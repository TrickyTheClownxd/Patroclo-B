import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { 
  res.write("Patroclo-B B01.8.2 ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: [
    "La disciplina es el puente entre las metas y los logros.",
    "El respeto es la base de cualquier imperio.",
    "En el silencio se encuentra la verdadera fuerza.",
    "La coherencia es la virtud de los grandes.",
    "Un Gigante no solo agita, también construye."
  ], 
  lastChannelId: null, 
  mantenimiento: false,
  modoSerio: false 
};
if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección bardo." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Mística premium." }
];

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    await loadConfig();
    console.log("✅ Sistema Total Conectado");
  } catch (e) { console.log("❌ Error DB:", e); }
}

async function loadConfig() {
  const dbData = await dataColl?.findOne({ id: "main_config" });
  if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
}

connectDb();

client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("```\nPATROCLO-B B01.8.2\nMODO: " + (cachedConfig.modoSerio ? "SERIO 👔" : "NORMAL 🔥") + "\nAGITE: 25%\n```").catch(() => null);
    }
  }
});

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;

  const content = msg.content ? msg.content.toLowerCase() : "";
  const user = await getUser(msg.author.id);

  // --- HABLA AUTOMÁTICA ---
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.modoSerio && dataColl && !cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true }).catch(() => null);
        cachedConfig.phrases.push(msg.content);
      }
      const mencionado = content.includes("patroclo") || (msg.mentions && msg.mentions.has(client.user.id));
      if (mencionado || Math.random() < 0.25) { 
        let banco = cachedConfig.modoSerio ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]).catch(() => null);
      }
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- BLOQUEO MANTENIMIENTO ---
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // --- COMANDOS SISTEMA (BOSS) ---
  if (cmd === 'personalidad' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.modoSerio = !cachedConfig.modoSerio;
    await dataColl.updateOne({ id: "main_config" }, { $set: { modoSerio: cachedConfig.modoSerio } }, { upsert: true });
    return msg.reply(cachedConfig.modoSerio ? "👔 **MODO SERIO ACTIVADO.**" : "🔥 **MODO NORMAL ACTIVADO.**");
  }

  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    return msg.reply(cachedConfig.mantenimiento ? "⚠️ **MODO MANTENIMIENTO ON.**" : "🚀 **SISTEMA ONLINE.**");
  }

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      const univ = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases, universeFacts: univ.facts } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ **JSON Sincronizado.**");
    } catch (e) { return msg.reply("❌ Error JSON."); }
  }

  if (cmd === 'reload' && msg.author.id === MI_ID_BOSS) { await loadConfig(); return msg.reply("♻️ **Cache refrescada.**"); }

  // --- COMANDOS ECONOMÍA ---
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Regresa en 24hs.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 Patro-Pesos.");
  }
  if (cmd === 'tienda') return msg.reply(`🛒 **TIENDA**\n${ITEMS_TIENDA.map(i => `ID: ${i.id} | **${i.nombre}** - 💰${i.precio}`).join('\n')}`);
  if (cmd === 'comprar') {
    const item = ITEMS_TIENDA.find(i => i.id === parseInt(args[0]));
    if (!item || user.points < item.precio) return msg.reply("Fondos insuficientes o ID incorrecto.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -item.precio }, $push: { inventario: item.nombre } });
    return msg.reply(`✅ Compraste: **${item.nombre}**.`);
  }

  // --- COMANDOS JUEGOS ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions?.users?.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("No tienes esa plata.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **${mencion.username}**, duelo de ${cmd} por **${monto}**. Usa \`!aceptar\`.`);
    }
    const gano = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
    return msg.reply(gano ? `✅ Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("No tienes retos pendientes.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 <@${g}> ganó los **${reto.monto}**.`);
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]) || 500;
    if (user.points < monto) return msg.reply("No tienes fondos.");
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
      return msg.reply("💥 **BANG!** Perdiste.");
    }
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: Math.floor(monto * 1.5) } });
    return msg.reply("🔫 **CLIC.** Zafaste y ganaste.");
  }

  if (cmd === 'suerte') return msg.reply(`🪙 Salió: **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**`);

  // --- COMANDOS MÍSTICA / MULTIMEDIA ---
  if (cmd === 'horoscopo') {
    const s = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"][Math.floor(Math.random()*12)];
    const b = cachedConfig.phrases?.length > 0 ? cachedConfig.phrases : ["Bardo astral."];
    return msg.reply(`🪐 **${s}:** "${b[Math.floor(Math.random()*b.length)]}"`);
  }
  if (cmd === 'bola8' || cmd === 'nekoask') return msg.reply(`🎱 | ${["Sí.", "No.", "Quizás.", "Ni ahí."][Math.floor(Math.random()*4)]}`);
  if (cmd === 'universefacts') return msg.reply(cachedConfig.universeFacts[Math.floor(Math.random()*cachedConfig.universeFacts.length)] || "El cosmos calla.");
  if (cmd === 'bardo') return msg.reply(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "No hay bardo.");
  if (cmd === 'spoty') return msg.reply(`🎧 **Patro-Mix:** ${["Techno Facha", "Bardo 2026", "Galactic Cachengue"][Math.floor(Math.random()*3)]}`);
  
  if (cmd === 'gif' || cmd === 'foto') {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'galaxy'}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "No encontré nada.");
    } catch (e) { return msg.reply("Error Giphy."); }
  }

  // --- AYUDA Y STATS ---
  if (cmd === 'sugerencias') {
    const boss = await client.users.fetch(MI_ID_BOSS).catch(() => null);
    if (boss) { boss.send(`💡 Sugerencia de ${msg.author.tag}: ${args.join(' ')}`); return msg.reply("✅ Enviada."); }
  }

  if (cmd === 'stats') {
    return msg.reply(`📊 **STATS:** ADN: ${cachedConfig.phrases.length} | Modo: ${cachedConfig.modoSerio ? 'Serio' : 'Normal'} | Agite: 25%`);
  }

  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B').setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!tienda`, `!comprar`' },
        { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`, `!universefacts`, `!bardo`, `!spoty`' },
        { name: '🛠️ SISTEMA', value: '`!personalidad`, `!stats`, `!mantenimiento`, `!sugerencias`' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [e] });
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);
