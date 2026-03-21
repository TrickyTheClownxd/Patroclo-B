import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor Base
http.createServer((req, res) => { 
  res.write("Patroclo-B B17.5 OMEGA ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

if (!client.retos) client.retos = new Map();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "El bardo es para Giles."], 
  lastChannelId: null, 
  mantenimiento: false,
  modoSerio: false,
  modoBot: "ia" 
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const VOICE_ID_LOQUENDO = "pNInz6obpgDQGcFmaJgB"; 
const ROLES_RANDOM = ["ID_1", "ID_2", "ID_3"]; // ACÁ PONDRÁS LOS IDS QUE ME PASES

// --- SISTEMA DE CARTAS (LLAMA4) ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [{ n: 'A', v: 11 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }, { n: '2', v: 2 }, { n: '7', v: 7 }, { n: '10', v: 10 }];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

// --- MOTOR MULTI-IA (CLAUDE + GROQ + GEMINI) ---
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
    const resGem = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: prompt + " " + mensaje }] }] });
    return resGem.data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
    console.log("✅ FUSIÓN B17.5 CONECTADA");
  } catch (e) { console.log("❌ DB Error"); }
}
connectDb();

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- APRENDIZAJE ADN ---
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        cachedConfig.phrases.push(msg.content);
      }
    }
    const mencionado = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    if (mencionado || Math.random() < 0.20) {
      const res = await respuestaIA(msg.content, msg.author.username);
      if (res) return msg.reply(res);
      let banco = cachedConfig.modoSerio ? cachedConfig.phrasesSerias : cachedConfig.phrases;
      if (banco.length > 0) return msg.reply(banco[Math.floor(Math.random()*banco.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  switch (cmd) {
    // --- JUEGOS ---
    case 'bingo':
      if (user.points < 300) return msg.reply("Falta plata pal bingo.");
      const ganoB = Math.random() < 0.12;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganoB ? 3000 : -300 } });
      msg.reply(ganoB ? "🎰 **BINGO!** Te llevaste $3000." : "📉 Salió la bolilla 45... nada para vos.");
      break;

    case 'bj': case 'blackjack':
      const apBJ = parseInt(args[0]) || 500;
      if (user.points < apBJ) return msg.reply("No tenés un peso.");
      const c1 = generarCarta(); const c2 = generarCarta();
      const tot = c1.val + c2.val;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: tot <= 21 ? apBJ : -apBJ } });
      msg.reply(`🃏 Tus cartas: ${c1.txt} ${c2.txt} (Total: ${tot}). ${tot <= 21 ? '¡Ganaste!' : 'Palmaron esos pesos.'}`);
      break;

    case 'ruleta':
      const apR = parseInt(args[0]) || 500;
      if (user.points < apR) return msg.reply("Sin fondos.");
      if (Math.random() < 0.16) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -apR } });
        return msg.reply("💥 **BANG!** Perdiste.");
      }
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: Math.floor(apR * 1.5) } });
      msg.reply("🔫 **CLIC.** Zafaste y cobraste.");
      break;

    case 'poker': case 'penal':
      const mencP = msg.mentions.users.first();
      const apP = parseInt(args[1]) || parseInt(args[0]) || 100;
      if (user.points < apP) return msg.reply("No te alcanza.");
      if (mencP) {
        client.retos.set(mencP.id, { retador: msg.author.id, monto: apP });
        return msg.reply(`⚔️ <@${mencP.id}>, \`!aceptar\` por **$${apP}**.`);
      }
      const ganoP = Math.random() > 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganoP ? apP : -apP } });
      msg.reply(ganoP ? `✅ Ganaste **$${apP}**` : `💀 Perdiste **$${apP}**`);
      break;

    case 'aceptar':
      const r = client.retos.get(msg.author.id);
      if (!r) return msg.reply("No tenés retos.");
      const winA = Math.random() > 0.5;
      const g = winA ? r.retador : msg.author.id;
      const p = winA ? msg.author.id : r.retador;
      await usersColl.updateOne({ userId: g }, { $inc: { points: r.monto } });
      await usersColl.updateOne({ userId: p }, { $inc: { points: -r.monto } });
      client.retos.delete(msg.author.id);
      msg.channel.send(`🏆 <@${g}> ganó los **$${r.monto}**.`);
      break;

    // --- ECONOMÍA ---
    case 'bal': case 'plata': msg.reply(`💰 Saldo: **$${user.points}**.`); break;
    case 'daily':
      if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé.");
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
      msg.reply("💵 +$500 Patro-Pesos.");
      break;
    
    case 'transferencia': case 'pay':
      const mP = msg.mentions.users.first();
      const cant = parseInt(args[1]) || parseInt(args[0]);
      if (!mP || !cant || cant <= 0 || user.points < cant) return msg.reply("Error en el pago.");
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -cant } });
      await usersColl.updateOne({ userId: mP.id }, { $inc: { points: cant } }, { upsert: true });
      msg.reply(`💸 Transferiste **$${cant}** a <@${mP.id}>.`);
      break;

    case 'lote':
      if (user.points < 5000) return msg.reply("El lote sale $5000.");
      const rID = ROLES_RANDOM[Math.floor(Math.random() * ROLES_RANDOM.length)];
      const rol = msg.guild.roles.cache.get(rID);
      if (rol) {
        await msg.member.roles.add(rol);
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -5000 } });
        msg.reply(`🎁 ¡Lote abierto! Sos un nuevo **${rol.name}**.`);
      }
      break;

    // --- MÍSTICA / MULTIMEDIA ---
    case 'habla':
      if (!process.env.ELEVENLABS_API_KEY) return msg.reply("Sin voz.");
      try {
        const aud = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID_LOQUENDO}`, 
          { text: args.join(" "), model_id: "eleven_multilingual_v2" },
          { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' });
        msg.reply({ files: [{ attachment: Buffer.from(aud.data), name: 'loquendo.mp3' }] });
      } catch (e) { msg.reply("Se me trabó la lengua."); }
      break;

    case 'gif':
      try {
        const resG = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'argentina'}&limit=1`);
        msg.reply(resG.data.data[0]?.url || "No encontré nada.");
      } catch (e) { msg.reply("Giphy se rompió."); }
      break;

    case 'noticias':
      try {
        const resN = await axios.get(`https://newsapi.org/v2/top-headlines?country=ar&apiKey=${process.env.NEWS_API}`);
        msg.reply(`📰 **${resN.data.articles[0].title}**\n${resN.data.articles[0].url}`);
      } catch (e) { msg.reply("Se cayó el diario."); }
      break;

    case 'horoscopo':
      const s = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"][Math.floor(Math.random()*12)];
      msg.reply(`🪐 **${s}:** "${cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Bardo astral."}"`);
      break;

    // --- SISTEMA ---
    case 'stats':
      const ultima = cachedConfig.phrases[cachedConfig.phrases.length - 1] || "Ninguna";
      msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${cachedConfig.modoSerio ? 'SERIO' : 'NORMAL'}\n🧠 Última palabra: "${ultima}"`);
      break;

    case 'personalidad':
      if (msg.author.id !== MI_ID_BOSS) return;
      cachedConfig.modoSerio = !cachedConfig.modoSerio;
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoSerio: cachedConfig.modoSerio } });
      msg.reply(cachedConfig.modoSerio ? "👔 Modo Serio." : "🔥 Modo Bardo.");
      break;

    case 'ayudacmd':
      const e = new EmbedBuilder().setTitle('📜 BIBLIA B17.5 OMEGA').setColor('#7D26CD')
        .addFields(
          { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!bingo`, `!bj`, `!aceptar`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`, `!lote`, `!tienda`, `!comprar`' },
          { name: '🌌 MÍSTICA', value: '`!habla`, `!gif`, `!noticias`, `!horoscopo`, `!nekoask`, `!bola8`' },
          { name: '🛠️ BOSS', value: '`!personalidad`, `!stats`, `!mantenimiento`' }
        );
      msg.channel.send({ embeds: [e] });
      break;
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}
client.login(process.env.TOKEN);