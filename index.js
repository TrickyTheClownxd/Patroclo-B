import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- SERVER ---
http.createServer((req, res) => { res.write("Patroclo-B V46.0 Online"); res.end(); }).listen(process.env.PORT || 8080);

// --- ESQUEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
  userId: String, username: String, coins: { type: Number, default: 500 }, lastDaily: { type: Date, default: new Date(0) }
}));

// --- BOT CONFIG ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const FILES = { memory: './memory.json', extras: './extras.json', universe: './universe.json' };
let memory = { phrases: [] }, extras = { spaceData: [] }, universe = { facts: [] };
let lastChannelId = null, lastMessageTime = Date.now(), isPaused = false;

function validateJSON(path, def) {
  try { return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : def; } catch (e) { return def; }
}

async function getSafeUser(author) {
  try {
    let u = await User.findOne({ userId: author.id });
    if (!u) u = await User.create({ userId: author.id, username: author.username });
    return u;
  } catch (e) { return { userId: author.id, username: author.username, coins: 0, dummy: true }; }
}

client.on('ready', async () => {
  console.log("✅ Patroclo-B V46.0 Online.");
  memory = validateJSON(FILES.memory, { phrases: [] });
  extras = validateJSON(FILES.extras, { spaceData: [] });
  universe = validateJSON(FILES.universe, { facts: [] });
  if (process.env.MONGO_URI) mongoose.connect(process.env.MONGO_URI).catch(() => console.log("Atlas Error"));
  
  client.guilds.cache.forEach(g => {
    const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has('SendMessages'));
    if (ch) ch.send("Ya llegué perritas 🔥").catch(() => {});
  });
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
      // --- COMANDOS DE RECARGA ---
      if (cmd === 'reload') {
        return msg.reply("♻️ **Sistema reiniciado.** Memoria operativa limpia y lista.");
      }

      if (cmd === 'reloadjson') {
        memory = validateJSON(FILES.memory, { phrases: [] });
        extras = validateJSON(FILES.extras, { spaceData: [] });
        universe = validateJSON(FILES.universe, { facts: [] });
        return msg.reply("📂 **Archivos JSON recargados.** Todo actualizado desde el disco.");
      }

      // --- AYUDA ---
      if (cmd === 'ayuda' || cmd === 'help') {
        return msg.channel.send("📜 **PATROCLO-B V46.0:**\n" +
          "🎮 `!suerte`, `!bola8`, `!nekoask`, `!horoscopo`\n" +
          "💰 `!perfil`, `!daily`, `!transferir`\n" +
          "🤫 `!confesion` (anónimos)\n" +
          "🔥 `!bardo`, `!spoty`, `!universefacts`\n" +
          "⚙️ `!reload`, `!reloadjson`, `!stats`, `!pausa`, `!limpiarconfesiones`"
        );
      }

      // --- CONFESIONES ---
      if (cmd === 'confesion') {
        if (args.length > 0) {
          memory.phrases.push(`[CONFESIÓN]: ${args.join(" ")}`);
          fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
          await msg.delete().catch(() => {});
          return msg.channel.send("🤫 Guardado anónimamente.");
        }
        const confs = memory.phrases.filter(p => p.startsWith("[CONFESIÓN]:"));
        if (confs.length === 0) return msg.reply("No hay confesiones.");
        const r = confs[Math.floor(Math.random()*confs.length)];
        return msg.channel.send(`📢 **Confesión Anónima:**\n"${r.replace("[CONFESIÓN]: ", "")}"`);
      }

      // --- ECONOMÍA ---
      if (cmd === 'perfil' || cmd === 'bal') return msg.reply(`🪙 Tenés **${user.coins} Patro-Pesos**.`);
      if (cmd === 'daily') {
        if (Date.now() - user.lastDaily < 86400000) return msg.reply("❌ Mañana volvé.");
        user.coins += 300; user.lastDaily = Date.now(); await user.save();
        return msg.reply("💸 +300 Patro-Pesos.");
      }
      if (cmd === 'suerte') {
        const apuesta = parseInt(args[0]);
        if (!apuesta || user.coins < apuesta) return msg.reply("🎰 Monto inválido.");
        const res = [Math.floor(Math.random()*5), Math.floor(Math.random()*5), Math.floor(Math.random()*5)];
        let mult = (res[0]===res[1] && res[1]===res[2]) ? 10 : (res[0]===res[1] || res[1]===res[2] || res[0]===res[2]) ? 2 : 0;
        user.coins = user.coins - apuesta + (apuesta * mult); await user.save();
        return msg.reply(`🎰 [${res.join('|')}] - ${mult > 0 ? "¡Ganaste!" : "Perdiste."}`);
      }

      // --- OTROS ---
      if (cmd === 'bardo') return msg.reply(["Bobo", "Fantasma", "Cerrá el orto"][Math.floor(Math.random()*3)]);
      if (cmd === 'spoty') return msg.reply(Math.random() > 0.5 ? "🎧 https://open.spotify.com/" : `🌌 ${extras.spaceData[0] || "Espacio..."}`);
      if (cmd === 'limpiarconfesiones') {
        if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return msg.reply("❌ No sos admin.");
        memory.phrases = memory.phrases.filter(p => !p.startsWith("[CONFESIÓN]:"));
        fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
        return msg.reply("🗑️ Confesiones borradas.");
      }

    } catch (e) { console.error(e); }
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
    channel.send(memory.phrases[Math.floor(Math.random()*memory.phrases.length)]).catch(()=>{});
    lastMessageTime = Date.now();
  }
}, 60000);

client.login(process.env.TOKEN);
