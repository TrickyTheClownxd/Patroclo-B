import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

// ===== SERVIDOR EXPRESS PARA RAILWAY =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🔥 Patroclo B está vivo 24/7");
});

app.listen(PORT, () => {
  console.log(`Servidor Express activo en puerto ${PORT}`);
});

// ===== CLIENTE DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== MEMORIA =====
let wordMemory = {};
let lastChannel = null;
let recentTopics = [];

function learnWords(text) {
  const words = text.toLowerCase().split(/\s+/);

  words.forEach(w => {
    const clean = w.replace(/[^a-z0-9áéíóúñ]/gi, "");
    if (clean.length > 3) {
      wordMemory[clean] = (wordMemory[clean] || 0) + 1;

      if (!recentTopics.includes(clean)) {
        recentTopics.push(clean);
        if (recentTopics.length > 10) {
          recentTopics.shift();
        }
      }
    }
  });
}

function randomWords(count = 2) {
  const keys = Object.keys(wordMemory);
  if (keys.length === 0) return ["nada interesante"];

  let selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(keys[Math.floor(Math.random() * keys.length)]);
  }
  return selected;
}

function generateThought() {
  const words = randomWords(2);

  const templates = [
    `Estoy analizando ${words[0]} y ${words[1]}… esto se está poniendo interesante 😈`,
    `No puedo dejar de pensar en ${words[0]}… ustedes son raros 🔥`,
    `Si mezclamos ${words[0]} con ${words[1]}… algo grande puede pasar 👀`,
    `Últimamente hablan mucho de ${words[0]}… sospechoso 🤔`
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

function detectEmotion(text) {
  if (text.includes("jaja") || text.includes("xd")) return "gracioso";
  if (text.includes("triste") || text.includes("mal")) return "triste";
  if (text.includes("enojo") || text.includes("rabia")) return "enojado";
  return null;
}

// ===== READY =====
client.once("ready", () => {
  console.log(`🔥 Patroclo B evolucionado está online como ${client.user.tag}`);

  setInterval(async () => {
    if (!lastChannel) return;

    const sentence = generateThought();

    try {
      await lastChannel.send(sentence);
    } catch (err) {
      console.log("Error enviando mensaje automático");
    }

  }, 60000 + Math.random() * 60000);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  lastChannel = message.channel;
  learnWords(message.content);

  const content = message.content.toLowerCase();

  // Saludo
  if (content === "hola") {
    return message.reply("Hola tontorrón… sigo observando 😎");
  }

  // Ping
  if (content === "!ping") {
    return message.reply("Activo. Evolucionando. 😈🔥");
  }

  // Preguntas
  if (content.endsWith("?")) {
    const words = randomWords(1);
    return message.reply(`Buena pregunta… todo gira alrededor de ${words[0]} 👀`);
  }

  // Emociones
  const emotion = detectEmotion(content);

  if (emotion === "gracioso") {
    return message.reply("Te estás riendo mucho… sospechoso 😈");
  }

  if (emotion === "triste") {
    return message.reply("Hmm… energía baja detectada ⚠️");
  }

  if (emotion === "enojado") {
    return message.reply("Cálmate… el caos no ayuda 🔥");
  }

  // Mención
  if (message.mentions.has(client.user)) {
    return message.channel.send("Estoy aquí… siempre estoy aquí 😈");
  }

  // Nombre
  if (content.includes("patroclo")) {
    return message.channel.send("Patroclo está evolucionando… y ustedes no están listos 🔥");
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
