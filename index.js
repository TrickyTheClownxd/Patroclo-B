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

// Función de validación y carga
function loadJSON(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : defaultData;
  } catch (error) { return defaultData; }
}

let memory = loadJSON(FILES.memory, { words: {}, phrases: [], emojis: [] });
let extras = loadJSON(FILES.extras, { emojis: [], customEmojis: [], stickers: [], spaceData: [] });
let universe = loadJSON(FILES.universe, { facts: [], usedToday: [] });

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

client.on('ready', () => {
  console.log(`✅ Patroclo-B activo.`);
  const salu = `Que onda perritas, ya llegué 🔥`;
  client.guilds.cache.forEach(guild => {
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has('SendMessages'));
    if (ch) ch.send(salu).catch(() => {});
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  
  // --- 1. COMANDOS MANUALES (CON !) ---
  if (content.startsWith('!')) {
    const args = content.slice(1).split(/\s+/);
    const command = args.shift();

    if (command === 'universo') {
      let available = universe.facts.filter(f => !universe.usedToday.includes(f));
      if (available.length === 0) {
        const bonus = extras.spaceData.length > 0 ? extras.spaceData[Math.floor(Math.random() * extras.spaceData.length)] : "🌌 El universo es infinito, pero mis datos de hoy no. ¡Mañana más!";
        return message.reply(`🌠 **Dato Extra:** ${bonus}`);
      }
      const selected = available[Math.floor(Math.random() * available.length)];
      universe.usedToday.push(selected);
      saveFile(FILES.universe, universe);
      return message.reply(`🌌 ${selected}`);
    }

    if (command === 'clearused') {
      universe.usedToday = [];
      saveFile(FILES.universe, universe);
      return message.reply("🧹 Lista de hechos del día reseteada.");
    }

    if (command === 'reloadjson') {
      memory = loadJSON(FILES.memory, memory);
      extras = loadJSON(FILES.extras, extras);
      universe = loadJSON(FILES.universe, universe);
      return message.reply("🔄 Archivos JSON recargados con éxito.");
    }

    if (command === 'stats') {
      return message.reply(`📊 **Stats:** ${memory.phrases.length} frases, ${extras.stickers.length} stickers y ${universe.facts.length} hechos espaciales.`);
    }
    return; // Salir si es un comando para no aprenderlo
  }

  // --- 2. TRIGGERS AUTOMÁTICOS (Palabras Clave) ---
  const keywords = ['universo', 'espacio', 'hecho', 'tarantula', 'estrella'];
  if (keywords.some(k => content.includes(k))) {
    const fact = universe.facts[Math.floor(Math.random() * universe.facts.length)];
    if (fact) return message.reply(`🔭 Ya que hablaban de eso... ${fact}`);
  }

  // --- 3. APRENDIZAJE DINÁMICO ---
  // Guardar Stickers
  if (message.stickers.size > 0) {
    message.stickers.forEach(s => { if (!extras.stickers.includes(s.id)) extras.stickers.push(s.id); });
    saveFile(FILES.extras, extras);
  }

  // Guardar Frases y Palabras
  if (content.length > 2) {
    if (!memory.phrases.includes(message.content)) {
      memory.phrases.push(message.content);
      content.split(/\s+/).forEach(w => {
        const clean = w.replace(/[.,!?;:]/g, "");
        if (clean.length > 2) memory.words[clean] = (memory.words[clean] || 0) + 1;
      });
      // Guardar Emojis
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

  // --- 4. RESPUESTA TIPO GEN-AI (Mención o Respuesta) ---
  if (message.mentions.has(client.user) || (message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id)) {
    if (memory.phrases.length > 0) {
      const resp = memory.phrases[Math.floor(Math.random() * memory.phrases.length)];
      return message.reply(resp);
    }
  }
});

client.login(process.env.BOT_TOKEN || process.env.TOKEN);
