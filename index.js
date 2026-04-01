import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { res.write("Patroclo B17.5 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, modoBot: "ia", mejorMensaje: "Sin recuerdos." };
let msgCounter = 0; // Contador para que hable seguido

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

  // --- LÓGICA DE ADN (HABLA CADA 2-3 MENSAJES) ---
  if (!msg.content.startsWith('!')) {
    msgCounter++;
    
    if (msg.content.length > 5 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }

    const apodos = ["patroclo", "patroclin", "patro", "facha"];
    const menc = apodos.some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    const triggerHableSolo = msgCounter >= Math.floor(Math.random() * (4 - 2) + 2);

    if (menc || triggerHableSolo) {
      msgCounter = 0; // Reset
      const adn = cachedConfig.phrases.slice(-25).join(" | ");
      const r = await respuestaIA(`Sos Patroclo-B, bot argentino, bardo y facha. ADN: ${adn}. Responde corto a ${msg.author.username}: ${msg.content}`);
      return msg.reply(r || cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS REPARADOS ---
  switch (cmd) {
    case 'stats':
      const ultima = cachedConfig.phrases[cachedConfig.phrases.length - 1] || "Ninguna";
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📊 STATS').setColor('#0099ff').addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
        { name: '📝 ÚLTIMA APRENDIDA', value: `"${ultima}"` },
        { name: '🏆 RECUERDO', value: cachedConfig.mejorMensaje }
      )] });
      break;

    case 'bal': case 'plata':
      msg.reply(`💰 Tenés **$${user.points}** en la billetera.`);
      break;

    case 'daily':
      const ahora = Date.now();
      if (ahora - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste hoy, no seas caradura.");
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: ahora } });
      msg.reply("💵 Cobraste tus **$1500** del día.");
      break;

    case 'penal':
      const arco = ['izquierda', 'derecha', 'centro'];
      const patea = args[0];
      if (!arco.includes(patea)) return msg.reply("¿A dónde pateás? `izquierda`, `derecha` o `centro`.");
      const ataja = arco[Math.floor(Math.random() * 3)];
      if (patea === ataja) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -300 } });
        msg.reply(`🧤 El arquero se tiró a la ${ataja}. **ATAJADO.** Perdiste $300.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 600 } });
        msg.reply(`⚽ ¡GOOOL! El arquero fue a la ${ataja}. Ganaste **$600**.`);
      }
      break;

    case 'ruleta':
      const apuestaR = parseInt(args[0]);
      const color = args[1];
      if (isNaN(apuestaR) || !['rojo', 'negro'].includes(color)) return msg.reply("Uso: `!ruleta 500 rojo`.");
      if (user.points < apuestaR) return msg.reply("No tenés esa guita.");
      const salio = Math.random() > 0.5 ? 'rojo' : 'negro';
      if (salio === color) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: apuestaR } });
        msg.reply(`🎰 Salió **${salio}**. ¡Ganaste $${apuestaR}!`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -apuestaR } });
        msg.reply(`🎰 Salió **${salio}**. Perdiste todo.`);
      }
      break;

    case 'poker': case 'bingo':
      const azar = Math.random() > 0.7;
      const premio = Math.floor(Math.random() * 2000);
      if (azar) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: premio } });
        msg.reply(`🃏 ¡TREMENDA JUGADA! Te llevaste **$${premio}**.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -200 } });
        msg.reply("💀 Perdiste $200. Sos malísimo.");
      }
      break;

    case 'mantenimiento':
      if (msg.author.id !== '986680845031059526') return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
      msg.channel.send({ embeds: [new EmbedBuilder().setTitle('⚠️ SISTEMA OFFLINE').setDescription(`📌 **RECUERDO:** ${cachedConfig.mejorMensaje}`).setColor('#ff0000')] });
      break;

    case 'ayudacmd':
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO').setColor('#7D26CD').addFields(
        { name: '🎮 JUEGOS', value: '`!penal`, `!ruleta`, `!poker`, `!bingo`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!stats`' }
      )] });
      break;
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

start();