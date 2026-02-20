import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { res.write("Patroclo-B B01 OBLIGATORIO ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// --- CONFIGURACIÓN ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let lastChannelId = null, lastMsgTime = Date.now();
let cachedConfig = { phrases: [], extras: {} };

const ID_PATROCLO_ORIGINAL = 'TU_ID_AQUÍ'; 
const MI_ID_BOSS = 'TU_ID_AQUÍ';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Sistema Full ADN Conectado");
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
  // Multiverso: Permite que el Original tire comandos
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  lastChannelId = msg.channel.id; lastMsgTime = Date.now();
  const content = msg.content.toLowerCase();

  // 1. APRENDIZAJE ADN (Filtro 2-200 carac, no links)
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2 && msg.content.length < 200) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // 2. RESPUESTAS AUTOMÁTICAS (Nombre/Mención/15% azar)
  if ((content.includes("patroclo") || content.includes("patroclin") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "Qué onda facha?");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS MÍSTICA Y ESPACIO ---
  if (cmd === 'universefacts') {
    try {
      const uniData = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      const extraData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      let pool = [...uniData.facts];
      if (extraData.universe_bonus) pool.push(...extraData.universe_bonus);
      return msg.reply(`🌌 **UNIVERSE:** ${pool[Math.floor(Math.random() * pool.length)]}`);
    } catch (e) { return msg.reply("Error de lectura estelar."); }
  }

  if (cmd === 'bola8') {
    const r = ["Sí.", "No.", "D1.", "Preguntale a tu vieja.", "Respetá la complexión de la cara."];
    return msg.reply(`🎱 **BOLA 8:** ${r[Math.floor(Math.random() * r.length)]}`);
  }

  if (cmd === 'nekoask') return msg.channel.send(`!ask ${args.join(' ')}`);

  if (cmd === 'horoscopo') {
    const h = ["Materia Oscura: Estás domado.", "Satélite Viejo: Girás al pedo.", "Nebulosa: No se ve nada."];
    return msg.reply(`✨ ${h[Math.floor(Math.random() * h.length)]}`);
  }

  // --- TIMBA ---
  const user = await getUser(msg.author.id);
  if (!user) return;

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Seco, ya cobraste.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Tomá tus **300 Patro-Pesos**.");
  }

  if (cmd === 'suerte' || cmd === 'ruleta') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points) return msg.reply("No tenés esa plata.");
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? bet : -bet } });
    return msg.reply(gano ? `🔥 ¡GANASTE! +${bet}` : `💀 AL LOBBY. -${bet}`);
  }

  // --- SISTEMA Y STATS ---
  if (cmd === 'stats') {
    const f = cachedConfig.phrases;
    const emojis = f.filter(p => /<a?:\w+:\d+>/.test(p)).length;
    const gifs = f.filter(p => p.includes("giphy") || p.includes("tenor")).length;
    const stickers = f.filter(p => p.includes("sticker:")).length;
    return msg.reply(`📊 **PATRO-STATS:**\n🧠 Memoria: ${f.length}\n✨ Emojis: ${emojis}\n🖼️ GIFs: ${gifs}\n🎫 Stickers: ${stickers}\n✅ DB: ONLINE`);
  }

  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **BIBLIA B01:** !daily, !bal, !suerte, !ruleta, !bola8, !nekoask, !universefacts, !horoscopo, !spoty, !gif, !bardo, !confesion, !stats, !reload");
  }

  if (cmd === 'reload') { await loadConfig(!!dataColl); return msg.reply("♻️ Memoria refrescada."); }

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    const local = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: local.phrases } }, { upsert: true });
    await loadConfig(true); return msg.reply("♻️ JSON cargado a la DB.");
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ') || 'meme'}&limit=1&rating=g`);
    return msg.reply(res.data.data[0]?.url || "Nada, facha.");
  }
});

client.login(process.env.TOKEN);
