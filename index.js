import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- SERVIDOR PARA RAILWAY ---
http.createServer((req, res) => { res.write("Patroclo-B V41.0 Online"); res.end(); }).listen(process.env.PORT || 8080);

// --- ESQUEMAS MONGODB ---
const UserSchema = new mongoose.Schema({
  userId: String,
  username: String,
  coins: { type: Number, default: 500 },
  lastDaily: { type: Date, default: new Date(0) }
});
const User = mongoose.model('User', UserSchema);

const MemorySchema = new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String]
});
const MemoryModel = mongoose.model('Memory', MemorySchema);

// --- CLIENTE DISCORD ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const FILES = { memory: './memory.json' };
let memory = { phrases: [] };
let lastChannelId = null;
let lastMessageTime = Date.now();
let isPaused = false;

function validateJSON(path, def) {
  try {
    if (!fs.existsSync(path)) { fs.writeFileSync(path, JSON.stringify(def, null, 2)); return def; }
    const raw = fs.readFileSync(path, 'utf8');
    return raw.trim() ? JSON.parse(raw) : def;
  } catch (e) { return def; }
}

async function getSafeUser(author) {
  try {
    if (mongoose.connection.readyState !== 1) return { userId: author.id, username: author.username, coins: 0, dummy: true };
    let u = await User.findOne({ userId: author.id });
    if (!u) u = await User.create({ userId: author.id, username: author.username });
    return u;
  } catch (e) { return { userId: author.id, username: author.username, coins: 0, dummy: true }; }
}

client.on('ready', async () => {
  console.log(`✅ Patroclo-B V41.0 en pista.`);
  memory = validateJSON(FILES.memory, { phrases: [] });

  if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
      .then(() => console.log("🌐 Conectado a Atlas"))
      .catch(e => console.error("❌ Error Atlas:", e.message));
  }

  client.guilds.cache.forEach(g => {
    const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has('SendMessages'));
    if (ch) ch.send("Ya llegué perritas 🔥").catch(() => {});
  });
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  lastChannelId = msg.channel.id;
  lastMessageTime = Date.now();
  const content = msg.content.toLowerCase();

  // APRENDIZAJE
  if (!content.startsWith('!') && content.length > 2 && !isPaused) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  }

  // COMANDOS
  if (content.startsWith('!')) {
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    try {
      const user = await getSafeUser(msg.author);

      if (cmd === 'bal' || cmd === 'perfil') {
        if (user.dummy) return msg.reply("⚠️ DB Offline.");
        return msg.reply(`🪙 **${user.username}**, tenés **${user.coins} Patro-Pesos**.`);
      }

      if (cmd === 'daily') {
        const cooldown = 24 * 60 * 60 * 1000;
        if (Date.now() - user.lastDaily < cooldown) return msg.reply("❌ Aguantá a mañana.");
        user.coins += 300; user.lastDaily = Date.now(); await user.save();
        return msg.reply("💸 Cobraste **300 Patro-Pesos**.");
      }

      if (cmd === 'transferir') {
        const target = msg.mentions.users.first();
        const monto = parseInt(args[1]);
        if (!target || isNaN(monto) || monto <= 0) return msg.reply("💸 Uso: `!transferir @user [monto]`");
        if (user.coins < monto) return msg.reply("❌ No tenés esa guita.");
        
        const targetUser = await getSafeUser(target);
        if (targetUser.dummy) return msg.reply("⚠️ No se puede transferir ahora.");
        
        user.coins -= monto; targetUser.coins += monto;
        await user.save(); await targetUser.save();
        return msg.reply(`✅ Le pasaste **${monto}** a ${target.username}.`);
      }

      if (cmd === 'suerte') {
        const apuesta = parseInt(args[0]);
        if (isNaN(apuesta) || apuesta <= 0) return msg.reply("🎰 Uso: `!suerte [monto]`");
        if (user.coins < apuesta) return msg.reply("❌ Estás seco.");

        const iconos = ['🍎', '💎', '🎰', '💩', '🔥'];
        const res = [iconos[Math.floor(Math.random()*5)], iconos[Math.floor(Math.random()*5)], iconos[Math.floor(Math.random()*5)]];
        let mult = (res[0] === res[1] && res[1] === res[2]) ? 10 : (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) ? 2 : 0;

        user.coins = user.coins - apuesta + (apuesta * mult);
        if (!user.dummy) await user.save();
        return msg.reply(`🎰 [ ${res[0]} | ${res[1]} | ${res[2]} ]\n${mult > 0 ? `🔥 ¡GANASTE **${apuesta*mult}**!` : "🤌 Perdiste."}`);
      }

      if (cmd === 'bola8') return msg.reply(`🎱 "${memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "Ni idea."}"`);
      if (cmd === 'bardo') return msg.reply(["Bobo", "Fantasma", "Cerrá el orto, Tricky"][Math.floor(Math.random()*3)]);
      if (cmd === 'ayuda') return msg.reply("📜 `!bal`, `!daily`, `!suerte [monto]`, `!transferir @user [monto]`, `!bola8`, `!bardo`.");

    } catch (err) { console.error(err); }
  }

  // INTERVENCIÓN RANDOM (15%)
  if (Math.random() < 0.15 && memory.phrases.length > 0 && !isPaused && !content.startsWith('!')) {
    msg.channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]).catch(()=>{});
  }
});

// --- REVIVIDOR (Iniciativa propia cada 5 min) ---
setInterval(() => {
  if (isPaused || !lastChannelId || Date.now() - lastMessageTime < 300000) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel && memory.phrases.length > 0) {
    channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]).catch(() => {});
    lastMessageTime = Date.now();
  }
}, 60000);

client.login(process.env.TOKEN);
