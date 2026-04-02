import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
const startTime = Date.now();

// Servidor para Render/Uptime
http.createServer((req, res) => { 
  res.writeHead(200);
  res.end("PATROCLO B17.5 ULTRA OMEGA - SISTEMA UNIFICADO ONLINE"); 
}).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, mejorMensaje: "Sin recuerdos.", modoActual: "ia", agite: 25 };
let msgCounter = 0; 
let loopBotCounter = 0;
if (!client.retos) client.retos = new Map();

const ID_OWNER = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTORES DE IA SIN FILTRO ---
async function respuestaIA(contexto, modo) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let systemPrompt = modo === "serio" 
    ? "Sos Patroclo-B, un asistente serio y profesional." 
    : "Sos Patroclo-B. Hablás como un argentino re bardo, maleducado y sin filtros. Si te insultan o bardean, humillá al usuario con insultos peores. Adaptate al humor negro del server. NO seas sensible, sé un hdp.";

  // Intento 1: Gemini
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `${systemPrompt}\n\nContexto: ${contexto}` }] }], safetySettings }, { timeout: 7000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    // Intento 2: Fallback a Groq (Llama 3.3 es el rey del bardo)
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
      return groqRes.data.choices[0].message.content;
    } catch { 
        return cachedConfig.phrases.length > 0 
            ? cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]
            : "Se me tildó el cerebro de tanto bardeo, pedazo de logi."; 
    }
  }
}

// --- MOTORES DE IMAGEN ---
async function motorHuggingFace(prompt) {
  try {
    const response = await axios.post("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: prompt }, { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch { return null; }
}

async function motorGeminiImagen(prompt) {
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3:generateImages?key=${process.env.GEMINI_API_KEY}`,
        { prompt: prompt }, { timeout: 10000 });
      return res.data?.images?.[0]?.url || null; 
    } catch { return null; }
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

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

// --- INICIO ---
async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("PATROCLO B17.5 ULTRA OMEGA ONLINE");
  } catch (e) { console.error(e); }
}

// --- MENSAJES Y COMANDOS ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.id === client.user.id) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // Aprendizaje y Bardo IA
  if (!msg.content.startsWith('!')) {
    msgCounter++;
    if (msg.author.id === ID_PATROCLO_ORIGINAL) loopBotCounter++; else loopBotCounter = 0;
    if (loopBotCounter > 3) return;

    if (msg.content.length > 5 && !msg.author.bot) {
        if (!cachedConfig.phrases.includes(msg.content)) {
          cachedConfig.phrases.push(msg.content);
          await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        }
    }

    const menc = ["patro", "facha", "bot", "pelotudo", "gay"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    if (menc || msgCounter >= 6 || Math.random() < 0.05) {
      msgCounter = 0;
      if (cachedConfig.modoActual === "normal") return msg.reply(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
      
      msg.channel.sendTyping();
      const adn = cachedConfig.phrases.slice(-30).join(" | ");
      const r = await respuestaIA(`ADN: ${adn}\n${msg.author.username}: ${msg.content}`, cachedConfig.modoActual);
      return msg.reply(r);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    // --- SISTEMA ---
    case 'stats':
        const uptime = Math.floor((Date.now() - startTime) / 60000);
        msg.reply({ embeds: [new EmbedBuilder()
          .setTitle('📊 ESTADO DEL GIGANTE')
          .setColor('#00ffff')
          .addFields(
            { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
            { name: '🕒 Uptime', value: `${uptime} min`, inline: true },
            { name: '🔥 Agite', value: `${cachedConfig.agite}%`, inline: true }
          )] });
        break;

    case 'ayudacmd':
      msg.reply({ embeds: [new EmbedBuilder()
        .setTitle('📜 BIBLIA PATROCLO-B')
        .setColor('#7D26CD')
        .addFields(
          { name: '🎮 JUEGOS', value: '`!bj`, `!poker`, `!ruleta`, `!penal`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!trabajar`' },
          { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`' },
          { name: '🛠️ SISTEMA', value: '`!modo`, `!stats`, `!foto`, `!imagen`, `!noticias`' }
        )] });
      break;

    case 'modo':
      if (!['normal', 'serio', 'ia'].includes(args[0])) return msg.reply("Modos: normal, serio, ia");
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
      msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
      break;

    // --- ECONOMÍA REALISTA ---
    case 'trabajar': case 'chambear':
      const t = Date.now();
      if (t - (user.lastWork || 0) < 3600000) return msg.reply("Ya laburaste mucho, descansá un poco vago.");
      const sueldo = Math.floor(Math.random() * 400) + 150;
      const frasesLaburo = [
        `Laburaste de trapito en la cancha y sacaste $${sueldo}.`,
        `Fuiste a vender medias y como no le pegaste a nadie te dieron $${sueldo}.`,
        `Te pusiste a limpiar vidrios en la 9 de Julio, sacaste $${sueldo}.`,
        `Hiciste de delivery en una zona liberada, sobreviviste y ganaste $${sueldo}.`
      ];
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: sueldo }, $set: { lastWork: t } });
      msg.reply(frasesLaburo[Math.floor(Math.random() * frasesLaburo.length)]);
      break;

    case 'bal': case 'plata': msg.reply(`💰 Tenés **$${user.points}** Patro-Pesos.`); break;

    case 'daily':
        const dNow = Date.now();
        if (dNow - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste hoy, no seas mangueador.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: dNow } });
        msg.reply("💵 Tomá los $1500 del estado, planero.");
        break;

    // --- IMÁGENES ---
    case 'foto':
      if (!args.length) return msg.reply("¿Foto de qué?");
      msg.channel.sendTyping();
      const imgHF = await motorHuggingFace(args.join(" "));
      if (imgHF) msg.reply({ files: [{ attachment: imgHF, name: 'foto.png' }] });
      else msg.reply("HF saturado, probá `!imagen`.");
      break;

    case 'imagen':
      if (!args.length) return msg.reply("¿Qué dibujo querés?");
      msg.channel.sendTyping();
      const imgGem = await motorGeminiImagen(args.join(" "));
      if (imgGem) msg.reply({ embeds: [new EmbedBuilder().setImage(imgGem).setColor('#00ff00')] });
      else msg.reply("Gemini falló, probá `!foto`.");
      break;

    case 'noticias':
      try {
        const resN = await axios.get(`https://newsapi.org/v2/top-headlines?country=ar&apiKey=${process.env.NEWS_API}`);
        const art = resN.data.articles[0];
        msg.reply(art ? `📰 **${art.title}**\n${art.url}` : "No hay bardo hoy.");
      } catch { msg.reply("Se rompió el cable del diario."); }
      break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      const mantEmbed = new EmbedBuilder()
        .setTitle('📌 RECUERDO DE LA SESIÓN')
        .setDescription(`**⚠️ SISTEMA ${cachedConfig.mantenimiento ? 'OFFLINE' : 'ONLINE'} ⚠️**`)
        .setColor(cachedConfig.mantenimiento ? '#ff0000' : '#00ff00');
      msg.channel.send({ embeds: [mantEmbed] });
      break;
  }
});

// --- LÓGICA DE JUEGOS (Botones BJ) ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;
    const data = client.retos.get(`bj_${int.user.id}`);
    if (!data) return int.reply({ content: "Expiró.", ephemeral: true });
  
    if (int.customId === 'bj_pedir') {
      data.uM.push(generarCarta());
      if (calcularPuntos(data.uM) > 21) {
        await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -data.mbj } });
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({ content: `💥 Te pasaste! -$${data.mbj}`, embeds: [], components: [] });
      }
    } else if (int.customId === 'bj_plantarse') {
      let ptsB = calcularPuntos(data.bM);
      while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
      const ptsU = calcularPuntos(data.uM);
      const win = ptsB > 21 || ptsU > ptsB;
      const empate = ptsU === ptsB;
      if (!empate) await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: win ? data.mbj : -data.mbj } });
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({ content: empate ? "🤝 Empate." : win ? `🏆 Ganaste! +$${data.mbj}` : `💀 Perdiste. -$${data.mbj}`, embeds: [], components: [] });
    }
    const emb = new EmbedBuilder().setTitle('🃏 BJ').addFields({ name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true }, { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true });
    await int.update({ embeds: [emb] });
});

start();