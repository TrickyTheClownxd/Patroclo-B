import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor para Render
http.createServer((req, res) => { 
  res.write("Patroclo-B B17.5 OMEGA ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

// CONFIGURACIÓN DE INTENTS CRÍTICA
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

if (!client.retos) client.retos = new Map();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "El bardo es para giles."], 
  lastChannelId: null, 
  mantenimiento: false,
  modoSerio: false,
  modoBot: "ia" 
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const VOICE_ID_LOQUENDO = "pNInz6obpgDQGcFmaJgB"; 

// --- REEMPLAZÁ CON EL ID DE UN CANAL DE TU SERVER PARA EL TEST ---
const ID_CANAL_TEST = 'ID_DEL_CANAL_AQUÍ'; 
const ROLES_RANDOM = ["ID_ROL_1", "ID_ROL_2", "ID_ROL_3"]; 

// --- MOTOR DE CARTAS ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [{ n: 'A', v: 11 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }, { n: '2', v: 2 }, { n: '7', v: 7 }, { n: '10', v: 10 }];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

// --- MOTOR MULTI-IA ---
async function respuestaIA(mensaje, autor) {
  const adn = cachedConfig.phrases.slice(-30).join(" | ");
  const prompt = `Sos Patroclo-B, bot argentino, facha y bardo. ADN: ${adn}. Responde corto a ${autor}.`;
  try {
    if (mensaje.length > 150 && process.env.CLAUDE_API_KEY) {
      const res = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-5-sonnet-20240620", max_tokens: 200, system: prompt,
        messages: [{ role: "user", content: mensaje }]
      }, { headers: { "x-api-key": process.env.CLAUDE_API_KEY, "anthropic-version": "2023-06-01" } });
      return res.data.content[0].text;
    }
    if (process.env.GROQ_API_KEY) {
      const resG = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama3-70b-8192", messages: [{ role: "system", content: prompt }, { role: "user", content: mensaje }]
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
      return resG.data.choices[0].message.content;
    }
    return null;
  } catch (e) { return null; }
}

async function connectDb() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    console.log("✅ FUSIÓN B17.5 CONECTADA A MONGODB");
  } catch (e) { console.log("❌ Error de DB:", e.message); }
}
connectDb();

// EVENTO DE ARRANQUE (DEBUG)
client.on('ready', () => {
  console.log(`🤖 DISCORD OK: Logueado como ${client.user.tag}`);
  const canal = client.channels.cache.get(ID_CANAL_TEST);
  if (canal) {
    canal.send("🔥 **PATROCLO-B ONLINE.** Sistema cargado y listo para el bardo.");
  }
});

client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.bot) return;
  
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // Test de vida sin prefijo
  if (content === 'ping') return msg.reply('🏓 Pong! Estoy vivo.');

  // APRENDIZAJE Y RESPUESTA AUTOMÁTICA
  if (!msg.content.startsWith('!')) {
    if (msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        if(dataColl) await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        cachedConfig.phrases.push(msg.content);
      }
    }
    const mencionado = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    if (mencionado || Math.random() < 0.15) {
      const res = await respuestaIA(msg.content, msg.author.username);
      if (res) return msg.reply(res);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  switch (cmd) {
    case 'bal': case 'plata': msg.reply(`💰 Saldo: **$${user.points}**.`); break;
    
    case 'bj': case 'blackjack':
      const apBJ = parseInt(args[0]) || 500;
      if (user.points < apBJ) return msg.reply("No tenés un peso.");
      const c1 = generarCarta(); const c2 = generarCarta();
      const tot = c1.val + c2.val;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: tot <= 21 ? apBJ : -apBJ } });
      msg.reply(`🃏 Cartas: ${c1.txt} ${c2.txt} (Total: ${tot}). ${tot <= 21 ? '¡Ganaste!' : 'Palmaste.'}`);
      break;

    case 'lote':
      if (user.points < 5000) return msg.reply("El lote sale $5000, seco.");
      const rID = ROLES_RANDOM[Math.floor(Math.random() * ROLES_RANDOM.length)];
      try {
        const role = msg.guild.roles.cache.get(rID);
        if(!role) return msg.reply("ID de rol no configurado.");
        await msg.member.roles.add(role);
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -5000 } });
        msg.reply(`🎁 ¡Lote abierto! Sos un nuevo **${role.name}**.`);
      } catch (e) { msg.reply("No tengo permisos para darte ese rol."); }
      break;

    case 'ayudacmd':
      const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO B17.5').setColor('#7D26CD')
        .addFields(
          { name: '🎮 JUEGOS', value: '`!bj`, `!bingo`, `!ruleta`, `!poker`, `!penal`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`, `!lote`' },
          { name: '🌌 MÍSTICA', value: '`!habla`, `!gif`, `!noticias`, `!horoscopo`' }
        );
      msg.channel.send({ embeds: [e] });
      break;
  }
});

async function getUser(id) {
  if (!usersColl) return { userId: id, points: 1000 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000 }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN).catch(err => {
  console.error("❌ ERROR CRÍTICO DE DISCORD:", err.message);
});