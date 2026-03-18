import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// --- VARIABLES DE ESTADO ---
let chatHistory = [];
let modoBot = "normal"; 
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  phrasesSerias: ["La disciplina es libertad.", "Respeto, orden y jerarquía.", "Fuerza en el silencio."],
  mantenimiento: false 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

http.createServer((req, res) => { res.write("Patroclo-B B03.7 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

// --- MOTORES IA Y ARTE ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] },
      { timeout: 10000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
}

async function generarImagen(prompt, modelUrl) {
  try {
    const res = await axios.post(modelUrl, { inputs: prompt }, { 
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, 
      responseType: "arraybuffer", timeout: 30000 
    });
    return Buffer.from(res.data, "binary");
  } catch { return null; }
}

// --- CONEXIÓN DB ---
async function connectDb() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const dbData = await dataColl.findOne({ id: "main_config" });
    if (dbData) {
      cachedConfig = { ...cachedConfig, ...dbData };
      modoBot = dbData.modoActual || "normal";
    }
    console.log(`✅ Patroclo B03.7. ADN: ${cachedConfig.phrases.length} frases.`);
  } catch (e) { console.log("Error DB:", e); }
}
connectDb();

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // 1. APRENDIZAJE ADN
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 2) {
    if (modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // 2. RESPUESTAS AUTOMÁTICAS
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    if (mencionado || Math.random() < 0.18) {
      if (modoBot === "ia") {
        msg.channel.sendTyping();
        const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 35).join(" | ");
        const promptIA = `Sos Patroclo-B de Nogoyá. Estilo rkt, facha y bardo. ADN: "${muestra}". Responde corto a: "${msg.content}".`;
        const r = await respuestaIA(promptIA);
        if (r) return msg.reply(r);
      }
      if (modoBot === "serio") return msg.channel.send(cachedConfig.phrasesSerias[Math.floor(Math.random()*cachedConfig.phrasesSerias.length)]);
      if (cachedConfig.phrases.length > 0) return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]);
    }
    chatHistory.push(`${msg.author.username}: ${msg.content}`);
    if (chatHistory.length > 10) chatHistory.shift();
    return;
  }

  // 3. COMANDOS
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // ECONOMÍA Y RANKING
  if (cmd === 'bal') return msg.reply(`💰 Tenés **${user.points}** Patro-Pesos.`);

  if (cmd === 'ranking' || cmd === 'top') {
    const topUsers = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
    let lista = "🏆 **TOP 10 MILLONARIOS** 🏆\n\n";
    topUsers.forEach((u, i) => {
      lista += `${i + 1}. <@${u.userId}> - **${u.points}** PP\n`;
    });
    return msg.channel.send(lista);
  }

  if (cmd === 'daily') {
    const cooldown = 86400000;
    if (Date.now() - (user.lastDaily || 0) < cooldown) return msg.reply("Ya cobraste, no seas muerto de hambre.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 Patro-Pesos acreditados.");
  }

  if (cmd === 'pay' || cmd === 'transferencia') {
    const target = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]);
    if (!target || !monto || monto <= 0 || target.id === msg.author.id) return msg.reply("Hacé bien el pase: `!pay @usuario 100`.");
    if (user.points < monto) return msg.reply("No tenés esa guita.");
    
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
    await usersColl.updateOne({ userId: target.id }, { $inc: { points: monto } }, { upsert: true });
    return msg.reply(`💸 Pasaste **${monto}** a <@${target.id}>.`);
  }

  // TIMBA
  if (cmd === 'poker' || cmd === 'penal' || cmd === 'ruleta') {
    const cant = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < cant) return msg.reply("No tenés saldo.");
    const win = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? cant : -cant } });
    return msg.reply(win ? `✅ ¡Ganaste **${cant}**!` : `💀 Perdiste **${cant}**.`);
  }

  // SISTEMA E IA
  if (cmd === "perfiladn") {
    msg.channel.sendTyping();
    const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 50).join(" | ");
    const prompt = `Analizá el ADN del server y decime quién es Patroclo-B hoy: "${muestra}"`;
    const r = await respuestaIA(prompt);
    return msg.reply(r || "Error al leer el ADN.");
  }

  if (cmd === "modo") {
    if (msg.author.id !== MI_ID_BOSS) return;
    modoBot = args[0];
    await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: modoBot } }, { upsert: true });
    return msg.reply(`🤖 Modo **${modoBot.toUpperCase()}**.`);
  }

  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 PATROCLO-B PRO B03.7').setColor('#7D26CD')
      .addFields(
        { name: '🧠 IA / ADN', value: '`!modo ia`, `!perfiladn`, `!stats`' },
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!ranking`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`' },
        { name: '🎨 IMÁGENES', value: '`!imagen`, `!imagen2`' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [e] });
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);