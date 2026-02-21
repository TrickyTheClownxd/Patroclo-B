import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { 
  res.write("Patroclo-B B01.8 SISTEMA DUAL ONLINE"); 
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
    console.log("✅ ADN, Personalidad y DB Conectados");
  } catch (e) { console.log("❌ Error DB:", e); }
}

async function loadConfig() {
  const dbData = await dataColl?.findOne({ id: "main_config" });
  if (dbData) { 
    cachedConfig = { ...cachedConfig, ...dbData }; 
  }
}

connectDb();

client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("ya llegué perritas 🔥");
      await channel.send("```\nREPORTE PATROCLO-B B01.8.2\nMODO ACTUAL: " + (cachedConfig.modoSerio ? "SERIO 👔" : "NORMAL 🔥") + "\n```");
    }
  }
});

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;

  const content = msg.content ? msg.content.toLowerCase() : "";
  const user = await getUser(msg.author.id);

  if (msg.channel.id && !msg.author.bot && cachedConfig.lastChannelId !== msg.channel.id) {
    cachedConfig.lastChannelId = msg.channel.id;
    await dataColl?.updateOne({ id: "main_config" }, { $set: { lastChannelId: msg.channel.id } }, { upsert: true }).catch(() => null);
  }

  // --- HABLA AUTOMÁTICA (CON SWITCH DE PERSONALIDAD) ---
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      // Solo aprende en Modo Normal
      if (!cachedConfig.modoSerio && dataColl && !cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true }).catch(() => null);
        cachedConfig.phrases.push(msg.content);
      }
      
      const apodos = ["patroclo", "patro", "bot", "facha"];
      const mencionado = apodos.some(a => content.includes(a)) || (msg.mentions && msg.mentions.has(client.user.id));
      
      if (mencionado || Math.random() < 0.25) { 
        let banco = cachedConfig.modoSerio ? cachedConfig.phrasesSerias : cachedConfig.phrases;
        if (banco?.length > 0) {
          return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]).catch(() => null);
        }
      }
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS BOSS (SEGURIDAD TOTAL) ---
  if (cmd === 'personalidad' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.modoSerio = !cachedConfig.modoSerio;
    await dataColl.updateOne({ id: "main_config" }, { $set: { modoSerio: cachedConfig.modoSerio } }, { upsert: true });
    return msg.reply(cachedConfig.modoSerio ? "👔 **MODO SERIO ACTIVADO.** Coherencia total." : "🔥 **MODO NORMAL ACTIVADO.** Volvió el bardo.");
  }

  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    if (cachedConfig.mantenimiento) {
      const frase = (cachedConfig.phrases?.length > 0) ? cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] : "Bardo eterno.";
      const embed = new EmbedBuilder().setTitle('📌 SESIÓN PAUSADA').setColor('#FF0000').setDescription(`"${frase}"`);
      const sent = await msg.channel.send({ embeds: [embed] }).catch(() => null);
      if (sent) await sent.pin().catch(() => null);
      return;
    }
    return msg.reply("🚀 **OPERATIVO.**");
  }

  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      const univ = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases, universeFacts: univ.facts } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ **ADN Sincronizado.**");
    } catch (e) { return msg.reply("❌ Error JSON."); }
  }

  // --- MULTIMEDIA ---
  if (cmd === 'gif' || cmd === 'foto') {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'galaxy'}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "Nada.");
    } catch (e) { return msg.reply("Error API."); }
  }

  // --- JUEGOS ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions?.users?.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (!user || user.points < monto || monto <= 0) return msg.reply("Falta guita.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **DUELO:** ${mencion}, !aceptar por ${monto}.`);
    } else {
      const gano = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
      return msg.reply(gano ? `✅ Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Sin retos.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 <@${g}> ganó los **${reto.monto}**.`);
  }

  // --- ECONOMÍA Y MÍSTICA ---
  if (cmd === 'bal') return msg.reply(`💰 **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500.");
  }

  if (cmd === 'stats') {
    const embedStats = new EmbedBuilder()
      .setTitle('📊 ESTADO DEL GIGANTE')
      .setColor('#00FFFF')
      .addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases?.length || 0} frases`, inline: true },
        { name: '👔 Modo', value: cachedConfig.modoSerio ? "Serio" : "Normal", inline: true },
        { name: '🔥 Agite', value: `25%`, inline: true }
      );
    return msg.reply({ embeds: [embedStats] });
  }

  if (cmd === 'ayudacmd') {
    const embed = new EmbedBuilder()
      .setTitle('📜 BIBLIA PATROCLO-B')
      .setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!tienda`' },
        { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`, `!personalidad` (Boss)' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [embed] });
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) {
    u = { userId: id, points: 500, lastDaily: 0, inventario: [] };
    await usersColl.insertOne(u);
  }
  return u;
}

client.login(process.env.TOKEN);
