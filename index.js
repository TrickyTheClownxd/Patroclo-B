import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';

try { dotenv.config(); } catch (e) { console.log("Variables listas."); }

// Server para Render/Railway
http.createServer((req, res) => {
  res.write("Patroclo-B Online");
  res.end();
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const FILES = {
  memory: './memory.json',
  extras: './extras.json',
  universe: './universe.json'
};

function validateJSON(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : defaultData;
  } catch (error) { return defaultData; }
}

let memory = validateJSON(FILES.memory, { words: {}, phrases: [], emojis: [] });
let extras = validateJSON(FILES.extras, { emojis: [], customEmojis: [], stickers: [], spaceData: [] });
let universe = validateJSON(FILES.universe, { facts: [], usedToday: [] });

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));
const randomEmojis = ['🔥', '😎', '🤙', '👺', '🛰️', '🌌', '🚀'];
let lastChannelId = null;

// --- SALUDO AL ENTRAR ---
client.on('ready', () => {
  console.log(`✅ Patroclo-B activo.`);
  const salu = `Que onda perritas, ya llegué ${randomEmojis[Math.floor(Math.random() * randomEmojis.length)]}`;
  client.guilds.cache.forEach(guild => {
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has('SendMessages'));
    if (ch) ch.send(salu).catch(() => {});
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  lastChannelId = message.channel.id;

  const content = message.content.toLowerCase();
  const isMentioned = message.mentions.has(client.user);
  const isReplyToMe = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

  // --- APRENDIZAJE ---
  if (!content.startsWith('!')) {
    if (message.stickers.size > 0) {
      message.stickers.forEach(s => { if (!extras.stickers.includes(s.id)) extras.stickers.push(s.id); });
      saveFile(FILES.extras, extras);
    }
    if (content.length > 2) {
      if (!memory.phrases.includes(message.content)) {
        memory.phrases.push(message.content);
        content.split(/\s+/).forEach(w => {
          const clean = w.replace(/[.,!?;:]/g, "");
          if (clean.length > 2) memory.words[clean] = (memory.words[clean] || 0) + 1;
        });
      }
      const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu;
      const found = message.content.match(emojiRegex);
      if (found) found.forEach(e => {
        if (e.startsWith('<')) { if (!extras.customEmojis.includes(e)) extras.customEmojis.push(e); }
        else { if (!memory.emojis.includes(e)) memory.emojis.push(e); }
      });
      saveFile(FILES.memory, memory);
      saveFile(FILES.extras, extras);
    }
  }

  // --- RESPUESTA GEN-AI ---
  if (isMentioned || isReplyToMe) {
    if (memory.phrases.length > 0) {
      return message.reply(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]);
    }
  }

  // --- COMANDO !UNIVERSO (CON BONUS TARÁNTULA) ---
  if (content.includes('!universo')) {
    let available = universe.facts.filter(f => !universe.usedToday.includes(f));
    if (available.length === 0) {
        const tarantula = [
            "🌌 **Bonus Tarántula:** Acá están las estrellas Wolf-Rayet, las más calientes y masivas del universo.",
            "🔥 **Dato Wolf-Rayet:** Estas estrellas pierden masa tan rápido que escupen vientos a millones de km/h."
        ];
        const res = tarantula[Math.floor(Math.random() * tarantula.length)];
        if (universe.usedToday.length > universe.facts.length + 1) universe.usedToday = [];
        return message.reply(res);
    }
    const selected = available[Math.floor(Math.random() * available.length)];
    universe.usedToday.push(selected);
    saveFile(FILES.universe, universe);
    return message.reply(selected);
  }

  // --- RANDOM (15%) ---
  if (Math.random() < 0.15 && memory.phrases.length > 0) {
    message.channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]);
  }
});

// --- INTERVALO 5 MIN ---
setInterval(() => {
  if (!lastChannelId) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel) {
    if (Math.random() > 0.5 && universe.facts.length > 0) {
      channel.send(`🔭 **Dato Espacial:** ${universe.facts[Math.floor(Math.random() * universe.facts.length)]}`).catch(() => {});
    } else if (memory.phrases.length > 0) {
      channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]).catch(() => {});
    }
  }
}, 300000);

client.login(process.env.BOT_TOKEN || process.env.TOKEN);
