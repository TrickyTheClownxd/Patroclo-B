import { Client, GatewayIntentBits } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

http.createServer((req, res) => { res.write("Patroclo-B B01 Full Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let lastChannelId = null, lastMsgTime = Date.now();
let cachedConfig = null; // Cache para optimizar el reload

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Memoria infinita conectada (MongoDB)");
    await loadConfig(); // Carga inicial
  } catch (e) { console.error("❌ Error Mongo:", e); }
}

async function loadConfig() {
  cachedConfig = await dataColl.findOne({ id: "main_config" }) || { 
    phrases: [], 
    extras: { reacciones_auto: { palabras_clave: [], emojis: [] }, spaceDataBackup: [] } 
  };
  console.log("♻️ Configuración sincronizada.");
}

connectDb();

async function getUser(id) {
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0 };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('ready', () => {
  console.log(`🔥 ${client.user.tag} ONLINE`);
  const channel = client.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(client.user).has("SendMessages"));
  if (channel) {
    channel.send("Ya llegué perritas 🔥. Escuchen bien: las versiones **V** fueron mi etapa Alfa, puro experimento y ver qué onda mientras aprendía de ustedes. Ahora entramos en la **Fase B (Beta)** con el código B01. Soy más estable, más bardo y mi memoria está más picante que nunca. No se confundan, sigo siendo el mismo que los descansa, pero ahora con el sistema optimizado. ¡A darle mecha!");
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  lastChannelId = msg.channel.id; lastMsgTime = Date.now();
  const content = msg.content.toLowerCase();

  // 1. REACCIONES AUTOMÁTICAS (Usando cache)
  cachedConfig?.extras?.reacciones_auto?.palabras_clave.forEach((palabra, i) => {
    if (content.includes(palabra)) msg.react(cachedConfig.extras.reacciones_auto.emojis[i] || '🔥').catch(() => {});
  });

  // 2. APRENDIZAJE
  if (!msg.content.startsWith('!') && msg.content.length > 2) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content); // Actualiza cache local
    }
  }

  // 3. RESPUESTAS POR MENCIÓN
  if (msg.mentions.has(client.user) || content.includes("patroclo")) {
    const rando = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Qué onda gato.";
    return msg.reply(rando);
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const user = await getUser(msg.author.id);

  // --- COMANDOS SISTEMA ---
  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **MANUAL B01:**\n!daily, !perfil, !suerte, !ruleta, !transferir, !bardo, !spoty, !bola8, !nekoask, !horoscopo, !universefacts, !confesion, !gif, !foto, !stats, !reload, !start, !pause, !stop");
  }

  if (cmd === 'reload') {
    await loadConfig();
    return msg.reply("♻️ **Sistema Reiniciado:** Memoria y extras sincronizados con MongoDB. Todo 10/10.");
  }

  if (cmd === 'stats') return msg.reply(`📊 **B01 Stats:**\n- Frases en memoria: ${cachedConfig.phrases.length}\n- Base de Datos: Online\n- Fase: Beta B01`);

  // --- TIMBA ---
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return msg.reply("❌ Mañana volvé, no seas manija.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: now } });
    return msg.reply("🎁 Recibiste **300 Patro-Pesos**.");
  }

  if (cmd === 'perfil' || cmd === 'bal') return msg.reply(`💰 **${msg.author.username}**, tenés **${user.points}** Patro-Pesos.`);

  if (cmd === 'suerte') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ Poné una cifra válida.");
    const r = Math.random();
    let win = r > 0.95 ? amt * 10 : (r > 0.5 ? amt * 2 : -amt);
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win === -amt ? -amt : win - amt } });
    return msg.reply(win > amt ? `🎰 ¡JACKPOT! x10` : (win > 0 ? `✅ Ganaste x2` : `❌ Perdiste todo`));
  }

  if (cmd === 'ruleta') {
    const amt = parseInt(args[0]); const choice = args[1];
    if (isNaN(amt) || amt > user.points || !choice) return msg.reply("❌ !ruleta [monto] [red/black/green]");
    const resNum = Math.floor(Math.random() * 37);
    const resCol = resNum === 0 ? "green" : (resNum % 2 === 0 ? "black" : "red");
    const won = choice === resCol;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: won ? amt : -amt } });
    return msg.reply(`🎰 Salió el **${resNum} (${resCol})**. ${won ? '¡Ganaste facha!' : 'Palmaste todo.'}`);
  }

  // --- MÍSTICA & SOCIAL ---
  if (cmd === 'bola8') {
    const r = ["Sí.", "Ni en pedo.", "Flasheaste.", "Es probable.", "No me rompas las bolas."];
    return msg.reply(`🎱 ${r[Math.floor(Math.random()*r.length)]}`);
  }

  if (cmd === 'spoty') {
    const facts = cachedConfig.extras.spaceDataBackup || ["El espacio es enorme."];
    return Math.random() > 0.5 ? msg.reply("🎧 **Sonando:** Reggaeton Viejo 🔥") : msg.reply(`🌌 **Dato:** ${facts[Math.floor(Math.random()*facts.length)]}`);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(" ") || "argentina";
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${q}&limit=1&rating=g&lang=es`);
    const data = await res.json();
    return data.data[0] ? msg.reply(data.data[0].url) : msg.reply("❌ No encontré nada.");
  }

  if (cmd === 'importar' && msg.author.id === '986680845031059526') {
    try {
      const ext = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { extras: ext } }, { upsert: true });
      await loadConfig();
      return msg.reply("✅ Extras importados y cache refrescado.");
    } catch (e) { return msg.reply("❌ Error leyendo extras.json"); }
  }
});

// REVIVIDOR
setInterval(async () => {
  if (!lastChannelId || Date.now() - lastMsgTime < 300000) return;
  const c = client.channels.cache.get(lastChannelId);
  if (c && cachedConfig.phrases.length > 0) {
    c.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
  }
}, 300000);

client.login(process.env.TOKEN);
