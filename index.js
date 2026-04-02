import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
http.createServer((req, res) => { 
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write("PATROCLO B17.5 ULTRA OMEGA ONLINE"); 
  res.end(); 
}).listen(port, () => {
  console.log(`Servidor HTTP escuchando en puerto ${port}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, mejorMensaje: "Sin recuerdos.", modoActual: "ia" };
let msgCounter = 0; 
let loopBotCounter = 0;
if (!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';
const ID_OWNER = '986680845031059526';

// --- MOTORES DE IA ---
async function respuestaIA(contexto) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: contexto }] }], safetySettings }, { timeout: 7000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: "Sos Patroclo-B, argentino bardo y sin filtros." }, { role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 5000 });
      return groqRes.data.choices[0].message.content;
    } catch { return null; }
  }
}

// --- MOTORES DE IMAGEN ---
async function motorHuggingFace(prompt) {
  try {
    const response = await axios.post("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: prompt }, { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch { return null; }
}

async function motorGeminiImagen(prompt) {
    try {
      // Usamos el endpoint de Gemini para generación de imágenes (requiere que tu key soporte Imagen 3 o similar)
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3:generateImages?key=${process.env.GEMINI_API_KEY}`,
        { prompt: prompt }, { timeout: 10000 });
      return res.data?.images?.[0]?.url || null; 
    } catch { return null; }
}

// --- UTILIDADES ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [{ n: 'A', v: 11 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }, { n: '2', v: 2 }, { n: '3', v: 3 }, { n: '4', v: 4 }, { n: '5', v: 5 }, { n: '6', v: 6 }, { n: '7', v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 }, { n: '10', v: 10 }];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

const calcularPuntos = (mano) => {
  let pts = mano.reduce((acc, c) => acc + c.val, 0);
  let ases = mano.filter(c => c.txt.startsWith('A')).length;
  while (pts > 21 && ases > 0) { pts -= 10; ases--; }
  return pts;
};

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

// --- INICIO ---
async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("Patroclo B17.5 Online y con motores de imagen listos.");
  } catch (e) { console.error(e); }
}

// --- MENSAJES Y COMANDOS ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) || msg.author.id === client.user.id) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  if (!msg.content.startsWith('!')) {
    msgCounter++;
    if (msg.author.id === ID_PATROCLO_ORIGINAL) loopBotCounter++; else loopBotCounter = 0;
    if (loopBotCounter > 3) return;
    if (msg.content.length > 5 && !msg.author.bot) {
        if (!cachedConfig.phrases.includes(msg.content)) {
          cachedConfig.phrases.push(msg.content);
          await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
        }
    }
    const menc = ["patro", "facha"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    if (menc || msgCounter >= 5) {
      msgCounter = 0;
      if (cachedConfig.modoActual === "normal") return msg.reply(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
      const adn = cachedConfig.phrases.slice(-30).join(" | ");
      const prompt = `ADN: ${adn}. Sos Patroclo-B, bardeá a ${msg.author.username} por decir: ${msg.content}`;
      const r = await respuestaIA(prompt);
      return msg.reply(r || "Cerrá el orto.");
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'foto': // Motor Hugging Face
      if (!args.length) return msg.reply("¿De qué queres la foto?");
      msg.channel.sendTyping();
      const imgBuffer = await motorHuggingFace(args.join(" "));
      if (imgBuffer) msg.reply({ files: [{ attachment: imgBuffer, name: 'patro_foto.png' }] });
      else msg.reply("Hugging Face está saturado, probá con `!imagen`.");
      break;

    case 'imagen': // Motor Gemini
      if (!args.length) return msg.reply("¿Qué imagen querés?");
      msg.channel.sendTyping();
      const imgUrl = await motorGeminiImagen(args.join(" "));
      if (imgUrl) msg.reply({ content: "Tomá, facha:", embeds: [new EmbedBuilder().setImage(imgUrl).setColor('#00ff00')] });
      else msg.reply("Gemini no quiso dibujar eso. Probá `!foto`.");
      break;

    case 'noticias':
      try {
        const resN = await axios.get(`https://newsapi.org/v2/top-headlines?country=ar&apiKey=${process.env.NEWS_API}`);
        const art = resN.data.articles[0];
        msg.reply(art ? `📰 **${art.title}**\n${art.url}` : "No hay noticias hoy.");
      } catch { msg.reply("Se cayó el diario."); }
      break;

    case 'ayudacmd':
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO').addFields({ name: 'Comandos', value: '!bal, !bj, !poker, !daily, !trabajar, !modo, !noticias, !foto (Motor 1), !imagen (Motor 2)' }).setColor('#7D26CD')] });
      break;

    case 'modo':
      if (!['normal', 'serio', 'ia'].includes(args[0])) return;
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
      msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
      break;

    case 'bal': case 'plata': msg.reply(`💰 Tenés $${user.points} Patro-Pesos.`); break;
    case 'daily':
        const ahora = Date.now();
        if (ahora - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste, rata.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: ahora } });
        msg.reply("💵 Cobraste $1500.");
        break;

    case 'mantenimiento':
      if (msg.author.id !== ID_OWNER) return;
      cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } });
      msg.reply(cachedConfig.mantenimiento ? "⚠️ OFFLINE" : "✅ ONLINE");
      break;
  }
});

// --- LÓGICA DE JUEGO (Botones BJ) ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;
    const data = client.retos.get(`bj_${int.user.id}`);
    if (!data) return int.reply({ content: "Expiró.", ephemeral: true });
  
    if (int.customId === 'bj_pedir') {
      data.uM.push(generarCarta());
      if (calcularPuntos(data.uM) > 21) {
        await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -data.mbj } });
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({ content: `💥 Te pasaste! -$${data.mbj}`, embeds: [], components: [] });
      }
    } else if (int.customId === 'bj_plantarse') {
      let ptsB = calcularPuntos(data.bM);
      while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
      const ptsU = calcularPuntos(data.uM);
      const win = ptsB > 21 || ptsU > ptsB;
      const empate = ptsU === ptsB;
      if (!empate) await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: win ? data.mbj : -data.mbj } });
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({ content: empate ? "🤝 Empate." : win ? `🏆 Ganaste! +$${data.mbj}` : `💀 Perdiste. -$${data.mbj}`, embeds: [], components: [] });
    }
    const emb = new EmbedBuilder().setTitle('🃏 BJ').addFields({ name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true }, { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true });
    await int.update({ embeds: [emb] });
});

start();