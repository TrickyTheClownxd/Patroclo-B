import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor Keep-Alive para Render
http.createServer((req, res) => { 
  res.write("Patroclo-B B08.5 OMEGA ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "El bardo es para Giles."], 
  lastChannelId: null, 
  mantenimiento: false,
  modoBot: "ia" 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// --- MOTORES IA Y GENERACIÓN ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

async function queryHF(prompt, model) {
  try {
    const response = await axios.post(`https://api-inference.huggingface.co/models/${model}`,
      { inputs: prompt }, { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch { return null; }
}

// --- CONEXIÓN DB ---
async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    const dbData = await dataColl.findOne({ id: "main_config" });
    if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
    console.log("✅ OMEGA SYSTEM ONLINE");
  } catch (e) { console.log("❌ Error DB:", e); }
}
connectDb();

// --- EVENTO READY ---
client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      const e = new EmbedBuilder().setTitle('⚙️ REPORTE OMEGA B08.5').setColor('#7D26CD')
        .addFields({ name: '🔥 Status', value: 'Ya llegué perritas. Motores de IA, Juegos y Mística listos.' });
      await channel.send({ embeds: [e] }).catch(() => null);
    }
  }
});

// --- MANEJO DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // Aprendizaje ADN
  if (!msg.author.bot && msg.content.length > 3 && !msg.content.startsWith('!') && !msg.content.includes('http')) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // Lógica Social (25% Probabilidad)
  if (!msg.content.startsWith('!')) {
    const menc = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    const esReply = msg.reference && (await msg.channel.messages.fetch(msg.reference.messageId)).author.id === client.user.id;

    if (menc || esReply || Math.random() < 0.25) {
      msg.channel.sendTyping();
      if (cachedConfig.modoBot === "ia") {
        const adn = cachedConfig.phrases.slice(-30).join(" | ");
        const r = await respuestaIA(`Actúa como Patroclo-B, facha y bardo. ADN: ${adn}. Responde a ${msg.author.username}: ${msg.content}`);
        if (r) return msg.reply(r);
      }
      return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Qué decís.");
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // --- COMANDOS JUEGOS ---
  if (cmd === 'poker') {
    const menc = msg.mentions.users.first();
    const monto = parseInt(args[1]) || 500;
    if (!menc || user.points < monto) return msg.reply("Datos inválidos.");
    client.retos.set(menc.id, { tipo: 'poker', retador: msg.author.id, monto, manos: { [msg.author.id]: [generarCarta(), generarCarta()], [menc.id]: [generarCarta(), generarCarta()] }, mesa: [generarCarta(), generarCarta(), generarCarta()] });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('poker_ver').setLabel('Ver Cartas 🎴').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('poker_aceptar').setLabel('Aceptar ✅').setStyle(ButtonStyle.Success));
    return msg.channel.send({ content: `🃏 **POKER:** <@${msg.author.id}> vs <@${menc.id}> por **${monto} PP**.`, components: [row] });
  }

  if (cmd === 'penal') {
    const menc = msg.mentions.users.first();
    const monto = parseInt(args[1]) || 500;
    if (!menc) return msg.reply("Mencioná a alguien.");
    client.retos.set(menc.id, { tipo: 'penal', retador: msg.author.id, monto, stage: 'pateando' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('penal_izq').setLabel('Izq').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('penal_cen').setLabel('Centro').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('penal_der').setLabel('Der').setStyle(ButtonStyle.Secondary));
    return msg.channel.send({ content: `⚽ <@${msg.author.id}> patea contra <@${menc.id}> por **${monto} PP**.`, components: [row] });
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]) || 500;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ruleta_${monto}`).setLabel('Gatillar 🔫').setStyle(ButtonStyle.Danger));
    return msg.channel.send({ content: `💀 **RULETA:** <@${msg.author.id}> arriesga **${monto} PP**.`, components: [row] });
  }

  // --- COMANDOS MÍSTICA E IMAGEN ---
  if (cmd === 'foto') {
    msg.channel.send("📸 **Revelando...**");
    const img = await queryHF(args.join(' '), "dreamlike-art/dreamlike-photoreal-2.0");
    return img ? msg.channel.send({ files: [{ attachment: img, name: 'f.png' }] }) : msg.reply("Error API.");
  }
  if (cmd === 'imagen') {
    msg.channel.send("🎨 **Pintando...**");
    const img = await queryHF(args.join(' '), "runwayml/stable-diffusion-v1-5");
    return img ? msg.channel.send({ files: [{ attachment: img, name: 'a.png' }] }) : msg.reply("Error API.");
  }
  if (cmd === 'gif') {
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')}&limit=1`);
    return msg.reply(res.data.data[0]?.url || "Nada.");
  }
  if (cmd === 'horoscopo') return msg.reply(`🪐 **Destino:** "${cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]}"`);
  if (cmd === 'bola8') return msg.reply(`🎱 | ${["Sí.", "No.", "Quizás."][Math.floor(Math.random()*3)]}`);

  // --- AYUDA Y STATS ---
  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO OMEGA').setColor('#7D26CD')
      .addFields({ name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`' }, { name: '🌌 MÍSTICA', value: '`!foto`, `!imagen`, `!gif`, `!horoscopo`' }, { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`' })
      .setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [e] });
  }
  if (cmd === 'stats') return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${cachedConfig.modoBot.toUpperCase()}`);
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** PP.`);
  if (cmd === 'daily') {
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 } });
    return msg.reply("💵 +500 PP.");
  }
});

// --- INTERACCIONES ---
client.on('interactionCreate', async (int) => {
  if (!int.isButton()) return;
  const retoKey = Array.from(client.retos.keys()).find(k => k === int.user.id || client.retos.get(k).retador === int.user.id);
  const reto = client.retos.get(retoKey);

  if (int.customId.startsWith('ruleta_')) {
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -parseInt(int.customId.split('_')[1]) } });
      return int.update({ content: "💥 **BANG!**", components: [] });
    }
    return int.update({ content: "🚩 **CLIC.** Sobreviviste.", components: [] });
  }

  if (!reto) return;
  if (int.customId === 'poker_ver') return int.reply({ content: `🃏 Cartas: ${reto.manos[int.user.id].join(" ")}`, ephemeral: true });
  if (int.customId === 'poker_aceptar' && int.user.id === retoKey) {
    const win = Math.random() > 0.5 ? reto.retador : int.user.id;
    await usersColl.updateOne({ userId: win }, { $inc: { points: reto.monto } });
    client.retos.delete(retoKey);
    return int.update({ content: `🎰 <@${win}> ganó **${reto.monto*2} PP**. Mesa: ${reto.mesa.join(" ")}`, components: [] });
  }
  if (int.customId.startsWith('penal_')) {
    if (reto.stage === 'pateando' && int.user.id === reto.retador) { reto.dir = int.customId; reto.stage = 'atajando'; return int.update({ content: `🥅 Pateó <@${reto.retador}>. ¡Atajá <@${retoKey}>!` }); }
    if (reto.stage === 'atajando' && int.user.id === retoKey) {
      const gol = int.customId !== reto.dir;
      const win = gol ? reto.retador : int.user.id;
      await usersColl.updateOne({ userId: win }, { $inc: { points: reto.monto } });
      client.retos.delete(retoKey);
      return int.update({ content: gol ? "⚽ **GOOOL!**" : "🧤 **ATAJÓ!**", components: [] });
    }
  }
});

function generarCarta() {
  const p=['♠️','♥️','♦️','♣️'], v=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  return `${v[Math.floor(Math.random()*v.length)]}${p[Math.floor(Math.random()*p.length)]}`;
}

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);