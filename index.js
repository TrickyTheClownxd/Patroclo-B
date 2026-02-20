import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- SERVER PARA RAILWAY ---
http.createServer((req, res) => { res.write("Patroclo-B V48.0 Online"); res.end(); }).listen(process.env.PORT || 8080);

// --- ESQUEMAS MONGO ---
const User = mongoose.model('User', new mongoose.Schema({
  userId: String, username: String, coins: { type: Number, default: 500 }, lastDaily: { type: Date, default: new Date(0) }
}));

// --- BOT CONFIG ---
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent 
  ] 
});

const FILES = { memory: './memory.json', extras: './extras.json', universe: './universe.json' };
let memory = { phrases: [] }, extras = { spaceData: [] }, universe = { facts: [] };
let lastChannelId = null, lastMessageTime = Date.now(), isPaused = false;

function validateJSON(path, def) {
  try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : def; } catch (e) { return def; }
}

// --- FUNCIÓN ANTICRASH DE USUARIO ---
async function getSafeUser(author) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { userId: author.id, username: author.username, coins: 0, isDummy: true };
    }
    let u = await User.findOne({ userId: author.id });
    if (!u) u = await User.create({ userId: author.id, username: author.username });
    return u;
  } catch (e) { 
    console.log("⚠️ Error de DB, usando modo Dummy.");
    return { userId: author.id, username: author.username, coins: 0, isDummy: true }; 
  }
}

client.on('ready', async () => {
  console.log("✅ Patroclo-B V48.0 Online.");
  memory = validateJSON(FILES.memory, { phrases: [] });
  extras = validateJSON(FILES.extras, { spaceData: [] });
  universe = validateJSON(FILES.universe, { facts: [] });
  
  if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
      .then(() => console.log("🔗 DB Conectada"))
      .catch(e => console.log("❌ Error de Atlas:", e.message));
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  lastChannelId = msg.channel.id; lastMessageTime = Date.now();
  const content = msg.content.toLowerCase();

  // APRENDIZAJE
  if (!content.startsWith('!') && content.length > 2 && !isPaused) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  }

  if (content.startsWith('!')) {
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    const user = await getSafeUser(msg.author);

    try {
      // AYUDA (Siempre funciona)
      if (cmd === 'ayuda') {
        return msg.reply("📜 Comandos: `!bal`, `!daily`, `!suerte`, `!transferir`, `!confesion`, `!bola8`, `!bardo`, `!spoty`, `!reload`.");
      }

      // RELOADS
      if (cmd === 'reload') return msg.reply("♻️ Sistema activo y escuchando.");
      if (cmd === 'reloadjson') { memory = validateJSON(FILES.memory, { phrases: [] }); return msg.reply("📂 Memoria refrescada."); }

      // ECONOMÍA (Con chequeo de DB)
      if (cmd === 'perfil' || cmd === 'bal') {
        return msg.reply(user.isDummy ? "⚠️ DB Offline. Saldo: 0" : `🪙 Tienes **${user.coins} Patro-Pesos**.`);
      }

      if (cmd === 'daily') {
        if (user.isDummy) return msg.reply("❌ MongoDB desconectado. No puedo guardar monedas.");
        if (Date.now() - user.lastDaily < 86400000) return msg.reply("❌ Mañana vuelves.");
        user.coins += 300; user.lastDaily = Date.now(); await user.save();
        return msg.reply("💸 +300 Patro-Pesos.");
      }

      if (cmd === 'suerte') {
        const apuesta = parseInt(args[0]);
        if (user.isDummy) return msg.reply("❌ Casino cerrado: DB Offline.");
        if (!apuesta || user.coins < apuesta) return msg.reply("🎰 No tienes esa guita.");
        
        const res = [Math.floor(Math.random()*5), Math.floor(Math.random()*5), Math.floor(Math.random()*5)];
        let mult = (res[0]===res[1] && res[1]===res[2]) ? 10 : (res[0]===res[1] || res[1]===res[2] || res[0]===res[2]) ? 2 : 0;
        user.coins = user.coins - apuesta + (apuesta * mult); await user.save();
        return msg.reply(`🎰 [${res.join('|')}] - ${mult > 0 ? "¡GANASTE!" : "Perdiste."}`);
      }

      // INTERACCIÓN
      if (cmd === 'bola8') return msg.reply(`🎱 "${memory.phrases[Math.floor(Math.random()*memory.phrases.length)] || "Ni idea."}"`);
      if (cmd === 'bardo') return msg.reply(["Bobo", "Fantasma", "Cerrá el orto"][Math.floor(Math.random()*3)]);
      
      if (cmd === 'confesion') {
        if (args.length > 0) {
          memory.phrases.push(`[CONFESIÓN]: ${args.join(" ")}`);
          fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
          await msg.delete().catch(() => {});
          return msg.channel.send("🤫 Guardado.");
        }
        const confs = memory.phrases.filter(p => p.startsWith("[CONFESIÓN]:"));
        if (confs.length === 0) return msg.reply("No hay confesiones.");
        return msg.channel.send(`📢 **Confesión:** "${confs[Math.floor(Math.random()*confs.length)].replace("[CONFESIÓN]: ", "")}"`);
      }

    } catch (e) { console.error("Error en comando:", e); }
  }

  // INTERVENCIÓN RANDOM
  if (Math.random() < 0.15 && !isPaused && memory.phrases.length > 0 && !content.startsWith('!')) {
    msg.channel.send(memory.phrases[Math.floor(Math.random()*memory.phrases.length)]).catch(()=>{});
  }
});

// REVIVIDOR
setInterval(() => {
  if (isPaused || !lastChannelId || Date.now() - lastMessageTime < 300000) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel && memory.phrases.length > 0) {
    const frase = memory.phrases[Math.floor(Math.random() * memory.phrases.length)];
    if (frase && !frase.startsWith("[CONFESIÓN]")) channel.send(frase).catch(()=>{});
    lastMessageTime = Date.now();
  }
}, 60000);

client.login(process.env.TOKEN);
