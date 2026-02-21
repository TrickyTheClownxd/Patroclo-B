import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para Railway
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
let cachedConfig = { phrases: [], universeFacts: [], lastChannelId: null, mantenimiento: false };
if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil galáctico." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección contra bardo aleatorio." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Acceso a zona de mística premium." }
];

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    await loadConfig();
    console.log("✅ Sistema ADN y DB Conectados");
  } catch (e) { console.log("❌ Error DB:", e); }
}

async function loadConfig() {
  const dbData = await dataColl?.findOne({ id: "main_config" });
  if (dbData) { 
    cachedConfig = { 
      ...cachedConfig, 
      ...dbData,
      phrases: dbData.phrases || [],
      universeFacts: dbData.universeFacts || []
    }; 
  }
}

connectDb();

client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("ya llegué perritas 🔥").catch(() => null);
      await channel.send("```\nREPORTE PATROCLO-B B01.8\nESTADO: OPERATIVO TOTAL\nAGITE: 25% (MODO PICANTE)\n```").catch(() => null);
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

  // --- APRENDIZAJE Y HABLA (25%) ---
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (dataColl && cachedConfig.phrases && !cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true }).catch(() => null);
        cachedConfig.phrases.push(msg.content);
      }
      const apodos = ["patroclo", "patro", "bot", "facha"];
      const mencionado = apodos.some(a => content.includes(a)) || (msg.mentions && msg.mentions.has(client.user.id));
      if (mencionado || Math.random() < 0.25) { 
        if (cachedConfig.phrases?.length > 0) {
          return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]).catch(() => null);
        }
      }
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- SISTEMA BOSS ---
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    if (cachedConfig.mantenimiento) {
      const frase = (cachedConfig.phrases?.length > 0) ? cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] : "El bardo es eterno.";
      const embed = new EmbedBuilder().setTitle('📌 RECUERDO').setColor('#FF0000').setDescription(`"**${frase}**"\n\n⚠️ **SISTEMA OFFLINE**`).setFooter({ text: 'Patroclo-B' });
      const sent = await msg.channel.send({ embeds: [embed] }).catch(() => null);
      if (sent) await sent.pin().catch(() => null);
      return;
    }
    return msg.reply("🚀 **MODO MANTENIMIENTO DESACTIVADO.**");
  }

  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      const univ = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases, universeFacts: univ.facts } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ **Sincronizado.**");
    } catch (e) { return msg.reply("❌ Error JSON."); }
  }

  if (cmd === 'reload' && msg.author.id === MI_ID_BOSS) {
    await loadConfig();
    return msg.reply("♻️ **Memoria refrescada.**");
  }

  // --- MULTIMEDIA ---
  if (cmd === 'gif' || cmd === 'foto') {
    const q = args.join(' ') || 'galaxy';
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "No encontré nada.");
    } catch (e) { return msg.reply("Error API Giphy."); }
  }

  // --- JUEGOS ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions?.users?.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (!user || user.points < monto || monto <= 0) return msg.reply("No tenés guita.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **RETO:** ${mencion}, duelo de ${cmd} por **${monto}**. \`!aceptar\`.`);
    } else {
      const gano = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
      return msg.reply(gano ? `✅ Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("No tenés retos.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **FINAL:** <@${g}> ganó **${reto.monto}**.`);
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]) || 500;
    if (user.points < monto || monto <= 0) return msg.reply("Falta guita.");
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
      return msg.reply(`💥 **BANG!** Perdiste **${monto}**.`);
    }
    const p = Math.floor(monto * 1.5);
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: p } });
    return msg.reply(`🔫 **CLIC.** Ganaste **${p}**.`);
  }

  if (cmd === 'suerte') {
    const r = ["CARA", "CRUZ"][Math.floor(Math.random() * 2)];
    return msg.reply(`🪙 Salió: **${r}**`);
  }

  // --- ECONOMÍA ---
  if (cmd === 'bal') return msg.reply(`💰 Tenés **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500.");
  }
  
  if (cmd === 'tienda') {
    let lista = ITEMS_TIENDA.map(i => `ID: ${i.id} | **${i.nombre}** - 💰${i.precio}`).join('\n');
    return msg.reply(`🛒 **TIENDA**\n${lista}`);
  }

  // --- MÍSTICA ---
  if (cmd === 'horoscopo') {
    const signo = cachedConfig.universeFacts[Math.floor(Math.random() * cachedConfig.universeFacts.length)] || "Signo Nulo";
    const pred = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Bardo.";
    return msg.reply(`🪐 **${signo}:** "${pred}"`);
  }

  if (cmd === 'bola8' || cmd === 'nekoask') {
    const rtas = ["Sí.", "No.", "Probablemente.", "Ni ahí."];
    return msg.reply(`🎱 | ${rtas[Math.floor(Math.random() * rtas.length)]}`);
  }

  // --- FEEDBACK / DIAGNÓSTICO ---
  if (cmd === 'sugerencias' && args.length > 0) {
    const boss = await client.users.fetch(MI_ID_BOSS).catch(() => null);
    if (boss) { boss.send(`💡 **Sugerencia de ${msg.author.tag}:** ${args.join(' ')}`); return msg.reply("✅ Enviada."); }
  }

  if (cmd === 'stats') {
    const uptimeTotal = Math.floor(process.uptime() / 60); 
    const embedStats = new EmbedBuilder()
      .setTitle('📊 ESTADO DEL GIGANTE')
      .setColor('#00FFFF')
      .addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases?.length || 0} frases`, inline: true },
        { name: '🕒 Uptime', value: `${uptimeTotal} min`, inline: true },
        { name: '🔥 Agite', value: `25%`, inline: true }
      ).setFooter({ text: 'Patroclo-B B01.8' });
    return msg.reply({ embeds: [embedStats] });
  }

  if (cmd === 'ayudacmd') {
    const embed = new EmbedBuilder()
      .setTitle('📜 BIBLIA PATROCLO-B')
      .setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!tienda`' },
        { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`, `!universefacts`' },
        { name: '🛠️ SISTEMA', value: '`!stats`, `!sugerencias`, `!mantenimiento`' }
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
