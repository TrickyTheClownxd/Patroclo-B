import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { res.write("Patroclo-B B01 MASTER ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// --- CONFIGURACIÓN MONGODB ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let lastChannelId = null, lastMsgTime = Date.now();
let cachedConfig = { phrases: [], extras: {} };

// CONFIGURACIÓN DE IDS (Reemplazá con las tuyas)
const ID_PATROCLO_ORIGINAL = 'TU_ID_AQUÍ'; 
const MI_ID_BOSS = 'TU_ID_AQUÍ';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Sistema Full Conectado (Mongo + Timba)");
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
  } catch (err) { cachedConfig = { phrases: ["¡D1 facha!"], extras: {} }; }
}

connectDb();

async function getUser(id) {
  if (!usersColl) return null;
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0 };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('messageCreate', async (msg) => {
  // FILTRO DE BOTS: Solo permite usuarios humanos Y al Patroclo Original
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  lastChannelId = msg.channel.id; lastMsgTime = Date.now();
  const content = msg.content.toLowerCase();

  // 1. APRENDIZAJE ADN (Solo humanos)
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2 && msg.content.length < 200) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // 2. RESPUESTAS AUTOMÁTICAS
  if ((content.includes("patroclo") || content.includes("patroclin") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "Qué onda facha?");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- MÍSTICA, SOCIAL E INVOCACIÓN ---
  if (cmd === 'bola8') {
    const r = ["Sí, olvidate.", "Ni en pedo.", "Puede ser, facha.", "Preguntale a tu vieja.", "D1.", "Respetá la complexión de la cara."];
    return msg.reply(`🎱 **BOLA 8:** ${r[Math.floor(Math.random() * r.length)]}`);
  }

  if (cmd === 'nekoask') {
    const duda = args.join(' '); if (!duda) return msg.reply("¿Qué le preguntás a la gata?");
    return msg.channel.send(`!ask ${duda}`);
  }

  if (cmd === 'horoscopo') {
    const p = ["✨ Materia Oscura: Tu futuro está negro.", "✨ Satélite Viejo: Girás al pedo.", "✨ Cometa Fugaz: Pasaste por la pala y seguiste."];
    return msg.reply(p[Math.floor(Math.random() * p.length)]);
  }

  if (cmd === 'spoty') {
    const s = ["🔥 Reggaeton: http://spotify.com/track/1", "🛰️ Dato: En el espacio nadie escucha tus gritos.", "🔥 Perreo: http://spotify.com/track/2"];
    return msg.reply(s[Math.floor(Math.random() * s.length)]);
  }

  if (cmd === 'bardo') {
    const insultos = ["Fantasma", "Seco", "Cara de vereda", "Domado", "Cajetilla"];
    return msg.reply(insultos[Math.floor(Math.random() * insultos.length)]);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const query = args.join(' ') || 'meme';
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${query}&limit=1&rating=g`);
    return msg.reply(res.data.data[0]?.url || "No encontré nada.");
  }

  if (cmd === 'confesion') {
    const t = args.join(' '); if (!t) return;
    await msg.delete(); return msg.channel.send(`🤫 **CONFESIÓN ANÓNIMA:** "${t}"`);
  }

  // --- TIMBA V45.0 ---
  const user = await getUser(msg.author.id);
  if (!user) return;

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Ya cobraste, manguero.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Cobraste tus **300 Patro-Pesos**.");
  }

  if (cmd === 'bal' || cmd === 'perfil') return msg.reply(`💰 Tenés **${user.points} Patro-Pesos**.`);

  if (cmd === 'suerte' || cmd === 'ruleta') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points) return msg.reply("Apostá lo que tengas, seco.");
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? bet : -bet } });
    return msg.reply(gano ? `🔥 ¡GANASTE! +${bet}` : `💀 AL LOBBY. Perdiste ${bet}`);
  }

  // --- CONTROL ---
  if (cmd === 'stats') return msg.reply(`📊 **STATS:** DB: ${dataColl ? '✅' : '❌'} | Frases: ${cachedConfig.phrases.length}`);
  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    const local = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: local.phrases } }, { upsert: true });
    await loadConfig(true); return msg.reply("♻️ ADN Sincronizado.");
  }
});

client.login(process.env.TOKEN);
