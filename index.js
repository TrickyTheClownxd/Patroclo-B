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

// --- LÓGICA DE ADN DINÁMICO ---
let usuariosRecientes = new Set(); 

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

client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.bot) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== '986680845031059526') return;

  // --- LÓGICA DE ADN (POR USUARIOS DISTINTOS) ---
  if (!msg.content.startsWith('!')) {
    // Aprender frases
    if (msg.content.length > 4 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }

    usuariosRecientes.add(msg.author.id);
    const apodos = ["patroclo", "patroclin", "patro", "facha"];
    const loLlaman = apodos.some(a => content.includes(a)) || msg.mentions?.has(client.user.id);

    // Habla si lo llaman O si hay 3-4 usuarios distintos hablando
    if (loLlaman || usuariosRecientes.size >= Math.floor(Math.random() * (5 - 3) + 3)) {
      usuariosRecientes.clear(); // Reinicia el contador de personas
      const adn = cachedConfig.phrases.slice(-20).join(" | ");
      const r = await respuestaIA(`Sos Patroclo-B, facha y bardo. ADN: ${adn}. Responde corto a ${msg.author.username}: ${msg.content}`);
      return msg.reply(r || cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'stats':
      const ultima = cachedConfig.phrases[cachedConfig.phrases.length - 1] || "Ninguna";
      const eStats = new EmbedBuilder()
        .setTitle('📊 ESTADO DEL GIGANTE')
        .setColor('#0099ff')
        .addFields(
          { name: '🧠 FRASES EN ADN', value: `${cachedConfig.phrases.length}`, inline: true },
          { name: '📝 ÚLTIMA APRENDIDA', value: `"${ultima}"` },
          { name: '🏆 RECUERDO', value: cachedConfig.mejorMensaje }
        );
      msg.reply({ embeds: [eStats] });
      break;

    case 'penal':
      const arco = ['izquierda', 'derecha', 'centro'];
      const patea = args[0];
      if (!arco.includes(patea)) return msg.reply("Pateá a: `izquierda`, `derecha` o `centro`.");
      const ataja = arco[Math.floor(Math.random() * 3)];
      if (patea === ataja) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -200 } });
        msg.reply(`🧤 El arquero fue a la ${ataja}. ¡ATAJADO! Perdiste $200.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 } });
        msg.reply(`⚽ ¡GOOOL! Fue a la ${patea} y el arquero a la ${ataja}. +$500.`);
      }
      break;

    case 'bingo':
      const num = Math.floor(Math.random() * 10) + 1;
      const saca = Math.floor(Math.random() * 10) + 1;
      if (num === saca) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 2000 } });
        msg.reply(`🎱 Cantaste el ${num} y salió el ${saca}. ¡BINGO! +$2000.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -100 } });
        msg.reply(`🎱 Salió el ${saca}, vos tenías el ${num}. Seguí participando.`);
      }
      break;

    case 'mantenimiento':
      if (msg.author.id !== '986680845031059526') return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      msg.channel.send({ embeds: [new EmbedBuilder().setTitle('⚠️ SISTEMA OFFLINE').setDescription(`Recuerdo: ${cachedConfig.mejorMensaje}`).setColor('#ff0000')] });
      break;

    case 'noticias':
      msg.reply("📰 **NOTICIAS:** ADN optimizado para grupos, Stats con última frase y comandos de timba revisados.");
      break;
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000 }; await usersColl.insertOne(u); }
  return u;
}

start();