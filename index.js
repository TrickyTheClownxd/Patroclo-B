import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// --- CONFIGURACIÓN ---
let chatHistory = [];
let modoBot = "normal"; 

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, memoryColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: [
    "La disciplina es el puente entre las metas y los logros.",
    "El respeto es la base de cualquier imperio.",
    "En el silencio se encuentra la verdadera fuerza.",
    "La coherencia es la virtud de los grandes.",
    "Un Gigante no solo agita, también construye."
  ], 
  lastChannelId: null, 
  mantenimiento: false,
  modoSerio: false 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000 },
  { id: 2, nombre: "Escudo Galactico", precio: 2500 },
  { id: 3, nombre: "VIP Pass", precio: 10000 }
];

// --- SERVIDOR ---
http.createServer((req, res) => { 
  res.write("Patroclo-B PRO B02.3 ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

// --- CEREBRO IA (GEMINI 1.5 FLASH) ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    console.error("❌ Error API Gemini:", e.message);
    return null;
  }
}

async function generarImagen(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: "arraybuffer" }
    );
    return Buffer.from(res.data, "binary");
  } catch { return null; }
}

async function buscarGif(query) {
  try {
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${query || 'galaxy'}&limit=1`);
    return res.data.data[0]?.url || null;
  } catch { return null; }
}

// --- BASE DE DATOS ---
async function connectDb() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    memoryColl = db.collection('user_memory');
    const dbData = await dataColl?.findOne({ id: "main_config" });
    if (dbData) {
        cachedConfig = { ...cachedConfig, ...dbData };
        if (cachedConfig.modoSerio) modoBot = "serio";
    }
    console.log("✅ PATROCLO-B PRO B02.3 CONECTADO");
  } catch (e) { console.log("❌ Error DB:", e); }
}

connectDb();

// --- LÓGICA DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // 1. Guardar en memoria y ADN (Solo si no es comando)
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
    if (modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl?.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // 2. Lógica de Respuestas Automáticas / Menciones
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    
    if (mencionado || Math.random() < 0.20) {
        // --- PRIORIDAD MODO IA ---
        if (modoBot === "ia") {
            msg.channel.sendTyping();
            const prompt = `Sos Patroclo-B, un bot de Discord de Nogoyá, Entre Ríos. Estilo argentino, callejero, rkt, bardo pero con códigos. Respondé corto y natural a: "${msg.content}". Contexto reciente: ${chatHistory.join(" | ")}`;
            const r = await respuestaIA(prompt);
            if (r) return msg.reply(r);
        }

        // --- BACKUP: FRASES ADN / SERIO ---
        let banco = (modoBot === "serio") ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
    }

    // Historial para la IA
    chatHistory.push(`${msg.author.username}: ${msg.content}`);
    if (chatHistory.length > 10) chatHistory.shift();
    return;
  }

  // --- COMANDOS ---
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // JUEGOS
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions?.users?.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("No tenés un peso.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ <@${mencion.id}>, aceptá con \`!aceptar\` por **${monto}**.`);
    }
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
    return msg.reply(gano ? `✅ Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]) || 500;
    if (user.points < monto) return msg.reply("Sin fondos.");
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
      return msg.reply("💥 **BANG!**");
    }
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: Math.floor(monto * 1.2) } });
    return msg.reply("🔫 **CLIC.**");
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Sin retos.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id; const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 <@${g}> ganó los **${reto.monto}**.`);
  }

  // ECONOMÍA
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}**.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Esperá 24hs.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500.");
  }

  // MÍSTICA / IA / MULTIMEDIA
  if (cmd === "modo" || cmd === "personalidad") {
    if (msg.author.id !== MI_ID_BOSS) return msg.reply("Solo el Boss.");
    if (!["normal","serio","ia"].includes(args[0])) return msg.reply("normal | serio | ia");
    modoBot = args[0];
    await dataColl?.updateOne({ id: "main_config" }, { $set: { modoSerio: (modoBot === "serio") } }, { upsert: true });
    return msg.reply(`🤖 Modo **${modoBot.toUpperCase()}**.`);
  }

  if (cmd === "imagen") {
    msg.channel.sendTyping();
    const img = await generarImagen(args.join(" "));
    return img ? msg.channel.send({ files: [{ attachment: img, name: "art.png" }] }) : msg.reply("Error.");
  }

  if (cmd === 'horoscopo') {
    const s = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"][Math.floor(Math.random()*12)];
    const p = cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Bardo.";
    return msg.reply(`🪐 **${s}:** "${p}"`);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const url = await buscarGif(args.join(' '));
    return url ? msg.reply(url) : msg.reply("Nada.");
  }

  // SISTEMA
  if (cmd === 'stats') return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${modoBot}`);
  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO PRO').setColor('#7D26CD')
      .addFields(
        { name: '🕹️ JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!aceptar`' },
        { name: '💰 GUITA', value: '`!bal`, `!daily`, `!pay`, `!tienda`' },
        { name: '🤖 IA/EXTRA', value: '`!modo ia`, `!imagen`, `!horoscopo`, `!gif`' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [e] });
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);