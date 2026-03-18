import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// --- ESTADO Y CONFIG ---
let chatHistory = [];
let modoBot = "normal"; 
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, sugsColl;

let cachedConfig = { 
  phrases: [], 
  phrasesSerias: ["La disciplina es libertad.", "Respeto, orden y jerarquía.", "Fuerza en el silencio."],
  mantenimiento: false 
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

http.createServer((req, res) => { res.write("Patroclo-B B03.9 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

// --- MOTORES IA ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] },
      { timeout: 10000 }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { return null; }
}

// --- CONEXIÓN DB ---
async function connectDb() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    sugsColl = db.collection('sugerencias');
    const dbData = await dataColl.findOne({ id: "main_config" });
    if (dbData) {
      cachedConfig = { ...cachedConfig, ...dbData };
      modoBot = dbData.modoActual || "normal";
    }
    console.log(`✅ Patroclo B03.9 Conectado. Biblia Sincronizada.`);
  } catch (e) { console.log("Error DB:", e); }
}
connectDb();

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const content = msg.content?.toLowerCase() || "";
  const user = await getUser(msg.author.id);

  // MANTENIMIENTO
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) {
    if (msg.content.startsWith('!')) return msg.reply("🛠️ Estoy en mantenimiento, bancá un toque.");
    return;
  }

  // APRENDIZAJE ADN (20k+ palabras)
  if (!msg.content.startsWith('!') && !msg.author.bot && msg.content.length > 2) {
    if (modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
    }
  }

  // RESPUESTAS AUTOMÁTICAS (MODO IA / SERIO / NORMAL)
  if (!msg.content.startsWith('!')) {
    const mencionado = msg.mentions?.has(client.user.id) || content.includes("patroclo");
    if (mencionado || Math.random() < 0.18) {
      if (modoBot === "ia") {
        msg.channel.sendTyping();
        const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 35).join(" | ");
        const promptIA = `Sos Patroclo-B de Nogoyá. ADN: "${muestra}". Responde corto y bardo a: "${msg.content}".`;
        const r = await respuestaIA(promptIA);
        if (r) return msg.reply(r);
      }
      if (modoBot === "serio") return msg.channel.send(cachedConfig.phrasesSerias[Math.floor(Math.random()*cachedConfig.phrasesSerias.length)]);
      if (cachedConfig.phrases.length > 0) return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- CATEGORÍA: JUEGOS ---
  if (['poker', 'penal', 'ruleta'].includes(cmd)) {
    const cant = parseInt(args[0]) || 100;
    if (user.points < cant) return msg.reply("No tenés un peso.");
    const win = Math.random() < 0.5;
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? cant : -cant } });
    return msg.reply(win ? `✅ Ganaste **${cant}**!` : `💀 Perdiste **${cant}**.`);
  }
  if (cmd === 'suerte') return msg.reply(`🪙 Tiraste la moneda y salió: **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**.`);
  if (cmd === 'aceptar') return msg.reply("✅ Reto/Duelo aceptado. ¡Que gane el mejor!");

  // --- CATEGORÍA: ECONOMÍA ---
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana volvé por más.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 Cobraste tus **500** de hoy.");
  }
  if (cmd === 'transferencia' || cmd === 'pay') {
    const target = msg.mentions.users.first();
    const monto = parseInt(args[1]);
    if (!target || !monto || monto <= 0) return msg.reply("Uso: `!pay @user 100`.");
    if (user.points < monto) return msg.reply("No tenés esa plata.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
    await usersColl.updateOne({ userId: target.id }, { $inc: { points: monto } }, { upsert: true });
    return msg.reply(`💸 Transferencia de **${monto}** a <@${target.id}> exitosa.`);
  }
  if (cmd === 'tienda') return msg.reply("🏪 **TIENDA PATROCLO**: \n1. Rango VIP (50000 PP)\n2. Un bardo personalizado (1000 PP)\nUsá `!comprar [número]`");
  if (cmd === 'comprar') return msg.reply("🛒 Compra procesada (simulada por ahora). El Boss revisará tu pedido.");

  // --- CATEGORÍA: MÍSTICA & IA ---
  if (cmd === 'bardo') {
    const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 10).join(" ");
    return msg.reply(`🔥 **BARDO ADN**: ${muestra}`);
  }
  if (cmd === 'perfiladn') {
    msg.channel.sendTyping();
    const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 40).join(" | ");
    const r = await respuestaIA(`Analizá este ADN y decime quién es Patroclo hoy: ${muestra}`);
    return msg.reply(r || "ADN ilegible.");
  }

  // --- CATEGORÍA: SISTEMA ---
  if (cmd === 'stats') {
    const totalU = await usersColl.countDocuments();
    return msg.reply(`📊 **STATS**: ADN con **${cachedConfig.phrases.length}** frases. **${totalU}** usuarios en el sistema.`);
  }
  if (cmd === 'mantenimiento') {
    if (msg.author.id !== MI_ID_BOSS) return;
    cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
    await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
    return msg.reply(cachedConfig.mantenimiento ? "🛠️ Mantenimiento ON." : "✅ Mantenimiento OFF.");
  }
  if (cmd === 'sugerencias') {
    if (!args[0]) return msg.reply("Escribí tu sugerencia después del comando.");
    await sugsColl.insertOne({ userId: msg.author.id, texto: args.join(" "), fecha: new Date() });
    return msg.reply("📩 Sugerencia guardada para el Boss.");
  }

  if (cmd === 'ayudacmd') {
    const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B B03.9').setColor('#7D26CD')
      .addFields(
        { name: '🎮 JUEGOS', value: '`!poker`, `!penal`, `!ruleta`, `!suerte`, `!aceptar`' },
        { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!transferencia`, `!tienda`, `!comprar`' },
        { name: '🌌 MÍSTICA', value: '`!bardo`, `!perfiladn`, `!modo ia`' },
        { name: '🛠️ SISTEMA', value: '`!stats`, `!mantenimiento`, `!sugerencias`' }
      ).setImage(IMG_PATROCLO_FUERTE);
    return msg.channel.send({ embeds: [e] });
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);