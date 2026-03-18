import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
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
  phrasesSerias: ["La disciplina es clave.", "Respeto ante todo.", "El silencio es fuerza."], 
  mantenimiento: false,
  modoSerio: false 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// --- SERVIDOR ---
http.createServer((req, res) => { 
  res.write("Patroclo-B PRO B02.5 ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

// --- FUNCIONES IA / MULTIMEDIA ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
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

// --- CONEXIÓN DB ---
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
    console.log("✅ PATROCLO-B PRO B02.5 CONECTADO");
  } catch (e) { console.log("❌ Error DB:", e); }
}
connectDb();

// --- LÓGICA PRINCIPAL ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // 1. Guardar en el ADN (Solo si no es comando)
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 3) {
    if (modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl?.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // 2. Respuestas Automáticas
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    
    if (mencionado || Math.random() < 0.20) {
        // --- PRIORIDAD IA: Si está en IA, NO usa frases del ADN ---
        if (modoBot === "ia") {
            msg.channel.sendTyping();
            const prompt = `Sos Patroclo-B, de Nogoyá, Entre Ríos. Estilo argentino, rkt, bardo pero facha. 
            NO uses frases repetidas. Respondé de forma ORIGINAL y corta a: "${msg.content}". 
            Contexto: ${chatHistory.join(" | ")}`;
            
            const r = await respuestaIA(prompt);
            if (r) return msg.reply(r);
        }

        // --- BACKUP: Si no es IA, usa el ADN ---
        let banco = (modoBot === "serio") ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
    }
    chatHistory.push(`${msg.author.username}: ${msg.content}`);
    if (chatHistory.length > 10) chatHistory.shift();
    return;
  }

  // --- COMANDOS ---
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // Timba
  if (cmd === 'poker' || cmd === 'penal') {
    const m = msg.mentions.users.first();
    const cant = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < cant) return msg.reply("No tenés un peso.");
    if (m) {
        client.retos.set(m.id, { tipo: cmd, retador: msg.author.id, monto: cant });
        return msg.channel.send(`⚔️ <@${m.id}>, !aceptar por **${cant}**.`);
    }
    const win = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? cant : -cant } });
    return msg.reply(win ? `✅ Ganaste **${cant}**!` : `💀 Perdiste **${cant}**.`);
  }

  if (cmd === 'ruleta') {
    const cant = parseInt(args[0]) || 500;
    if (user.points < cant) return msg.reply("Fondos insuficientes.");
    if (Math.random() < 0.16) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -cant } });
        return msg.reply("💥 **BANG!**");
    }
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: Math.floor(cant * 1.3) } });
    return msg.reply("🔫 **CLIC.** Ganaste.");
  }

  if (cmd === 'aceptar') {
    const r = client.retos.get(msg.author.id);
    if (!r) return msg.reply("Sin retos.");
    const win = Math.random() < 0.5;
    const g = win ? r.retador : msg.author.id; const p = win ? msg.author.id : r.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: r.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -r.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 <@${g}> se llevó los **${r.monto}**.`);
  }

  // Economía básica
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}**.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500.");
  }

  // Modos y Multimedia
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
    return img ? msg.channel.send({ files: [{ attachment: img, name: "patro.png" }] }) : msg.reply("Error.");
  }

  if (cmd === 'stats') return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${modoBot}`);
  
  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO PRO').setColor('#7D26CD')
      .addFields(
        { name: '🕹️ TIMBA', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!aceptar`' },
        { name: '💰 PLATA', value: '`!bal`, `!daily`, `!pay`' },
        { name: '🤖 IA/MÍSTICA', value: '`!modo ia`, `!imagen`, `!horoscopo`' }
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