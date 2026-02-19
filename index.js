import { Client, GatewayIntentBits } from "discord.js";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

// ===== CLIENTE DISCORD =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers
  ]
});

// ===== ESTADO =====
let paused = false; // false = activo, true = pausado

// ===== MEMORIA =====
let memory = fs.existsSync("memory.json") ? JSON.parse(fs.readFileSync("memory.json")) : { words: {}, phrases: [], emojis: [] };
let extras = fs.existsSync("extras.json") ? JSON.parse(fs.readFileSync("extras.json")) : { emojis: [], customEmojis: [], stickers: [] };
let universe = fs.existsSync("universe.json") ? JSON.parse(fs.readFileSync("universe.json")) : { facts: [], usedToday: [] };

function saveMemory() { fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2)); }
function saveExtras() { fs.writeFileSync("extras.json", JSON.stringify(extras, null, 2)); }
function saveUniverse() { fs.writeFileSync("universe.json", JSON.stringify(universe, null, 2)); }

// ===== APRENDER =====
function learnFromMessage(message) {
  const words = message.content.toLowerCase()
    .replace(/[^\w\sáéíóúñ<>:]/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => isNaN(word));

  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i];
    const next = words[i + 1];
    if (!memory.words[word]) memory.words[word] = [];
    memory.words[word].push(next);
  }

  const emojiMatches = message.content.match(/[\p{Emoji}]/gu);
  if (emojiMatches) emojiMatches.forEach(e => { if (!extras.emojis.includes(e)) extras.emojis.push(e); });

  const customMatches = message.content.match(/<a?:\w+:\d+>/g);
  if (customMatches) customMatches.forEach(e => { if (!extras.customEmojis.includes(e)) extras.customEmojis.push(e); });

  if (message.stickers.size > 0) message.stickers.forEach(s => { if (!extras.stickers.includes(s.id)) extras.stickers.push(s.id); });

  saveMemory();
  saveExtras();
}

// ===== GENERAR FRASES =====
function generateSentence(maxLength = 12) {
  const keys = Object.keys(memory.words);
  if (keys.length === 0) return "estoy aprendiendo todavía";

  let word = keys[Math.floor(Math.random() * keys.length)];
  let sentence = [word];

  for (let i = 0; i < maxLength; i++) {
    const nextWords = memory.words[word];
    if (!nextWords || nextWords.length === 0) break;
    const next = nextWords[Math.floor(Math.random() * nextWords.length)];
    sentence.push(next);
    word = next;
  }

  return sentence.join(" ");
}

function randomEmoji() { return extras.emojis.length ? extras.emojis[Math.floor(Math.random() * extras.emojis.length)] : ""; }
function randomCustomEmoji() { return extras.customEmojis.length ? extras.customEmojis[Math.floor(Math.random() * extras.customEmojis.length)] : ""; }
function randomSticker() { return extras.stickers.length ? extras.stickers[Math.floor(Math.random() * extras.stickers.length)] : null; }

// ===== MINI API DEL UNIVERSO =====
function getDailyFact() {
  const available = universe.facts.filter(f => !universe.usedToday.includes(f));

  if (available.length === 0) {
    const bonus = "🌠 Bonus: La Nebulosa de Tarántula es la región de formación estelar más grande en la Nube de Magallanes, a 163,000 años luz de la Tierra";
    universe.usedToday = [];
    saveUniverse();
    return bonus;
  }

  const fact = available[Math.floor(Math.random() * available.length)];
  universe.usedToday.push(fact);
  saveUniverse();
  return fact;
}

// ===== READY =====
client.once("ready", () => {
  console.log(`🔥 Patroclo B final está online como ${client.user.tag}`);

  // Mensajes automáticos cada 1-2 min
  setInterval(async () => {
    if (paused) return; // pausa
    const channels = client.channels.cache.filter(c => c.isTextBased());
    const randomChannel = channels.random();
    if (!randomChannel) return;

    const sentence = generateSentence(12);
    const emoji = randomEmoji();
    const customEmoji = randomCustomEmoji();
    const sticker = randomSticker();

    if (sticker && Math.random() < 0.3) {
      await randomChannel.send({ content: `${sentence} ${emoji} ${customEmoji}`, stickers: [sticker] });
    } else {
      await randomChannel.send(`${sentence} ${emoji} ${customEmoji}`);
    }
  }, 60000 + Math.random() * 60000);

  // Enviar dato diario de universo a canal específico
  const CHANNEL_ID = "ID_DEL_CANAL"; // reemplazar con tu canal
  setInterval(() => {
    if (paused) return; // pausa
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (channel) channel.send(`🌌 Dato del día: ${getDailyFact()}`);
  }, 86400000);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (paused) return; // no responde mientras pausado

  learnFromMessage(message);

  const content = message.content.toLowerCase();
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

  // Comandos
  if (content === "!hora") return message.reply(`🕒 Son las ${new Date().toLocaleTimeString()}`);
  if (content === "!frase") return message.reply(sentence);
  if (content === "!dado") return message.reply(`🎲 Salió: ${Math.floor(Math.random() * 6 + 1)}`);
  if (content === "!espacio") return message.reply(getDailyFact());

  // Pausa / reanudar
  if (content === "!pausar" && message.member.permissions.has("Administrator")) {
    paused = true;
    return message.reply("🛑 Patroclo está en modo descanso. No responderá ni enviará mensajes automáticos.");
  }
  if (content === "!reanudar" && message.member.permissions.has("Administrator")) {
    paused = false;
    return message.reply("🔥 Patroclo vuelve a la acción! Todos los sistemas activados.");
  }

  // Reacciones
  if (content.includes("jaja") || content.includes("xd")) message.react("😂");
  if (content.includes("triste") || content.includes("mal")) message.react("😢");
  if (content.includes("enojo") || content.includes("rabia")) message.react("😡");

  // Responde si lo mencionan o reply a bot
  if (shouldRespond) {
    if (sticker && Math.random() < 0.3) {
      return message.channel.send({ content: `${sentence} ${emoji} ${customEmoji}`, stickers: [sticker] });
    } else {
      return message.channel.send(`${sentence} ${emoji} ${customEmoji}`);
    }
  }

  // Respuesta autónoma 25%
  if (Math.random() < 0.25) return message.channel.send(sentence);
});

// ===== LOGIN =====
client.login(process.env.TOKEN);