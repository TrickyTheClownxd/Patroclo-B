import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para Railway
http.createServer((req, res) => { res.write("Patroclo-B B01.7 GAMER ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], extras: {} };
if (!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Conectado a MongoDB");
    await loadConfig(true);
  } catch (e) { await loadConfig(false); }
}

async function loadConfig(useDb) {
  try {
    if (useDb && dataColl) {
      const dbData = await dataColl.findOne({ id: "main_config" });
      if (dbData) { cachedConfig = dbData; return; }
    }
    const localData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    cachedConfig = { phrases: localData.phrases || [], extras: localData.extras || {} };
  } catch (err) { cachedConfig = { phrases: ["D1 facha"], extras: {} }; }
}

connectDb();

client.once('ready', async () => {
  const channel = client.channels.cache.find(c => c.type === 0);
  if (channel) {
    await channel.send("ya llegué perritas 🔥");
    const historialActu = `
📝 **HISTORIAL DE ACTUALIZACIONES (BRANCH B)**
• **B01.5:** Conexión a MongoDB y sistema de ADN (Aprendizaje).
• **B01.6:** Comandos de Mística (Universe, Bola8, Horóscopo) y Confesiones.
• **B01.7 (Actual):** - 🎮 **Duelos 1vs1:** Poker y Penales entre miembros.
  - 🛒 **Tienda:** Compra de VIP y Escudos.
  - 🔧 **Fixes:** Comando !foto arreglado y modo Mantenimiento.
    `;
    await channel.send(historialActu);
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

  // --- SISTEMA ADN ---
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // RESPUESTAS AUTOMÁTICAS
  if ((content.includes("patroclo") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "Qué onda facha?");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS DE TIMBA Y DUELOS ---
  if (cmd === 'poker') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]);

    if (isNaN(monto) || monto <= 0 || monto > user.points) return msg.reply("Revisá tu billetera, facha.");

    if (!mencion) {
      const gano = Math.random() < 0.35;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? Math.floor(monto * 1.5) : -monto } });
      return msg.reply(gano ? `🃏 **GANASTE:** Te llevaste **${Math.floor(monto * 1.5)}** vs la casa.` : `💀 **PERDISTE:** La casa te peló **${monto}**.`);
    } else {
      client.retos.set(mencion.id, { tipo: 'poker', retador: msg.author.id, monto: monto });
      return msg.channel.send(`🃏 **RETO:** ${mencion}, te desafiaron a Póker por **${monto}**. Escribí \`!aceptar\`.`);
    }
  }

  if (cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || 100;
    if (user.points < monto) return msg.reply("No tenés esa guita.");
    
    if (mencion) {
      client.retos.set(mencion.id, { tipo: 'penal', retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚽ **DUELO:** ${mencion}, prepará los guantes. <@${msg.author.id}> te retó por **${monto}**. \`!aceptar\`.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te retó.");

    const rObj = await getUser(reto.retador);
    if (rObj.points < reto.monto || user.points < reto.monto) return msg.reply("Alguien se quedó seco.");

    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;

    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    
    client.retos.delete(msg.author.id);
    return msg.channel.send(reto.tipo === 'poker' 
      ? `🃏 **RESULTADO:** <@${g}> ganó el pozo de **${reto.monto}**.` 
      : `⚽ **RESULTADO:** ¡GOOOL de <@${g}>! Se lleva los **${reto.monto}**.`);
  }

  // --- TIENDA ---
  if (cmd === 'tienda') {
    return msg.reply("🛒 **PATRO-TIENDA**\n1. **VIP Pass** (5k)\n2. **Escudo Anti-Bardo** (2k)\nUsa: `!comprar [id]`");
  }

  if (cmd === 'comprar') {
    const ids = {"1": {p: 5000, n: "VIP"}, "2": {p: 2000, n: "Escudo"}};
    const prod = ids[args[0]];
    if (!prod) return msg.reply("Elegí 1 o 2.");
    if (user.points < prod.p) return msg.reply("No te alcanza.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -prod.p }, $push: { inventario: prod.n } });
    return msg.reply(`✅ Compraste **${prod.n}**.`);
  }

  // --- MULTIMEDIA (FIX) ---
  if (cmd === 'foto' || cmd === 'gif') {
    const query = args.join(' ') || 'random';
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${query}&limit=1`);
    return msg.reply(res.data.data[0]?.url || "No hay nada.");
  }

  // --- GESTIÓN ---
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    return msg.channel.send("╔════════════════════════╗\n      ⚠️  **SISTEMA OFFLINE** ⚠️\n╚════════════════════════╝\n**¿TE LO VUELVO A ACTIVAR?** *En breve...*\nEl Boss está actualizando el ADN.");
  }

  if (cmd === 'sugerencia') {
    const idea = args.join(' ');
    if (dataColl && idea) {
      await dataColl.insertOne({ type: "sugerencia", user: msg.author.username, texto: idea });
      return msg.reply("📩 Idea guardada.");
    }
  }

  if (cmd === 'ayudacmd') {
    return msg.reply(`📜 **BIBLIA B01.7**\n• **Juegos:** !poker, !penal, !aceptar, !ruleta, !suerte\n• **Tienda:** !tienda, !comprar, !bal\n• **Mix:** !universefacts, !bola8, !horoscopo, !confesion, !gif, !sugerencia\n• **Staff:** !stats, !reload, !mantenimiento`);
  }

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Cobraste 300 Patro-Pesos.");
  }

  if (cmd === 'bal') return msg.reply(`💰 Billetera: **${user.points}**.`);
});

client.login(process.env.TOKEN);
