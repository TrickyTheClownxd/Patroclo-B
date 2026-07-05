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
let usersColl, dataColl, placeColl, asociaColl, userMemColl, lotsColl, warsColl, casinoColl, universeFactsColl;

// ================= CONFIG =================
let config = {
  phrases: [],
  modoActual: "normal",
};

const rand = a => a[Math.floor(Math.random() * a.length)];

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

// ================= IA =================
async function IA(contexto, modo) {
  let sys, prompt;

  if (modo === "normal") {
    const frases = config.phrases;
    if (!frases.length) return null;
    sys = "Elegí UNA frase de la lista FRASES DEL ADN que mejor responda al MENSAJE DEL USUARIO. Respondé solo con esa frase exacta. Si ninguna encaja, respondé NINGUNA.";
    prompt = `FRASES DEL ADN:\n${frases.join("\n")}\n\nMENSAJE DEL USUARIO:\n${contexto}`;
  } else if (modo === "serio") {
    sys = "Respondé profesional y claro, sin humor ni sarcasmo.";
    prompt = contexto;
  } else {
    sys = "Sos argentino sarcástico y divertido.";
    prompt = contexto;
  }

  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `${sys}\n\n${prompt}` }] }] }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch {
    return null;
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

  const d = await dataColl.findOne({ id: "main_config" });
  config.phrases = d?.phrases || [];

  if (!(await universeFactsColl.findOne({ id: "daily_facts" }))) {
    await universeFactsColl.insertOne({
      id: "daily_facts",
      usedFacts: [],
      usedToday: [],
      lastFactDate: ""
    });
  }

  try {
    bgImage = await loadImage("./maps/world.png");
  } catch {
    console.error("No se pudo cargar el mapa base.");
  }

  // ================= REGISTRAR SLASH COMMANDS (GLOBAL) =================
  const comandosSlash = [
    { name: "bal", description: "💰 Ver tu saldo de PatroPesos" },
    {
      name: "modo", description: "🧠 Cambiar el modo del bot",
      options: [{ name: "modo", description: "normal / ia / serio", type: 3, required: true }]
    },
    {
      name: "asocia", description: "🔗 Asociar palabra > respuesta",
      options: [
        { name: "clave", description: "Palabra clave", type: 3, required: true },
        { name: "respuesta", description: "Respuesta", type: 3, required: true }
      ]
    },
    { name: "gif", description: "🎞️ Buscar un GIF", options: [{ name: "busqueda", description: "Término", type: 3, required: true }] },
    { name: "foto", description: "🖼️ Generar imagen con IA", options: [{ name: "descripcion", description: "Descripción", type: 3, required: true }] },
    { name: "daily", description: "🎁 Reclamar recompensa diaria" },
    { name: "work", description: "💼 Trabajar por PatroPesos" },
    {
      name: "pay", description: "💸 Transferir dinero",
      options: [
        { name: "usuario", description: "Usuario", type: 6, required: true },
        { name: "cantidad", description: "Cantidad", type: 4, required: true }
      ]
    },
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
    { name: "ayuda", description: "📜 Lista de comandos" }
  ];

  client.once("ready", async () => {
    try {
      await client.application.commands.set(comandosSlash);
      console.log("✅ Slash commands registrados globalmente.");
    } catch (err) {
      console.error("❌ Error al registrar slash commands:", err);
    }
  });

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO HC FINAL ONLINE");
}

// ================= UTILIDADES CASINO =================
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

// ================= FACT DIARIO (API) =================
async function obtenerFactDiario() {
  try {
    const response = await axios.get("https://api.spaceflightnewsapi.net/v4/articles/?limit=1");
    if (response.data?.results?.length > 0) {
      const articulo = response.data.results[0];
      return `🌠 **${articulo.title}**\n${articulo.summary || ""}\n🔗 ${articulo.url}`;
    }
  } catch (e) {
    console.error("Error al obtener fact de API:", e.message);
  }
  return null;
}

// ================= EMBED HELPER =================
function crearEmbed(color, title, description, thumbnail) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

// ================= INTERACTION HANDLER (SLASH) =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;
  const guild = interaction.guild;
  const userId = interaction.user.id;

  async function replyEmbed(color, title, descripcion, thumbnail) {
    const embed = crearEmbed(color, title, descripcion, thumbnail || interaction.user.displayAvatarURL());
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }

  try {
    if (commandName === "bal") {
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
      await interaction.editReply(`🎰 **SLOT**\n${final.join(" | ")}\n${win ? `🎉 ¡GANASTE $${win}! ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
      await interaction.editReply(`🎡 **RULETA**\n${t("ruleta_numero", guild)}: ${color} ${numero}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
        return interaction.reply(`🃏 **BLACKJACK**\nTus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer[0]} ?\n¡BLACKJACK! Ganaste $${ganancia} ${rand(frasesArgentinas)}`);
      }
      await usersColl.updateOne({ userId }, { $inc: { points: -bet } }, { upsert: true });
      const ganancia = dScore > 21 || pScore > dScore ? bet * 2 : 0;
      await interaction.reply(`🃏 **BLACKJACK**\nTus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer.join(" ")} (${dScore})\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
      await interaction.editReply(`🎲 **DADOS**\n${dado1} + ${dado2} = ${suma}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
      await interaction.editReply(`🏁 **CARRERA**\nGanó: ${ganador}\nElegiste: ${elegido}\n${gano ? `🎉 Ganaste $${delta} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
          await interaction.editReply(`💥 **CRASH** en ${multiplicador.toFixed(2)}x\nPerdiste $${bet}`);
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
        await interaction.editReply(`💰 Retiraste a ${multiplicador.toFixed(2)}x\nGanaste $${ganancia} ${rand(frasesArgentinas)}`);
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
      await interaction.reply(`🃏 **PÓKER**\n${t("poker_mano", guild)}: ${manoJugador.join(" ")}\n${resultado.nombre} → ${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
    }
    else if (commandName === "coinflip") {
      const bet = options.getInteger("apuesta");
      if (!bet || bet <= 0) return interaction.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const win = Math.random() < 0.5;
      await usersColl.updateOne({ userId }, { $inc: { points: win ? bet : -bet } }, { upsert: true });
      await interaction.reply(win ? `🪙 Ganaste $${bet} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`);
    }
    else if (commandName === "penal") {
      const bet = options.getInteger("apuesta") || 100;
      if (!(await verificarSaldo(interaction, userId, bet))) return;
      const gol = Math.random() < 0.6;
      await usersColl.updateOne({ userId }, { $inc: { points: gol ? bet : -bet } }, { upsert: true });
      await interaction.reply(gol ? `⚽ ¡GOL! Ganaste $${bet} ${rand(frasesArgentinas)}` : `🧤 Atajado. Perdiste $${bet}`);
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
      await interaction.reply(fact || t("universo_silencio", guild));
    }
    else if (commandName === "rich") {
      const top = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
      const desc = top.map((u, i) => `${i + 1}. $${u.points}`).join("\n") || "Nadie tiene dinero aún.";
      await replyEmbed(0xFFD700, t("ranking_titulo", guild), desc);
    }
    else if (commandName === "ayuda") {
      const texto = `🎨 MAPA: /place, /pixel, /zoom, /zoomlat, /territorio, /comprarlote, /guerra, /topplace\n📷 MULTIMEDIA: /gif, /foto\n🌌 EXTRAS: /universefacts\n💰 ECONOMÍA: /bal, /daily, /work, /pay, /rich\n🎰 CASINO: /slot, /ruleta, /bj, /dados, /carrera, /crash, /poker, /coinflip, /penal\n🧠 IA: /modo, /asocia\n\n🔥 Aprende automáticamente del chat.`;
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

  // Aprendizaje
  if (!msg.content.startsWith("!") && texto.length > 1) {
    await dataColl.updateOne({ id: "main_config" }, { $addToSet: { phrases: texto } }, { upsert: true });
  }

  // Reacciones automáticas
  if (extras.reacciones_auto?.palabras_clave?.length) {
    const alguna = extras.reacciones_auto.palabras_clave.some(p => content.includes(p.toLowerCase()));
    if (alguna) {
      const emoji = rand(extras.reacciones_auto.emojis) || "🔥";
      try { await msg.react(emoji); } catch {}
    }
  }

  // Comandos de prefijo "!"
  if (msg.content.startsWith("!")) {
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    const responder = (color, title, desc) => msg.reply({ embeds: [crearEmbed(color, title, desc, msg.author.displayAvatarURL())] });

    if (cmd === "bal") {
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
      await mensaje.edit(`🎰 **SLOT**\n${final.join(" | ")}\n${win ? `🎉 ¡GANASTE $${win}! ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win - bet } }, { upsert: true });
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
      await mensaje.edit(`🎡 **RULETA**\n${t("ruleta_numero", guild)}: ${color} ${numero}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
      let mensaje = `🃏 **BLACKJACK**\nTus cartas: ${player.join(" ")} (${pScore})\nDealer: ${dealer[0]} ?`;
      if (pScore === 21) {
        const ganancia = Math.floor(bet * 1.5);
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
        return msg.reply(`${mensaje}\n¡BLACKJACK! Ganaste $${ganancia} ${rand(frasesArgentinas)}`);
      }
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -bet } }, { upsert: true });
      const ganancia = dScore > 21 || pScore > dScore ? bet * 2 : 0;
      if (ganancia > 0) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: ganancia } }, { upsert: true });
        return msg.reply(`${mensaje}\nDealer: ${dealer.join(" ")} (${dScore})\n🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}`);
      } else {
        return msg.reply(`${mensaje}\nDealer: ${dealer.join(" ")} (${dScore})\n💀 Perdiste $${bet}`);
      }
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
      await mensaje.edit(`🎲 **DADOS**\n${dado1} + ${dado2} = ${suma}\n${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
      await mensaje.edit(`🏁 **CARRERA**\nGanó: ${ganador}\nElegiste: ${elegido}\n${gano ? `🎉 Ganaste $${delta} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
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
          await mensaje.edit(`💥 **CRASH** en ${multiplicador.toFixed(2)}x\nPerdiste $${bet}`);
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
        await mensaje.edit(`💰 Retiraste a ${multiplicador.toFixed(2)}x\nGanaste $${ganancia} ${rand(frasesArgentinas)}`);
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
      await msg.reply(`🃏 **PÓKER**\nTu mano: ${manoJugador.join(" ")}\n${resultado.nombre} → ${ganancia > 0 ? `🎉 Ganaste $${ganancia} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`}`);
    }
    else if (cmd === "coinflip") {
      const bet = parseInt(args[0]);
      if (!bet || bet <= 0) return msg.reply(t("apuesta_invalida", guild));
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const win = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? bet : -bet } }, { upsert: true });
      return msg.reply(win ? `🪙 Ganaste $${bet} ${rand(frasesArgentinas)}` : `💀 Perdiste $${bet}`);
    }
    else if (cmd === "penal") {
      const bet = parseInt(args[0]) || 100;
      if (!(await verificarSaldo(msg, msg.author.id, bet))) return;
      const gol = Math.random() < 0.6;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gol ? bet : -bet } }, { upsert: true });
      return msg.reply(gol ? `⚽ ¡GOL! Ganaste $${bet} ${rand(frasesArgentinas)}` : `🧤 Atajado. Perdiste $${bet}`);
    }
    // ================= MAPA =================
    else if (cmd === "place") {
      const img = await renderPlace();
      return msg.reply({ files: [new AttachmentBuilder(img, "map.png")] });
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
      return msg.reply(fact || t("universo_silencio", guild));
    }
    // ================= AYUDA =================
    else if (cmd === "ayudacmd" || cmd === "ayuda") {
      const texto = `🎨 MAPA: !place, !pixel, !zoom, !zoomlat, !territorio, !comprarlote, !guerra, !topplace\n📷 MULTIMEDIA: !gif, !foto\n🌌 EXTRAS: !universefacts\n💰 ECONOMÍA: !bal, !daily, !work, !pay, !rich\n🎰 CASINO: !slot, !ruleta, !bj, !dados, !carrera, !crash, !poker, !coinflip, !penal\n🧠 IA: !modo, !asocia\n\n🔥 Aprende automáticamente del chat.`;
      return msg.reply(texto);
    }

    return; // Importante: si se ejecuta un comando, no seguir con la IA
  }

  // ================= RESPUESTAS IA (solo si no es comando) =================
  const esReply = !!msg.reference;

  const allAsoc = await asociaColl.find().toArray();
  const asoc = allAsoc.find(a => content.includes(a.clave?.toLowerCase()?.trim()));
  if (asoc) return msg.reply(asoc.respuesta);

  let contexto = msg.content;
  if (esReply) {
    try {
      const replied = await msg.fetchReference();
      contexto = `MENSAJE ORIGINAL:\n${replied.content}\n\nRESPUESTA DEL USUARIO:\n${msg.content}`;
    } catch {}
  }

  let r = await IA(contexto, config.modoActual);
  if (config.modoActual === "normal" && r === "NINGUNA") r = null;

  // 🚨 FILTRO ANTI-"U" MEJORADO: detecta cualquier respuesta que contenga solo "u" (o variantes)
  const prohibidas = ["u", "undefined", "null", "ok", ".", "..", "...", "si", "no"];
  const textoLimpio = String(r || "").trim();
  const soloLetras = textoLimpio.toLowerCase().replace(/[^a-záéíóúüñ]/g, ""); // solo letras, sin números ni signos
  const esRespuestaInvalida = !r
    || r.length <= 1
    || prohibidas.includes(textoLimpio.toLowerCase())
    || soloLetras === "u"  // captura "u", "U", "u.", " u ", "U!", etc.
    || soloLetras.length === 0; // por si acaso

  let finalReply;
  if (esRespuestaInvalida) {
    finalReply = rand(config.phrases) || rand(extras.phrases) || "💀";
  } else {
    finalReply = r;
  }

  return msg.reply(finalReply);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

start();