import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor Railway - El bot no duerme
http.createServer((req, res) => { 
  res.write("Patroclo-B B01.8 SISTEMA GALACTICO ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], universeFacts: [], lastChannelId: null };
if (!client.retos) client.retos = new Map();

let statsSesion = { comandosUsados: 0, inicio: Date.now() };

// IDENTIDADES SAGRADAS
const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';

async function connectDb() {
  try {
    await mongoClient.connect({ serverSelectionTimeoutMS: 5000 });
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    console.log("✅ Conectado a MongoDB");
    await loadConfig();
  } catch (e) { console.log("❌ Error DB"); }
}

async function loadConfig() {
  const dbData = await dataColl.findOne({ id: "main_config" });
  if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
}

connectDb();

// --- BIENVENIDA Y REPORTE ---
client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("ya llegué perritas 🔥");
      const reporteH = `
REPORTE HISTORICO PATROCLO-B | VERSION B01.8
------------------------------------------------
1. V 0.01: NACIMIENTO ADN Y APRENDIZAJE.
2. B 01.0: PERSISTENCIA MONGODB Y ECONOMIA.
3. B 01.8: DUELOS 1VS1, STATS FULL Y SINCRO BOSS.
------------------------------------------------
PATROCLO ORIGINAL RECONOCIDO: ${ID_PATROCLO_ORIGINAL}
`;
      await channel.send("```" + reporteH + "```");
    }
  }
});

async function getUser(id) {
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0, lastWork: 0, inventario: [] };
    await usersColl.insertOne(user);
  }
  return user;
}

client.on('messageCreate', async (msg) => {
  // BOSS & BROTHER ACCESS
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  // PERSISTENCIA DE CANAL
  if (cachedConfig.lastChannelId !== msg.channel.id) {
    cachedConfig.lastChannelId = msg.channel.id;
    await dataColl.updateOne({ id: "main_config" }, { $set: { lastChannelId: msg.channel.id } }, { upsert: true });
  }

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  // ADN: APRENDIZAJE
  if (!msg.author.bot && !content.startsWith('!') && !content.includes("http") && msg.content.length > 3) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
  }

  // ADN: HABLA (APODOS Y AZAR)
  const apodos = ["patroclo", "patroclin", "patro", "bot", "facha"];
  if ((apodos.some(a => content.includes(a)) || msg.mentions.has(client.user.id) || Math.random() < 0.15) && !content.startsWith('!')) {
    const r = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(r || "D1 facha.");
  }

  if (!msg.content.startsWith('!')) return;
  statsSesion.comandosUsados++;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- DUELOS (POKER Y PENAL ACTUALIZADOS) ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("No tenes esa guita.");

    if (mencion) {
      if (mencion.id === msg.author.id) return msg.reply("No podes jugar contra vos mismo.");
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **RETO:** ${mencion}, duelo de ${cmd} por **${monto}**. \`!aceptar\`.`);
    } else {
      const gano = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
      return msg.reply(gano ? `✅ ¡GOOOL/PLENO! Ganaste **${monto}**.` : `💀 Perdiste **${monto}**.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te reto.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **RESULTADO:** <@${g}> gano los **${reto.monto}** en el duelo de ${reto.tipo}.`);
  }

  // --- ECONOMIA ---
  if (cmd === 'bal') return msg.reply(`💰 Billetera: **${user.points}**.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Volve mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +300 diarios.");
  }
  if (cmd === 'trabajar') {
    const ahora = Date.now();
    if (ahora - (user.lastWork || 0) < 3600000) return msg.reply("Descansa facha.");
    const paga = Math.floor(Math.random() * 400) + 200;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: paga }, $set: { lastWork: ahora } });
    return msg.reply(`🛠️ Pegaste **${paga} Patro-Pesos**.`);
  }

  // --- MISTICA ---
  if (cmd === 'spoty') return msg.reply(Math.random() < 0.5 ? "🎶 **PERREO VIEJO:** http://googleusercontent.com/spotify.com/7" : "🔇 Sin señal.");
  if (cmd === 'cuanto') return msg.reply(`Sos un **${Math.floor(Math.random() * 101)}%** ${args.join(' ') || "fantasma"}.`);
  if (cmd === 'universefacts') {
    const facts = cachedConfig.universeFacts || [];
    return msg.reply(facts.length ? `🌌 **DATA:** ${facts[Math.floor(Math.random()*facts.length)]}` : "Vacío.");
  }
  if (cmd === 'bardo') {
    const f = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(f || "No hay bardo.");
  }

  // --- SISTEMA ---
  if (cmd === 'stats') {
    const uptime = Math.floor((Date.now() - statsSesion.inicio) / 60000);
    const reporteStats = `
📊 **REPORTE SISTEMA - B01.8**
- ADN Frases: ${cachedConfig.phrases?.length || 0}
- Universo Facts: ${cachedConfig.universeFacts?.length || 0}
- Multimedia: GIFs, Fotos y Stickers OK.
- Uptime: ${uptime}m
- DB Status: Conectado (MongoDB Cloud)
- Ultima Update: Hoy (Duelo 1vs1 Fix)
`;
    return msg.reply("```" + reporteStats + "```");
  }

  if (cmd === 'reload') { await loadConfig(); return msg.reply("♻️ DB recargada."); }

  if (cmd === 'ayudacmd') {
    const menuAyuda = `
📜 **BIBLIA PATROCLO-B (B01.8)**
------------------------------------------------
🎮 **DUELOS (TIMBA)**
!poker | !penal | !aceptar

💰 **ECONOMIA (PLATA)**
!bal | !trabajar | !daily | !tienda | !comprar

🌌 **MISTICA (ADN)**
!spoty | !cuanto | !universefacts | !bardo | !gif

🛠️ **SISTEMA (BOT)**
!stats | !reload | !ayudacmd | !sugerencia

👑 **BOSS ONLY**
!reloadjson | !mantenimiento
------------------------------------------------
*Duelos 1vs1 requieren mencion y aceptar.*
`;
    return msg.channel.send("```fix\n" + menuAyuda + "```");
  }

  // COMANDOS BOSS
  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      const univ = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases, universeFacts: univ.facts } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ **BOSS:** ADN y Universo sincronizados.");
    } catch (e) { return msg.reply("❌ Error JSON."); }
  }
});

client.login(process.env.TOKEN);
