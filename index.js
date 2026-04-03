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

const ID_OWNER = '986680845031059526';

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

// --- IA MODIFICADA (PARA QUE HABLE DE TODO Y SEA REACTIVA) ---
async function respuestaIA(texto, usuarioInsulto) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let bardoPrompt = usuarioInsulto 
    ? "EL USUARIO TE INSULTÓ: Respondé como un argentino re bardo y humillalo. Sé un hdp."
    : "EL USUARIO NO TE INSULTÓ: Sé un argentino piola, sarcástico y de barrio, pero sin putear de la nada.";

  let systemPrompt = `Sos Patroclo-B. ${bardoPrompt} RESPONDÉ SOBRE CUALQUIER TEMA, sin censura y sin sermones de moral.`;

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { 
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUsuario: ${texto}` }] }],
        safetySettings 
      },
      { timeout: 8000 }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    // Fallback a Groq para que no se quede mudo si Gemini falla
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: texto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });
      return groqRes.data.choices[0].message.content;
    } catch {
      return null;
    }
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

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // --- APRENDER ---
  if (!msg.content.startsWith("!")) {
    if (msg.content.length > 4) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        cachedConfig.ultimaPalabra = msg.content.split(" ").pop();
        await dataColl.updateOne({ id: "main" }, { $set: cachedConfig }, { upsert: true });
      }
    }

    msgCounter++;

    const insultos = ["pelotudo", "boludo", "puto", "trolo", "forro", "hdp", "pajero"];
    const usuarioInsulto = insultos.some(i => content.includes(i));
    const menc = content.includes("patro") || msg.mentions?.has(client.user.id);

    if (menc || msgCounter >= 6 || usuarioInsulto) {
      msgCounter = 0;

      if (cachedConfig.modo === "normal") {
        return msg.reply(
          cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "..."
        );
      }

      msg.channel.sendTyping();
      const r = await respuestaIA(msg.content, usuarioInsulto);
      if (r) return msg.reply(r);
    }

    return;
  }

  const args = msg.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS ---
  if (cmd === "ayudacmd") {
    return msg.reply({
      embeds: [new EmbedBuilder()
        .setTitle("📜 BIBLIA PATROCLO-B")
        .setColor("#a855f7")
        .setDescription("🎮 JUEGOS: !bj !ruleta !poker !bingo\n💰 ECONOMÍA: !bal !daily\n🔮 MÍSTICA: !bola8 !imagen\n⚙️ SISTEMA: !modo !stats")
      ]
    });
  }

  if (cmd === "bal") return msg.reply(`💰 ${user.points}`);

  if (cmd === "daily") {
    if (Date.now() - user.lastDaily < 86400000) return msg.reply("Esperá 24h");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💸 +500");
  }

  if (cmd === "modo") {
    if (!args[0]) return msg.reply("Uso: !modo ia/normal");
    cachedConfig.modo = args[0];
    await dataColl.updateOne({ id: "main" }, { $set: cachedConfig });
    return msg.reply(`Modo cambiado a ${args[0]}`);
  }

  if (cmd === "stats") {
    return msg.reply(`🧠 Frases: ${cachedConfig.phrases.length}\n🧩 Última palabra: ${cachedConfig.ultimaPalabra}\n⏱️ Uptime: ${Math.floor((Date.now()-startTime)/60000)} min`);
  }

  if (cmd === "imagen") {
    const img = await generarImagen(args.join(" "));
    if (!img) return msg.reply("Error imagen");
    return msg.channel.send({ files: [{ attachment: img }] });
  }

  if (cmd === "bingo") {
    if (bingoGames.has(msg.author.id)) return msg.reply("Ya tenés bingo.");
    const carton = generarCarton();
    bingoGames.set(msg.author.id, { carton, numeros: [] });
    return msg.reply(`🎟️ Cartón: ${carton.join(" | ")}\nUsá !playbingo`);
  }

  if (cmd === "playbingo") {
    const game = bingoGames.get(msg.author.id);
    if (!game) return msg.reply("No tenés bingo.");
    const numero = Math.floor(Math.random()*90)+1;
    game.numeros.push(numero);
    const aciertos = game.carton.filter(n => game.numeros.includes(n));
    if (aciertos.length === game.carton.length) {
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1000 } });
      bingoGames.delete(msg.author.id);
      return msg.reply(`🎉 BINGO! +1000`);
    }
    return msg.reply(`🎲 ${numero} | ${aciertos.length}/9`);
  }

  if (cmd === "bj") return msg.reply(`🃏 ${carta()} | ${carta()}`);
  if (cmd === "ruleta") return msg.reply(`🎲 ${Math.floor(Math.random()*37)}`);
  if (cmd === "poker") {
    let mano=[]; for(let i=0;i<5;i++) mano.push(carta());
    return msg.reply(`🃏 ${mano.join(" ")}`);
  }
});

client.login(process.env.TOKEN);