const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

// ====== BASE DE DATOS ======
let memory = {};
let emojis = [];
let customEmojis = [];
let stickers = [];

if (fs.existsSync("memory.json")) {
  memory = JSON.parse(fs.readFileSync("memory.json"));
}

if (fs.existsSync("extras.json")) {
  const data = JSON.parse(fs.readFileSync("extras.json"));
  emojis = data.emojis || [];
  customEmojis = data.customEmojis || [];
  stickers = data.stickers || [];
}

// ====== GUARDAR ======
function saveMemory() {
  fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
}

function saveExtras() {
  fs.writeFileSync("extras.json", JSON.stringify({
    emojis,
    customEmojis,
    stickers
  }, null, 2));
}

// ====== APRENDER ======
function learnFromMessage(message) {
  const words = message.content
    .toLowerCase()
    .replace(/[^\w\sáéíóúñ<>:]/gi, "")
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i];
    const next = words[i + 1];

    if (!memory[word]) memory[word] = [];
    memory[word].push(next);
  }

  const emojiMatches = message.content.match(/[\p{Emoji}]/gu);
  if (emojiMatches) emojiMatches.forEach(e => { if (!emojis.includes(e)) emojis.push(e); });

  const customMatches = message.content.match(/<a?:\w+:\d+>/g);
  if (customMatches) customMatches.forEach(e => { if (!customEmojis.includes(e)) customEmojis.push(e); });

  if (message.stickers.size > 0) {
    message.stickers.forEach(s => { if (!stickers.includes(s.id)) stickers.push(s.id); });
  }

  saveMemory();
  saveExtras();
}

// ====== GENERAR FRASE ======
function generateSentence(maxLength = 12) {
  const keys = Object.keys(memory);
  if (keys.length === 0) return "estoy aprendiendo todavía";

  let word = keys[Math.floor(Math.random() * keys.length)];
  let sentence = [word];

  for (let i = 0; i < maxLength; i++) {
    const nextWords = memory[word];
    if (!nextWords || nextWords.length === 0) break;

    const next = nextWords[Math.floor(Math.random() * nextWords.length)];
    sentence.push(next);
    word = next;
  }

  return sentence.join(" ");
}

function randomEmoji() {
  if (emojis.length === 0) return "";
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function randomCustomEmoji() {
  if (customEmojis.length === 0) return "";
  return customEmojis[Math.floor(Math.random() * customEmojis.length)];
}

function randomSticker() {
  if (stickers.length === 0) return null;
  return stickers[Math.floor(Math.random() * stickers.length)];
}

// ====== READY ======
client.once("ready", () => {
  console.log(`🔥 Patroclo B online como ${client.user.tag}`);

  // Mensajes automáticos cada 1-2 minutos
  setInterval(async () => {
    const channels = client.channels.cache.filter(c => c.isTextBased());
    const randomChannel = channels.random();
    if (!randomChannel) return;

    const sentence = generateSentence(12);
    const emoji = randomEmoji();
    const customEmoji = randomCustomEmoji();
    const sticker = randomSticker();

    if (sticker && Math.random() < 0.3) {
      await randomChannel.send({
        content: `${sentence} ${emoji} ${customEmoji}`,
        stickers: [sticker]
      });
    } else {
      await randomChannel.send(`${sentence} ${emoji} ${customEmoji}`);
    }
  }, 60000 + Math.random() * 60000); // 1-2 min
});

// ====== MENSAJES ======
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  learnFromMessage(message);

  const mentioned = message.mentions.has(client.user);

  let repliedToBot = false;
  if (message.reference) {
    try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (repliedMessage.author.id === client.user.id) repliedToBot = true;
    } catch {}
  }

  const shouldRespond = mentioned || repliedToBot;

  const sentence = generateSentence(12);
  const emoji = randomEmoji();
  const customEmoji = randomCustomEmoji();
  const sticker = randomSticker();

  if (shouldRespond) {
    if (sticker && Math.random() < 0.3) {
      return message.channel.send({
        content: `${sentence} ${emoji} ${customEmoji}`,
        stickers: [sticker]
      });
    } else {
      return message.channel.send(`${sentence} ${emoji} ${customEmoji}`);
    }
  }

  // Respuestas autónomas 25%
  if (Math.random() < 0.25) return message.channel.send(sentence);
});

// ====== LOGIN ======
client.login(process.env.TOKEN);