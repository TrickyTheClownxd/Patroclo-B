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

// --- ESTADO Y CACHÉ ---
let chatHistory = [];
let modoBot = "normal"; 
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: ["El universo es bardo.", "Nogoyá es la capital del cosmos."],
  phrasesSerias: ["Disciplina y respeto.", "La coherencia es poder."],
  mantenimiento: false 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// Servidor para Railway
http.createServer((req, res) => { res.write("Patroclo-B Online"); res.end(); }).listen(process.env.PORT || 8080);

// --- CEREBRO IA (GEMINI 1.5 FLASH) ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] },
      { timeout: 8000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
}

// --- MOTOR DE IMÁGENES (ESTABLE) ---
async function generarImagen(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: "arraybuffer", timeout: 25000 }
    );
    return Buffer.from(res.data, "binary");
  } catch { return null; }
}

async function buscarGif(query) {
  try {
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${query || 'funny'}&limit=1`);
    return res.data.data[0]?.url || null;
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
    console.log("✅ PATROCLO-B B02.9 CONECTADO");
  } catch (e) { console.log(e); }
}
connectDb();

// --- MANEJADOR DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // Guardar ADN
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 3) {
    if (modoBot === "normal" && !cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // --- RESPUESTAS AUTOMÁTICAS ---
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    if (mencionado || Math.random() < 0.20) {
        if (modoBot === "ia") {
            msg.channel.sendTyping();
            const adn = cachedConfig.phrases.slice(-30).join(" | ");
            const prompt = `Sos Patroclo-B, bot rkt de Nogoyá. Copiá este estilo de hablar (ADN): "${adn}". Respondé corto a: "${msg.content}". Historial: ${chatHistory.join(" | ")}`;
            const r = await respuestaIA(prompt);
            if (r) return msg.reply(r);
        }
        let banco = (modoBot === "serio") ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
    }
    chatHistory.push(`${msg.author.username}: ${msg.content}`);
    if (chatHistory.length > 10) chatHistory.shift();
    return;
  }

  // --- COMANDOS ---
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // JUEGOS
  if (cmd === 'poker' || cmd === 'penal' || cmd === 'ruleta') {
    const cant = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < cant) return msg.reply("No tenés un peso, bobi.");
    if (cmd === 'ruleta' && Math.random() < 0.16) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -cant } });
        return msg.reply("💥 **BANG!** Perdiste.");
    }
    const win = Math.random() < 0.5;
    const multi = (cmd === 'ruleta') ? 1.5 : 1;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? Math.floor(cant * multi) : -cant } });
    return msg.reply(win ? `✅ Ganaste **${Math.floor(cant * multi)}**!` : `💀 Perdiste **${cant}**.`);
  }

  if (cmd === 'suerte') return msg.reply(`🪙 Salió: **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**`);

  // ECONOMÍA
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 Patro-Pesos.");
  }
  if (cmd === 'transferencia' || cmd === 'pay') {
    const m = msg.mentions.users.first();
    const cant = parseInt(args[1]);
    if (!m || !cant || user.points < cant) return msg.reply("Error en la transferencia.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -cant } });
    await usersColl.updateOne({ userId: m.id }, { $inc: { points: cant } }, { upsert: true });
    return msg.reply(`💸 Pasaste **${cant}** a <@${m.id}>.`);
  }

  // MÍSTICA
  if (cmd === 'nekoask') return msg.reply(`🐱 Patroclo dice: ${args.join(' ')} (Quizás)`);
  if (cmd === 'bola8') return msg.reply(`🎱 **${["Sí.", "No.", "Ni ahí.", "Olvidalo."][Math.floor(Math.random()*4)]}**`);
  if (cmd === 'horoscopo') return msg.reply(`🪐 **Signo Random:** "${cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Bardo"}"`);
  if (cmd === 'bardo') return msg.reply(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]);
  if (cmd === 'imagen') {
    msg.channel.sendTyping();
    const img = await generarImagen(args.join(" "));
    return img ? msg.channel.send({ files: [{ attachment: img, name: "art.png" }] }) : msg.reply("HF está saturado.");
  }
  if (cmd === 'gif' || cmd === 'foto') {
    const url = await buscarGif(args.join(' '));
    return url ? msg.reply(url) : msg.reply("Nada.");
  }

  // SISTEMA
  if (cmd === 'personalidad' || cmd === 'modo') {
    if (msg.author.id !== MI_ID_BOSS) return;
    modoBot = args[0];
    await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: modoBot } }, { upsert: true });
    return msg.reply(`🤖 Modo **${modoBot.toUpperCase()}**.`);
  }
  if (cmd === 'stats') return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${modoBot}`);
  if (cmd === 'sugerencias') return msg.reply("✅ Anotado en mi lista negra.");

  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B B02.9').setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`poker`, `penal`, `ruleta`, `suerte`' },
        { name: '💰 ECONOMÍA', value: '`bal`, `daily`, `pay`, `tienda`' },
        { name: '🌌 MÍSTICA', value: '`nekoask`, `bola8`, `horoscopo`, `bardo`, `imagen`, `gif`' },
        { name: '🛠️ SISTEMA', value: '`modo`, `stats`, `mantenimiento`' }
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