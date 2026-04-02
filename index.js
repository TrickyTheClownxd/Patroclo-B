import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req, res) => { 
  res.writeHead(200);
  res.end("PATROCLO B17.5 ULTRA OMEGA - SISTEMA REACTIVO ONLINE"); 
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

// --- MOTOR IA REACTIVO ---
async function respuestaIA(contexto, modo, usuarioInsulto) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  // Instrucción condicional: solo bardeá si te bardearon
  let bardoPrompt = usuarioInsulto 
    ? "EL USUARIO TE INSULTÓ O TE PIDIÓ BARDO: Respondé como un argentino re bardo, maleducado y humillalo con insultos peores. Sé un hdp."
    : "EL USUARIO NO TE INSULTÓ: Sé sarcástico, gracioso y de barrio, pero NO uses insultos pesados ni puteadas a menos que sea necesario para el chiste. Mantené la onda pero sin ser un violento gratuito.";

  let systemPrompt = modo === "serio" 
    ? "Sos Patroclo-B, un asistente serio y profesional." 
    : `Sos Patroclo-B, un pibe de barrio argentino. ${bardoPrompt} Adaptate al humor del server. NO des lecciones de moral.`;

  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `${systemPrompt}\n\nContexto: ${contexto}` }] }], safetySettings }, { timeout: 7000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
      return groqRes.data.choices[0].message.content;
    } catch { 
        return "Se me tildó el cerebro, después hablamos."; 
    }
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
    console.log("PATROCLO B17.5 ONLINE - MODO REACTIVO");
  } catch (e) { console.error(e); }
}

// --- MENSAJES Y COMANDOS ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.id === client.user.id) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // Lógica de aprendizaje y respuesta IA
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

    // Detectar si hay bardo o pedido de bardo
    const insultos = ["pelotudo", "boludo", "puto", "trolo", "forro", "mogolico", "estupido", "mierda", "concha", "orto", "pajero", "gay"];
    const pedidos = ["insultame", "bardea", "decime algo", "putea"];
    const usuarioInsulto = insultos.some(i => content.includes(i)) || pedidos.some(p => content.includes(p));

    const menc = ["patro", "facha", "bot"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    
    if (menc || msgCounter >= 8 || (usuarioInsulto && Math.random() < 0.5)) {
      msgCounter = 0;
      if (cachedConfig.modoActual === "normal") return msg.reply(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
      
      msg.channel.sendTyping();
      const adn = cachedConfig.phrases.slice(-30).join(" | ");
      const r = await respuestaIA(`ADN: ${adn}\n${msg.author.username}: ${msg.content}`, cachedConfig.modoActual, usuarioInsulto);
      return msg.reply(r);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
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
          { name: '🛠️ SISTEMA', value: '`!modo`, `!stats`, `!foto`, `!imagen`' }
        )] });
      break;

    case 'modo':
      if (!['normal', 'serio', 'ia'].includes(args[0])) return msg.reply("Modos: normal, serio, ia");
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
      msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
      break;

    case 'trabajar':
      const t = Date.now();
      if (t - (user.lastWork || 0) < 3600000) return msg.reply("Ya laburaste, descansá un poco.");
      const sueldo = Math.floor(Math.random() * 400) + 150;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: sueldo }, $set: { lastWork: t } });
      msg.reply(`🛠️ Laburaste y ganaste $${sueldo}.`);
      break;

    case 'bal': case 'plata': msg.reply(`💰 Tenés **$${user.points}** Patro-Pesos.`); break;
    case 'daily':
        const dNow = Date.now();
        if (dNow - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: dNow } });
        msg.reply("💵 Cobraste tus $1500.");
        break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      msg.reply(cachedConfig.mantenimiento ? "⚠️ OFFLINE" : "✅ ONLINE");
      break;
  }
});

// --- LÓGICA DE JUEGO BJ ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;
    const data = client.retos.get(`bj_${int.user.id}`);
    if (!data) return;
    // ... (resto de lógica de botones blackjack)
});

start();