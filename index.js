import { Client, GatewayIntentBits } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Servidor para Railway (Mantiene vivo al bot)
http.createServer((req, res) => { res.write("Patroclo-B B01 Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ]
});

// --- CONFIGURACIÓN MONGODB ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let lastChannelId = null, lastMsgTime = Date.now();
let cachedConfig = null;

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Memoria conectada (MongoDB)");
    await loadConfig();
  } catch (e) { console.error("❌ Error Mongo:", e); }
}

async function loadConfig() {
  cachedConfig = await dataColl.findOne({ id: "main_config" }) || { 
    phrases: [], 
    extras: { reacciones_auto: { palabras_clave: [], emojis: [] } } 
  };
}

connectDb();

async function getUser(id) {
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0 };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('ready', () => { console.log(`🔥 ${client.user.tag} ONLINE - ADN CARGADO`); });

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  lastChannelId = msg.channel.id; lastMsgTime = Date.now();
  const content = msg.content.toLowerCase();

  // 1. APRENDIZAJE CON FILTRO DE LIMPIEZA
  const isUrl = content.includes("http") || content.includes("www");
  const isCommand = content.startsWith("!") || content.startsWith(".");
  const isTooLong = content.length > 200;

  if (!isCommand && !isUrl && !isTooLong && msg.content.length > 2) {
    if (cachedConfig && !cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }

    // 2. INTERVENCIÓN (15% de chance de bocado al azar)
    if (Math.random() < 0.15) {
      const bocado = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Mirá vos...";
      return msg.channel.send(bocado);
    }
  }

  // 3. RESPUESTAS POR MENCIÓN, APODO O REPLY (ESENCIA OBLIGATORIA)
  const isMentioned = msg.mentions.has(client.user.id);
  const isReplyToBot = msg.reference && (await msg.channel.messages.fetch(msg.reference.messageId)).author.id === client.user.id;
  const isNamed = content.includes("patroclo") || content.includes("patroclin");

  if (isMentioned || isReplyToBot || isNamed) {
    const backup = ["¿Qué hacés, facha?", "Acá estoy.", "Qué onda.", "Me llamabas?"];
    const frases = (cachedConfig.phrases && cachedConfig.phrases.length > 0) ? cachedConfig.phrases : backup;
    return msg.reply(frases[Math.floor(Math.random() * frases.length)]);
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const user = await getUser(msg.author.id);

  // --- COMANDOS ---

  // EL HORÓSCOPO (Disociado y Astronómico)
  if (cmd === 'horoscopo') {
    const tipos = ["✨ HORÓSCOPO DISOCIADO ✨", "✨ HORÓSCOPO ASTRONÓMICO ✨"];
    const tipo = tipos[Math.floor(Math.random() * tipos.length)];
    const signosDisociados = [
      { s: "Satélite Viejo (dando vueltas al pedo)", p: "Seguí participando, perrita." },
      { s: "Materia Oscura (ni se te ve)", p: "JAJAJAJAJAJAJAJA" },
      { s: "Nebulosa de Tarantula", p: "Respetá la complexión de la cara." }
    ];
    const signosAstros = [
      { s: "Luz de galaxias lejanas", p: "Tarda millones de años, como tu cerebro." },
      { s: "Capella", p: "JAJAJAJAJAJAJAJAJ" }
    ];
    const data = tipo.includes("DISOCIADO") ? signosDisociados : signosAstros;
    const item = data[Math.floor(Math.random() * data.length)];
    return msg.reply(`${tipo}\n🪐 **Signo:** ${item.s}\n🔮 **Predicción:** "${item.p}"`);
  }

  // IMPORTACIÓN MASIVA (Solo Boss)
  if (cmd === 'reloadjson' && msg.author.id === '986680845031059526') {
    try {
      const ext = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      if (ext.phrases) await dataColl.updateOne({ id: "main_config" }, { $addToSet: { phrases: { $each: ext.phrases } } }, { upsert: true });
      await dataColl.updateOne({ id: "main_config" }, { $set: { extras: ext.extras || ext } }, { upsert: true });
      await loadConfig();
      return msg.reply("📂 **Importación Exitosa.** El cerebro del Patroclin se actualizó.");
    } catch (e) { return msg.reply("❌ Error en `extras.json`."); }
  }

  if (cmd === 'ayudacmd') {
    return msg.reply(`📜 **MANUAL B01:**\n💰 **TIMBA:** !daily, !perfil, !suerte, !ruleta\n🌌 **MÍSTICA:** !horoscopo, !spoty, !bola8\n🔥 **SOCIAL:** !bardo, !confesion, !gif, !foto\n⚙️ **SISTEMA:** !stats, !reload, !reloadjson`);
  }

  if (cmd === 'reload') { await loadConfig(); return msg.reply("♻️ Cache sincronizado."); }

  if (cmd === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return msg.reply("❌ Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: now } });
    return msg.reply("🎁 +300 Patro-Pesos.");
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(" ") || "argentina";
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${q}&limit=1&rating=g&lang=es`);
    const data = await res.json();
    return data.data[0] ? msg.reply(data.data[0].url) : msg.reply("❌ No hay nada.");
  }
});

// 4. REVIVIDOR: 5 min de inactividad
setInterval(async () => {
  if (!lastChannelId || Date.now() - lastMsgTime < 300000) return;
  const c = client.channels.cache.get(lastChannelId);
  if (c && cachedConfig.phrases.length > 0) {
    c.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    lastMsgTime = Date.now();
  }
}, 300000);

client.login(process.env.TOKEN);
