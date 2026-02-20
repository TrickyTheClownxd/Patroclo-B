import { Client, GatewayIntentBits } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Servidor para Railway
http.createServer((req, res) => { res.write("Patroclo-B B01 Full Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ]
});

// --- CONFIGURACIÓN MONGODB ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let lastChannelId = null, lastMsgTime = Date.now();
let cachedConfig = null;

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Memoria infinita conectada (MongoDB)");
    await loadConfig();
  } catch (e) { console.error("❌ Error Mongo:", e); }
}

async function loadConfig() {
  cachedConfig = await dataColl.findOne({ id: "main_config" }) || { 
    phrases: [], 
    extras: { reacciones_auto: { palabras_clave: [], emojis: [] }, spaceDataBackup: [] } 
  };
  console.log("♻️ Configuración sincronizada con la nube.");
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

// --- EVENTO READY ---
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

  // 1. REACCIONES AUTOMÁTICAS
  cachedConfig?.extras?.reacciones_auto?.palabras_clave.forEach((palabra, i) => {
    if (content.includes(palabra)) msg.react(cachedConfig.extras.reacciones_auto.emojis[i] || '🔥').catch(() => {});
  });

  // 2. APRENDIZAJE AUTOMÁTICO
  if (!msg.content.startsWith('!') && msg.content.length > 2) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // 3. RESPUESTAS POR MENCIÓN, APODO O REPLY
  const isReplyToBot = msg.reference && (await msg.channel.messages.fetch(msg.reference.messageId)).author.id === client.user.id;
  const namingBot = content.includes("patroclo") || content.includes("patroclin");

  if (msg.mentions.has(client.user) || namingBot || isReplyToBot) {
    const rando = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Qué onda gato, me buscabas?";
    return msg.reply(rando);
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const user = await getUser(msg.author.id);

  // --- COMANDOS SISTEMA ---
  if (cmd === 'ayudacmd') {
    const manual = `📜 **MANUAL PATROCLO-B (B01):**
    
**💰 TIMBA V45.0:**
!daily, !perfil, !suerte [m], !ruleta [m] [c], !transferir @u [m]

**🌌 MÍSTICA & SOCIAL:**
!spoty, !bola8 [p], !nekoask [p], !horoscopo, !universefacts, !bardo, !confesion [t], !gif [q]

**⚙️ SISTEMA & CONTROL:**
!stats, !reload (DB), !reloadjson (Archivo), !start, !pause, !resume, !stop

**🧠 ADN:**
Respondo a menciones, apodos (Patroclin) y replies. Hablo solo cada 5 min.`;
    return msg.reply(manual);
  }

  if (cmd === 'reload') {
    await loadConfig();
    return msg.reply("♻️ **Cache Refrescado:** Memoria sincronizada con MongoDB.");
  }

  if (cmd === 'reloadjson' && msg.author.id === '986680845031059526') {
    try {
      const ext = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { extras: ext } }, { upsert: true });
      await loadConfig();
      return msg.reply("📂 **Archivo Sincronizado:** `extras.json` subido y aplicado.");
    } catch (e) { return msg.reply("❌ Error al leer `extras.json`."); }
  }

  if (cmd === 'stats') return msg.reply(`📊 **B01 Stats:** Frases: ${cachedConfig.phrases.length} | DB: Online.`);

  // --- TIMBA V45.0 ---
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return msg.reply("❌ Volvé mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: now } });
    return msg.reply("🎁 +300 Patro-Pesos.");
  }

  if (cmd === 'perfil' || cmd === 'bal') return msg.reply(`💰 Saldo de **${msg.author.username}**: ${user.points} puntos.`);

  if (cmd === 'suerte') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ Saldo insuficiente.");
    const r = Math.random();
    let win = r > 0.95 ? amt * 10 : (r > 0.5 ? amt * 2 : -amt);
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win === -amt ? -amt : win - amt } });
    return msg.reply(win > amt ? `🎰 ¡JACKPOT! x10` : (win > 0 ? `✅ Ganaste x2` : `❌ Perdiste`));
  }

  if (cmd === 'ruleta') {
    const amt = parseInt(args[0]); const choice = args[1];
    if (isNaN(amt) || amt > user.points || !choice) return msg.reply("❌ !ruleta [monto] [red/black/green]");
    const resNum = Math.floor(Math.random() * 37);
    const resCol = resNum === 0 ? "green" : (resNum % 2 === 0 ? "black" : "red");
    const won = choice === resCol;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: won ? amt : -amt } });
    return msg.reply(`🎰 Salió el **${resNum} (${resCol})**. ${won ? '¡Ganaste!' : 'Palmaste.'}`);
  }

  if (cmd === 'transferir') {
    const target = msg.mentions.users.first();
    const amt = parseInt(args[1]);
    if (!target || isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ !transferir @u 100");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -amt } });
    await usersColl.updateOne({ userId: target.id }, { $inc: { points: amt } }, { upsert: true });
    return msg.reply(`💸 Pasaste ${amt} a ${target.username}.`);
  }

  // --- MÍSTICA & SOCIAL ---
  if (cmd === 'bola8') {
    const r = ["Sí.", "Ni en pedo.", "Flasheaste.", "Es probable.", "No me rompas las bolas."];
    return msg.reply(`🎱 ${r[Math.floor(Math.random()*r.length)]}`);
  }

  if (cmd === 'nekoask') {
    const r = ["Miau (Sí)", "Miau... (No)", "¡Prrr!"];
    return msg.reply(`🐱 ${r[Math.floor(Math.random()*r.length)]}`);
  }

  if (cmd === 'universefacts') {
    const f = cachedConfig.extras.spaceDataBackup || ["El espacio es enorme."];
    return msg.reply(`🌌 ${f[Math.floor(Math.random()*f.length)]}`);
  }

  if (cmd === 'spoty') {
    const facts = cachedConfig.extras.spaceDataBackup || ["El espacio es enorme."];
    return Math.random() > 0.5 
      ? msg.reply("🎧 **Sonando:** Reggaeton Viejo 🔥 (Dale mecha)") 
      : msg.reply(`🌌 **Dato Espacial:** ${facts[Math.floor(Math.random()*facts.length)]}`);
  }

  if (cmd === 'bardo') {
    const b = ["¿Qué mirás, bobo?", "Cerrá el orto.", "Sos un descanso."];
    return msg.reply(b[Math.floor(Math.random()*b.length)]);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(" ") || "argentina";
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${q}&limit=1&rating=g&lang=es`);
    const data = await res.json();
    return data.data[0] ? msg.reply(data.data[0].url) : msg.reply("❌ No hay nada.");
  }

  if (cmd === 'confesion') {
    const t = args.join(" "); if (!t) return;
    msg.delete(); return msg.channel.send(`🤫 **Confesión:** ${t}`);
  }

  // --- CONTROLES ---
  if (cmd === 'start') return msg.reply("⏱️ Iniciado.");
  if (cmd === 'pause') return msg.reply("⏸️ Pausado.");
  if (cmd === 'resume') return msg.reply("▶️ Reanudado.");
  if (cmd === 'stop') return msg.reply("🛑 Detenido.");

  // --- IMPORTAR ---
  if (cmd === 'importar' && msg.author.id === '986680845031059526') {
    try {
      const ext = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { extras: ext } }, { upsert: true });
      await loadConfig();
      return msg.reply("✅ Extras importados.");
    } catch (e) { return msg.reply("❌ Error al importar."); }
  }
});

// REVIVIDOR (5 min)
setInterval(async () => {
  if (!lastChannelId || Date.now() - lastMsgTime < 300000) return;
  const c = client.channels.cache.get(lastChannelId);
  if (c && cachedConfig.phrases.length > 0) {
    c.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
  }
}, 300000);

client.login(process.env.TOKEN);
