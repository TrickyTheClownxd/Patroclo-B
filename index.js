import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

try { dotenv.config(); } catch (e) {}

const MemoryModel = mongoose.model('Memory', new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String]
}));

let isPaused = false;
const FILES = { memory: './memory.json', universe: './universe.json' };
const loadJSON = (path, def) => { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return def; } };

let memory = loadJSON(FILES.memory, { phrases: [] });
let universeFacts = loadJSON(FILES.universe, ["El cosmos espera."]);

http.createServer((req, res) => { res.write("Patroclo-B V23.0"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) return console.log("⚠️ No detecto la variable MONGO_URI en Railway.");
  
  // Log para ver qué está leyendo (solo los primeros caracteres por seguridad)
  console.log(`⏳ Intentando conectar a: ${uri.substring(0, 20)}...`);

  try {
    // Quitamos configuraciones raras, que Mongoose decida
    await mongoose.connect(uri);
    console.log("🌐 ¡CONECTADO A MONGODB ATLAS!");
    
    const data = await MemoryModel.findOne({ id: "global_memory" });
    if (data) {
      memory.phrases = [...new Set([...memory.phrases, ...data.phrases])];
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  } catch (err) {
    console.log("❌ Error de conexión: ", err.message);
    setTimeout(connectDB, 10000);
  }
};

client.on('ready', () => {
  console.log(`✅ Patroclo-B ready.`);
  connectDB();
});

client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return;
  const input = msg.content.toLowerCase();

  if (input === '!reanudar') { isPaused = false; return msg.reply("🚀 On."); }
  if (isPaused) return;
  if (input === '!pausa') { isPaused = true; return msg.reply("💤 Off."); }

  if (input.startsWith('!')) {
    const args = input.slice(1).split(/\s+/);
    const cmd = args.shift();

    if (cmd === 'ayuda') return msg.reply("📜 Comandos: `!suerte`, `!bola8`, `!nekoask`, `!confesion`, `!spoty`, `!bardo`, `!universefacts`, `!stats`, `!reloadjson`.");
    
    if (cmd === 'universefacts') return msg.reply(`🌌 ${universeFacts[Math.floor(Math.random() * universeFacts.length)]}`);
    
    if (cmd === 'reloadjson') {
      universeFacts = loadJSON(FILES.universe, ["Reset."]);
      return msg.reply("📂 Universe actualizado.");
    }

    if (cmd === 'nekoask') {
      const q = args.join(" ");
      if (!q) return msg.reply("¿?");
      msg.channel.send(`!nekoask ${q}`);
      return msg.channel.send(`> **Pregunta a Nekotina:** ${q}`);
    }

    if (cmd === 'confesion') {
      const texto = args.join(" ");
      if (texto) {
        memory.phrases.push(`[CONFESIÓN]: ${texto}`);
        try { await msg.delete(); } catch(e){}
        return msg.channel.send("🤫 Guardado.");
      } else {
        const c = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const p = (c.length > 0 ? c : memory.phrases)[Math.floor(Math.random() * (c.length || memory.phrases.length))];
        return msg.reply(`🤫 **CONFESIÓN:** ${p.replace("[CONFESIÓN]: ", "")}`);
      }
    }

    if (cmd === 'stats') {
      const db = mongoose.connection.readyState === 1 ? "☁️ Conectado" : "❌ Desconectado";
      return msg.reply(`📊 Memoria: ${memory.phrases.length} | DB: ${db}`);
    }
  }

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
