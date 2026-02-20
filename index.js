import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

try { dotenv.config(); } catch (e) {}

// --- MODELO DB ---
const MemorySchema = new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String]
});
const MemoryModel = mongoose.model('Memory', MemorySchema);

// --- CARGA DE ARCHIVOS ---
const FILES = { 
  memory: './memory.json', 
  universe: './universe.json', 
  extras: './extras.json' 
};

const loadJSON = (path, def) => { 
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } 
  catch { return def; } 
};

let memory = loadJSON(FILES.memory, { words: {}, phrases: [], emojis: [] });
let universeFacts = loadJSON(FILES.universe, []);
let extras = loadJSON(FILES.extras, { emojis: [], customEmojis: [], stickers: [], spaceData: [] });
let isPaused = false;

// --- SERVIDOR PARA RAILWAY ---
http.createServer((req, res) => { 
  res.write("Patroclo-B V26.5 Online"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ] 
});

// --- CONEXIÓN DB CON REINTENTO ---
const connectDB = async () => {
  if (!process.env.MONGO_URI) return console.log("⚠️ Falta MONGO_URI en variables de entorno.");
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("🌐 Atlas Conectado");
    const data = await MemoryModel.findOne({ id: "global_memory" });
    if (data) {
      // Sincroniza Atlas con local (evita duplicados)
      memory.phrases = [...new Set([...memory.phrases, ...data.phrases])];
    }
  } catch (err) {
    console.log("❌ Error DB, reintentando en 15s...");
    setTimeout(connectDB, 15000);
  }
};

client.on('ready', () => { 
  console.log(`✅ Patroclo-B listo como ${client.user.tag}`); 
  connectDB(); 
});

client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return;
  const input = msg.content.toLowerCase();

  // --- COMANDOS ADMIN ---
  if (input === '!stats') {
    const dbStatus = mongoose.connection.readyState === 1 ? "🟩 **Conectada**" : "🟥 **Desconectada**";
    return msg.reply({
      content: `📊 **Estado de Patroclo-B**\n\n` +
               `• **Base de Datos:** ${dbStatus}\n` +
               `• **Memoria Local:** \`${memory.phrases.length}\` frases guardadas\n` +
               `• **Estado:** ${isPaused ? "💤 En siesta" : "🚀 Activo"}\n` +
               `• **Versión:** \`26.5.0\``
    });
  }

  if (input === '!pausa') { isPaused = true; return msg.reply("💤 Me fui a dormir un rato. No aprendo ni respondo."); }
  if (input === '!reanudar') { isPaused = false; return msg.reply("🚀 ¡Desperté! De nuevo en servicio."); }
  
  if (input === '!reloadjson') {
    universeFacts = loadJSON(FILES.universe, []);
    extras = loadJSON(FILES.extras, { spaceData: [] });
    return msg.reply("📂 Los archivos JSON fueron recargados con éxito.");
  }

  if (isPaused) return;

  // --- COMANDOS DE INTERACCIÓN ---
  if (input.startsWith('!')) {
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // Bardo (Insultos)
    if (cmd === 'bardo') {
      const insultos = ["Fantasma", "Bobo", "No servís ni para repuesto de loco", "Andá a lavar los platos", "Sos un desastre caminando"];
      return msg.reply(insultos[Math.floor(Math.random() * insultos.length)]);
    }

    // Datos Espaciales (Mezcla universe.json y extras.json)
    if (cmd === 'universefacts') {
      const allFacts = [...universeFacts, ...(extras.spaceData || [])];
      if (allFacts.length === 0) return msg.reply("🌌 No tengo datos espaciales cargados.");
      return msg.reply(`🌌 **Dato Espacial:** ${allFacts[Math.floor(Math.random() * allFacts.length)]}`);
    }

    // Spotify (50% Chance de dato espacial)
    if (cmd === 'spoty') {
      if (Math.random() > 0.5) {
        return msg.reply("🎶 Escuchate este temón: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGvPBcmT");
      } else {
        const allFacts = [...universeFacts, ...(extras.spaceData || [])];
        return msg.reply(`🌌 No hay música, pero sí un dato: ${allFacts[Math.floor(Math.random() * allFacts.length)]}`);
      }
    }

    // Suerte / Bola 8
    if (cmd === 'suerte' || cmd === 'bola8') {
      const r = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "El futuro es incierto.";
      return msg.reply(`🎱 **La bola dice:** ${r}`);
    }

    // Confesiones Anónimas
    if (cmd === 'confesion') {
      const texto = args.join(" ");
      if (texto) {
        memory.phrases.push(`[CONFESIÓN]: ${texto}`);
        try { await msg.delete(); } catch(e){} // Borra el mensaje original
        if (mongoose.connection.readyState === 1) {
          await MemoryModel.findOneAndUpdate({ id: "global_memory" }, { phrases: memory.phrases }, { upsert: true });
        }
        return msg.channel.send("🤫 Tu secreto fue guardado. Nadie sabrá que fuiste vos.");
      } else {
        const confs = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const seleccion = (confs.length ? confs : memory.phrases)[Math.floor(Math.random() * (confs.length || memory.phrases.length))];
        return msg.reply(`🤫 **Confesión Anónima:** ${seleccion.replace("[CONFESIÓN]: ", "")}`);
      }
    }
  }

  // --- APRENDER Y AUTO-RESPUESTA ---
  if (msg.author.bot) {
    if (input.includes("ganaste") || input.includes("monedas")) {
      return msg.channel.send("Tirá algo para los pibes, no seas rata.");
    }
  } else if (input.length > 3 && !input.startsWith('!')) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      
      // Guardado en Atlas si hay conexión
      if (mongoose.connection.readyState === 1) {
        await MemoryModel.findOneAndUpdate({ id: "global_memory" }, { phrases: memory.phrases }, { upsert: true });
      }
      
      // Guardado local respetando tu estructura original
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  }
});

client.login(process.env.TOKEN);
