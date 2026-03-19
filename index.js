import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
http.createServer((req, res) => { res.write("Patroclo-B OMEGA B10.1 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], universeFacts: [], modoBot: "ia", mantenimiento: false, modoSerio: false };

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// --- MOTOR DE INTELIGENCIA SUPERIOR ---
async function respuestaIA(mensaje, autor) {
  try {
    const adnLocal = cachedConfig.phrases.slice(-50).join(" | ");
    const promptPro = `Actúa como "Patroclo-B", un bot de Discord con mucha facha, argentino, con calle y un toque de bardo. 
    Tu personalidad se basa en este ADN: ${adnLocal}. 
    Reglas: No seas aburrido, usá jerga argentina (facha, giles, bardo, joya). 
    Usuario ${autor} dice: ${mensaje}`;

    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: promptPro }] }] }, { timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
}

async function queryHF(prompt, model) {
  try {
    const res = await axios.post(`https://api-inference.huggingface.co/models/${model}`,
      { inputs: prompt }, { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' });
    return Buffer.from(res.data, 'binary');
  } catch { return null; }
}

async function connectDb() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    console.log("✅ SISTEMA OMEGA B10.1 CONECTADO");
  } catch (e) { console.log("❌ Error DB"); }
}
connectDb();

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- APRENDIZAJE Y ADN ---
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }
    const menc = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    if (menc || Math.random() < 0.15) {
      if (cachedConfig.modoBot === "ia") {
        const r = await respuestaIA(msg.content, msg.author.username);
        if (r) return msg.reply(r);
      }
      return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "...");
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS SISTEMA ---
  if (cmd === 'ayudacmd') {
    const eb = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO OMEGA').setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!bj`, `!bingo`, `!ruleta`, `!suerte`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`, `!tienda`, `!inv`' },
        { name: '🌌 MÍSTICA', value: '`!foto`, `!imagen`, `!gif`, `!horoscopo`, `!bola8`' },
        { name: '🛠️ SISTEMA', value: '`!stats`, `!noticias`, `!personalidad` (Boss)' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.reply({ embeds: [eb] });
  }

  if (cmd === 'stats') {
    const prom = (cachedConfig.phrases.join(" ").split(" ").length / cachedConfig.phrases.length).toFixed(2);
    const eb = new EmbedBuilder().setTitle("📊 PATRO-STATS").setColor("#00ffcc")
      .addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
        { name: '📈 Léxico', value: `${prom} p/f`, inline: true },
        { name: '🆕 Última', value: `*"${cachedConfig.phrases.slice(-1)[0] || "N/A"}"*`, inline: false }
      );
    return msg.reply({ embeds: [eb] });
  }

  // --- COMANDOS DE MODO (BOSS ONLY) ---
  if (cmd === 'personalidad' && msg.author.id === MI_ID_BOSS) {
    cachedConfig.modoBot = (cachedConfig.modoBot === "ia") ? "adn" : "ia";
    await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: cachedConfig.modoBot } });
    return msg.reply(`⚙️ Modo cambiado a: **${cachedConfig.modoBot.toUpperCase()}**`);
  }

  // --- IMÁGENES ---
  if (cmd === 'foto' || cmd === 'imagen') {
    if (!args[0]) return msg.reply("Pasame un prompt.");
    msg.channel.send("📸 **Generando...**");
    const model = cmd === 'foto' ? "dreamlike-art/dreamlike-photoreal-2.0" : "stabilityai/stable-diffusion-2-1";
    const img = await queryHF(args.join(' '), model);
    return img ? msg.channel.send({ files: [{ attachment: img, name: 'res.png' }] }) : msg.reply("Fallo en la API.");
  }
  
  // (Aquí van los de Blackjack y Bingo que ya tenías)
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000 }; await usersColl.insertOne(u); }
  return u;
}
client.login(process.env.TOKEN);