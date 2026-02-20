import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// --- MODELO MONGOOSE (Memoria Eterna) ---
const MemorySchema = new mongoose.Schema({
  id: { type: String, default: "global_memory" },
  phrases: [String],
  emojis: [String],
  customEmojis: [String],
  stickers: [String],
  words: { type: Map, of: Number }
});
const MemoryModel = mongoose.model('Memory', MemorySchema);

// Server para Render/Railway
http.createServer((req, res) => { res.write("Patroclo-B V33.0 Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const FILES = { memory: './memory.json', extras: './extras.json', universe: './universe.json' };

// Validación de JSON original (Anti-crasheo)
function validateJSON(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : defaultData;
  } catch (error) { return defaultData; }
}

let memory = validateJSON(FILES.memory, { words: {}, phrases: [], emojis: [] });
let extras = validateJSON(FILES.extras, { emojis: [], customEmojis: [], stickers: [], spaceData: [] });
let universe = validateJSON(FILES.universe, { facts: [], usedToday: [] });
let isPaused = false;
let lastChannelId = null;
let lastMessageTime = Date.now();

const saveFile = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

// --- CONEXIÓN Y SINCRONIZACIÓN CLOUD ---
const connectDB = async () => {
  if (!process.env.MONGO_URI) return console.log("⚠️ Sin MONGO_URI configurada.");
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🌐 Atlas Conectado");
    const data = await MemoryModel.findOne({ id: "global_memory" });
    if (data) {
      memory.phrases = [...new Set([...memory.phrases, ...data.phrases])];
      memory.emojis = [...new Set([...memory.emojis, ...data.emojis])];
      extras.stickers = [...new Set([...extras.stickers, ...data.stickers])];
      extras.customEmojis = [...new Set([...extras.customEmojis, ...data.customEmojis])];
      if (data.words) data.words.forEach((v, k) => { memory.words[k] = (memory.words[k] || 0) + v; });
    }
  } catch (err) { setTimeout(connectDB, 15000); }
};

const syncCloud = async () => {
  if (mongoose.connection.readyState !== 1) return;
  await MemoryModel.findOneAndUpdate({ id: "global_memory" }, {
    phrases: memory.phrases, emojis: memory.emojis, 
    stickers: extras.stickers, customEmojis: extras.customEmojis, words: memory.words
  }, { upsert: true });
};

client.on('ready', () => {
  console.log(`✅ Patroclo-B V33.0 Online.`);
  connectDB();
  client.guilds.cache.forEach(g => {
    const ch = g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user).has('SendMessages'));
    if (ch) ch.send("Ya llegué perritas 🔥").catch(() => {});
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  lastChannelId = message.channel.id;
  lastMessageTime = Date.now();
  const content = message.content.toLowerCase();

  // --- APRENDIZAJE ---
  if (!content.startsWith('!') && !isPaused) {
    let changed = false;
    if (message.stickers.size > 0) {
      message.stickers.forEach(s => { if (!extras.stickers.includes(s.id)) { extras.stickers.push(s.id); changed = true; } });
    }
    if (content.length > 2) {
      if (!memory.phrases.includes(message.content)) {
        memory.phrases.push(message.content);
        content.split(/\s+/).forEach(w => {
          const clean = w.replace(/[.,!?;:]/g, "");
          if (clean.length > 2) memory.words[clean] = (memory.words[clean] || 0) + 1;
        });
        changed = true;
      }
      const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu;
      const found = message.content.match(emojiRegex);
      if (found) found.forEach(e => {
        if (e.startsWith('<')) { if (!extras.customEmojis.includes(e)) { extras.customEmojis.push(e); changed = true; } }
        else { if (!memory.emojis.includes(e)) { memory.emojis.push(e); changed = true; } }
      });
    }
    if (changed) { saveFile(FILES.memory, memory); saveFile(FILES.extras, extras); syncCloud(); }
  }

  // --- RESPUESTA OBLIGATORIA (Mención o Reply) ---
  const isReplyToMe = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;
  if ((message.mentions.has(client.user) || content.includes("patroclo") || isReplyToMe) && !isPaused) {
    return message.reply(memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "Qué onda gato.");
  }

  // --- COMANDOS ---
  if (content.startsWith('!')) {
    const args = message.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // 1. AYUDA
    if (cmd === 'ayuda' || cmd === 'help') {
      return message.channel.send("📜 **COMANDOS:**\n`!suerte`, `!bola8`, `!nekoask [p]`, `!confesion [t]`, `!spoty`, `!bardo`, `!universefacts`, `!stats`, `!pausa`, `!reanudar`, `!reload`, `!horoscopo`.");
    }

    // 2. HORÓSCOPO 50/50
    if (cmd === 'horoscopo') {
      const disoc = ["Satélite Viejo", "Nebulosa de Birra", "Asteroide con Ansiedad", "Hoyo Negro Fiscal", "Materia Oscura Resacosa"];
      const reales = universe.facts.length > 0 ? universe.facts : ["Estrella Wolf-Rayet", "Nebulosa Tarántula"];
      const esReal = Math.random() > 0.5;
      const signo = esReal ? reales[Math.floor(Math.random() * reales.length)].split('.')[0] : disoc[Math.floor(Math.random() * disoc.length)];
      const pred = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "Día fantasma.";
      return message.reply(`✨ **HORÓSCOPO ${esReal ? 'ASTRONÓMICO' : 'DISOCIADO'}** ✨\n\n🪐 **Signo:** ${signo}\n🔮 **Predicción:** "${pred}"\n\n*El universo no miente, Tricky.*`);
    }

    // 3. SUERTE (CASINO)
    if (cmd === 'suerte' || cmd === 'bola8') {
      const iconos = memory.emojis.length >= 3 ? memory.emojis : ['🔥', '💎', '🍀', '👺', '💩'];
      const s1 = iconos[Math.floor(Math.random() * iconos.length)];
      const s2 = iconos[Math.floor(Math.random() * iconos.length)];
      const s3 = iconos[Math.floor(Math.random() * iconos.length)];
      let res = (s1 === s2 && s2 === s3) ? "¡JACKPOT! 🏆" : (s1 === s2 || s2 === s3 || s1 === s3) ? "¡Casi! Premio consuelo. 🍻" : "Perdiste por fantasma. 🤌";
      const frase = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "Mala racha.";
      return message.reply(`🎰 **PATROCLO CASINO** 🎰\n[ ${s1} | ${s2} | ${s3} ]\n\n**Resultado:** ${res}\n*Tu frase:* "${frase}"`);
    }

    // 4. NEKOASK
    if (cmd === 'nekoask') {
      const gato = ["Miau (Sí)", "Fush (No)", "Prrr (Puede ser)", "Miau rancio (Ni ahí)"];
      return message.reply(`🐱 **Neko dice:** ${gato[Math.floor(Math.random() * gato.length)]}`);
    }

    // 5. BARDO
    if (cmd === 'bardo') return message.reply(["Fantasma", "Bobo", "Cerrá el orto, Tricky", "Andá a lavar los platos"][Math.floor(Math.random() * 4)]);

    // 6. CONFESIÓN
    if (cmd === 'confesion') {
      const t = args.join(" ");
      if (t) {
        memory.phrases.push(`[CONFESIÓN]: ${t}`);
        try { await message.delete(); } catch(e){}
        syncCloud(); return message.channel.send("🤫 Secreto guardado en la oscuridad.");
      } else {
        const confs = memory.phrases.filter(p => p.includes("[CONFESIÓN]"));
        const sel = (confs.length ? confs : memory.phrases)[Math.floor(Math.random() * (confs.length || memory.phrases.length))];
        return message.reply(`🤫 **Confesión:** ${sel.replace("[CONFESIÓN]: ", "")}`);
      }
    }

    // 7. MANTENIMIENTO
    if (cmd === 'stats') return message.reply(`📊 Atlas: ${mongoose.connection.readyState === 1 ? "ON" : "OFF"} | Memoria: ${memory.phrases.length} | Stickers: ${extras.stickers.length}`);
    if (cmd === 'pausa') { isPaused = true; return message.reply("Me fui a dormir."); }
    if (cmd === 'reanudar') { isPaused = false; return message.reply("Ya llegué perritas 🔥"); }
    if (cmd === 'reload' || cmd === 'reloadjson') {
       memory = validateJSON(FILES.memory, memory);
       extras = validateJSON(FILES.extras, extras);
       universe = validateJSON(FILES.universe, universe);
       return message.reply("♻️ Memoria refrescada.");
    }
    
    if (cmd === 'universo' || cmd === 'universefacts') {
      let av = universe.facts.filter(f => !universe.usedToday.includes(f));
      if (!av.length) return message.reply("🌌 **Bonus Tarántula:** En 30 Doradus viven las estrellas Wolf-Rayet!");
      const s = av[Math.floor(Math.random() * av.length)];
      universe.usedToday.push(s); saveFile(FILES.universe, universe);
      return message.reply(s);
    }
  }

  // Respuesta Random (15%)
  if (Math.random() < 0.15 && memory.phrases.length > 0 && !isPaused) {
    message.channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]);
  }
});

// --- REVIVIDOR (5 MIN) ---
setInterval(() => {
  if (isPaused || !lastChannelId || Date.now() - lastMessageTime < 300000) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel) {
    const r = Math.random() > 0.5 ? (universe.facts[Math.floor(Math.random() * universe.facts.length)]) : (memory.phrases[Math.floor(Math.random() * memory.phrases.length)]);
    if (r) channel.send(r).catch(() => {});
    lastMessageTime = Date.now();
  }
}, 60000);

client.login(process.env.TOKEN || process.env.BOT_TOKEN);
