import { Client, GatewayIntentBits, Partials, AttachmentBuilder, EmbedBuilder } from "discord.js";
import { MongoClient } from "mongodb";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

// ================= SERVER =================
http.createServer((req, res) => res.end("PATROCLO HC FINAL")).listen(process.env.PORT || 8080);

// ================= JSON =================
function safeJSON(path, def) {
  try {
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, JSON.stringify(def, null, 2));
      return def;
    }
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch { return def; }
}

const extras = safeJSON("./extras.json", { phrases: [], facts: [], reacciones_auto: {} });
const universe = safeJSON("./universe.json", { facts: [] });
const idiomas = safeJSON("./idiomas.json", {});

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel],
});

const mongo = new MongoClient(process.env.MONGO_URI);

// ================= DBS =================
let usersColl, dataColl, placeColl, asociaColl, userMemColl, lotsColl, warsColl, casinoColl, universeFactsColl, statsColl, tiendaColl;

// ================= CONFIG =================
let config = {
  phrases: [],
  modoActual: "normal",
  mantenimiento: false,
  canalActus: null,
};

const rand = a => a[Math.floor(Math.random() * a.length)];
const uptimeInicio = Date.now();
let comandosEjecutados = 0;

// ================= IDIOMA =================
function getLang(guild) {
  const locale = guild?.preferredLocale || "es";
  return idiomas[locale] ? locale : "es";
}

function t(key, guild) {
  const lang = getLang(guild);
  return idiomas[lang]?.[key] || idiomas["es"][key] || key;
}

// ================= MAPA =================
const SIZE = 256;
const SCALE = 4;
let bgImage = null;
const cooldown = new Map();

function latLonToXY(lat, lon) {
  lat = Math.max(-90, Math.min(90, lat));
  lon = Math.max(-180, Math.min(180, lon));
  const x = ((lon + 180) / 360) * (SIZE - 1);
  const y = ((90 - lat) / 180) * (SIZE - 1);
  return { x: Math.round(x), y: Math.round(y) };
}

async function renderPlace() {
  const canvas = createCanvas(SIZE * SCALE, SIZE * SCALE);
  const ctx = canvas.getContext("2d");
  if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  const pixels = await placeColl.find().toArray();
  pixels.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * SCALE, p.y * SCALE, SCALE, SCALE);
  });
  return canvas.toBuffer();
}

async function renderZoom(minX, maxX, minY, maxY) {
  const width = (maxX - minX) + 1;
  const height = (maxY - minY) + 1;
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  const pixels = await placeColl.find({
    x: { $gte: minX, $lte: maxX },
    y: { $gte: minY, $lte: maxY }
  }).toArray();
  pixels.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.fillRect((p.x - minX) * SCALE, (p.y - minY) * SCALE, SCALE, SCALE);
  });
  return canvas.toBuffer();
}

// ================= IA CON GROQ + FALLBACK GEMINI =================
async function IA(contexto, modo) {
  if (modo === "normal") {
    const frases = config.phrases;
    if (!frases.length) return null;
    const sys = "Elegí UNA frase de la lista FRASES DEL ADN que mejor responda al MENSAJE DEL USUARIO. Respondé solo con esa frase exacta. Si ninguna encaja, respondé NINGUNA.";
    const prompt = `FRASES DEL ADN:\n${frases.join("\n")}\n\nMENSAJE DEL USUARIO:\n${contexto}`;
    try {
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { contents: [{ parts: [{ text: `${sys}\n\n${prompt}` }] }] }
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    } catch { return null; }
  }

  const groqKey = process.env.GROQ_API_KEY;
  let sys;
  if (modo === "serio") {
    sys = "Sos un experto multidisciplinario. Respondé de manera profesional, clara y detallada, usando información precisa. Si es necesario, da ejemplos y desarrollá el tema en profundidad. Sin humor ni sarcasmo.";
  } else {
    sys = "Sos un asistente argentino sarcástico, divertido y sin pelos en la lengua. Podés hablar de cualquier tema con total libertad de expresión, sin censura, siempre manteniendo un mínimo de respeto. No evites ningún tema, respondé con sinceridad y con el humor ácido característico.";
  }

  async function geminiFallback() {
    try {
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { contents: [{ parts: [{ text: `${sys}\n\n${contexto}` }] }] }
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    } catch { return null; }
  }

  if (!groqKey) return geminiFallback();

  try {
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: contexto }
        ],
        temperature: 0.9,
        max_tokens: 1024
      },
      { headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" } }
    );
    return r.data?.choices?.[0]?.message?.content?.trim();
  } catch (e) {
    console.error("Groq falló, usando Gemini:", e.message);
    return geminiFallback();
  }
}

// ================= START =================
async function start() {
  await mongo.connect();
  const db = mongo.db("patroclo_bot");
  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  placeColl = db.collection("place_pixels");
  asociaColl = db.collection("asociaciones");
  userMemColl = db.collection("user_memory");
  lotsColl = db.collection("lots");
  warsColl = db.collection("wars");
  casinoColl = db.collection("casino_stats");
  universeFactsColl = db.collection("universe_facts");
  statsColl = db.collection("stats");
  tiendaColl = db.collection("tienda");

  const d = await dataColl.findOne({ id: "main_config" });
  config.phrases = d?.phrases || [];
  config.mantenimiento = d?.mantenimiento || false;
  config.canalActus = d?.canalActus || null;

  if (!(await universeFactsColl.findOne({ id: "daily_facts" }))) {
    await universeFactsColl.insertOne({
      id: "daily_facts",
      usedFacts: [],
      usedToday: [],
      lastFactDate: ""
    });
  }

  try { bgImage = await loadImage("./maps/world.png"); } catch { console.error("No se pudo cargar el mapa base."); }

  const comandosSlash = [
    { name: "bal", description: "💰 Ver tu saldo de PatroPesos" },
    { name: "modo", description: "🧠 Cambiar el modo del bot", options: [{ name: "modo", description: "normal / ia / serio", type: 3, required: true }] },
    { name: "asocia", description: "🔗 Asociar palabra > respuesta", options: [{ name: "clave", description: "Palabra clave", type: 3, required: true }, { name: "respuesta", description: "Respuesta", type: 3, required: true }] },
    { name: "gif", description: "🎞️ Buscar un GIF", options: [{ name: "busqueda", description: "Término", type: 3, required: true }] },
    { name: "foto", description: "🖼️ Generar imagen con IA", options: [{ name: "descripcion", description: "Descripción", type: 3, required: true }] },
    { name: "daily", description: "🎁 Reclamar recompensa diaria" },
    { name: "work", description: "💼 Trabajar por PatroPesos" },
    { name: "pay", description: "💸 Transferir dinero", options: [{ name: "usuario", description: "Usuario", type: 6, required: true }, { name: "cantidad", description: "Cantidad", type: 4, required: true }] },
    { name: "slot", description: "🎰 Jugar al slot" },
    { name: "ruleta", description: "🎡 Jugar a la ruleta", options: [{ name: "apuesta", description: "Apuesta", type: 4, required: true }] },
    { name: "bj", description: "🃏 Jugar al blackjack", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "dados", description: "🎲 Tirar los dados", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "carrera", description: "🏁 Carrera de caballos", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "crash", description: "💥 Juego Crash", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "poker", description: "🃏 Mano de póker", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "coinflip", description: "🪙 Cara o cruz", options: [{ name: "apuesta", description: "Apuesta", type: 4, required: true }] },
    { name: "penal", description: "⚽ Patear un penal", options: [{ name: "apuesta", description: "Apuesta", type: 4 }] },
    { name: "place", description: "🗺️ Ver el mapa mundial" },
    { name: "universefacts", description: "🌌 Dato curioso del universo" },
    { name: "rich", description: "💰 Ranking de los más ricos" },
    { name: "ayuda", description: "📜 Lista de comandos" },
    { name: "comprar", description: "🛒 Comprar ítems en la tienda", options: [{ name: "item", description: "escudo / multiplicador", type: 3, required: true }] },
    { name: "stats", description: "📊 Estadísticas del bot" },
    { name: "actus", description: "📢 Mostrar últimas actualizaciones" },
    { name: "setcanalactus", description: "📌 Configurar canal de actualizaciones (admin)", options: [{ name: "canal", description: "Canal", type: 7, required: true }] },
    { name: "mantenimiento", description: "🔧 Activar/desactivar modo mantenimiento (admin)", options: [{ name: "activar", description: "true/false", type: 5, required: true }] },
    { name: "hablar", description: "🔊 Convertir texto a voz (ElevenLabs)", options: [{ name: "texto", description: "Texto a hablar", type: 3, required: true }] }
  ];

  client.once("ready", async () => {
    try { await client.application.commands.set(comandosSlash); console.log("✅ Slash commands registrados globalmente."); }
    catch (err) { console.error("❌ Error al registrar slash commands:", err); }
  });

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO HC FINAL ONLINE");
}

// ================= UTILIDADES =================
const frasesArgentinas = [
  "¡De una!", "¡No da más!", "F por tus PatroPesos", "¡Aguante!", "¡Qué lo tiró!",
  "No estabas manija, no.", "El Diego te sonríe desde el cielo.", "Messi lo aprueba.",
  "¡Gritalo, carajo!", "Ahora comprate un fernet."
];

async function verificarSaldo(source, userId, amount) {
  const u = await usersColl.findOne({ userId }) || { points: 0 };
  if (u.points < amount) {
    const guild = source.guild;
    const mensaje = t("no_saldo", guild);
    if (source.reply && !source.deferred) source.reply(mensaje);
    else if (source.editReply) source.editReply(mensaje);
    return false;
  }
  return true;
}

async function obtenerFactDiario() {
  if (process.env.NEWS_API) {
    try {
      const resp = await axios.get(`https://newsapi.org/v2/top-headlines?category=science&language=es&pageSize=1&apiKey=${process.env.NEWS_API}`);
      if (resp.data?.articles?.length) {
        const a = resp.data.articles[0];
        return `📰 **${a.title}**\n${a.description || ""}\n🔗 ${a.url}`;
      }
    } catch (e) { console.error("News API falló:", e.message); }
  }

  try {
    const resp = await axios.get("https://api.spaceflightnewsapi.net/v4/articles/?limit=1");
    if (resp.data?.results?.length) {
      const a = resp.data.results[0];
      return `🌠 **${a.title}**\n${a.summary || ""}\n🔗 ${a.url}`;
    }
  } catch (e) { console.error("Error al obtener fact de API:", e.message); }
  return null;
}

function crearEmbed(color, title, description, options = {}) {
  const { authorUser, thumbnail } = options;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Patroclo HC FINAL", iconURL: client.user?.displayAvatarURL() })
    .setTimestamp();

  if (authorUser) embed.setAuthor({ name: authorUser.username, iconURL: authorUser.displayAvatarURL() });
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

const userMessageCounts = new Map();
function shouldRespondToUser(msg) {
  const userId = msg.author.id;
  const content = msg.content;
  if (msg.reference) return true;
  if (content.includes(`@${client.user.id}`) || content.toLowerCase().includes("patroclo")) {
    userMessageCounts.delete(userId);
    return true;
  }
  let count = userMessageCounts.get(userId) || 0;
  count++;
  userMessageCounts.set(userId, count);
  if (count >= 8) { userMessageCounts.set(userId, 0); return true; }
  return false;
}

const novedades = [
  "🎨 Embeds estéticos con autor y footer.",
  "🤖 Groq integrado para modos IA y serio.",
  "🗞️ Noticias reales en universefacts (News API).",
  "📍 Geolocalización al pintar píxeles (OpenCage).",
  "🔊 Comando /hablar con ElevenLabs.",
  "📢 Canal de actus configurable.",
  "🛡️ Tienda con escudo y multiplicador."
];

async function sintetizarVoz(texto) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const resp = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
      { text: texto, model_id: "eleven_monolingual_v1", voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" }, responseType: "arraybuffer" }
    );
    return Buffer.from(resp.data);
  } catch (e) { console.error("ElevenLabs error:", e.message); return null; }
}

async function obtenerUbicacion(lat, lon) {
  if (!process.env.OPENCAGE_KEY) return null;
  try {
    const resp = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${process.env.OPENCAGE_KEY}&language=es&pretty=1`);
    if (resp.data?.results?.length) {
      const comp = resp.data.results[0].components;
      return `${comp.city || comp.town || comp.state || ""}, ${comp.country || ""}`.trim();
    }
  } catch (e) { console.error("OpenCage error:", e.message); }
  return null;
}

// ================= INTERACTION HANDLER (SLASH) =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;
  const guild = interaction.guild;
  const userId = interaction.user.id;

  async function replyEmbed(color, title, descripcion, thumbnail) {
    const embed = crearEmbed(color, title, descripcion, { authorUser: interaction.user, thumbnail: thumbnail || interaction.user.displayAvatarURL() });
    if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [embed] });
    else await interaction.reply({ embeds: [embed] });
  }

  if (config.mantenimiento && commandName !== "mantenimiento") {
    return interaction.reply({ content: "🔧 El bot está en mantenimiento. Vuelve más tarde.", ephemeral: true });
  }

  comandosEjecutados++;

  try {
    if (commandName === "mantenimiento") {
      const activar = options.getBoolean("activar");
      config.mantenimiento = activar;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: activar } }, { upsert: true });
      return interaction.reply(`🔧 Modo mantenimiento **${activar ? "activado" : "desactivado"}**.`);
    }
    else if (commandName === "stats") {
      const uptime = Date.now() - uptimeInicio;
      const horas = Math.floor(uptime / 3600000);
      const minutos = Math.floor((uptime % 3600000) / 60000);
      const frasesAprendidas = config.phrases.length;
      const desc = `⏱️ Uptime: ${horas}h ${minutos}m\n📚 Frases aprendidas: ${frasesAprendidas}\n🔢 Comandos ejecutados: ${comandosEjecutados}`;
      await replyEmbed(0x3498DB, "📊 Estadísticas", desc);
    }
    else if (commandName === "actus") {
      if (!config.canalActus) return interaction.reply("❌ No hay canal configurado. Usá `/setcanalactus`.");
      const canal = client.channels.cache.get(config.canalActus);
      if (!canal) return interaction.reply("❌ No se encontró el canal.");
      await canal.send({ embeds: [crearEmbed(0x9B59B6, "📢 Novedades de Patroclo", novedades.join("\n"))] });
      await interaction.reply("✅ Novedades enviadas.");
    }
    else if (commandName === "setcanalactus") {
      if (!interaction.member.permissions.has("Administrator")) return interaction.reply({ content: "❌ Sin permisos.", ephemeral: true });
      const canal = options.getChannel("canal");
      config.canalActus = canal.id;
      await dataColl.updateOne({ id: "main_config" }, { $set: { canalActus: canal.id } }, { upsert: true });
      return interaction.reply(`✅ Canal de actus configurado a ${canal}.`);
    }
    else if (commandName === "hablar") {
      await interaction.deferReply();
      const texto = options.getString("texto");
      const audio = await sintetizarVoz(texto);
      if (!audio) return interaction.editReply("❌ No se pudo generar el audio.");
      await interaction.editReply({ files: [new AttachmentBuilder(audio, "voz.mp3")] });
    }
    else if (commandName === "comprar") {
      const item = options.getString("item").toLowerCase();
      if (!["escudo", "multiplicador"].includes(item)) return interaction.reply("❌ Ítem no válido. Usá `escudo` o `multiplicador`.");
      const precios = { escudo: 500, multiplicador: 300 };
      const precio = precios[item];
      if (!(await verificarSaldo(interaction, userId, precio))) return;
      await usersColl.updateOne({ userId }, { $inc: { points: -precio } }, { upsert: true });
      const duracion = item === "escudo" ? 3600000 : 1800000;
      const expira = Date.now() + duracion;
      await tiendaColl.updateOne(
        { userId, tipo: item },
        { $set: { userId, tipo: item, expira } },
        { upsert: true }
      );
      await replyEmbed(0xFFD700, "🛒 Tienda", `¡Compraste **${item}** por **$${precio}**!\nExpira <t:${Math.floor(expira/1000)}:R>.`);
    }
    else if (commandName === "bal") {
      const u = await usersColl.findOne({ userId }) || { points: 0 };
      await replyEmbed(0x00FF00, "💰 PatroPesos", `${t("saldo", guild)}: **$${u.points}**`);
    }
    else if (commandName === "modo") {
      const modo = options.getString("modo").toLowerCase();
      if (!["normal", "ia", "serio"].includes(modo)) return interaction.reply({ content: "❌ Modo inválido", ephemeral: true });
      config.modoActual = modo;
      await interaction.reply(`🧠 ${t("modo_cambiado", guild)}: **${modo}**`);
    }
    else if (commandName === "asocia") {
      const clave = options.getString("clave").trim().toLowerCase();
      const respuesta = options.getString("respuesta").trim();
      await asociaColl.updateOne({ clave }, { $set: { respuesta } }, { upsert: true });
      await interaction.reply(t("asocia_guardada", guild));
    }
    else if (commandName === "gif") {
      const q = options.getString("busqueda");
      const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
      await interaction.reply(r.data.data[0]?.url || "No encontré nada.");
    }
    else if (commandName === "foto") {
      await interaction.deferReply();
      const desc = options.getString("descripcion");
      const r = await axios.post(
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
        { inputs: desc },
        { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: "arraybuffer" }
      );
      await interaction.editReply({ files: [new AttachmentBuilder(Buffer.from(r.data), "img.png")] });
    }
    else if (commandName === "daily") {
      const u = await usersColl.findOne({ userId }) || {};
      if (Date.now() - (u.lastDaily || 0) < 86400000) return interaction.reply(t("daily_ya", guild));
      const reward = 200 + Math.floor(Math.random() * 500);
      await usersColl.updateOne({ userId }, { $set: { lastDaily: Date.now() }, $inc: { points: reward } }, { upsert: true });
      await replyEmbed(0x00FF00, "🎁 Daily", `${t("daily_recompensa", guild)}: **+$${reward}**`);
    }
    else if (commandName === "work") {
      const reward = 100 + Math.floor(Math.random() * 300);
      await usersColl.updateOne({ userId }, { $inc: { points: reward } }, { upsert: true });
      await replyEmbed(0x00FF00, "💼 Trabajo", `${t("work_ganaste", guild)} **$${reward}**`);
    }
    else if (commandName === "pay") {
      const user = options.getUser("usuario");
      const amount = options.getInteger("cantidad");
      if (!user || amount <= 0) return interaction.reply(t("pay_uso", guild));
      if (!(await verificarSaldo(interaction, userId, amount))) return;
      const session = mongo.startSession();
      try {
        session.startTransaction();
        await usersColl.updateOne({ userId }, { $inc: { points: -amount } }, { session });
        await usersColl.updateOne({ userId: user.id }, { $inc: { points: amount } }, { session });
        await session.commitTransaction();
        await replyEmbed(0x00FF00, "💸 Transferencia", `${t("pay_exito", guild)} **$${amount}** a ${user.username}`);
      } catch (e) {
        await session.abortTransaction();
        console.error(e);
        await interaction.reply(t("pay_fallo", guild));
      } finally { session.endSession(); }
    }
    // ================= CASINO =================
    else if (commandName === "slot") {
      const bet = 50;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      await interaction.reply("🎰 Girando...");
      const carretes = ["🍒", "💎", "7️⃣", "🍀", "⭐"];
      for (let i = 0; i < 4; i++) {
        const r = [rand(carretes), rand(carretes), rand(carretes)];
        await interaction.editReply(`🎰 **SLOT**\n${r.join(" | ")}`);
        await new Promise(res => setTimeout(res, 600));
      }
      const final = [rand(carretes), rand(carretes), rand(carretes)];
      const win = final[0] === final[1] && final[1] === final[2] ? bet * 10 : 0;
      await usersColl.updateOne({ userId }, { $inc: { points: win - bet } }, { upsert: true });
      await interaction.editReply({ embeds: [crearEmbed(win ? 0xFFD700 : 0xFF0000, "🎰 Slot", `${final.join(" | ")}\n${win ? `🎉 ¡GANASTE $${win}! ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
    }
    else if (commandName === "ruleta") {
      const bet = options.getInteger("apuesta");
      if (!bet || bet <= 0) return interaction.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      await interaction.reply(t("ruleta_girando", guild));
      const numero = Math.floor(Math.random() * 37);
      const color = numero === 0 ? "🟢" : (numero % 2 === 0 ? "🔴" : "⚫");
      const ganancia = numero === 0 ? bet * 14 : (Math.random() < 0.45 ? bet : -bet);
      await new Promise(res => setTimeout(res, 1200));
      await interaction.editReply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🎡 Ruleta", `${t("ruleta_numero", guild)}: ${color} ${numero}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
      await usersColl.updateOne({ userId }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (commandName === "bj") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const mazo = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
      const valor = c => c === "A" ? 11 : (isNaN(c) ? 10 : parseInt(c));
      const mano = () => [rand(mazo), rand(mazo)];
      const puntaje = cartas => { let total = cartas.reduce((a,c) => a + valor(c), 0); let ases = cartas.filter(c => c === "A").length; while (total > 21 && ases > 0) { total -= 10; ases--; } return total; };
      let player = mano(), dealer = mano();
      let pScore = puntaje(player), dScore = puntaje(dealer);
      if (pScore === 21) {
        const ganancia = Math.floor(bet * 1.5);
        await usersColl.updateOne({ userId }, { $inc: { points: ganancia } }, { upsert: true });
        return interaction.reply({ embeds: [crearEmbed(0xFFD700, "🃏 Blackjack", `Tus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer[0]} ?\n¡BLACKJACK! Ganaste $${ganancia} ${rand(frasesArgentinas)}`, { authorUser: interaction.user })] });
      }
      await usersColl.updateOne({ userId }, { $inc: { points: -bet } }, { upsert: true });
      const ganancia = dScore > 21 || pScore > dScore ? bet * 2 : 0;
      await interaction.reply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🃏 Blackjack", `Tus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer.join(" ")} (${dScore})\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
      if (ganancia > 0) await usersColl.updateOne({ userId }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (commandName === "dados") {
      const bet = options.getInteger("apuesta") || 50;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      await interaction.reply(t("dados_tirando", guild));
      const dado1 = Math.floor(Math.random() * 6) + 1;
      const dado2 = Math.floor(Math.random() * 6) + 1;
      const suma = dado1 + dado2;
      const ganancia = suma === 7 ? bet * 4 : (suma === 11 ? bet * 2 : -bet);
      await new Promise(res => setTimeout(res, 800));
      await interaction.editReply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🎲 Dados", `${dado1} + ${dado2} = ${suma}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
      await usersColl.updateOne({ userId }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (commandName === "carrera") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const caballos = ["🐎", "🐴", "🦄", "🏇"];
      const elegido = caballos[Math.floor(Math.random() * caballos.length)];
      await interaction.reply(t("carrera_inicio", guild) + "\n" + caballos.join(" "));
      const posiciones = caballos.map(() => 0);
      const meta = 5;
      let ganador = null;
      while (!ganador) {
        caballos.forEach((_, i) => { posiciones[i] += Math.random() > 0.6 ? 1 : 0; });
        const pista = caballos.map((c, i) => "·".repeat(posiciones[i]) + c + "·".repeat(meta - posiciones[i])).join("\n");
        await interaction.editReply("🏁 **CARRERA**\n" + pista);
        ganador = caballos.find((_, i) => posiciones[i] >= meta);
        await new Promise(r => setTimeout(r, 600));
      }
      const gano = ganador === elegido;
      const delta = gano ? bet * 3 : -bet;
      await usersColl.updateOne({ userId }, { $inc: { points: delta } }, { upsert: true });
      await interaction.editReply({ embeds: [crearEmbed(gano ? 0xFFD700 : 0xFF0000, "🏁 Carrera", `Ganó: ${ganador}\nElegiste: ${elegido}\n${gano ? `🎉 Ganaste $${delta} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
    }
    else if (commandName === "crash") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      await interaction.reply("💥 **CRASH**\nMultiplicador: 1.0x");
      let multiplicador = 1.0;
      const crashPoint = Math.random() * 4 + 1;
      const intervalo = setInterval(async () => {
        multiplicador += 0.15;
        if (multiplicador >= crashPoint) {
          clearInterval(intervalo);
          await interaction.editReply({ embeds: [crearEmbed(0xFF0000, "💥 Crash", `Multiplicador: ${multiplicador.toFixed(2)}x\n💀 Perdiste $${bet}`, { authorUser: interaction.user })] });
          await usersColl.updateOne({ userId }, { $inc: { points: -bet } }, { upsert: true });
          return;
        }
        await interaction.editReply(`💥 **CRASH**\nMultiplicador: ${multiplicador.toFixed(2)}x\n${t("crash_retirar", guild)}`);
      }, 1000);
      const reply = await interaction.fetchReply();
      await reply.react("💰");
      const filter = (reaction, user) => reaction.emoji.name === "💰" && user.id === userId;
      const collector = reply.createReactionCollector({ filter, time: 15000 });
      collector.on("collect", async () => {
        clearInterval(intervalo);
        collector.stop();
        const ganancia = Math.floor(bet * multiplicador);
        await usersColl.updateOne({ userId }, { $inc: { points: ganancia - bet } }, { upsert: true });
        await interaction.editReply({ embeds: [crearEmbed(0xFFD700, "💰 Crash", `Retiraste a ${multiplicador.toFixed(2)}x\nGanaste $${ganancia} ${rand(frasesArgentinas)}`, { authorUser: interaction.user })] });
        await reply.reactions.removeAll();
      });
    }
    else if (commandName === "poker") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const palos = ["♠", "♥", "♦", "♣"];
      const valores = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
      const mazo = []; palos.forEach(p => valores.forEach(v => mazo.push(v + p)));
      const barajar = arr => arr.sort(() => Math.random() - 0.5);
      const mano = (arr, n) => barajar(arr).slice(0, n);
      const manoJugador = mano(mazo, 5);
      const evaluar = cartas => {
        const vals = cartas.map(c => c.slice(0, -1));
        const suits = cartas.map(c => c.slice(-1));
        const unicos = [...new Set(vals)];
        const esColor = new Set(suits).size === 1;
        const orden = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
        const indices = vals.map(v => orden.indexOf(v)).sort((a,b)=>a-b);
        const escalera = indices[4] - indices[0] === 4 && new Set(indices).size === 5;
        if (esColor && escalera) return { nombre: "Escalera de color", multi: 50 };
        if (unicos.length === 2) {
          const cuenta = unicos.map(v => vals.filter(x => x === v).length);
          if (cuenta.includes(4)) return { nombre: "Póker", multi: 25 };
          if (cuenta.includes(3) && cuenta.includes(2)) return { nombre: "Full house", multi: 9 };
        }
        if (esColor) return { nombre: "Color", multi: 6 };
        if (escalera) return { nombre: "Escalera", multi: 4 };
        if (unicos.length === 3) {
          const cuenta = unicos.map(v => vals.filter(x => x === v).length);
          if (cuenta.includes(3)) return { nombre: "Trío", multi: 3 };
          if (cuenta.filter(c => c === 2).length === 2) return { nombre: "Doble par", multi: 2 };
        }
        if (unicos.length === 4) return { nombre: "Par", multi: 1.5 };
        return { nombre: "Carta alta", multi: 0 };
      };
      const resultado = evaluar(manoJugador);
      const ganancia = resultado.multi > 0 ? Math.floor(bet * resultado.multi) : -bet;
      await usersColl.updateOne({ userId }, { $inc: { points: ganancia } }, { upsert: true });
      await interaction.reply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🃏 Póker", `Tu mano: ${manoJugador.join(" ")}\n${resultado.nombre} → ${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: interaction.user })] });
    }
    else if (commandName === "coinflip") {
      const bet = options.getInteger("apuesta");
      if (!bet || bet <= 0) return interaction.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const win = Math.random() < 0.5;
      await usersColl.updateOne({ userId }, { $inc: { points: win ? bet : -bet } }, { upsert: true });
      await interaction.reply({ embeds: [crearEmbed(win ? 0xFFD700 : 0xFF0000, "🪙 Coinflip", win ? `🎉 Ganaste $${bet} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`, { authorUser: interaction.user })] });
    }
    else if (commandName === "penal") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const gol = Math.random() < 0.6;
      await usersColl.updateOne({ userId }, { $inc: { points: gol ? bet : -bet } }, { upsert: true });
      await interaction.reply({ embeds: [crearEmbed(gol ? 0xFFD700 : 0xFF0000, "⚽ Penal", gol ? `¡GOL! Ganaste $${bet} ${rand(frasesArgentinas)}` : `🧤 Atajado. Perdiste $${bet}`, { authorUser: interaction.user })] });
    }
    else if (commandName === "place") {
      const img = await renderPlace();
      await interaction.reply({ files: [new AttachmentBuilder(img, "map.png")], embeds: [crearEmbed(0x1E90FF, t("mapa_titulo", guild), "🌍")] });
    }
    else if (commandName === "universefacts") {
      const doc = await universeFactsColl.findOne({ id: "daily_facts" });
      if (!doc) return interaction.reply(t("universo_silencio", guild));
      const today = new Date().toISOString().slice(0, 10);
      let fact;
      if (doc.lastFactDate !== today) {
        fact = await obtenerFactDiario();
        if (fact) {
          await universeFactsColl.updateOne({ id: "daily_facts" }, { $push: { usedFacts: fact }, $set: { lastFactDate: today } });
        }
      }
      const poolBase = [...(universe.facts || []), ...(extras.facts || []), ...(doc.usedFacts || [])];
      let usedToday = doc.usedToday || [];
      let disponibles = poolBase.filter(f => !usedToday.includes(f));
      if (disponibles.length === 0) {
        usedToday = [];
        disponibles = poolBase;
      }
      fact = fact || rand(disponibles);
      if (!usedToday.includes(fact)) {
        usedToday.push(fact);
        await universeFactsColl.updateOne({ id: "daily_facts" }, { $set: { usedToday } });
      }
      await interaction.reply({ embeds: [crearEmbed(0x9B59B6, "🌌 Dato del universo", fact)] });
    }
    else if (commandName === "rich") {
      const top = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
      const desc = top.map((u, i) => `${i + 1}. $${u.points}`).join("\n") || "Nadie tiene dinero aún.";
      await replyEmbed(0xFFD700, t("ranking_titulo", guild), desc);
    }
    else if (commandName === "ayuda") {
      const texto = `🎨 MAPA: /place, /pixel, /zoom, /zoomlat, /territorio, /comprarlote, /guerra, /topplace\n📷 MULTIMEDIA: /gif, /foto\n🌌 EXTRAS: /universefacts\n💰 ECONOMÍA: /bal, /daily, /work, /pay, /rich\n🎰 CASINO: /slot, /ruleta, /bj, /dados, /carrera, /crash, /poker, /coinflip, /penal\n🧠 IA: /modo, /asocia\n🛒 TIENDA: /comprar\n📊 STATS: /stats\n📢 ACTUS: /actus\n🔊 HABLAR: /hablar\n🔧 MANTENIMIENTO: /mantenimiento\n\n🔥 Aprende automáticamente del chat.`;
      await replyEmbed(0x9B59B6, "📜 Ayuda", texto);
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ Ocurrió un error.", ephemeral: true });
  }
});

// ================= MENSAJES (COMANDOS ! Y RESPUESTAS IA) =================
client.on("messageCreate", async msg => {
  if (!msg.author || msg.author.bot) return;
  const content = msg.content.toLowerCase().trim();
  const texto = msg.content.trim();
  const guild = msg.guild;

  if (config.mantenimiento && !msg.content.startsWith("!mantenimiento")) return;

  if (!msg.content.startsWith("!") && texto.length > 1) {
    await dataColl.updateOne({ id: "main_config" }, { $addToSet: { phrases: texto } }, { upsert: true });
  }

  if (extras.reacciones_auto?.palabras_clave?.length) {
    const alguna = extras.reacciones_auto.palabras_clave.some(p => content.includes(p.toLowerCase()));
    if (alguna) {
      const emoji = rand(extras.reacciones_auto.emojis) || "🔥";
      try { await msg.react(emoji); } catch {}
    }
  }

  if (msg.content.startsWith("!")) {
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();
    comandosEjecutados++;

    const responder = (color, title, desc) => msg.reply({ embeds: [crearEmbed(color, title, desc, { authorUser: msg.author })] });

    if (cmd === "mantenimiento") {
      if (!msg.member.permissions.has("Administrator")) return msg.reply("❌ Sin permisos.");
      const activar = args[0] === "on" || args[0] === "true" || args[0] === "1";
      config.mantenimiento = activar;
      await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: activar } }, { upsert: true });
      return msg.reply(`🔧 Modo mantenimiento **${activar ? "activado" : "desactivado"}**.`);
    }
    else if (cmd === "stats") {
      const uptime = Date.now() - uptimeInicio;
      const horas = Math.floor(uptime / 3600000);
      const minutos = Math.floor((uptime % 3600000) / 60000);
      const frasesAprendidas = config.phrases.length;
      const desc = `⏱️ Uptime: ${horas}h ${minutos}m\n📚 Frases aprendidas: ${frasesAprendidas}\n🔢 Comandos ejecutados: ${comandosEjecutados}`;
      await responder(0x3498DB, "📊 Estadísticas", desc);
      return;
    }
    else if (cmd === "actus") {
      if (!config.canalActus) return msg.reply("❌ No hay canal de actualizaciones configurado. Usá !setcanalactus.");
      const canal = client.channels.cache.get(config.canalActus);
      if (!canal) return msg.reply("❌ No se encontró el canal.");
      await canal.send({ embeds: [crearEmbed(0x9B59B6, "📢 Novedades de Patroclo", novedades.join("\n"))] });
      return msg.reply("✅ Novedades enviadas.");
    }
    else if (cmd === "setcanalactus" || cmd === "canalactus") {
      if (!msg.member.permissions.has("Administrator")) return msg.reply("❌ Sin permisos.");
      const canal = msg.mentions.channels.first();
      if (!canal) return msg.reply("❌ Mencioná un canal: `!setcanalactus #canal`");
      config.canalActus = canal.id;
      await dataColl.updateOne({ id: "main_config" }, { $set: { canalActus: canal.id } }, { upsert: true });
      return msg.reply(`✅ Canal de actus configurado a ${canal}.`);
    }
    else if (cmd === "hablar") {
      const texto = args.join(" ");
      if (!texto) return msg.reply("❌ Escribí algo para hablar.");
      const audio = await sintetizarVoz(texto);
      if (!audio) return msg.reply("❌ Error al generar audio.");
      return msg.reply({ files: [new AttachmentBuilder(audio, "voz.mp3")] });
    }
    else if (cmd === "comprar") {
      const item = args[0]?.toLowerCase();
      if (!["escudo", "multiplicador"].includes(item)) return msg.reply("❌ Ítem no válido. Usá `escudo` o `multiplicador`.");
      const precios = { escudo: 500, multiplicador: 300 };
      const precio = precios[item];
      if (!(await verificarSaldo(msg, msg.author.id, precio))) return;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -precio } }, { upsert: true });
      const duracion = item === "escudo" ? 3600000 : 1800000;
      const expira = Date.now() + duracion;
      await tiendaColl.updateOne(
        { userId: msg.author.id, tipo: item },
        { $set: { userId: msg.author.id, tipo: item, expira } },
        { upsert: true }
      );
      return msg.reply({ embeds: [crearEmbed(0xFFD700, "🛒 Tienda", `¡Compraste **${item}** por **$${precio}**!\nExpira <t:${Math.floor(expira/1000)}:R>.`, { authorUser: msg.author })] });
    }
    else if (cmd === "bal") {
      const u = await usersColl.findOne({ userId: msg.author.id }) || { points: 0 };
      await responder(0x00FF00, "💰 PatroPesos", `${t("saldo", guild)}: **$${u.points}**`);
    }
    else if (cmd === "modo") {
      const modo = args[0]?.toLowerCase();
      if (!["normal", "ia", "serio"].includes(modo)) return msg.reply("🧠 Modos: `normal`, `ia`, `serio`");
      config.modoActual = modo;
      await msg.reply(`🧠 ${t("modo_cambiado", guild)}: **${modo}**`);
    }
    else if (cmd === "asocia") {
      const partes = msg.content.slice(1).split(">");
      if (partes.length < 2) return msg.reply("❌ Formato: !asocia clave > respuesta");
      await asociaColl.updateOne({ clave: partes[0].trim().toLowerCase() }, { $set: { respuesta: partes[1].trim() } }, { upsert: true });
      await msg.reply(t("asocia_guardada", guild));
    }
    else if (cmd === "gif") {
      try {
        const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
        return msg.reply(r.data.data[0]?.url || "No encontré nada.");
      } catch { return msg.reply("❌ Error al buscar GIF."); }
    }
    else if (cmd === "foto") {
      try {
        const r = await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          { inputs: args.join(" ") },
          { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: "arraybuffer" }
        );
        return msg.reply({ files: [new AttachmentBuilder(Buffer.from(r.data), "img.png")] });
      } catch { return msg.reply("❌ Error al generar imagen."); }
    }
    else if (cmd === "daily") {
      const u = await usersColl.findOne({ userId: msg.author.id }) || {};
      if (Date.now() - (u.lastDaily || 0) < 86400000) return msg.reply(t("daily_ya", guild));
      const reward = 200 + Math.floor(Math.random() * 500);
      await usersColl.updateOne({ userId: msg.author.id }, { $set: { lastDaily: Date.now() }, $inc: { points: reward } }, { upsert: true });
      await responder(0x00FF00, "🎁 Daily", `${t("daily_recompensa", guild)}: **+$${reward}**`);
    }
    else if (cmd === "work") {
      const reward = 100 + Math.floor(Math.random() * 300);
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: reward } }, { upsert: true });
      await responder(0x00FF00, "💼 Trabajo", `${t("work_ganaste", guild)} **$${reward}**`);
    }
    else if (cmd === "pay") {
      const user = msg.mentions.users.first();
      const amount = parseInt(args[1]);
      if (!user || !amount || amount <= 0) return msg.reply(t("pay_uso", guild));
      if (!(await verificarSaldo(msg, msg.author.id, amount))) return;
      const session = mongo.startSession();
      try {
        session.startTransaction();
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -amount } }, { session });
        await usersColl.updateOne({ userId: user.id }, { $inc: { points: amount } }, { session });
        await session.commitTransaction();
        await responder(0x00FF00, "💸 Transferencia", `${t("pay_exito", guild)} **$${amount}** a ${user.username}`);
      } catch (e) {
        await session.abortTransaction();
        console.error(e);
        await msg.reply(t("pay_fallo", guild));
      } finally { session.endSession(); }
    }
    // ================= CASINO =================
    else if (cmd === "slot") {
      const bet = 50;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const carretes = ["🍒", "💎", "7️⃣", "🍀", "⭐"];
      let mensaje = await msg.reply("🎰 Girando...");
      for (let i = 0; i < 4; i++) {
        const r = [rand(carretes), rand(carretes), rand(carretes)];
        await mensaje.edit(`🎰 **SLOT**\n${r.join(" | ")}`);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      const final = [rand(carretes), rand(carretes), rand(carretes)];
      const win = final[0] === final[1] && final[1] === final[2] ? bet * 10 : 0;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win - bet } }, { upsert: true });
      await mensaje.edit({ embeds: [crearEmbed(win ? 0xFFD700 : 0xFF0000, "🎰 Slot", `${final.join(" | ")}\n${win ? `🎉 ¡GANASTE $${win}! ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
    }
    else if (cmd === "ruleta") {
      const bet = parseInt(args[0]);
      if (!bet || bet <= 0) return msg.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const numero = Math.floor(Math.random() * 37);
      const color = numero === 0 ? "🟢" : (numero % 2 === 0 ? "🔴" : "⚫");
      const ganancia = numero === 0 ? bet * 14 : (Math.random() < 0.45 ? bet : -bet);
      let mensaje = await msg.reply(t("ruleta_girando", guild));
      await new Promise(resolve => setTimeout(resolve, 1200));
      await mensaje.edit({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🎡 Ruleta", `${t("ruleta_numero", guild)}: ${color} ${numero}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (cmd === "bj") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const mazo = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
      const valor = c => c === "A" ? 11 : (isNaN(c) ? 10 : parseInt(c));
      const mano = () => [rand(mazo), rand(mazo)];
      const puntaje = cartas => { let total = cartas.reduce((a,c) => a + valor(c), 0); let ases = cartas.filter(c => c === "A").length; while (total > 21 && ases > 0) { total -= 10; ases--; } return total; };
      let player = mano(), dealer = mano();
      let pScore = puntaje(player), dScore = puntaje(dealer);
      if (pScore === 21) {
        const ganancia = Math.floor(bet * 1.5);
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
        return msg.reply({ embeds: [crearEmbed(0xFFD700, "🃏 Blackjack", `Tus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer[0]} ?\n¡BLACKJACK! Ganaste $${ganancia} ${rand(frasesArgentinas)}`, { authorUser: msg.author })] });
      }
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -bet } }, { upsert: true });
      const ganancia = dScore > 21 || pScore > dScore ? bet * 2 : 0;
      await msg.reply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🃏 Blackjack", `Tus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer.join(" ")} (${dScore})\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
      if (ganancia > 0) await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (cmd === "dados") {
      const bet = parseInt(args[0]) || 50;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      let mensaje = await msg.reply(t("dados_tirando", guild));
      await new Promise(resolve => setTimeout(resolve, 800));
      const dado1 = Math.floor(Math.random() * 6) + 1;
      const dado2 = Math.floor(Math.random() * 6) + 1;
      const suma = dado1 + dado2;
      const ganancia = suma === 7 ? bet * 4 : (suma === 11 ? bet * 2 : -bet);
      await mensaje.edit({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🎲 Dados", `${dado1} + ${dado2} = ${suma}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
    }
    else if (cmd === "carrera") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const caballos = ["🐎", "🐴", "🦄", "🏇"];
      const elegido = caballos[Math.floor(Math.random() * caballos.length)];
      let mensaje = await msg.reply(t("carrera_inicio", guild) + "\n" + caballos.join(" "));
      await new Promise(r => setTimeout(r, 1000));
      const posiciones = caballos.map(() => 0);
      const meta = 5;
      let ganador = null;
      while (!ganador) {
        caballos.forEach((_, i) => { posiciones[i] += Math.random() > 0.6 ? 1 : 0; });
        const pista = caballos.map((c, i) => "·".repeat(posiciones[i]) + c + "·".repeat(meta - posiciones[i])).join("\n");
        await mensaje.edit("🏁 **CARRERA**\n" + pista);
        ganador = caballos.find((_, i) => posiciones[i] >= meta);
        await new Promise(r => setTimeout(r, 600));
      }
      const gano = ganador === elegido;
      const delta = gano ? bet * 3 : -bet;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: delta } }, { upsert: true });
      await mensaje.edit({ embeds: [crearEmbed(gano ? 0xFFD700 : 0xFF0000, "🏁 Carrera", `Ganó: ${ganador}\nElegiste: ${elegido}\n${gano ? `🎉 Ganaste $${delta} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
    }
    else if (cmd === "crash") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      let mensaje = await msg.reply("💥 **CRASH**\nMultiplicador: 1.0x");
      let multiplicador = 1.0;
      const crashPoint = Math.random() * 4 + 1;
      const intervalo = setInterval(async () => {
        multiplicador += 0.15;
        if (multiplicador >= crashPoint) {
          clearInterval(intervalo);
          await mensaje.edit({ embeds: [crearEmbed(0xFF0000, "💥 Crash", `Multiplicador: ${multiplicador.toFixed(2)}x\n💀 Perdiste $${bet}`, { authorUser: msg.author })] });
          await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -bet } }, { upsert: true });
          return;
        }
        await mensaje.edit(`💥 **CRASH**\nMultiplicador: ${multiplicador.toFixed(2)}x\nReaccioná con 💰 para retirar`);
      }, 1000);
      await mensaje.react("💰");
      const filter = (reaction, user) => reaction.emoji.name === "💰" && user.id === msg.author.id;
      const collector = mensaje.createReactionCollector({ filter, time: 15000 });
      collector.on("collect", async () => {
        clearInterval(intervalo);
        collector.stop();
        const ganancia = Math.floor(bet * multiplicador);
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia - bet } }, { upsert: true });
        await mensaje.edit({ embeds: [crearEmbed(0xFFD700, "💰 Crash", `Retiraste a ${multiplicador.toFixed(2)}x\nGanaste $${ganancia} ${rand(frasesArgentinas)}`, { authorUser: msg.author })] });
        await mensaje.reactions.removeAll();
      });
    }
    else if (cmd === "poker" || cmd === "poker2") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const palos = ["♠", "♥", "♦", "♣"];
      const valores = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
      const mazo = []; palos.forEach(p => valores.forEach(v => mazo.push(v + p)));
      const barajar = arr => arr.sort(() => Math.random() - 0.5);
      const mano = (arr, n) => barajar(arr).slice(0, n);
      const manoJugador = mano(mazo, 5);
      const evaluar = cartas => {
        const vals = cartas.map(c => c.slice(0, -1));
        const suits = cartas.map(c => c.slice(-1));
        const unicos = [...new Set(vals)];
        const esColor = new Set(suits).size === 1;
        const orden = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
        const indices = vals.map(v => orden.indexOf(v)).sort((a,b)=>a-b);
        const escalera = indices[4] - indices[0] === 4 && new Set(indices).size === 5;
        if (esColor && escalera) return { nombre: "Escalera de color", multi: 50 };
        if (unicos.length === 2) {
          const cuenta = unicos.map(v => vals.filter(x => x === v).length);
          if (cuenta.includes(4)) return { nombre: "Póker", multi: 25 };
          if (cuenta.includes(3) && cuenta.includes(2)) return { nombre: "Full house", multi: 9 };
        }
        if (esColor) return { nombre: "Color", multi: 6 };
        if (escalera) return { nombre: "Escalera", multi: 4 };
        if (unicos.length === 3) {
          const cuenta = unicos.map(v => vals.filter(x => x === v).length);
          if (cuenta.includes(3)) return { nombre: "Trío", multi: 3 };
          if (cuenta.filter(c => c === 2).length === 2) return { nombre: "Doble par", multi: 2 };
        }
        if (unicos.length === 4) return { nombre: "Par", multi: 1.5 };
        return { nombre: "Carta alta", multi: 0 };
      };
      const resultado = evaluar(manoJugador);
      const ganancia = resultado.multi > 0 ? Math.floor(bet * resultado.multi) : -bet;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
      await msg.reply({ embeds: [crearEmbed(ganancia > 0 ? 0xFFD700 : 0xFF0000, "🃏 Póker", `Tu mano: ${manoJugador.join(" ")}\n${resultado.nombre} → ${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`, { authorUser: msg.author })] });
    }
    else if (cmd === "coinflip") {
      const bet = parseInt(args[0]);
      if (!bet || bet <= 0) return msg.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const win = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? bet : -bet } }, { upsert: true });
      await msg.reply({ embeds: [crearEmbed(win ? 0xFFD700 : 0xFF0000, "🪙 Coinflip", win ? `🎉 Ganaste $${bet} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`, { authorUser: msg.author })] });
    }
    else if (cmd === "penal") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const gol = Math.random() < 0.6;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gol ? bet : -bet } }, { upsert: true });
      await msg.reply({ embeds: [crearEmbed(gol ? 0xFFD700 : 0xFF0000, "⚽ Penal", gol ? `¡GOL! Ganaste $${bet} ${rand(frasesArgentinas)}` : `🧤 Atajado. Perdiste $${bet}`, { authorUser: msg.author })] });
    }
    // ================= MAPA =================
    else if (cmd === "place") {
      const img = await renderPlace();
      return msg.reply({ files: [new AttachmentBuilder(img, "map.png")], embeds: [crearEmbed(0x1E90FF, t("mapa_titulo", guild), "🌍")] });
    }
    else if (cmd === "zoom") {
      const x1 = parseInt(args[0]), x2 = parseInt(args[1]), y1 = parseInt(args[2]), y2 = parseInt(args[3]);
      const img = await renderZoom(x1, x2, y1, y2);
      return msg.reply({ files: [new AttachmentBuilder(img, "zoom.png")] });
    }
    else if (cmd === "zoomlat") {
      const p1 = latLonToXY(parseFloat(args[0]), parseFloat(args[1]));
      const p2 = latLonToXY(parseFloat(args[2]), parseFloat(args[3]));
      const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
      const img = await renderZoom(minX, maxX, minY, maxY);
      return msg.reply({ files: [new AttachmentBuilder(img, "zoom.png")] });
    }
    else if (cmd === "pixel") {
      let x, y;
      const a = parseFloat(args[0]), b = parseFloat(args[1]);
      if (a >= -90 && a <= 90 && b >= -180 && b <= 180) {
        const pos = latLonToXY(a, b);
        x = pos.x; y = pos.y;
      } else {
        x = parseInt(args[0]); y = parseInt(args[1]);
      }
      const color = args[2] || "#fff";
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return msg.reply("❌ fuera del mapa");
      const last = cooldown.get(msg.author.id) || 0;
      if (Date.now() - last < 3000) return msg.reply("⏳ espera 3 segundos");
      cooldown.set(msg.author.id, Date.now());
      await placeColl.updateOne({ x, y }, { $set: { color, guildId: msg.guild.id } }, { upsert: true });

      // Geolocalización opcional con OpenCage
      if (process.env.OPENCAGE_KEY && a && b) {
        const ubicacion = await obtenerUbicacion(a, b);
        if (ubicacion) {
          return msg.reply(`🎨 pixel puesto (${x},${y}) - 📍 ${ubicacion}`);
        }
      }
      return msg.reply(`🎨 pixel puesto (${x},${y})`);
    }
    else if (cmd === "topplace") {
      const top = await placeColl.aggregate([{ $group: { _id: "$guildId", total: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 10 }]).toArray();
      return msg.reply(top.map((t, i) => `${i + 1}. ${t.total} px`).join("\n"));
    }
    else if (cmd === "territorio") {
      const total = await placeColl.countDocuments({ guildId: msg.guild.id });
      return msg.reply(`🌍 territorio del server: ${total} píxeles`);
    }
    // ================= RANKINGS =================
    else if (cmd === "rich") {
      const top = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
      const desc = top.map((u, i) => `${i + 1}. $${u.points}`).join("\n") || "Nadie tiene dinero aún.";
      await responder(0xFFD700, t("ranking_titulo", guild), desc);
    }
    // ================= UNIVERSO =================
    else if (cmd === "universefacts") {
      const doc = await universeFactsColl.findOne({ id: "daily_facts" });
      if (!doc) return msg.reply(t("universo_silencio", guild));
      const today = new Date().toISOString().slice(0, 10);
      let fact;
      if (doc.lastFactDate !== today) {
        fact = await obtenerFactDiario();
        if (fact) {
          await universeFactsColl.updateOne({ id: "daily_facts" }, { $push: { usedFacts: fact }, $set: { lastFactDate: today } });
        }
      }
      const poolBase = [...(universe.facts || []), ...(extras.facts || []), ...(doc.usedFacts || [])];
      let usedToday = doc.usedToday || [];
      let disponibles = poolBase.filter(f => !usedToday.includes(f));
      if (disponibles.length === 0) {
        usedToday = [];
        disponibles = poolBase;
      }
      fact = fact || rand(disponibles);
      if (!usedToday.includes(fact)) {
        usedToday.push(fact);
        await universeFactsColl.updateOne({ id: "daily_facts" }, { $set: { usedToday } });
      }
      return msg.reply({ embeds: [crearEmbed(0x9B59B6, "🌌 Dato del universo", fact)] });
    }
    // ================= AYUDA =================
    else if (cmd === "ayudacmd" || cmd === "ayuda") {
      const texto = `🎨 MAPA: !place, !pixel, !zoom, !zoomlat, !territorio, !comprarlote, !guerra, !topplace\n📷 MULTIMEDIA: !gif, !foto\n🌌 EXTRAS: !universefacts\n💰 ECONOMÍA: !bal, !daily, !work, !pay, !rich\n🎰 CASINO: !slot, !ruleta, !bj, !dados, !carrera, !crash, !poker, !coinflip, !penal\n🧠 IA: !modo, !asocia\n🛒 TIENDA: !comprar\n📊 STATS: !stats\n📢 ACTUS: !actus\n🔊 HABLAR: !hablar\n🔧 MANTENIMIENTO: !mantenimiento\n\n🔥 Aprende automáticamente del chat.`;
      return msg.reply({ embeds: [crearEmbed(0x9B59B6, "📜 Ayuda", texto)] });
    }

    return;
  }

  // ================= RESPUESTAS IA =================
  if (!shouldRespondToUser(msg)) return;

  const esReply = !!msg.reference;

  const allAsoc = await asociaColl.find().toArray();
  const asoc = allAsoc.find(a => content.includes(a.clave?.toLowerCase()?.trim()));
  if (asoc) {
    const respAsoc = String(asoc.respuesta);
    const prohibidas = ["u", "undefined", "null", "ok", ".", "..", "...", "si", "no"];
    const soloLetrasAsoc = respAsoc.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
    if (prohibidas.includes(respAsoc.toLowerCase().trim()) || soloLetrasAsoc === "u" || soloLetrasAsoc.length === 0) {
      const frase = rand(config.phrases) || rand(extras.phrases) || "💀";
      return msg.reply(frase);
    }
    if (config.modoActual === "normal") {
      return msg.reply(respAsoc);
    } else {
      return msg.reply({ embeds: [crearEmbed(0x808080, "🧠 Patroclo", respAsoc)] });
    }
  }

  let contexto = msg.content;
  if (esReply) {
    try {
      const replied = await msg.fetchReference();
      contexto = `MENSAJE ORIGINAL:\n${replied.content}\n\nRESPUESTA DEL USUARIO:\n${msg.content}`;
    } catch {}
  }

  let r = await IA(contexto, config.modoActual);
  if (config.modoActual === "normal" && r === "NINGUNA") r = null;

  const prohibidas = ["u", "undefined", "null", "ok", ".", "..", "...", "si", "no"];
  const textoLimpio = String(r || "").trim();
  const soloLetras = textoLimpio.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  const esRespuestaInvalida = !r || r.length <= 1 || prohibidas.includes(textoLimpio.toLowerCase()) || soloLetras === "u" || soloLetras.length === 0;

  let finalReply;
  if (esRespuestaInvalida) {
    finalReply = rand(config.phrases) || rand(extras.phrases) || "💀";
  } else {
    finalReply = r;
  }

  if (config.modoActual === "normal") {
    return msg.reply(finalReply);
  } else {
    return msg.reply({ embeds: [crearEmbed(0x808080, "🧠 Patroclo", finalReply, { authorUser: msg.author })] });
  }
});

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

start();