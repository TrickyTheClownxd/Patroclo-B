import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// ===== EXPRESS =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🔥 Patroclo B V3 está evolucionando...");
});

app.listen(PORT, () => {
  console.log(`Servidor Express activo en puerto ${PORT}`);
});

// ===== DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== MEMORIA =====
const MEMORY_FILE = "./memory.json";

let memory = {
  markovChain: {},
  learnedSentences: [],
  learnedEmojis: [],
  learnedCustomEmojis: [],
  learnedStickers: [],
  userMemory: {},
  mood: "neutral"
};

// Cargar memoria
if (fs.existsSync(MEMORY_FILE)) {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

// Guardar memoria
function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

// ===== APRENDER =====
function learnFromMessage(message) {
  const text = message.content;

  // Frases
  if (text.length > 5 && text.length < 200) {
    memory.learnedSentences.push(text);
    if (memory.learnedSentences.length > 500) {
      memory.learnedSentences.shift();
    }
  }

  // Markov Orden 2
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ\s]/gi, "")
    .split(/\s+/)
    .filter(w => w.length > 2);

  for (let i = 0; i < words.length - 2; i++) {
    const key = words[i] + " " + words[i + 1];
    const nextWord = words[i + 2];

    if (!memory.markovChain[key]) {
      memory.markovChain[key] = [];
    }

    memory.markovChain[key].push(nextWord);
  }

  // Usuario
  if (!memory.userMemory[message.author.id]) {
    memory.userMemory[message.author.id] = [];
  }

  memory.userMemory[message.author.id].push(text);
  if (memory.userMemory[message.author.id].length > 50) {
    memory.userMemory[message.author.id].shift();
  }

  // Emojis Unicode
  const emojiRegex = /\p{Emoji}/gu;
  const emojis = text.match(emojiRegex);
  if (emojis) {
    emojis.forEach(e => memory.learnedEmojis.push(e));
  }

  // Emojis personalizados
  const customEmojiRegex = /<a?:\w+:\d+>/g;
  const customEmojis = text.match(customEmojiRegex);
  if (customEmojis) {
    customEmojis.forEach(e => memory.learnedCustomEmojis.push(e));
  }

  // Stickers
  if (message.stickers.size > 0) {
    message.stickers.forEach(sticker => {
      memory.learnedStickers.push(sticker.id);
    });
  }

  // Mood dinámico
  if (text.includes("jaja") || text.includes("😂")) {
    memory.mood = "divertido";
  } else if (text.includes("enojo") || text.includes("rabia")) {
    memory.mood = "agresivo";
  } else if (text.includes("triste")) {
    memory.mood = "oscuro";
  }

  saveMemory();
}

// ===== GENERADOR =====
function generateSentence(maxLength = 15) {
  const keys = Object.keys(memory.markovChain);
  if (keys.length === 0) return "Estoy absorbiendo datos...";

  let currentKey = keys[Math.floor(Math.random() * keys.length)];
  let sentence = currentKey.split(" ");

  for (let i = 0; i < maxLength; i++) {
    const nextWords = memory.markovChain[currentKey];
    if (!nextWords || nextWords.length === 0) break;

    const nextWord =
      nextWords[Math.floor(Math.random() * nextWords.length)];

    sentence.push(nextWord);

    currentKey =
      sentence[sentence.length - 2] + " " +
      sentence[sentence.length - 1];
  }

  let base = sentence.join(" ");

  // Mood
  if (memory.mood === "agresivo") base += " 🔥";
  if (memory.mood === "divertido") base += " 😂";
  if (memory.mood === "oscuro") base += " 👁️";

  return base;
}

function randomEmoji() {
  if (memory.learnedEmojis.length === 0) return "";
  return memory.learnedEmojis[Math.floor(Math.random() * memory.learnedEmojis.length)];
}

function randomCustomEmoji() {
  if (memory.learnedCustomEmojis.length === 0) return "";
  return memory.learnedCustomEmojis[Math.floor(Math.random() * memory.learnedCustomEmojis.length)];
}

function randomSticker() {
  if (memory.learnedStickers.length === 0) return null;
  return memory.learnedStickers[Math.floor(Math.random() * memory.learnedStickers.length)];
}

// ===== READY =====
client.once("clientReady", () => {
  console.log(`🔥 Patroclo B V3 online como ${client.user.tag}`);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  learnFromMessage(message);

  const content = message.content.toLowerCase();

  if (content === "!ping") {
    return message.reply("Sigo evolucionando 😈");
  }

  // Respuesta autónoma 25%
  if (Math.random() < 0.25) {
    const sentence = generateSentence(12);
    const emoji = randomEmoji();
    const customEmoji = randomCustomEmoji();
    const sticker = randomSticker();

    if (sticker && Math.random() < 0.3) {
      await message.channel.send({
        content: sentence + " " + emoji + " " + customEmoji,
        stickers: [sticker]
      });
    } else {
      await message.channel.send(
        sentence + " " + emoji + " " + customEmoji
      );
    }
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);