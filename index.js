import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para Railway
http.createServer((req, res) => { res.write("Patroclo-B B01 FINAL ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// --- CONFIGURACIÓN DE BASE DE DATOS ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], extras: {} };

const ID_PATROCLO_ORIGINAL = 'TU_ID_AQUÍ'; 

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    await loadConfig(true);
    console.log("✅ Conexión con MongoDB establecida.");
  } catch (e) { await loadConfig(false); }
}

async function loadConfig(useDb) {
  try {
    if (useDb && dataColl) {
      const dbData = await dataColl.findOne({ id: "main_config" });
      if (dbData) { cachedConfig = dbData; return; }
    }
    const localData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    cachedConfig = { phrases: localData.phrases || [], extras: localData.extras || {} };
  } catch (err) { cachedConfig = { phrases: ["¡D1 facha!"], extras: {} }; }
}

connectDb();

// --- SALUDO E INFORME TÉCNICO AL INICIAR ---
client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  const channel = client.channels.cache.find(c => c.type === 0); 
  if (channel) {
    await channel.send("ya llegué perritas 🔥");
    
    const explicacion = `
📘 **REPORTE TÉCNICO DE ARQUITECTURA**
Para conocimiento de los usuarios, el sistema se divide en dos fases:
• **Versiones V (Alpha):** Constituyen la etapa inicial de experimentación donde se desarrolló la arquitectura de comandos básica.
• **Versiones B (Branch/Beta):** Fase actual de desarrollo extendido. Esta rama implementa persistencia de datos en nube, sistema de economía y Aprendizaje Dinámico (ADN).

📜 **GUÍA DE COMANDOS (Prefijo !)**
• **!daily**: Bonificación diaria de 300 puntos.
• **!bal / !perfil**: Consulta de saldo actual.
• **!suerte [monto]**: Apuesta tradicional 50/50.
• **!ruleta [monto]**: Sistema de Slots con multiplicador x5.
• **!universefacts**: Datos astronómicos de la base de datos.
• **!confesion [texto]**: Mensajería anónima con borrado automático.
• **!spoty**: Recomendaciones y datos acústicos espaciales.
    `;
    await channel.send(explicacion);
  }
});

async function getUser(id) {
  if (!usersColl) return null;
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0 };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  const content = msg.content.toLowerCase();

  // APRENDIZAJE ADN (Sin comandos ni links)
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2 && msg.content.length < 200) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // INTERVENCIÓN ALEATORIA
  if ((content.includes("patroclo") || content.includes("patroclin") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "Qué onda facha?");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS MULTIMEDIA Y MÍSTICA ---
  if (cmd === 'spoty') {
    const temas = ["🔥 Perreo galáctico: https://open.spotify.com/track/60Sndv0veYf98n77JmZzCR", "🌌 El sonido no se propaga en el vacío absoluto."];
    return msg.reply(temas[Math.floor(Math.random() * temas.length)]);
  }

  if (cmd === 'confesion') {
    const texto = args.join(' ');
    if (!texto) return;
    try { await msg.delete(); } catch (e) {}
    return msg.channel.send(`🤫 **CONFESIÓN ANÓNIMA:**\n"${texto}"`);
  }

  if (cmd === 'universefacts') {
    try {
      const uniData = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      const extraData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      let pool = [...uniData.facts];
      if (extraData.universe_bonus) pool.push(...extraData.universe_bonus);
      return msg.reply(`🌌 **UNIVERSE:** ${pool[Math.floor(Math.random() * pool.length)]}`);
    } catch (e) { return msg.reply("Error en la lectura de datos."); }
  }

  // --- ECONOMÍA Y JUEGOS ---
  const user = await getUser(msg.author.id);
  if (!user) return;

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Ya has reclamado tus puntos hoy.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Has recibido **300 Patro-Pesos**.");
  }

  if (cmd === 'bal' || cmd === 'perfil') return msg.reply(`💰 **BILLETERA:** Tienes **${user.points} Patro-Pesos**.`);

  if (cmd === 'ruleta') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points || bet <= 0) return msg.reply("Fondos insuficientes.");
    const emojis = ["🍒", "💎", "🌟", "🎰", "🔥"];
    const r = [emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)]];
    const jackpot = r[0] === r[1] && r[1] === r[2];
    let res = `🎰 **PATROCLO SLOTS**\n[ ${r[0]} | ${r[1]} | ${r[2]} ]\n\n`;
    if (jackpot) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: bet * 5 } });
      res += `✨ **JACKPOT!** Ganaste **${bet * 5}**.`;
    } else {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -bet } });
      res += `💀 Perdiste **${bet}**.`;
    }
    return msg.reply(res);
  }

  if (cmd === 'suerte') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points || bet <= 0) return msg.reply("Fondos insuficientes.");
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? bet : -bet } });
    return msg.reply(gano ? `🪙 **GANASTE:** +${bet}` : `💀 **PERDISTE:** -${bet}`);
  }

  if (cmd === 'stats') {
    return msg.reply(`📊 **STATS:** Frases ADN: ${cachedConfig.phrases.length} | DB: ONLINE`);
  }
});

client.login(process.env.TOKEN);
