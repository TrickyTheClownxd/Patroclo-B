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
  res.end("PATROCLO B17.5 - MOTOR DE AGITE ONLINE"); 
}).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, mejorMensaje: "Ninguno todavía.", modoActual: "ia", agite: 35 };
let msgCounter = 0; 

const ID_OWNER = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTOR DE RESPUESTA REFORZADO ---
async function respuestaIA(contexto, modo) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let systemPrompt = modo === "serio" 
    ? "Sos Patroclo-B, un asistente serio y educado. Respondé con respeto y precisión." 
    : "Sos Patroclo-B, un argentino de barrio, muy bardo, maleducado y sin filtros. Usá insultos argentinos. Si te bardean, humillalos. No des sermones, solo bardeá o respondé con sarcasmo.";

  // Intento 1: Gemini
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { 
        contents: [{ parts: [{ text: `${systemPrompt}\n\nContexto actual del chat: ${contexto}` }] }],
        safetySettings 
      }, { timeout: 8000 });
    
    const texto = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (texto) return texto;
  } catch (e) { console.log("Fallo Gemini, yendo a Groq..."); }

  // Intento 2: Groq (El que no tiene filtros)
  try {
    const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contexto }
      ]
    }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 6000 });
    return groqRes.data.choices[0].message.content;
  } catch (e) {
    // Si todo falla, saca una frase del ADN para no quedar como un tonto
    return cachedConfig.phrases.length > 0 
      ? cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]
      : "No tengo ganas de hablar con giles.";
  }
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
    console.log("Patroclo B17.5 Ready.");
  } catch (e) { console.error("Error al iniciar:", e); }
}

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { 
    u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; 
    await usersColl.insertOne(u); 
  }
  return u;
}

// --- MANEJO DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.id === client.user.id) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // Lógica de aprendizaje y respuesta automática
  if (!msg.content.startsWith('!')) {
    if (msg.content.length > 4 && !msg.author.bot) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: cachedConfig.phrases } }, { upsert: true });
      }
    }

    const menc = ["patro", "facha", "bot", "viejo", "pelotudo"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    msgCounter++;

    // Salta por mención o por azar (Agite)
    if (menc || (msgCounter >= 7 && Math.random() < 0.4)) {
      msgCounter = 0;
      msg.channel.sendTyping();
      const adnReciente = cachedConfig.phrases.slice(-20).join(" | ");
      const respuesta = await respuestaIA(`ADN: ${adnReciente}. Mensaje de ${msg.author.username}: ${msg.content}`, cachedConfig.modoActual);
      return msg.reply(respuesta);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'stats':
      const up = Math.floor((Date.now() - startTime) / 60000);
      const sEmb = new EmbedBuilder()
        .setTitle('📊 ESTADO DEL GIGANTE')
        .setColor('#00FFFF')
        .addFields(
          { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
          { name: '🕒 Uptime', value: `${up} min`, inline: true },
          { name: '🔥 Agite', value: `${cachedConfig.agite}%`, inline: true }
        );
      msg.reply({ embeds: [sEmb] });
      break;

    case 'trabajar':
      const t = Date.now();
      if (t - (user.lastWork || 0) < 3600000) return msg.reply("Pará un poco, esclavo, volvé en una hora.");
      const plata = Math.floor(Math.random() * 500) + 150;
      const chambas = [
        `Laburaste de seguridad en un boliche y cobraste $${plata}.`,
        `Le lavaste el auto al puntero del barrio y te dio $${plata}.`,
        `Vendiste un par de cosas 'encontradas' y sacaste $${plata}.`
      ];
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: plata }, $set: { lastWork: t } });
      msg.reply(`🛠️ ${chambas[Math.floor(Math.random() * chambas.length)]}`);
      break;

    case 'bal': case 'plata':
      msg.reply(`💰 Tenés **$${user.points}** Patro-Pesos.`);
      break;

    case 'modo':
      if (!['ia', 'serio', 'normal'].includes(args[0])) return msg.reply("Poné un modo que sirva: ia, serio o normal.");
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
      msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
      break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      msg.reply(cachedConfig.mantenimiento ? "⚠️ OFFLINE" : "✅ ONLINE");
      break;
  }
});

start();