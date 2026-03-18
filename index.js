import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// --- CONFIGURACIÓN Y ESTADO ---
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
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección bardo." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Mística premium." }
];

// --- SERVIDOR ---
http.createServer((req, res) => { 
  res.write("Patroclo-B PRO B02.2 ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

// --- FUNCIONES IA / IMAGEN / GIF ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch { return null; }
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
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    memoryColl = database.collection('user_memory');
    await loadConfig();
    console.log("✅ PATROCLO-B PRO B02.2 CONECTADO");
  } catch (e) { console.log("❌ Error DB:", e); }
}

async function loadConfig() {
  const dbData = await dataColl?.findOne({ id: "main_config" });
  if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
}

async function guardarMemoria(msg) {
  if (!memoryColl || msg.author.bot) return;
  const palabras = msg.content.toLowerCase().split(/\s+/);
  let update = { $push: { mensajes: { $each: [msg.content], $slice: -50 } }, $inc: {}, $set: {} };
  palabras.forEach(p => { if(p.length > 3) update.$inc[`palabras.${p}`] = 1; });
  if (msg.content.match(/boludo|hdp|puto|bobo/)) update.$set.estilo = "bardo";
  await memoryColl.updateOne({ userId: msg.author.id }, update, { upsert: true });
}

connectDb();

// --- EVENTOS ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);
  await guardarMemoria(msg);

  // Aprendizaje de frases
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
    if (!cachedConfig.modoSerio && !cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl?.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // Respuestas automáticas
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    if (mencionado || Math.random() < 0.20) {
        if (modoBot === "ia") {
            const contexto = `Sos Patroclo-B, bot de Discord argentino, rkt y facha. Historial: ${chatHistory.join("|")}. Respondé a: ${msg.content}`;
            const r = await respuestaIA(contexto);
            if (r) return msg.reply(r);
        }
        let banco = cachedConfig.modoSerio ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
    }
    chatHistory.push(msg.content); if (chatHistory.length > 15) chatHistory.shift();
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // --- COMANDOS JUEGOS ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions?.users?.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("No tenés un mango.");
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
    if (user.points < monto) return msg.reply("Fondos insuficientes.");
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
      return msg.reply("💥 **BANG!** Perdiste todo.");
    }
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: Math.floor(monto * 1.5) } });
    return msg.reply("🔫 **CLIC.** Zafaste y ganaste un extra.");
  }

  if (cmd === 'suerte') return msg.reply(`🪙 Tiraste la moneda: **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**`);
  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te retó.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id; const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 <@${g}> se llevó los **${reto.monto}**.`);
  }

  // --- COMANDOS ECONOMÍA ---
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 Patro-Pesos.");
  }
  if (cmd === 'transferencia' || cmd === 'pay') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]);
    if (!mencion || !monto || monto <= 0) return msg.reply("❌ `!pay @user monto`.");
    if (user.points < monto) return msg.reply("No tenés esa guita.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
    await usersColl.updateOne({ userId: mencion.id }, { $inc: { points: monto } }, { upsert: true });
    return msg.reply(`💸 Transferiste **${monto}** a <@${mencion.id}>.`);
  }
  if (cmd === 'tienda') return msg.reply(`🛒 **TIENDA**\n${ITEMS_TIENDA.map(i => `ID: ${i.id} | **${i.nombre}** - 💰${i.precio}`).join('\n')}`);
  if (cmd === 'comprar') {
    const item = ITEMS_TIENDA.find(i => i.id === parseInt(args[0]));
    if (!item || user.points < item.precio) return msg.reply("Error en compra.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -item.precio }, $push: { inventario: item.nombre } });
    return msg.reply(`✅ Compraste: **${item.nombre}**.`);
  }

  // --- COMANDOS MÍSTICA / MULTIMEDIA ---
  if (cmd === 'nekoask') return args.length ? msg.channel.send(`Nekoask: ${args.join(' ')}`) : msg.reply("Preguntá algo.");
  if (cmd === 'bola8') return msg.reply(`🎱 | **${["Sí.", "No.", "Quizás.", "Ni ahí."][Math.floor(Math.random()*4)]}**`);
  if (cmd === 'horoscopo') {
    const signos = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
    const pred = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Bardo astral.";
    return msg.reply(`🪐 **${signos[Math.floor(Math.random()*12)]}:** "${pred}"`);
  }
  if (cmd === 'universefacts') return msg.reply(cachedConfig.universeFacts[Math.floor(Math.random()*cachedConfig.universeFacts.length)] || "El cosmos calla.");
  if (cmd === 'bardo') return msg.reply(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Sin bardo.");
  if (cmd === 'gif' || cmd === 'foto') {
    const url = await buscarGif(args.join(' '));
    return url ? msg.reply(url) : msg.reply("No encontré nada.");
  }
  if (cmd === "imagen") {
    msg.channel.sendTyping(); const img = await generarImagen(args.join(" "));
    if (!img) return msg.reply("No pude pintar eso.");
    return msg.channel.send({ files: [{ attachment: img, name: "patroclo.png" }] });
  }

  // --- COMANDOS SISTEMA ---
  if (cmd === "modo" || cmd === "personalidad") {
    if (msg.author.id !== MI_ID_BOSS) return msg.reply("Solo el Boss cambia mi adn.");
    if (!["normal","serio","ia"].includes(args[0])) return msg.reply("Modos: normal | serio | ia");
    modoBot = args[0]; cachedConfig.modoSerio = (modoBot === "serio");
    return msg.reply(`🤖 Modo **${modoBot.toUpperCase()}** activado.`);
  }
  if (cmd === 'stats') return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} frases | Modo: ${modoBot} | Memoria: ${chatHistory.length}`);
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
    return msg.reply(cachedConfig.mantenimiento ? "⚠️ MANTENIMIENTO ON." : "🚀 MANTENIMIENTO OFF.");
  }
  if (cmd === 'sugerencias') {
    const boss = await client.users.fetch(MI_ID_BOSS).catch(() => null);
    if (boss) { boss.send(`💡 Sugerencia de ${msg.author.tag}: ${args.join(' ')}`); return msg.reply("✅ Enviada al Boss."); }
  }

  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B B02.2').setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!aceptar`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!transferencia`, `!tienda`, `!comprar`' },
        { name: '🌌 MÍSTICA', value: '`!nekoask`, `!bola8`, `!horoscopo`, `!universefacts`, `!bardo`, `!gif`, `!foto`, `!imagen`' },
        { name: '🛠️ SISTEMA', value: '`!personalidad`, `!stats`, `!mantenimiento`, `!sugerencias`' }
      ).setImage(IMG_PATROCLO_FUERTE).setFooter({ text: "Patroclo-B Pro" });
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