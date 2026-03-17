import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// ===== SERVER KEEP ALIVE =====
http.createServer((req, res) => {
  res.write("Patroclo ON");
  res.end();
}).listen(process.env.PORT || 8080);

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// ===== DB =====
const mongo = new MongoClient(process.env.MONGO_URI);
let users, memory;

await mongo.connect();
const db = mongo.db("patroclo");
users = db.collection("users");
memory = db.collection("memory");

// ===== CONFIG =====
let modoBot = "normal";
let chatHistory = [];

// ===== IA =====
async function ia(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "ni idea";
  } catch {
    return "error IA";
  }
}

// ===== IMAGEN =====
async function imagen(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
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

// ===== USER =====
async function getUser(id) {
  let u = await users.findOne({ userId: id });
  if (!u) {
    u = { userId: id, points: 500, lastDaily: 0 };
    await users.insertOne(u);
  }
  return u;
}

// ===== MEMORIA =====
async function guardar(msg) {
  await memory.updateOne(
    { userId: msg.author.id },
    { $push: { mensajes: msg.content } },
    { upsert: true }
  );
}

// ===== READY =====
client.once("ready", () => {
  console.log("🔥 Bot listo");
});

// ===== MENSAJES =====
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const content = msg.content.toLowerCase();
  chatHistory.push(msg.content);
  if (chatHistory.length > 15) chatHistory.shift();

  await guardar(msg);

  const mencionado = msg.mentions.has(client.user);
  const esReply = msg.reference;

  const debeResponder = mencionado || esReply || Math.random() < 0.6;

  // ===== COMANDOS =====
  if (content.startsWith("!")) {
    const args = content.slice(1).split(" ");
    const cmd = args.shift();

    // ===== MODO =====
    if (cmd === "modo") {
      if (!["normal","serio","ia"].includes(args[0])) return msg.reply("normal | serio | ia");
      modoBot = args[0];
      return msg.reply(`Modo: ${modoBot}`);
    }

    // ===== AYUDA =====
    if (cmd === "ayudacmd") {
      const embed = new EmbedBuilder()
        .setTitle("📜 Comandos")
        .setColor("Blue")
        .setDescription(`
🤖 IA
!modo normal/serio/ia
!imagen <texto>

💰 Economía
!bal
!daily

🎰 Casino
!ruleta <apuesta>
!slots <apuesta>
`);
      return msg.reply({ embeds: [embed] });
    }

    // ===== ECONOMIA =====
    if (cmd === "bal") {
      const u = await getUser(msg.author.id);
      return msg.reply(`💰 ${u.points}`);
    }

    if (cmd === "daily") {
      const u = await getUser(msg.author.id);
      if (Date.now() - u.lastDaily < 86400000) return msg.reply("espera 24h");
      await users.updateOne({ userId: msg.author.id }, {
        $inc: { points: 500 },
        $set: { lastDaily: Date.now() }
      });
      return msg.reply("+500 💰");
    }

    // ===== CASINO =====
    if (cmd === "ruleta") {
      const bet = parseInt(args[0]);
      const u = await getUser(msg.author.id);
      if (!bet || bet > u.points) return msg.reply("apuesta invalida");

      const win = Math.random() < 0.5;
      const change = win ? bet : -bet;

      await users.updateOne({ userId: msg.author.id }, { $inc: { points: change } });

      return msg.reply(win ? `ganaste +${bet}` : `perdiste -${bet}`);
    }

    if (cmd === "slots") {
      const bet = parseInt(args[0]);
      const u = await getUser(msg.author.id);
      if (!bet || bet > u.points) return msg.reply("apuesta invalida");

      const roll = Math.random();
      let mult = 0;

      if (roll < 0.1) mult = 5;
      else if (roll < 0.3) mult = 2;

      const win = bet * mult;
      await users.updateOne({ userId: msg.author.id }, { $inc: { points: win - bet } });

      return msg.reply(mult ? `GANASTE x${mult}` : "perdiste todo");
    }

    // ===== IMAGEN =====
    if (cmd === "imagen") {
      const img = await imagen(args.join(" "));
      if (!img) return msg.reply("error imagen");
      return msg.channel.send({ files: [{ attachment: img, name: "img.png" }] });
    }

    return;
  }

  // ===== RESPUESTA BOT =====
  if (!debeResponder) return;

  // ===== IA =====
  if (modoBot === "ia") {
    const contexto = chatHistory.join("\n");
    const r = await ia(`Responde como argentino natural:\n${contexto}`);
    return msg.channel.send(r);
  }

  // ===== SERIO =====
  if (modoBot === "serio") {
    const frases = [
      "La disciplina define el destino.",
      "El respeto se gana.",
      "El silencio habla más que mil palabras."
    ];
    return msg.channel.send(frases[Math.floor(Math.random()*frases.length)]);
  }

  // ===== NORMAL =====
  const random = [
    "q onda",
    "alta data",
    "banco",
    "????",
    "jajaja"
  ];

  msg.channel.send(random[Math.floor(Math.random()*random.length)]);
});

client.login(process.env.TOKEN);