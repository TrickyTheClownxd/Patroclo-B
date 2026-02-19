import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

try { dotenv.config(); } catch (e) { console.log("Variables cargadas."); }

// --- 1. CONFIGURACIÓN MONGODB ---
const memorySchema = new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String],
  stickers: [String]
});
const MemoryModel = mongoose.model('Memory', memorySchema);

// --- 2. CONFIGURACIÓN Y SERVER ---
let isPaused = false; 

http.createServer((req, res) => {
  res.write("Patroclo-B V19.0 - Edición Final");
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

const loadJSON = (path, def) => { 
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return def; } 
};

// Carga inicial de archivos
let memory = loadJSON(FILES.memory, { phrases: [] });
let extras = loadJSON(FILES.extras, { stickers: [] });
let universeFacts = loadJSON(FILES.universe, ["El universo es vasto y estamos aprendiendo de él."]);

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

async function syncWithCloud() {
  try {
    const data = await MemoryModel.findOne({ id: "global_memory" });
    if (data) {
      memory.phrases = [...new Set([...memory.phrases, ...data.phrases])];
      extras.stickers = [...new Set([...extras.stickers, ...data.stickers])];
      saveFile(FILES.memory, memory);
      return true;
    }
    return false;
  } catch (e) { return false; }
}

async function saveToCloud() {
  try {
    await MemoryModel.findOneAndUpdate({ id: "global_memory" }, 
    { phrases: memory.phrases, stickers: extras.stickers }, { upsert: true });
  } catch (e) { console.log("❌ Error al sincronizar con la nube."); }
}

// --- 3. INICIO ---
client.on('ready', async () => {
  console.log(`✅ Patroclo-B en órbita como ${client.user.tag}`);
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
    await syncWithCloud();
  }
});

// --- 4. LÓGICA DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return;

  const input = msg.content.toLowerCase();

  // COMANDO: !reanudar
  if (input === '!reanudar') {
    isPaused = false;
    return msg.reply("🚀 **SISTEMAS ONLINE.** Volví del hiperespacio.");
  }

  if (isPaused) return;

  // COMANDO: !pausa
  if (input === '!pausa') {
    isPaused = true;
    return msg.reply("💤 **MODO SIESTA.** El bot se fue a disociar. (Usá `!reanudar`).");
  }

  // INTERACCIÓN CON BOTS (Nekotina, etc)
  if (msg.author.bot) {
    if (input.includes("ganaste") || input.includes("monedas")) {
      return msg.channel.send("Miralo al millonario, tirá unos mangos kpo.");
    }
    if (msg.author.username.toLowerCase().includes("nekotina") && (input.includes("sí") || input.includes("no"))) {
        setTimeout(() => { msg.channel.send("No le crean a la gata, miente por los circuitos."); }, 2000);
    }
    return; 
  }

  // --- COMANDOS CON ! ---
  if (input.startsWith('!')) {
    const args = input.slice(1).split(/\s+/);
    const cmd = args.shift();

    if (cmd === 'ayuda' || cmd === 'help') {
      return msg.reply("📜 **COMANDOS DISPONIBLES:**\n`!suerte`, `!bola8`, `!nekoask [pregunta]`, `!confesion [texto]`, `!spoty`, `!bardo`, `!universefacts`, `!stats`, `!pausa`, `!reanudar`, `!reload`, `!reloadjson`.");
    }

    if (cmd === 'universefacts') {
        const fact = universeFacts[Math.floor(Math.random() * universeFacts.length)];
        return msg.reply(`🌌 **DATO DEL UNIVERSO:** ${fact}`);
    }

    if (cmd === 'reloadjson') {
        memory = loadJSON(FILES.memory, { phrases: [] });
        extras = loadJSON(FILES.extras, { stickers: [] });
        universeFacts = loadJSON(FILES.universe, ["El universo se reinició localmente."]);
        return msg.reply("📂 **ARCHIVOS LOCALES RECARGADOS.** Leí el `universe.json` de nuevo.");
    }

    if (cmd === 'nekoask') {
        const q = args.join(" ");
        if (!q) return msg.reply("¡Mandale una pregunta a la gata!");
        await msg.channel.send(`> **Enviando consulta a Nekotina:** ${q}`);
        return msg.channel.send(`!nekoask ${q}`);
    }

    if (cmd === 'confesion') {
      const texto = args.join(" ");
      if (texto) {
        memory.phrases.push(`[CONFESIÓN]: ${texto}`);
        await saveToCloud();
        try { await msg.delete(); } catch(e){}
        return msg.channel.send("🤫 Tu secreto está a salvo en mis circuitos.");
      } else {
        const confesiones = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const p = (confesiones.length > 0 ? confesiones : memory.phrases)[Math.floor(Math.random() * (confesiones.length || memory.phrases.length))];
        return msg.reply(`🤫 **UNA CONFESIÓN:** ${p.replace("[CONFESIÓN]: ", "")}`);
      }
    }

    if (cmd === 'spoty') {
      if (Math.random() > 0.5) {
        const t = ["https://open.spotify.com/track/2plYvIOf8InT08p8t19vR08", "https://open.spotify.com/track/2plYvIOf8InT08p8t19vR09"];
        return msg.reply(`🎧 Temazo: ${t[Math.floor(Math.random()*t.length)]}`);
      } else {
        const fact = universeFacts[Math.floor(Math.random() * universeFacts.length)];
        return msg.reply(`🌌 **VIAJE ASTRAL:** ${fact}`);
      }
    }

    if (cmd === 'suerte' || cmd === 'bola8') {
        const p = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "El cosmos está en silencio.";
        return msg.reply(`🔮 **PREDICCIÓN:** ${p}`);
    }

    if (cmd === 'bardo') {
        const i = ["Cara de artesanía de barro", "Termotanque de achuras", "Tobogán de piojos"];
        return msg.reply(i[Math.floor(Math.random() * i.length)]);
    }

    if (cmd === 'stats') return msg.reply(`📊 Memoria: ${memory.phrases.length} frases guardadas.`);
    
    if (cmd === 'reload') {
        await syncWithCloud();
        return msg.reply("🔄 Sincronizado con la nube de MongoDB.");
    }
  }

  // APRENDER (Mensajes de usuarios)
  if (input.length > 2 && !input.startsWith('!')) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      saveToCloud();
    }
  }
});

client.login(process.env.TOKEN);
