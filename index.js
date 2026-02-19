import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

try { dotenv.config(); } catch (e) {}

// --- ESQUEMA ---
const MemoryModel = mongoose.model('Memory', new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String]
}));

// --- VARIABLES Y CARGA DE ARCHIVOS ---
let isPaused = false;
const FILES = { 
  memory: './memory.json', 
  universe: './universe.json' 
};

const loadJSON = (path, def) => { 
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } 
  catch { return def; } 
};

let memory = loadJSON(FILES.memory, { phrases: [] });
let universeFacts = loadJSON(FILES.universe, ["El cosmos está en silencio."]);

// --- SERVIDOR PARA RAILWAY ---
http.createServer((req, res) => { 
  res.write("Patroclo-B V24.0 - Running"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

// --- FUNCIÓN DE CONEXIÓN (CON PACIENCIA) ---
const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) return console.log("⚠️ No hay MONGO_URI en las variables.");

  console.log("⏳ Intentando entrar a Atlas...");
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
    
    console.log("🌐 ¡CONECTADO A LA NUBE!");
    
    // Sincronizar memoria al conectar
    const data = await MemoryModel.findOne({ id: "global_memory" });
    if (data) {
      memory.phrases = [...new Set([...memory.phrases, ...data.phrases])];
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  } catch (err) {
    console.log("❌ Atlas sigue rechazando. Reintentando en 15s...");
    setTimeout(connectDB, 15000);
  }
};

client.on('ready', () => {
  console.log(`✅ Patroclo-B activo: ${client.user.tag}`);
  connectDB();
});

// --- LÓGICA DE COMANDOS ---
client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return;
  const input = msg.content.toLowerCase();

  if (input === '!reanudar') { isPaused = false; return msg.reply("🚀 Sistemas ONLINE."); }
  if (isPaused) return;
  if (input === '!pausa') { isPaused = true; return msg.reply("💤 Modo siesta activado."); }

  // Reacción a Bots
  if (msg.author.bot) {
    if (input.includes("ganaste") || input.includes("monedas")) return msg.channel.send("Tirá unos mangos para los pibes.");
    return;
  }

  // Comandos
  if (input.startsWith('!')) {
    const args = input.slice(1).split(/\s+/);
    const cmd = args.shift();

    if (cmd === 'ayuda') return msg.reply("📜 `!suerte`, `!bola8`, `!nekoask`, `!confesion`, `!spoty`, `!bardo`, `!universefacts`, `!stats`, `!reloadjson`.");
    
    if (cmd === 'universefacts') {
      const f = universeFacts[Math.floor(Math.random() * universeFacts.length)];
      return msg.reply(`🌌 **Dato:** ${f}`);
    }

    if (cmd === 'nekoask') {
      const q = args.join(" ");
      if (!q) return msg.reply("¡Mandale una pregunta!");
      msg.channel.send(`!nekoask ${q}`);
      return msg.channel.send(`> **Consultando a la gata:** ${q}`);
    }

    if (cmd === 'confesion') {
      const texto = args.join(" ");
      if (texto) {
        memory.phrases.push(`[CONFESIÓN]: ${texto}`);
        try { await msg.delete(); } catch(e){}
        return msg.channel.send("🤫 Tu secreto murió acá.");
      } else {
        const c = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const p = (c.length > 0 ? c : memory.phrases)[Math.floor(Math.random() * (c.length || memory.phrases.length))];
        return msg.reply(`🤫 **Confesión:** ${p.replace("[CONFESIÓN]: ", "")}`);
      }
    }

    if (cmd === 'stats') {
      const dbStatus = mongoose.connection.readyState === 1 ? "☁️ Conectado" : "❌ Desconectado";
      return msg.reply(`📊 Memoria: ${memory.phrases.length} frases | DB: ${dbStatus}`);
    }

    if (cmd === 'reloadjson') {
      universeFacts = loadJSON(FILES.universe, ["Reset."]);
      return msg.reply("📂 Universe.json actualizado.");
    }
  }

  // Aprendizaje Pasivo
  if (input.length > 3 && !input.startsWith('!')) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      if (mongoose.connection.readyState === 1) {
        await MemoryModel.findOneAndUpdate({ id: "global_memory" }, { phrases: memory.phrases }, { upsert: true });
      }
    }
  }
});

client.login(process.env.TOKEN);
