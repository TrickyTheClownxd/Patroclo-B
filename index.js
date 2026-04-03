import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req, res) => {
  res.end("PATROCLO ULTRA GOD ONLINE");
}).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = {
  phrases: [],
  modo: "ia",
  mantenimiento: false,
  ultimaPalabra: "ninguna"
};

let msgCounter = 0;
let bingoGames = new Map();

// --- DB ---
async function connectDb() {
  await mongoClient.connect();
  const db = mongoClient.db("patroclo_bot");
  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({ id: "main" });
  if (d) cachedConfig = { ...cachedConfig, ...d };

  console.log("✅ DB OK");
}
connectDb();

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) {
    u = { userId: id, points: 1000, lastDaily: 0 };
    await usersColl.insertOne(u);
  }
  return u;
}

// --- IA ---
async function respuestaIA(texto) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: texto }] }] }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return null;
  }
}

// --- IMAGEN ---
async function generarImagen(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
        responseType: "arraybuffer"
      }
    );
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

// --- BINGO ---
function generarCarton() {
  let nums = [];
  while (nums.length < 9) {
    let n = Math.floor(Math.random() * 90) + 1;
    if (!nums.includes(n)) nums.push(n);
  }
  return nums.sort((a,b)=>a-b);
}

// --- CARTAS ---
const carta = () => {
  const v = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const p = ["♠️","♥️","♦️","♣️"];
  return v[Math.floor(Math.random()*v.length)] + p[Math.floor(Math.random()*p.length)];
};

// --- MENSAJES ---
client.on("messageCreate", async (msg) => {
  if (!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento) return;

  // --- APRENDER ---
  if (!msg.content.startsWith("!")) {
    if (msg.content.length > 4) {
      cachedConfig.phrases.push(msg.content);
      cachedConfig.ultimaPalabra = msg.content.split(" ").pop();

      await dataColl.updateOne(
        { id: "main" },
        { $set: cachedConfig },
        { upsert: true }
      );
    }

    msgCounter++;

    if (msgCounter >= 6 || content.includes("patro")) {
      msgCounter = 0;

      if (cachedConfig.modo === "normal") {
        return msg.reply(
          cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "..."
        );
      }

      const r = await respuestaIA(`Respondé como argentino piola: ${msg.content}`);
      if (r) return msg.reply(r);
    }

    return;
  }

  const args = msg.content.slice(1).split(" ");
  const cmd = args.shift();

  // --- AYUDA ---
  if (cmd === "ayudacmd") {
    return msg.reply({
      embeds: [new EmbedBuilder()
        .setTitle("📜 BIBLIA PATROCLO-B")
        .setColor("#a855f7")
        .setDescription(`
🎮 JUEGOS
!bj !ruleta !poker !bingo

💰 ECONOMÍA
!bal !daily

🔮 MÍSTICA
!bola8 !imagen

📰 EXTRA
!news

⚙️ SISTEMA
!modo !stats !noticias
        `)
      ]
    });
  }

  // --- BAL ---
  if (cmd === "bal") return msg.reply(`💰 ${user.points}`);

  // --- DAILY ---
  if (cmd === "daily") {
    if (Date.now() - user.lastDaily < 86400000)
      return msg.reply("Esperá 24h");

    await usersColl.updateOne(
      { userId: msg.author.id },
      { $inc: { points: 500 }, $set: { lastDaily: Date.now() } }
    );

    return msg.reply("💸 +500");
  }

  // --- MODO ---
  if (cmd === "modo") {
    cachedConfig.modo = args[0];
    await dataColl.updateOne({ id: "main" }, { $set: cachedConfig });
    return msg.reply("Modo cambiado");
  }

  // --- STATS ---
  if (cmd === "stats") {
    return msg.reply(`
🧠 Frases: ${cachedConfig.phrases.length}
🧩 Última palabra: ${cachedConfig.ultimaPalabra}
⏱️ Uptime: ${Math.floor((Date.now()-startTime)/60000)} min
    `);
  }

  // --- NOTICIAS INTERNA ---
  if (cmd === "noticias") {
    return msg.reply("🆕 IA + Casino + Bingo + Imágenes activas.");
  }

  // --- NEWS API ---
  if (cmd === "news") {
    try {
      const res = await axios.get(`https://newsapi.org/v2/top-headlines?country=ar&apiKey=${process.env.NEWS_API}`);
      const art = res.data.articles[0];
      return msg.reply(`📰 ${art.title}\n${art.url}`);
    } catch {
      return msg.reply("Error noticias");
    }
  }

  // --- BOLA8 ---
  if (cmd === "bola8") {
    const r = ["Sí","No","Tal vez","Obvio","Ni en pedo"];
    return msg.reply(r[Math.floor(Math.random()*r.length)]);
  }

  // --- IMAGEN ---
  if (cmd === "imagen") {
    const img = await generarImagen(args.join(" "));
    if (!img) return msg.reply("Error imagen");
    return msg.channel.send({ files: [{ attachment: img }] });
  }

  // --- BINGO ---
  if (cmd === "bingo") {
    if (bingoGames.has(msg.author.id)) return msg.reply("Ya tenés bingo.");

    const carton = generarCarton();
    bingoGames.set(msg.author.id, { carton, numeros: [] });

    return msg.reply(`🎟️ Cartón:\n${carton.join(" | ")}\nUsá !playbingo`);
  }

  if (cmd === "playbingo") {
    const game = bingoGames.get(msg.author.id);
    if (!game) return msg.reply("No tenés bingo.");

    const numero = Math.floor(Math.random()*90)+1;
    game.numeros.push(numero);

    const aciertos = game.carton.filter(n => game.numeros.includes(n));

    if (aciertos.length === game.carton.length) {
      const premio = parseInt(process.env.BINGO_REWARD) || 1000;

      await usersColl.updateOne(
        { userId: msg.author.id },
        { $inc: { points: premio } }
      );

      bingoGames.delete(msg.author.id);
      return msg.reply(`🎉 BINGO! +${premio}`);
    }

    return msg.reply(`🎲 ${numero} | ${aciertos.length}/9`);
  }

  // --- CASINO ---
  if (cmd === "bj") return msg.reply(`🃏 ${carta()} | ${carta()}`);
  if (cmd === "ruleta") return msg.reply(`🎲 ${Math.floor(Math.random()*37)}`);
  if (cmd === "poker") {
    let mano=[]; for(let i=0;i<5;i++) mano.push(carta());
    return msg.reply(`🃏 ${mano.join(" ")}`);
  }

});

client.login(process.env.TOKEN);