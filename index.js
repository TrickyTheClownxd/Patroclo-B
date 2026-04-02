import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor para Keep-Alive
http.createServer((req, res) => { res.write("PATROCLO B17.5 ULTRA OMEGA ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, mejorMensaje: "Sin recuerdos.", modoActual: "ia" };
let msgCounter = 0; 
let loopBotCounter = 0;
if (!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';
const ID_OWNER = '986680845031059526';

// --- MOTORES DE IA ---
async function respuestaIA(contexto) {
  try {
    // Intento 1: Gemini (Principal)
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 6000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    try {
      // Intento 2: Groq (Llama 3)
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
      return groqRes.data.choices[0].message.content;
    } catch { return null; }
  }
}

// --- UTILIDADES ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [{ n: 'A', v: 11 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }, { n: '2', v: 2 }, { n: '3', v: 3 }, { n: '4', v: 4 }, { n: '5', v: 5 }, { n: '6', v: 6 }, { n: '7', v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 }, { n: '10', v: 10 }];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

const calcularPuntos = (mano) => {
  let pts = mano.reduce((acc, c) => acc + c.val, 0);
  let ases = mano.filter(c => c.txt.startsWith('A')).length;
  while (pts > 21 && ases > 0) { pts -= 10; ases--; }
  return pts;
};

// --- BASE DE DATOS ---
async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("Patroclo B17.5 Online");
  } catch (e) { console.log("Error de inicio:", e); }
}

// --- INTERACCIONES (BOTONES BLACKJACK) ---
client.on('interactionCreate', async (int) => {
  if (!int.isButton()) return;
  const data = client.retos.get(`bj_${int.user.id}`);
  if (!data) return int.reply({ content: "La partida expiró.", ephemeral: true });

  if (int.customId === 'bj_pedir') {
    data.uM.push(generarCarta());
    if (calcularPuntos(data.uM) > 21) {
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -data.mbj } });
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({ content: `💥 **Te pasaste!** Perdiste $${data.mbj}.`, embeds: [], components: [] });
    }
  } else if (int.customId === 'bj_plantarse') {
    let ptsB = calcularPuntos(data.bM);
    while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
    const ptsU = calcularPuntos(data.uM);
    const win = ptsB > 21 || ptsU > ptsB;
    const empate = ptsU === ptsB;
    if (!empate) await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: win ? data.mbj : -data.mbj } });
    client.retos.delete(`bj_${int.user.id}`);
    return int.update({ content: empate ? "🤝 **Empate.** No perdés nada." : win ? `🏆 **Ganaste!** El bot tenía ${ptsB}. Sumás +$${data.mbj}` : `💀 **Perdiste.** El bot tenía ${ptsB}. -$${data.mbj}`, embeds: [], components: [] });
  }
  const emb = new EmbedBuilder().setTitle('🃏 BLACKJACK').addFields({ name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true }, { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true }).setColor('#2b2d31');
  await int.update({ embeds: [emb] });
});

// --- MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  if (msg.author.id === client.user.id) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // --- LÓGICA DE ADN Y DIÁLOGO ---
  if (!msg.content.startsWith('!')) {
    msgCounter++;
    if (msg.author.id === ID_PATROCLO_ORIGINAL) loopBotCounter++; else loopBotCounter = 0;
    if (loopBotCounter > 5) return;

    // Aprender frases
    if (msg.content.length > 5 && !msg.content.includes('http') && !msg.author.bot) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }

    const apodos = ["patroclo", "patro", "facha", "patroclin"];
    const menc = apodos.some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    const triggerHableSolo = msgCounter >= Math.floor(Math.random() * 2) + 2;

    if (menc || triggerHableSolo) {
      msgCounter = 0;
      if (cachedConfig.modoActual === "normal") {
        return msg.reply(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Qué decís facha.");
      }
      
      const adn = cachedConfig.phrases.slice(-25).join(" | ");
      const prompt = `Sos Patroclo-B, bot argentino. Modo: ${cachedConfig.modoActual}. ADN: ${adn}. Responde a ${msg.author.username}: ${msg.content}`;
      const r = await respuestaIA(prompt);
      return msg.reply(r || cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'modo':
      if (!['normal', 'serio', 'ia'].includes(args[0])) return msg.reply("Modos: `normal`, `serio`, `ia`.");
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
      msg.reply(`🕹️ Modo cambiado a: **${args[0].toUpperCase()}**`);
      break;

    case 'ayudacmd':
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B').setColor('#7D26CD').addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!bj`, `!penal`, `!ruleta`, `!bingo`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!trabajar`, `!reto`, `!stats`' },
        { name: '🌌 MÍSTICA', value: '`!suerte`, `!bola8`, `!bardo`, `!acusar`' },
        { name: '⚙️ SISTEMA', value: '`!modo`, `!mantenimiento`, `!sugerencia`, `!noticias`' }
      )] });
      break;

    case 'poker':
      const apuestaP = parseInt(args[0]) || 500;
      if (user.points < apuestaP) return msg.reply("No tenés guita.");
      const suerteP = Math.random();
      let winP = -apuestaP, txtP = "No tenés nada, sos malísimo.";
      if (suerteP > 0.96) { winP = apuestaP * 5; txtP = "🔥 ¡POKER DE ASES!"; }
      else if (suerteP > 0.8) { winP = apuestaP * 2; txtP = "🃏 Color."; }
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: winP } });
      msg.reply(`🃏 **POKER LLAMA4**\n"${txtP}"\n${winP > 0 ? `Ganaste **$${winP}**` : `Perdiste **$${apuestaP}**`}`);
      break;

    case 'bj':
      const mbj = parseInt(args[0]) || 500;
      if (user.points < mbj) return msg.reply("No tenés plata.");
      const uM = [generarCarta(), generarCarta()], bM = [generarCarta(), generarCarta()];
      client.retos.set(`bj_${msg.author.id}`, { mbj, uM, bM });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_pedir').setLabel('Pedir 🃏').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_plantarse').setLabel('Plantarse ✋').setStyle(ButtonStyle.Danger)
      );
      msg.reply({ embeds: [new EmbedBuilder().setTitle('🃏 BLACKJACK').addFields({ name: 'Tu Mano', value: `${uM.map(c=>c.txt).join(" ")} (${calcularPuntos(uM)})`, inline: true }, { name: 'Crupier', value: `${bM[0].txt} [❓]`, inline: true }).setColor('#2b2d31')], components: [row] });
      break;

    case 'bal': case 'plata':
      msg.reply(`💰 **Saldo de ${msg.author.username}:** $${user.points} Patro-Pesos.`);
      break;

    case 'trabajar':
      const ahoraW = Date.now();
      if (ahoraW - (user.lastWork || 0) < 3600000) return msg.reply("A laburar a la obra, podés cada 1 hora.");
      const pagoW = Math.floor(Math.random() * 1500) + 500;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: pagoW }, $set: { lastWork: ahoraW } });
      msg.reply(`👷 Laburaste y te pagaron **$${pagoW}**.`);
      break;

    case 'suerte':
      const rs = await respuestaIA("Inventá un horóscopo bardo y disociado para hoy. Corto.");
      msg.reply(`✨ **HORÓSCOPO:** ${rs || "Te va a ir mal."}`);
      break;

    case 'gif':
      try {
        const query = args.join(" ") || "argentina bardo";
        const resG = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${query}&limit=1&rating=g`);
        msg.reply(resG.data.data[0]?.url || "No encontré nada.");
      } catch { msg.reply("Error con Giphy."); }
      break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      msg.channel.send({ embeds: [new EmbedBuilder().setTitle(cachedConfig.mantenimiento ? '⚠️ SISTEMA OFFLINE' : '✅ SISTEMA ONLINE').setDescription(`📌 **RECUERDO:** ${cachedConfig.mejorMensaje}`).setColor(cachedConfig.mantenimiento ? '#ff0000' : '#00ff00')] });
      break;

    case 'stats':
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📊 STATS').setColor('#0099ff').addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
        { name: '🤖 MODO', value: cachedConfig.modoActual, inline: true },
        { name: '🏆 RECUERDO', value: cachedConfig.mejorMensaje }
      )] });
      break;

    case 'sugerencia':
      if (!args.length) return msg.reply("Escribí la sugerencia.");
      await dataColl.updateOne({ id: "sugerencias" }, { $push: { lista: { autor: msg.author.username, id: msg.author.id, texto: args.join(" "), fecha: new Date() } } }, { upsert: true });
      msg.reply("✅ Joya, guardada.");
      break;

    case 'daily':
        const tD = Date.now(); if (tD - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: tD } });
        msg.reply("💵 Cobraste **$1500**.");
        break;

    case 'noticias':
      msg.reply("📰 **NOTICIAS:** Sistema Multi-IA Gemini/Groq activo. Modos !modo normal/serio/ia habilitados.");
      break;
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

start();