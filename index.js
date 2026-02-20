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

// --- CONFIGURACIÓN DE IDENTIDADES Y DB ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], extras: {} };

// IDs CONFIGURADOS
const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Sistema Full ADN Conectado");
    await loadConfig(true);
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
• **!bola8 [pregunta]**: Consulta al oráculo del ADN.
• **!horoscopo [signo]**: Predicción astral diaria.
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

  // 1. APRENDIZAJE ADN
  if (!msg.author.bot && dataColl && !content.startsWith('!') && !content.includes("http") && msg.content.length > 2 && msg.content.length < 200) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // 2. RESPUESTAS AUTOMÁTICAS
  if ((content.includes("patroclo") || content.includes("patroclin") || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "Qué onda facha?");
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- MÍSTICA Y ESPACIO ---
  if (cmd === 'universefacts') {
    try {
      const uniData = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      const extraData = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      let pool = [...uniData.facts];
      if (extraData.universe_bonus) pool.push(...extraData.universe_bonus);
      return msg.reply(`🌌 **UNIVERSE:** ${pool[Math.floor(Math.random() * pool.length)]}`);
    } catch (e) { return msg.reply("Error de lectura estelar."); }
  }

  if (cmd === 'bola8') {
    const r = ["Sí.", "No.", "D1.", "Preguntale a tu vieja.", "Respetá la complexión de la cara.", "Olvidate, de una.", "Ni ahí, rati."];
    const respuesta = Math.random() < 0.2 ? cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] : r[Math.floor(Math.random() * r.length)];
    return msg.reply(`🎱 **BOLA 8:** ${respuesta}`);
  }

  if (cmd === 'horoscopo') {
    const h = ["Materia Oscura: Estás domado.", "Satélite Viejo: Girás al pedo.", "Nebulosa: No se ve nada.", "Supernova: Hoy explotás de facha.", "Agujero Negro: Tu billetera está en peligro."];
    return msg.reply(`✨ **HORÓSCOPO:** ${h[Math.floor(Math.random() * h.length)]}`);
  }

  if (cmd === 'confesion') {
    const texto = args.join(' ');
    if (!texto) return;
    try { await msg.delete(); } catch (e) {}
    return msg.channel.send(`🤫 **CONFESIÓN ANÓNIMA:**\n"${texto}"`);
  }

  if (cmd === 'spoty') {
    const temas = ["🔥 Perreo: https://open.spotify.com/track/60Sndv0veYf98n77JmZzCR", "🌌 Dato: El sonido no viaja en el vacío.", "🔥 Mix: https://open.spotify.com/track/127Q3Y79pU9u9I96S963mY"];
    return msg.reply(temas[Math.floor(Math.random() * temas.length)]);
  }

  // --- TIMBA Y ECONOMÍA ---
  const user = await getUser(msg.author.id);
  if (!user) return;

  if (cmd === 'daily') {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Seco, ya cobraste.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Tomá tus **300 Patro-Pesos**.");
  }

  if (cmd === 'bal' || cmd === 'perfil') return msg.reply(`💰 **BILLETERA:** Tienes **${user.points} Patro-Pesos**.`);

  if (cmd === 'suerte') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points || bet <= 0) return msg.reply("No tenés esa plata.");
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? bet : -bet } });
    return msg.reply(gano ? `🪙 **GANASTE:** +${bet}` : `💀 **PERDISTE:** -${bet}`);
  }

  if (cmd === 'ruleta') {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet > user.points || bet <= 0) return msg.reply("Fondos insuficientes.");
    const emojis = ["🍒", "💎", "🎰", "🔥", "🌟"];
    const r = [emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)]];
    const jackpot = r[0] === r[1] && r[1] === r[2];
    let res = `🎰 **PATROCLO SLOTS**\n[ ${r[0]} | ${r[1]} | ${r[2]} ]\n\n`;
    if (jackpot) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: bet * 5 } });
      res += `✨ **JACKPOT!** Ganaste **${bet * 5}**.`;
    } else {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -bet } });
      res += `💀 **AL LOBBY.** Perdiste **${bet}**.`;
    }
    return msg.reply(res);
  }

  // --- SISTEMA ---
  if (cmd === 'stats') {
    const f = cachedConfig.phrases;
    return msg.reply(`📊 **PATRO-STATS:**\n🧠 Memoria: ${f.length}\n✅ DB: ONLINE\n👑 Boss: ${msg.author.id === MI_ID_BOSS ? "Reconocido" : "Usuario"}`);
  }

  if (cmd === 'bardo') {
    const insultos = ["Sos un cara de rampa.", "Respetá la complexión de la cara.", "Tenés menos onda que un renglón."];
    return msg.reply(`🔥 ${insultos[Math.floor(Math.random() * insultos.length)]}`);
  }

  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **BIBLIA B01:** !daily, !bal, !suerte, !ruleta, !bola8, !universefacts, !horoscopo, !spoty, !gif, !bardo, !confesion, !stats");
  }

  if (cmd === 'reload' && msg.author.id === MI_ID_BOSS) { await loadConfig(!!dataColl); return msg.reply("♻️ Memoria refrescada."); }

  if (cmd === 'gif') {
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ') || 'meme'}&limit=1&rating=g`);
    return msg.reply(res.data.data[0]?.url || "Nada, facha.");
  }
});

client.login(process.env.TOKEN);
