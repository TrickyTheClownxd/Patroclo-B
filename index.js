import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para Railway (Evita que el bot se duerma)
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

let statsSesion = { comandosUsados: 0, inicio: Date.now() };

// IDENTIDADES SAGRADAS
const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';
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
  } catch (e) { console.log("❌ Error DB"); }
}

async function loadConfig() {
  const dbData = await dataColl.findOne({ id: "main_config" });
  if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
}

connectDb();

client.once('ready', async () => {
  console.log(`Logueado como ${client.user.tag} 🔥`);
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("ya llegué perritas 🔥");
      const reporte = "```\nREPORTE PATROCLO-B B01.8\nESTADO: OPERATIVO TOTAL\nSincronización JSON: OK\nEconomía: OK\nFijado de Sesión: OK\n```";
      await channel.send(reporte);
    }
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  if (cachedConfig.lastChannelId !== msg.channel.id && !msg.author.bot) {
    cachedConfig.lastChannelId = msg.channel.id;
    await dataColl.updateOne({ id: "main_config" }, { $set: { lastChannelId: msg.channel.id } }, { upsert: true });
  }

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  if (!msg.content.startsWith('!')) {
    // ADN: APRENDIZAJE Y HABLA AUTOMATICA
    if (!msg.author.bot && msg.content.length > 3) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        cachedConfig.phrases.push(msg.content);
      }
      const apodos = ["patroclo", "patro", "bot", "facha"];
      if (apodos.some(a => content.includes(a)) || msg.mentions.has(client.user.id) || Math.random() < 0.15) {
        if (cachedConfig.phrases.length > 0) {
          return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
        }
      }
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  statsSesion.comandosUsados++;

  // --- COMANDOS BOSS (SEGURIDAD Y RECUERDO) ---
  if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    if (cachedConfig.mantenimiento) {
      const fraseRecuerdo = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "El bardo nunca muere.";
      const embedMaint = new EmbedBuilder()
        .setTitle('📌 RECUERDO DE LA SESIÓN')
        .setColor('#FF0000')
        .setDescription(`"**${fraseRecuerdo}**"\n\n⚠️ **SISTEMA OFFLINE**\nEl Boss está actualizando el ADN.`)
        .setFooter({ text: 'Patroclo-B Mantenimiento' });
      const sentMsg = await msg.channel.send({ embeds: [embedMaint] });
      await sentMsg.pin().catch(() => null);
      return;
    } else {
      return msg.reply("🚀 **MODO MANTENIMIENTO DESACTIVADO.** ¡Volvimos!");
    }
  }

  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      const univ = JSON.parse(fs.readFileSync('./universe.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases, universeFacts: univ.facts } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ **ADN y Universo sincronizados.**");
    } catch (e) { return msg.reply("❌ Error en JSON."); }
  }

  // --- JUEGOS Y AZAR ---
  if (cmd === 'suerte') {
    const opciones = ["CARA", "CRUZ"];
    const resultado = opciones[Math.floor(Math.random() * opciones.length)];
    const eleccion = args[0] ? args[0].toUpperCase() : null;
    if (!eleccion) return msg.reply(`🪙 Salió: **${resultado}**`);
    return msg.reply(eleccion === resultado ? `🪙 Salió **${resultado}**. ¡Ganaste! 😎` : `🪙 Salió **${resultado}**. Perdiste. 💀`);
  }

  if (cmd === 'ruleta') {
    const monto = parseInt(args[0]) || 500;
    if (user.points < monto || monto <= 0) return msg.reply("No tenés guita.");
    if (Math.random() < 0.16) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
      return msg.reply(`💥 **BANG!** Perdiste **${monto}**. 💀`);
    } else {
      const p = Math.floor(monto * 1.5);
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: p } });
      return msg.reply(`🔫 **CLIC.** Zafaste y ganaste **${p}**. 😎`);
    }
  }

  // --- MISTICA ---
  if (cmd === 'horoscopo') {
    const signo = cachedConfig.universeFacts[Math.floor(Math.random() * cachedConfig.universeFacts.length)] || "Estrella Muerta";
    const pred = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Hoy hay bardo.";
    return msg.reply(`🪐 **Signo:** ${signo}\n🔮 **Predicción:** ${pred}`);
  }

  if (cmd === 'bola8' || cmd === 'nekoask') {
    const rtas = ["Sí.", "No.", "Tal vez.", "Ni ahí.", "Preguntale al Boss.", "Totalmente."];
    return msg.reply(`🎱 | ${rtas[Math.floor(Math.random() * rtas.length)]}`);
  }

  if (cmd === 'sugerencias') {
    const sug = args.join(' ');
    if (!sug) return msg.reply("Escribí algo facha.");
    const boss = await client.users.fetch(MI_ID_BOSS).catch(() => null);
    if (boss) {
      await boss.send(`💡 **SUGERENCIA de ${msg.author.tag}:** ${sug}`);
      return msg.reply("✅ Enviada al Boss.");
    }
  }

  if (cmd === 'ayudacmd') {
    const embed = new EmbedBuilder()
      .setTitle('📜 BIBLIA PATROCLO-B (B01.8)')
      .setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte` (cara/cruz)', inline: true },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!tienda`, `!comprar`', inline: true },
        { name: '🌌 MÍSTICA', value: '`!universefacts`, `!bardo`, `!horoscopo`, `!bola8`, `!spoty`', inline: true },
        { name: '🛠️ FEEDBACK', value: '`!sugerencias`, `!stats`', inline: true }
      )
      .setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [embed] });
  }

  // --- ECONOMIA Y DUELOS BASICOS ---
  if (cmd === 'bal') return msg.reply(`💰 **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +500 diarios.");
  }
  
  if (cmd === 'universefacts') return msg.channel.send(cachedConfig.universeFacts[Math.floor(Math.random() * cachedConfig.universeFacts.length)] || "El cosmos calla.");
  if (cmd === 'bardo') return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "No hay bardo.");
});

async function getUser(id) {
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0, inventario: [] };
    await usersColl.insertOne(user);
  }
  return user;
}

client.login(process.env.TOKEN);
