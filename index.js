import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// 1. HOSTING FIX
http.createServer((req, res) => { res.write("Patroclo B17.5 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, modoBot: "ia", mejorMensaje: "..." };

// --- MOTOR IA (LLAMA4/GEMINI) ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 5000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
  } catch (e) { console.log("DB Error"); }
}

// --- ADN Y APRENDIZAJE ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.bot) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== '986680845031059526') return;

  if (!msg.content.startsWith('!')) {
    // Aprendizaje de ADN
    if (msg.content.length > 5 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
      // Probabilidad de "Mejor Mensaje"
      if (Math.random() < 0.05) {
        cachedConfig.mejorMensaje = `"${msg.content}" (by ${msg.author.username})`;
        await dataColl.updateOne({ id: "main_config" }, { $set: { mejorMensaje: cachedConfig.mejorMensaje } });
      }
    }

    // ADN 25% + Apodos
    const apodos = ["patroclo", "patroclin", "patro"];
    const menc = apodos.some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    if (menc || Math.random() < 0.25) {
      const adn = cachedConfig.phrases.slice(-20).join(" | ");
      const r = await respuestaIA(`Patroclo-B facha. ADN: ${adn}. Responde corto a ${msg.author.username}: ${msg.content}`);
      return msg.reply(r || cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'stats':
      const ultimaFrase = cachedConfig.phrases[cachedConfig.phrases.length - 1] || "Nada todavía";
      const embedStats = new EmbedBuilder()
        .setTitle('📊 ESTADO DEL GIGANTE')
        .setColor('#0099ff')
        .addFields(
          { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
          { name: '🔥 Agite', value: '25%', inline: true },
          { name: '📝 Última aprendida', value: `"${ultimaFrase}"` }
        ).setFooter({ text: `Patroclo-B B17.5` });
      msg.reply({ embeds: [embedStats] });
      break;

    case 'ayudacmd':
      const help = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B').setColor('#7D26CD')
        .addFields(
          { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!bingo`, `!bj`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!tienda`, `!trabajo`, `!pay`' },
          { name: '🌌 MÍSTICA', value: '`!horoscopo`, `!bola8`, `!universefacts`' },
          { name: '⚙️ SISTEMA', value: '`!stats`, `!mantenimiento`, `!modo`' }
        );
      msg.reply({ embeds: [help] });
      break;

    case 'mantenimiento':
      if (msg.author.id !== '986680845031059526') return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
      const statusEmbed = new EmbedBuilder()
        .setDescription(`📌 **RECUERDO DE LA SESIÓN:** ${cachedConfig.mejorMensaje}\n\n⚠️ **SISTEMA OFFLINE** ⚠️\nEl Boss está actualizando el ADN.`)
        .setColor('#ff0000');
      msg.channel.send({ embeds: [statusEmbed] });
      break;

    case 'noticias':
      msg.reply("📰 **NOTICIAS:** Integrado motor LLAMA4, sistema de apuestas realista, ADN persistente al 25% y comandos de economía sincronizados.");
      break;

    // ... (Aquí irían los restos de juegos: ruleta, poker, bingo con lógica corta)
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000 }; await usersColl.insertOne(u); }
  return u;
}

start();