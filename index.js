import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

try { dotenv.config(); } catch (e) { console.log("Entorno cargado."); }

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
  res.write("Patroclo-B V20.0 - Final Edition");
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

let memory = loadJSON(FILES.memory, { phrases: [] });
let extras = loadJSON(FILES.extras, { stickers: [] });
let universeFacts = loadJSON(FILES.universe, ["El universo está en expansión."]);

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

async function syncWithCloud() {
  if (mongoose.connection.readyState !== 1) return false;
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
  if (mongoose.connection.readyState !== 1) return;
  try {
    await MemoryModel.findOneAndUpdate({ id: "global_memory" }, 
    { phrases: memory.phrases, stickers: extras.stickers }, { upsert: true });
  } catch (e) { console.log("⚠️ Guardado local (Nube desconectada)"); }
}

// --- 3. INICIO CON PARCHE DE CONEXIÓN ---
client.on('ready', async () => {
  console.log(`✅ Patroclo-B online: ${client.user.tag}`);
  
  if (process.env.MONGO_URI) {
    console.log("⏳ Intentando conexión forzada (IPv4)...");
    mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4 // Forzar IPv4 para evitar el error ENOTFOUND en Railway
    })
    .then(async () => {
      console.log("🌐 ¡CONECTADO A MONGODB ATLAS!");
      await syncWithCloud();
    })
    .catch(err => {
      console.log("❌ Error de DNS: Trabajando con memoria local.");
    });
  }
});

// --- 4. LÓGICA DE MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return;
  const input = msg.content.toLowerCase();

  // COMANDO: !reanudar
  if (input === '!reanudar') {
    isPaused = false;
    return msg.reply("🚀 **SISTEMAS ONLINE.**");
  }
  if (isPaused) return;

  // COMANDO: !pausa
  if (input === '!pausa') {
    isPaused = true;
    return msg.reply("💤 **MODO SIESTA.**");
  }

  // Interacción con otros bots
  if (msg.author.bot) {
    if (input.includes("ganaste") || input.includes("monedas")) {
      return msg.channel.send("Miralo al millonario, invitá el asado.");
    }
    if (msg.author.username.toLowerCase().includes("nekotina") && (input.includes("sí") || input.includes("no"))) {
        setTimeout(() => { msg.channel.send("Naaa, no le crean a la gata..."); }, 2000);
    }
    return; 
  }

  // COMANDOS CON !
  if (input.startsWith('!')) {
    const args = input.slice(1).split(/\s+/);
    const cmd = args.shift();

    if (cmd === 'ayuda' || cmd === 'help') {
      return msg.reply("📜 **COMANDOS:**\n`!suerte`, `!bola8`, `!nekoask [p]`, `!confesion [t]`, `!spoty`, `!bardo`, `!universefacts`, `!stats`, `!pausa`, `!reanudar`, `!reload`, `!reloadjson`.");
    }

    if (cmd === 'universefacts') {
        const fact = universeFacts[Math.floor(Math.random() * universeFacts.length)];
        return msg.reply(`🌌 **DATO ESPACIAL:** ${fact}`);
    }

    if (cmd === 'reloadjson') {
        memory = loadJSON(FILES.memory, { phrases: [] });
        universeFacts = loadJSON(FILES.universe, ["Reinicio local."]);
        return msg.reply("📂 **JSON RECARGADOS.** Universe.json leído de nuevo.");
    }

    if (cmd === 'nekoask') {
        const q = args.join(" ");
        if (!q) return msg.reply("¡Preguntale algo!");
        await msg.channel.send(`!nekoask ${q}`);
        return msg.channel.send(`> **Pregunta enviada a Nekotina:** ${q}`);
    }

    if (cmd === 'confesion') {
      const texto = args.join(" ");
      if (texto) {
        memory.phrases.push(`[CONFESIÓN]: ${texto}`);
        await saveToCloud();
        try { await msg.delete(); } catch(e){}
        return msg.channel.send("🤫 Tu secreto está a salvo.");
      } else {
        const c = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const p = (c.length > 0 ? c : memory.phrases)[Math.floor(Math.random() * (c.length || memory.phrases.length))];
        return msg.reply(`🤫 **CONFESIÓN:** ${p.replace("[CONFESIÓN]: ", "")}`);
      }
    }

    if (cmd === 'spoty') {
      if (Math.random() > 0.5) {
        return msg.reply(`🎧 Temazo: https://open.spotify.com/playlist/37i9dQZF1DWZU5DGR2xCSH?utm_source=google&utm_medium=gemini8`);
      } else {
        const f = universeFacts[Math.floor(Math.random() * universeFacts.length)];
        return msg.reply(`🌌 **FLASH:** ${f}`);
      }
    }

    if (cmd === 'suerte' || cmd === 'bola8') {
        const p = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "Silencio cósmico.";
        return msg.reply(`🔮 **PREDICCIÓN:** ${p}`);
    }

    if (cmd === 'bardo') {
        const i = ["Cara de pan lactal", "Termotanque de achuras", "Tobogán de piojos"];
        return msg.reply(i[Math.floor(Math.random() * i.length)]);
    }

    if (cmd === 'stats') {
        const db = mongoose.connection.readyState === 1 ? "☁️ Online" : "❌ Offline";
        return msg.reply(`📊 Memoria: ${memory.phrases.length} frases.\n🌐 Base de Datos: ${db}`);
    }
    
    if (cmd === 'reload') {
        const ok = await syncWithCloud();
        return msg.reply(ok ? "🔄 Sincronizado con la nube." : "❌ Sin conexión a MongoDB.");
    }
  }

  // APRENDER
  if (input.length > 3 && !input.startsWith('!')) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      saveToCloud();
    }
  }
});

client.login(process.env.TOKEN);
