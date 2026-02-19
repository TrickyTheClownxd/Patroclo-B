import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';

try { dotenv.config(); } catch (e) { console.log("Variables desde el sistema."); }

// Servidor para evitar el apagado en Render/Railway
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
  } catch (error) {
    return defaultData;
  }
}

let memory = validateJSON(FILES.memory, { words: {}, phrases: [], emojis: [] });
let extras = validateJSON(FILES.extras, { emojis: [], customEmojis: [], stickers: [], spaceData: [] });
let universe = validateJSON(FILES.universe, { facts: [], usedToday: [] });

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

// --- LISTA DE EMOJIS PARA EL SALUDO ---
const randomEmojis = ['🔥', '😎', '🤙', '👺', '🛰️', '🌌', '😈', '🚀', '💎'];

client.on('ready', async () => {
  console.log(`✅ Conectado como: ${client.user.tag}`);

  // SALUDO DE ENTRADA
  const emoji = randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
  const saludo = `Que onda perritas, ya llegué ${emoji}`;

  // Busca el primer canal donde pueda escribir para avisar que llegó
  client.guilds.cache.forEach(async (guild) => {
    const channel = guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(client.user).has('SendMessages'));
    if (channel) {
      channel.send(saludo).catch(err => console.log("No pude saludar en un canal."));
    }
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // APRENDIZAJE: Guarda todo lo que digan los usuarios
  if (content.length > 2 && !content.startsWith('!')) {
    if (!memory.phrases.includes(message.content)) {
      memory.phrases.push(message.content);
      const words = content.split(/\s+/);
      words.forEach(w => memory.words[w] = (memory.words[w] || 0) + 1);
      saveFile(FILES.memory, memory);
    }
  }

  // COMANDO: !universo
  if (content.includes('!universo')) {
    const fact = universe.facts[Math.floor(Math.random() * universe.facts.length)];
    return message.reply(fact || "El espacio es gigante, pa.");
  }

  // RESPUESTA ALEATORIA
  if (Math.random() < 0.15 && memory.phrases.length > 0) {
    const response = memory.phrases[Math.floor(Math.random() * memory.phrases.length)];
    return message.channel.send(response);
  }
});

client.login(process.env.BOT_TOKEN || process.env.TOKEN);
