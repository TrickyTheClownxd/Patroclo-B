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
  res.end("PATROCLO B17.5 SUPREMO - ADN Y UNIVERSO ONLINE"); 
}).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, mejorMensaje: "Sin recuerdos.", modoActual: "ia", agite: 25 };
let msgCounter = 0; 

const ID_OWNER = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTOR IA ADAPTABLE ---
async function respuestaIA(contexto, modo) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let systemPrompt = modo === "serio" 
    ? "Sos Patroclo-B, un asistente serio y profesional." 
    : "Sos Patroclo-B. Hablás como un argentino re bardo, maleducado y sin filtros. Si te insultan, humillá al usuario. Adaptate al humor negro del server. NO seas sensible.";

  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `${systemPrompt}\n\nContexto: ${contexto}` }] }], safetySettings }, { timeout: 7000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
      return groqRes.data.choices[0].message.content;
    } catch { return "Se me tildó el cerebro de tanto bardeo."; }
  }
}

// --- BASE DE DATOS Y USUARIOS ---
async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("PATROCLO B17.5 ONLINE");
  } catch (e) { console.error(e); }
}

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

// --- EVENTOS DE MENSAJE ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.id === client.user.id) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // Lógica de aprendizaje y respuesta IA
  if (!msg.content.startsWith('!')) {
    if (msg.content.length > 5 && !msg.author.bot) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }
    
    const menc = ["patro", "facha", "bot", "pelotudo"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    if (menc || Math.random() < 0.1) {
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
    case 'ayudacmd':
      const helpEmbed = new EmbedBuilder()
        .setTitle('📜 BIBLIA PATROCLO-B')
        .setColor('#2b2d31')
        .addFields(
          { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!bj`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!trabajar`, `!tienda`' },
          { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`, `!personalidad`' },
          { name: '🛠️ SISTEMA', value: '`!stats`, `!mantenimiento`, `!modo`, `!foto`, `!imagen`' }
        );
      msg.reply({ embeds: [helpEmbed] });
      break;

    case 'stats':
      const uptime = Math.floor((Date.now() - startTime) / 60000);
      const statsEmbed = new EmbedBuilder()
        .setTitle('📊 ESTADO DEL GIGANTE')
        .setColor('#00ffff')
        .addFields(
          { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
          { name: '🕒 Uptime', value: `${uptime} min`, inline: true },
          { name: '🔥 Agite', value: `${cachedConfig.agite}%`, inline: true }
        )
        .setFooter({ text: 'Patroclo-B B17.5' });
      msg.reply({ embeds: [statsEmbed] });
      break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      
      const mantEmbed = new EmbedBuilder()
        .setTitle('📌 RECUERDO DE LA SESIÓN')
        .setDescription(`El bot piensa que este fue el mejor mensaje: "${cachedConfig.mejorMensaje}"\n\n**⚠️ SISTEMA ${cachedConfig.mantenimiento ? 'OFFLINE' : 'ONLINE'} ⚠️**`)
        .setColor(cachedConfig.mantenimiento ? '#ff0000' : '#00ff00')
        .setFooter({ text: 'El Boss está actualizando el ADN.' });
      msg.channel.send({ embeds: [mantEmbed] });
      break;

    // --- ECONOMÍA ---
    case 'trabajar':
    case 'chambear':
      const ahora = Date.now();
      if (ahora - (user.lastWork || 0) < 3600000) return msg.reply("Ya laburaste demasiado, descansá un poco vago.");
      const sueldo = Math.floor(Math.random() * 400) + 100;
      const frasesLaburo = [
        `Laburaste de trapito en la cancha y sacaste $${sueldo}.`,
        `Fuiste a vender medias y por no pegarle a nadie te dieron $${sueldo}.`,
        `Te pusiste a limpiar vidrios en la 9 de Julio, sacaste $${sueldo}.`,
        `Hiciste de delivery en una zona liberada, sobreviviste y ganaste $${sueldo}.`
      ];
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: sueldo }, $set: { lastWork: ahora } });
      msg.reply(frasesLaburo[Math.floor(Math.random() * frasesLaburo.length)]);
      break;

    case 'bal': case 'plata':
      msg.reply(`💰 Tenés **$${user.points}** Patro-Pesos.`);
      break;

    case 'daily':
      const dNow = Date.now();
      if (dNow - (user.lastDaily || 0) < 86400000) return msg.reply("No seas mangueador, volvé mañana.");
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: dNow } });
      msg.reply("💵 Tomá los $1500 del estado, planero.");
      break;

    // --- JUEGOS ---
    case 'ruleta':
      const apuestaR = parseInt(args[0]);
      if (!apuestaR || apuestaR <= 0 || user.points < apuestaR) return msg.reply("Poné una apuesta válida, seco.");
      const color = args[1]; // rojo, negro, verde
      const resultado = Math.random();
      let gano = false;
      let multi = 2;

      if (resultado < 0.05) { gano = (color === 'verde'); multi = 14; }
      else if (resultado < 0.5) { gano = (color === 'rojo'); }
      else { gano = (color === 'negro'); }

      if (gano) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: apuestaR * (multi - 1) } });
        msg.reply(`🎡 Salió ${color}! Ganaste **$${apuestaR * multi}**.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -apuestaR } });
        msg.reply(`🎡 Perdiste, sos un muerto. -$${apuestaR}`);
      }
      break;

    // --- MÍSTICA ---
    case 'bola8':
      const r8 = ["Ni ahí", "Olvidate", "Puede ser", "Re sí", "Preguntale a tu vieja", "Totalmente", "Cualquiera mandaste"];
      msg.reply(`🎱 ${r8[Math.floor(Math.random() * r8.length)]}`);
      break;

    case 'horoscopo':
      const signos = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
      const prediccion = ["Hoy te gorrean", "Vas a encontrar plata", "Cuidado con los baches", "Se viene un garche", "Día de mierda"];
      msg.reply(`✨ **${signos[Math.floor(Math.random() * signos.length)]}**: ${prediccion[Math.floor(Math.random() * prediccion.length)]}`);
      break;

    // --- MULTIMEDIA ---
    case 'foto':
      msg.channel.sendTyping();
      const img = await axios.post("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        { inputs: args.join(" ") }, { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' }).catch(() => null);
      img ? msg.reply({ files: [{ attachment: Buffer.from(img.data), name: 'foto.png' }] }) : msg.reply("No hay sistema.");
      break;
  }
});

start();