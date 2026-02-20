import { Client, GatewayIntentBits } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Servidor para que Railway no apague el bot
http.createServer((req, res) => { res.write("Patroclo-B B01 Online"); res.end(); }).listen(process.env.PORT || 8080);

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

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Memoria infinita conectada (MongoDB)");
  } catch (e) { console.error("❌ Error Mongo:", e); }
}
connectDb();

async function getFullConfig() {
  return await dataColl.findOne({ id: "main_config" }) || { 
    phrases: [], 
    extras: { reacciones_auto: { palabras_clave: [], emojis: [] }, spaceDataBackup: [] } 
  };
}

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
  const config = await getFullConfig();
  const content = msg.content.toLowerCase();

  // 1. REACCIONES AUTOMÁTICAS
  config.extras.reacciones_auto?.palabras_clave.forEach((palabra, i) => {
    if (content.includes(palabra)) msg.react(config.extras.reacciones_auto.emojis[i] || '🔥').catch(() => {});
  });

  // 2. APRENDIZAJE AUTOMÁTICO
  if (!msg.content.startsWith('!') && msg.content.length > 2) {
    if (!config.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // 3. RESPUESTAS POR MENCIÓN
  if (msg.mentions.has(client.user) || content.includes("patroclo")) {
    const rando = config.phrases[Math.floor(Math.random() * config.phrases.length)] || "Qué onda gato.";
    return msg.reply(rando);
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const user = await getUser(msg.author.id);

  // --- COMANDOS ---
  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **MANUAL B01:**\n!daily, !perfil, !suerte [m], !ruleta [m] [c/n], !transferir @u [m], !bardo, !spoty, !bola8, !nekoask, !universefacts, !confesion, !gif, !foto, !stats, !reloadjson");
  }

  if (cmd === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return msg.reply("❌ Mañana volvé, no seas manija.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: now } });
    return msg.reply("🎁 Recibiste **500 Patro-Pesos**.");
  }

  if (cmd === 'perfil' || cmd === 'bal') return msg.reply(`👤 **${msg.author.username}** | 💰 **Saldo:** ${user.points} puntos.`);

  if (cmd === 'ruleta') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ No tenés esa guita.");
    const win = Math.random() > 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? amt : -amt } });
    return msg.reply(win ? `✅ ¡Ganaste! Ahora tenés **${user.points + amt}**.` : `❌ Perdiste todo.`);
  }

  if (cmd === 'bardo') {
    const b = ["¿Qué mirás, bobo?", "Cerrá el orto.", "Sos un descanso.", "Tomátela, salame."];
    return msg.reply(b[Math.floor(Math.random() * b.length)]);
  }

  if (cmd === 'nekoask') {
    const r = ["Miau (Sí)", "Miau... (No)", "¡Prrr! (Quizás)", "¡GRRR! (Callate)"];
    return msg.reply(`🐱 **Neko dice:** ${r[Math.floor(Math.random() * r.length)]}`);
  }

  if (cmd === 'universefacts') {
    const facts = config.extras.spaceDataBackup || ["El espacio es enorme."];
    return msg.reply(`🌌 ${facts[Math.floor(Math.random() * facts.length)]}`);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(" ") || "argentina";
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${q}&limit=1&rating=g&lang=es`);
    const data = await res.json();
    return data.data[0] ? msg.reply(data.data[0].url) : msg.reply("❌ No encontré nada.");
  }

  if (cmd === 'stats') return msg.reply(`📊 **ESTADO:** Memoria: ${config.phrases.length} frases | DB: MongoDB`);

  if (cmd === 'importar' && msg.author.id === '986680845031059526') {
    const ext = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
    await dataColl.updateOne({ id: "main_config" }, { $set: { extras: ext } }, { upsert: true });
    return msg.reply("✅ Extras importados a MongoDB.");
  }
});

// REVIVIDOR
setInterval(async () => {
  if (!lastChannelId || Date.now() - lastMsgTime < 300000) return;
  const config = await getFullConfig();
  const c = client.channels.cache.get(lastChannelId);
  if (c && config.phrases.length > 0) {
    c.send(config.phrases[Math.floor(Math.random() * config.phrases.length)]);
  }
}, 300000);

client.login(process.env.TOKEN);
