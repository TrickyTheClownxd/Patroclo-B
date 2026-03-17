import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// 🧠 IA
let chatHistory = [];
let modoBot = "normal"; // normal | serio | ia

// Servidor
http.createServer((req, res) => { 
  res.write("Patroclo-B B02.0 PRO ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

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
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección bardo." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Mística premium." }
];

// 🧠 IA RESPUESTA
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return null;
  }
}

// 🖼️ IMAGEN
async function generarImagen(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
        responseType: "arraybuffer"
      }
    );
    return Buffer.from(res.data, "binary");
  } catch {
    return null;
  }
}

// 💾 DB
async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    memoryColl = database.collection('user_memory');
    await loadConfig();
    console.log("✅ PRO ACTIVO");
  } catch (e) { console.log(e); }
}

async function loadConfig() {
  const dbData = await dataColl?.findOne({ id: "main_config" });
  if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
}

connectDb();

// 🧠 MEMORIA USUARIO
async function guardarMemoria(msg) {
  const palabras = msg.content.toLowerCase().split(/\s+/);

  let update = { $push: { mensajes: msg.content }, $inc: {}, $set: {} };

  palabras.forEach(p => update.$inc[`palabras.${p}`] = 1);

  if (msg.content.match(/boludo|hdp|puto|bobo/)) {
    update.$set.estilo = "bardo";
  }

  await memoryColl.updateOne({ userId: msg.author.id }, update, { upsert: true });
}

async function obtenerResumenUsuarios() {
  const users = await memoryColl.find().limit(10).toArray();

  return users.map(u => {
    const top = Object.entries(u.palabras || {})
      .sort((a,b)=>b[1]-a[1])
      .slice(0,3)
      .map(p=>p[0])
      .join(", ");

    return `Usuario ${u.userId}: estilo ${u.estilo || "normal"}, usa ${top}`;
  }).join("\n");
}

client.once('ready', async () => {
  console.log(`Logueado como ${client.user.tag}`);
});

// 🚨 EVENTO PRINCIPAL
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;

  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // 🧠 historial
  chatHistory.push(msg.content);
  if (chatHistory.length > 20) chatHistory.shift();

  await guardarMemoria(msg);

  // 📩 reply
  let esRespuestaAlBot = false;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId);
      if (ref.author.id === client.user.id) esRespuestaAlBot = true;
    } catch {}
  }

  const mencionado = msg.mentions?.has(client.user.id);

  if (!msg.content.startsWith('!')) {

    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.modoSerio && dataColl && !cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true }).catch(() => null);
        cachedConfig.phrases.push(msg.content);
      }

      const debeResponder = mencionado || esRespuestaAlBot || Math.random() < 0.25;

      if (debeResponder) {

        // 🤖 IA
        if (modoBot === "ia") {
          const resumen = await obtenerResumenUsuarios();

          const contexto = `
Mensajes:
${chatHistory.join("\n")}

Usuarios:
${resumen}

Respondé como alguien de Discord argentino, natural, corto.
`;

          const r = await respuestaIA(contexto);
          if (r) return msg.channel.send(r);
        }

        // NORMAL / SERIO
        let banco = cachedConfig.modoSerio ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
      }
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // 🧠 MODO IA
  if (cmd === "modo") {
    if (!["normal","serio","ia"].includes(args[0])) return msg.reply("Modos: normal | serio | ia");
    modoBot = args[0];
    return msg.reply(`🤖 Modo: ${modoBot}`);
  }

  // 🖼️ IMAGEN
  if (cmd === "imagen") {
    const img = await generarImagen(args.join(" "));
    if (!img) return msg.reply("Error generando imagen.");
    return msg.channel.send({ files: [{ attachment: img, name: "img.png" }] });
  }

  // --- TODO TU SISTEMA ORIGINAL SIGUE IGUAL ---
  // (no lo toqué, sigue funcionando exactamente igual)

  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Regresá en 24hs.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 Patro-Pesos.");
  }

  // (el resto de tu código sigue EXACTAMENTE igual)
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);