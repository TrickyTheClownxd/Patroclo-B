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

// --- CONFIGURACIÓN DE IDENTIDAD ---
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
  - 🛒 **Tienda:** !tienda y !comprar (VIP, Escudos).
  - 🔧 **Fixes:** Re-activación de !foto, !spoty y buscador multimedia.
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
  // Solo responde a humanos o al Patroclo Original
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  // --- SISTEMA ADN (APRENDIZAJE) ---
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
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

  // --- JUEGOS Y RETOS 1vs1 ---
  if (cmd === 'poker') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]);
    if (isNaN(monto) || monto <= 0 || (user && user.points < monto)) return msg.reply("No tenés esa guita, laburá.");

    if (!mencion) {
      const gano = Math.random() < 0.35;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? Math.floor(monto * 1.5) : -monto } });
      return msg.reply(gano ? `🃏 **GANASTE:** Sacaste color y te llevaste **${Math.floor(monto * 1.5)}**.` : `💀 **PERDISTE:** La casa te peló **${monto}**.`);
    } else {
      client.retos.set(mencion.id, { tipo: 'poker', retador: msg.author.id, monto: monto });
      return msg.channel.send(`🃏 **RETO:** ${mencion}, <@${msg.author.id}> te desafió a Póker por **${monto}**. Escribí \`!aceptar\`.`);
    }
  }

  if (cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || 100;
    if (user.points < monto) return msg.reply("No tenés Patro-Pesos suficientes.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: 'penal', retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚽ **DUELO:** ${mencion}, prepará los guantes. <@${msg.author.id}> te retó por **${monto}**. \`!aceptar\`.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te retó, fantasma.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **FINAL:** <@${g}> ganó el duelo y se lleva **${reto.monto}** de <@${p}>.`);
  }

  // --- MULTIMEDIA (FIXED) ---
  if (cmd === 'foto' || cmd === 'gif') {
    const q = args.join(' ') || 'meme';
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "No encontré nada, facha.");
    } catch (e) { return msg.reply("Giphy está la gorra, no anda."); }
  }

  if (cmd === 'spoty') {
    const music = ["https://open.spotify.com/track/6habFbeexmbtBU8oYp79nC", "https://open.spotify.com/track/1r9xUipOgnNw59pCnyB9Az"];
    return msg.reply(`🎶 **PATRO-MIX:** ${music[Math.floor(Math.random()*music.length)]}`);
  }

  // --- MÍSTICA & MIX ---
  if (cmd === 'horoscopo') {
    const frases = ["Hoy una supernova traerá cambios a tu billetera.", "Cuidado con Mercurio retrogrado en el chat.", "Tu energía astral dice: Timbeá todo en la ruleta."];
    return msg.reply(`🔮 **ASTRAL:** ${frases[Math.floor(Math.random()*frases.length)]}`);
  }

  if (cmd === 'bardo') {
    const insultos = ["sos un fantasma", "no te quiere ni tu vieja", "seguí laburando que sos pobre", "tenés menos onda que un renglón"];
    return msg.reply(insultos[Math.floor(Math.random()*insultos.length)]);
  }

  if (cmd === 'cuanto') {
    const n = Math.floor(Math.random() * 101);
    return msg.reply(`📊 El nivel de **${args.join(' ') || 'facha'}** es de un **${n}%**.`);
  }

  // --- TIENDA ---
  if (cmd === 'tienda') {
    return msg.reply("🛒 **PATRO-TIENDA**\n1. VIP Pass (5000 pts)\n2. Escudo Anti-Bardo (2000 pts)\nUsa `!comprar [id]`");
  }

  if (cmd === 'comprar') {
    const p = args[0] === "1" ? 5000 : 2000;
    if (user.points < p) return msg.reply("No te alcanza, seco.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -p }, $push: { inventario: args[0] } });
    return msg.reply("✅ Compra realizada. Ya tenés facha.");
  }

  // --- GESTIÓN (BOSS) ---
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    const banner = `
╔════════════════════════╗
      ⚠️  **SISTEMA OFFLINE** ⚠️
╚════════════════════════╝
**¿TE LO VUELVO A ACTIVAR?** *En breve...*
El Boss está actualizando el ADN.`;
    return msg.channel.send(banner);
  }

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    const local = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: local.phrases } }, { upsert: true });
    await loadConfig(true); 
    return msg.reply("♻️ JSON sincronizado con la DB.");
  }

  if (cmd === 'reload') {
    await loadConfig(true);
    return msg.reply("♻️ Memoria RAM refrescada.");
  }

  if (cmd === 'stats') {
    return msg.reply(`📈 **STATS PATRO-B:**\n• Boss: ${msg.author.id === MI_ID_BOSS ? "Si" : "No"}\n• ADN: ${cachedConfig.phrases.length} frases\n• DB: Online ✅`);
  }

  if (cmd === 'sugerencia') {
    const idea = args.join(' ');
    if (dataColl && idea) {
      await dataColl.insertOne({ type: "sugerencia", user: msg.author.username, texto: idea });
      return msg.reply("📩 Idea guardada para el Boss.");
    }
  }

  // --- BIBLIA ---
  if (cmd === 'ayudacmd') {
    const biblia = `
📜 **BIBLIA PATROCLO B01.7**
💰 **TIMBA:** !poker, !penal, !aceptar, !daily, !bal
🛒 **SHOP:** !tienda, !comprar
🎭 **MIX:** !spoty, !foto, !gif, !horoscopo, !bardo, !cuanto, !bola8
⚙️ **ADMIN:** !stats, !reload, !reloadjson, !mantenimiento, !sugerencia
    `;
    return msg.reply(biblia);
  }

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Mañana volvé, facha.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +300 Patro-Pesos a tu cuenta.");
  }

  if (cmd === 'bal') return msg.reply(`💰 Billetera: **${user.points} Patro-Pesos**.`);

});

client.login(process.env.TOKEN);
