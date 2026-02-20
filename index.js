import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor básico para Railway
http.createServer((req, res) => { 
  res.write("Patroclo-B B01.7 MEGA-GAMER ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], extras: {} };
if (!client.retos) client.retos = new Map();

// Variable para guardar el "Mejor Mensaje" de la sesión
let mejorMensajeSesion = { texto: "Nada interesante todavía...", autor: "Nadie" };

const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Conectado a MongoDB - ADN Activo");
    await loadConfig(true);
  } catch (e) { 
    console.log("❌ Error DB, usando local");
    await loadConfig(false); 
  }
}

async function loadConfig(useDb) {
  try {
    if (useDb && dataColl) {
      const dbData = await dataColl.findOne({ id: "main_config" });
      if (dbData) { cachedConfig = dbData; return; }
    }
    const localData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    cachedConfig = { phrases: localData.phrases || [], extras: localData.extras || {} };
  } catch (err) { 
    cachedConfig = { phrases: ["D1 facha", "Qué onda perri"], extras: {} }; 
  }
}

connectDb();

client.once('ready', async () => {
  const channel = client.channels.cache.find(c => c.type === 0);
  if (channel) {
    await channel.send("ya llegué perritas 🔥");
    const historial = `
📘 **EVOLUCIÓN PATROCLO-B (BRANCH BETA)**
• **B01.5:** Migración a MongoDB y aprendizaje pasivo (ADN).
• **B01.6:** Comandos de mística, universo y confesiones.
• **B01.7 (Actual):** - 🎮 **Duelos:** !poker y !penal 1vs1 entre pibes.
  - 🎰 **Casino:** !ruleta y !suerte integrados.
  - 🛒 **Tienda:** !tienda y !comprar.
  - 🌌 **Mística:** !universefacts reactivado.
  - 🏆 **Sentimientos:** El bot ahora elige y fija el mejor mensaje antes de la actu.
    `;
    await channel.send(historial);
  }
});

async function getUser(id) {
  if (!usersColl) return null;
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0, inventario: [] };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  // --- LÓGICA DEL MEJOR MENSAJE (ADN) ---
  if (!msg.author.bot && !content.startsWith('!') && msg.content.length > 5) {
    // Si el mensaje actual es más largo que el record guardado, lo actualizamos
    if (msg.content.length > mejorMensajeSesion.texto.length) {
      mejorMensajeSesion = {
        texto: msg.content,
        autor: msg.author.username,
        msgRef: msg
      };
    }

    if (dataColl && !content.includes("http")) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        cachedConfig.phrases.push(msg.content);
      }
    }
  }

  // --- RESPUESTAS AUTOMÁTICAS ---
  if ((content.includes("patroclo") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "D1 facha.");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS DE TIMBA ---
  if (cmd === 'suerte') {
    const monto = parseInt(args[0]) || 100;
    if (user.points < monto) return msg.reply("No tenés esa guita, laburá.");
    const gana = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gana ? monto : -monto } });
    return msg.reply(gana ? `🍀 **SUERTE:** Ganaste **${monto}** Patro-Pesos.` : `💀 **MALA SUERTE:** Perdiste **${monto}**.`);
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]);
    const apuesta = args[1];
    if (!monto || !apuesta || user.points < monto) return msg.reply("Uso: `!ruleta [monto] [rojo/negro/numero]`");
    const num = Math.floor(Math.random() * 37);
    const color = num === 0 ? "verde" : (num % 2 === 0 ? "rojo" : "negro");
    let gano = (apuesta === color || parseInt(apuesta) === num);
    let mult = parseInt(apuesta) === num ? 35 : 2;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto * (mult - 1) : -monto } });
    return msg.reply(`🎰 Cayó el **${num} (${color})**. ${gano ? `¡Ganaste **${monto * mult}**!` : `Perdiste **${monto}**.`}`);
  }

  if (cmd === 'poker') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]);
    if (isNaN(monto) || monto <= 0 || user.points < monto) return msg.reply("Revisá tu billetera.");
    if (!mencion) {
      const gano = Math.random() < 0.35;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? Math.floor(monto * 1.5) : -monto } });
      return msg.reply(gano ? `🃏 Ganaste **${Math.floor(monto * 1.5)}**.` : `💀 Perdiste **${monto}**.`);
    } else {
      client.retos.set(mencion.id, { tipo: 'poker', retador: msg.author.id, monto: monto });
      return msg.channel.send(`🃏 **RETO:** ${mencion}, te desafiaron por **${monto}**. \`!aceptar\`.`);
    }
  }

  if (cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || 100;
    if (mencion && user.points >= monto) {
      client.retos.set(mencion.id, { tipo: 'penal', retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚽ **DUELO:** ${mencion}, te retaron por **${monto}**. \`!aceptar\`.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te retó.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **GANADOR:** <@${g}> se lleva **${reto.monto}**.`);
  }

  // --- MÍSTICA ---
  if (cmd === 'universefacts') {
    try {
      const uniData = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      const extraData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      let pool = [...uniData.facts, ...(extraData.universe_bonus || [])];
      return msg.reply(`🌌 **UNIVERSE:** ${pool[Math.floor(Math.random() * pool.length)]}`);
    } catch (e) { return msg.reply("Error estelar."); }
  }

  if (cmd === 'horoscopo') {
    const h = ["Tu energía astral está flama.", "Cuidado con la materia oscura.", "Timbeá que hoy los astros te bancan."];
    return msg.reply(`🔮 ${h[Math.floor(Math.random()*h.length)]}`);
  }

  // --- MULTIMEDIA ---
  if (cmd === 'foto' || cmd === 'gif') {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'meme'}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "Nada che.");
    } catch (e) { return msg.reply("Error con la API."); }
  }

  if (cmd === 'spoty') {
    const music = ["https://open.spotify.com/track/6habFbeexmbtBU8oYp79nC", "https://open.spotify.com/track/1r9xUipOgnNw59pCnyB9Az"];
    return msg.reply(`🎶 **PATRO-MIX:** ${music[Math.floor(Math.random()*music.length)]}`);
  }

  // --- GESTIÓN Y MANTENIMIENTO ---
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    // Fija el mejor mensaje antes de apagar
    if (mejorMensajeSesion.msgRef) {
      try {
        await mejorMensajeSesion.msgRef.pin();
        await msg.channel.send(`📌 **RECUERDO DE LA SESIÓN:** El bot piensa que este fue el mejor mensaje: "${mejorMensajeSesion.texto}" (by ${mejorMensajeSesion.autor})`);
      } catch (e) { console.log("Error al fijar mensaje."); }
    }

    const banner = `
╔════════════════════════╗
      ⚠️  **SISTEMA OFFLINE** ⚠️
╚════════════════════════╝
**¿TE LO VUELVO A ACTIVAR?** *En breve...*
El Boss está actualizando el ADN. Se fijó el mejor mensaje de la tanda.`;
    return msg.channel.send(banner);
  }

  if (cmd === 'ayudacmd') {
    return msg.reply(`📜 **BIBLIA B01.7**\nTimba: !poker, !penal, !aceptar, !ruleta, !suerte, !daily, !bal\nMix: !universefacts, !spoty, !foto, !gif, !horoscopo, !bardo, !cuanto\nStaff: !stats, !reload, !mantenimiento`);
  }

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +300.");
  }

  if (cmd === 'bal') return msg.reply(`💰 Billetera: **${user.points}**.`);
  if (cmd === 'stats') return msg.reply(`📈 ADN: ${cachedConfig.phrases.length} frases aprendidas.`);
});

client.login(process.env.TOKEN);
