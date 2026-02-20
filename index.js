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

  // --- COMANDOS SISTEMA ---
  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **MANUAL B01:**\n!daily, !perfil, !suerte [m], !ruleta [m][c/n], !transferir @u [m], !bardo, !spoty, !bola8, !nekoask, !horoscopo, !universefacts, !confesion, !gif, !foto, !stats, !reload, !reloadjson, !start, !pause, !resume, !stop");
  }

  if (cmd === 'reload' || cmd === 'reloadjson') return msg.reply("♻️ Sistema B01 optimizado. Memoria y extras sincronizados con la nube.");
  
  if (cmd === 'stats') return msg.reply(`📊 **B01 Stats:**\n- Memoria: ${config.phrases.length} frases.\n- DB: MongoDB Cloud.\n- Status: Fase B Activa.`);

  // --- TIMBA V45.0 ---
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 86400000) return msg.reply("❌ Ya cobraste, volvé mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: now } });
    return msg.reply("🎁 Reclamaste tu sueldo: **+300 Patro-Pesos**.");
  }

  if (cmd === 'perfil' || cmd === 'bal') return msg.reply(`💰 **${msg.author.username}**, tenés **${user.points}** Patro-Pesos.`);

  if (cmd === 'suerte') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ Poné una cifra válida.");
    const r = Math.random();
    let win = 0; let txt = "";
    if (r > 0.95) { win = amt * 10; txt = "🎰 ¡JACKPOT! x10"; }
    else if (r > 0.5) { win = amt * 2; txt = "✅ Ganaste x2"; }
    else { win = -amt; txt = "❌ Perdiste todo"; }
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win === -amt ? -amt : win - amt } });
    return msg.reply(txt);
  }

  if (cmd === 'ruleta') {
    const amt = parseInt(args[0]);
    const choice = args[1];
    if (isNaN(amt) || amt > user.points || !choice) return msg.reply("❌ Uso: !ruleta [monto] [red/black/green/número]");
    const resNum = Math.floor(Math.random() * 37);
    const resCol = resNum === 0 ? "green" : (resNum % 2 === 0 ? "black" : "red");
    const won = (choice === resCol || choice === resNum.toString());
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: won ? amt : -amt } });
    return msg.reply(`${won ? '✅' : '❌'} Salió el **${resNum} (${resCol})**. ${won ? '¡Ganaste!' : 'Perdiste.'}`);
  }

  if (cmd === 'transferir') {
    const target = msg.mentions.users.first();
    const amt = parseInt(args[1]);
    if (!target || isNaN(amt) || amt > user.points || amt <= 0) return msg.reply("❌ !transferir @user 100");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -amt } });
    await usersColl.updateOne({ userId: target.id }, { $inc: { points: amt } }, { upsert: true });
    return msg.reply(`💸 Pasaste ${amt} a ${target.username}.`);
  }

  // --- MÍSTICA ---
  if (cmd === 'spoty') {
    return Math.random() > 0.5 
      ? msg.reply("🎧 **Sonando:** Reggaeton Viejo 🔥 (Dale mecha)")
      : msg.reply(`🌌 **Flash Espacial:** ${config.extras.spaceDataBackup[Math.floor(Math.random()*config.extras.spaceDataBackup.length)]}`);
  }

  if (cmd === 'bola8') {
    const r = ["Sí.", "Ni en pedo.", "Flasheaste.", "Es probable.", "No me rompas las bolas.", "Preguntale a tu ex."];
    return msg.reply(`🎱 ${r[Math.floor(Math.random()*r.length)]}`);
  }

  if (cmd === 'horoscopo') {
    const h = ["Hoy te va a ir como el orto.", "La suerte te sonríe (mentira).", "Cuidá tu bolsillo.", "Un amor del pasado vuelve (bloquealo)."];
    return msg.reply(`✨ **Horóscopo B01:** ${h[Math.floor(Math.random()*h.length)]}`);
  }

  if (cmd === 'nekoask') {
    const r = ["Miau (Sí)", "Miau... (No)", "¡Prrr!", "¡GRRR!"];
    return msg.reply(`🐱 **Neko dice:** ${r[Math.floor(Math.random()*r.length)]}`);
  }

  if (cmd === 'universefacts') {
    const f = config.extras.spaceDataBackup || ["El espacio es enorme."];
    return msg.reply(`🌌 ${f[Math.floor(Math.random()*f.length)]}`);
  }

  // --- SOCIAL / MULTIMEDIA ---
  if (cmd === 'bardo') {
    const b = ["¿Qué mirás, bobo?", "Cerrá el orto.", "Sos un descanso.", "Tomátela, salame.", "Flasheas confianza."];
    return msg.reply(b[Math.floor(Math.random()*b.length)]);
  }

  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(" ") || "argentina";
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_KEY}&q=${q}&limit=1&rating=g&lang=es`);
    const data = await res.json();
    return data.data[0] ? msg.reply(data.data[0].url) : msg.reply("❌ No encontré nada.");
  }

  if (cmd === 'confesion') {
    const t = args.join(" "); if (!t) return;
    msg.delete(); return msg.channel.send(`🤫 **Confesión Anónima:** ${t}`);
  }

  // --- CONTROL (Stopwatch/Media) ---
  if (cmd === 'start') return msg.reply("⏱️ Cronómetro en marcha.");
  if (cmd === 'pause') return msg.reply("⏸️ Pausado... Tomate un respiro.");
  if (cmd === 'resume') return msg.reply("▶️ Seguimos con el bardo.");
  if (cmd === 'stop') return msg.reply("🛑 Paramos acá.");
  if (cmd === 'reset') return msg.reply("🔄 Todo de cero.");

  // --- ADMIN ---
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
  if (c && config.phrases.length > 0) c.send(config.phrases[Math.floor(Math.random()*config.phrases.length)]);
}, 300000);

client.login(process.env.TOKEN);
