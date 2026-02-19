import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';

try { dotenv.config(); } catch (e) { console.log("Variables listas."); }

// Server para mantener vivo el bot en el hosting
http.createServer((req, res) => {
  res.write("Patroclo-B V12 Full Interactivo Online");
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

// Carga segura de JSON
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
  console.log(`✅ Patroclo-B V12 (Edicion Enana Blanca) en linea.`);
  client.user.setActivity('el universo disociado', { type: 3 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.toLowerCase();
  
  // --- 1. COMANDOS INTERACTIVOS (!) ---
  if (content.startsWith('!')) {
    const args = content.slice(1).split(/\s+/);
    const command = args.shift();

    // Universo & Datos
    if (command === 'universo') {
      let available = universe.facts.filter(f => !universe.usedToday.includes(f));
      if (available.length === 0) {
        return message.reply("🌌 **Bonus Tarantula:** En 30 Doradus viven las estrellas Wolf-Rayet, las mas calientes del barrio.");
      }
      const selected = available[Math.floor(Math.random() * available.length)];
      universe.usedToday.push(selected);
      saveFile(FILES.universe, universe);
      return message.reply(`🔭 ${selected}`);
    }

    // Horoscopo Disociado (Version Enana Blanca)
    if (command === 'suerte') {
      const signos = [
        "Enana Blanca (chiquito pero pesado)", 
        "Estrella Wolf-Rayet (la mas picante del barrio)", 
        "Agujero Negro (te chupa la energia y la guita)", 
        "Supernova (estas a un paso de explotar)", 
        "Nebulosa de Tarantula (un quilombo de gente)",
        "Materia Oscura (ni se te ve pero estas ahi rompiendo las bolas)",
        "Satelite Viejo (estas dando vueltas al pedo)"
      ];
      const signo = signos[Math.floor(Math.random() * signos.length)];
      const consejo = memory.phrases.length > 0 ? memory.phrases[Math.floor(Math.random() * memory.phrases.length)] : "Segui participando, perrita.";
      return message.reply(`✨ **HOROSCOPO DISOCIADO** ✨\n\n🪐 **Signo:** ${signo}\n🔮 **Prediccion:** "${consejo}"\n\n*El universo no miente, Tricky.*`);
    }

    // Bola 8
    if (command === 'bola8') {
      if (!args.length) return message.reply("Preguntame algo, no seas timido.");
      const resp = memory.phrases.length > 0 ? memory.phrases[Math.floor(Math.random() * memory.phrases.length)] : "Ni idea che.";
      return message.reply(`🎱 | **Pregunta:** ${args.join(" ")}\n✨ | **Patroclo dice:** ${resp}`);
    }

    // Multimedia
    if (command === 'foto') {
      const pics = [
        "https://images-assets.nasa.gov/image/PIA23645/PIA23645~medium.jpg",
        "https://www.nasa.gov/wp-content/uploads/2023/03/stsci-01gw79nntn5rk9zdy6p170m9ms.jpg",
        "https://images-assets.nasa.gov/image/hubble-captures-the-tarantula-nebula_17361131707_o/hubble-captures-the-tarantula-nebula_17361131707_o~medium.jpg"
      ];
      return message.reply(pics[Math.floor(Math.random() * pics.length)]);
    }

    if (command === 'gif') {
      const gifs = [
        "https://media.giphy.com/media/vA8VInmFvSjHq/giphy.gif",
        "https://media.giphy.com/media/3o7TKSjP31Qh7sK3G8/giphy.gif"
      ];
      return message.reply(gifs[Math.floor(Math.random() * gifs.length)]);
    }

    if (command === 'spotify') {
      return message.reply("🎧 Playlist espacial para disociar un rato: https://open.spotify.com/home");
    }

    // Admin & Stats
    if (command === 'stats') return message.reply(`📊 **Stats:** ${memory.phrases.length} frases aprendidas y ${extras.stickers.length} stickers en el cerebro.`);
    if (command === 'clearused') { universe.usedToday = []; saveFile(FILES.universe, universe); return message.reply("🧹 Hechos reseteados."); }

    return;
  }

  // --- 2. APRENDIZAJE Y RESPUESTAS ---
  // Guardar Stickers
  if (message.stickers.size > 0) {
    message.stickers.forEach(s => { if (!extras.stickers.includes(s.id)) extras.stickers.push(s.id); });
    saveFile(FILES.extras, extras);
  }

  // Guardar Frases (si no es comando)
  if (content.length > 2 && !content.startsWith('!')) {
    if (!memory.phrases.includes(message.content)) {
      memory.phrases.push(message.content);
      saveFile(FILES.memory, memory);
    }
  }

  // Respuesta al ser arrobado o respondido
  if (message.mentions.has(client.user) || (message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id)) {
    const resp = memory.phrases.length > 0 ? memory.phrases[Math.floor(Math.random() * memory.phrases.length)] : "Que onda perritas.";
    return message.reply(resp);
  }
});

client.login(process.env.BOT_TOKEN || process.env.TOKEN);
