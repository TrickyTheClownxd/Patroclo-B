import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- ESQUEMAS MONGODB ---
const MemorySchema = new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String], emojis: [String], stickers: [String], customEmojis: [String]
});
const MemoryModel = mongoose.model('Memory', MemorySchema);

const UserSchema = new mongoose.Schema({
  userId: String,
  username: String,
  coins: { type: Number, default: 500 },
  lastDaily: { type: Date, default: new Date(0) }
});
const User = mongoose.model('User', UserSchema);

http.createServer((req, res) => { res.write("Patroclo-B V36.0 Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const FILES = { memory: './memory.json', extras: './extras.json', universe: './universe.json' };

function validateJSON(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) { fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2)); return defaultData; }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : defaultData;
  } catch (e) { return defaultData; }
}

let memory = validateJSON(FILES.memory, { phrases: [], emojis: [] });
let extras = validateJSON(FILES.extras, { stickers: [], customEmojis: [], spaceData: [] });
let universe = validateJSON(FILES.universe, { facts: [], usedToday: [] });
let isPaused = false;

// --- FUNCIONES DE ECONOMÍA ---
async function getDBUser(userId, username) {
  let user = await User.findOne({ userId });
  if (!user) user = await User.create({ userId, username });
  return user;
}

// --- LÓGICA PRINCIPAL ---
client.on('ready', async () => {
  console.log("✅ Patroclo-B V36.0: Economía Activada.");
  if (process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  const content = msg.content.toLowerCase();

  if (content.startsWith('!')) {
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    const user = await getDBUser(msg.author.id, msg.author.username);

    // ECONOMÍA
    if (cmd === 'perfil') return msg.reply(`💰 **${msg.author.username}**, tenés **${user.coins} Patro-Pesos**.`);

    if (cmd === 'daily') {
      const cooldown = 24 * 60 * 60 * 1000;
      if (Date.now() - user.lastDaily < cooldown) return msg.reply("❌ Ya cobraste hoy, no seas mangueador.");
      user.coins += 200; user.lastDaily = Date.now(); await user.save();
      return msg.reply("💸 Cobraste **200 Patro-Pesos** de arriba.");
    }

    if (cmd === 'suerte') {
      const apuesta = parseInt(args[0]);
      if (isNaN(apuesta) || apuesta <= 0) return msg.reply("🎰 Poné cuánto vas a apostar: `!suerte [monto]`");
      if (user.coins < apuesta) return msg.reply("❌ Estás seco, andá a laburar.");

      const iconos = ['🔥', '💎', '🍀', '👺', '💩'];
      const s = [iconos[Math.floor(Math.random()*5)], iconos[Math.floor(Math.random()*5)], iconos[Math.floor(Math.random()*5)]];
      let win = 0;
      if (s[0] === s[1] && s[1] === s[2]) win = apuesta * 5;
      else if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) win = apuesta * 2;

      user.coins = user.coins - apuesta + win; await user.save();
      return msg.reply(`🎰 [ ${s[0]} | ${s[1]} | ${s[2]} ]\n${win > 0 ? `🔥 ¡GANASTE! Te llevás **${win}**.` : "🤌 Perdiste por fantasma."}`);
    }

    // COMANDOS CLÁSICOS
    if (cmd === 'bola8') return msg.reply(`🎱 **La Bola 8 dice:** "${memory.phrases[Math.floor(Math.random()*memory.phrases.length)] || "Ni idea."}"`);
    if (cmd === 'horoscopo') {
      const signo = universe.facts.length > 0 && Math.random() > 0.5 ? universe.facts[Math.floor(Math.random()*universe.facts.length)].split('.')[0] : "Hoyo Negro Fiscal";
      return msg.reply(`✨ **HORÓSCOPO** ✨\n🪐 **Signo:** ${signo}\n🔮 **Predicción:** "${memory.phrases[Math.floor(Math.random()*memory.phrases.length)] || "Día rancio."}"\n*El universo no miente, Tricky.*`);
    }
    if (cmd === 'ayuda') return msg.reply("📜 `!perfil`, `!daily`, `!suerte [monto]`, `!bola8`, `!horoscopo`, `!stats`, `!pausa`.");
    if (cmd === 'stats') return msg.reply(`📊 Memoria: ${memory.phrases.length} | Tu Saldo: ${user.coins}`);
    if (cmd === 'reload' || cmd === 'reloadjson') { 
      memory = validateJSON(FILES.memory, memory); 
      return msg.reply("♻️ Memoria local refrescada."); 
    }
  }

  // APRENDIZAJE RANDOM
  if (!content.startsWith('!') && content.length > 2 && !isPaused) {
    if (!memory.phrases.includes(msg.content)) memory.phrases.push(msg.content);
  }
});

client.login(process.env.TOKEN);
