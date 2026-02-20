import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// --- SERVER ---
http.createServer((req, res) => { res.write("Patroclo-B B01 Online"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const FILES = { memory: './memory.json', universe: './universe.json', extras: './extras.json' };
let memory, universe, extras;
let lastChannelId = null, lastMessageTime = Date.now(), botPaused = false;

const loadData = () => {
  try {
    memory = JSON.parse(fs.readFileSync(FILES.memory, 'utf8'));
    universe = JSON.parse(fs.readFileSync(FILES.universe, 'utf8'));
    extras = JSON.parse(fs.readFileSync(FILES.extras, 'utf8'));
  } catch (e) { console.error("Revisá que los .json existan"); }
};
loadData();

// --- HABLA SAGRADA (Menciones, Respuestas, Revividor) ---
const handleHabla = async (msg) => {
  if (botPaused) return;
  const isMentioned = msg.mentions.has(client.user) || msg.content.toLowerCase().includes("patroclo");
  const isReplyToMe = msg.reference && (await msg.channel.messages.fetch(msg.reference.messageId)).author.id === client.user.id;

  if (isMentioned || isReplyToMe) {
    const r = memory.phrases[Math.floor(Math.random() * memory.phrases.length)] || "qué onda";
    return msg.reply(r);
  }
};

client.on('ready', () => {
  const channel = client.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(client.user).has("SendMessages"));
  if (channel) {
    channel.send("Ya llegué perritas 🔥. Las versiones **V** fueron mi etapa Alfa. Ahora entramos en la **Fase B (Beta)** con el código **B01**. ¡A darle mecha!");
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  lastChannelId = msg.channel.id; lastMessageTime = Date.now();

  // Aprendizaje automático
  if (!msg.content.startsWith('!') && msg.content.length > 2 && !botPaused) {
    if (!memory.phrases.includes(msg.content)) {
      memory.phrases.push(msg.content);
      fs.writeFileSync(FILES.memory, JSON.stringify(memory, null, 2));
    }
  }

  if (!msg.content.startsWith('!')) return await handleHabla(msg);

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS ---
  if (cmd === 'ayudacmd') {
    return msg.reply(`📜 **BIBLIA DE COMANDOS - B01**\n\n**💰 ECONOMÍA:** !perfil, !daily, !suerte [m], !ruleta [m][c/n], !transferir @u [m].\n**🔮 MÍSTICA:** !spoty (50/50), !bola8 [p], !nekoask [p], !horoscopo, !universefacts.\n**🖕 SOCIAL:** !bardo (Argento), !confesion [t], !gif/!foto.\n**🛠️ ADMIN:** !stats, !reload, !reloadjson (Obligatorio), !pausa/!reanudar.`);
  }

  if (cmd === 'reloadjson') { loadData(); return msg.reply("✅ **Archivos JSON recargados.**"); }
  
  if (cmd === 'spoty') {
    if (Math.random() > 0.5) {
      const reggaeton = ["link_reggaeton_viejo_1", "link_reggaeton_viejo_2"];
      return msg.reply(`🔥 **Perreo viejo para activar:** ${reggaeton[Math.floor(Math.random()*reggaeton.length)]}`);
    } else {
      const facts = ["Nebulosa Tarántula proyectaría sombras...", "R136 tiene estrellas gigantes..."];
      return msg.reply(`${facts[Math.floor(Math.random()*facts.length)]}\n🎧 **Viaje espacial:** link_psicodelico`);
    }
  }

  if (cmd === 'bardo') {
    const insultos = ["¿Qué te hacés el loco, fantasma?", "Sos un descanso, flaco.", "Cerrá el orto, bobo."];
    return msg.reply(insultos[Math.floor(Math.random()*insultos.length)]);
  }

  // Resto de lógica (!bola8, !stats, etc.)
});

// --- REVIVIDOR 5 MIN ---
setInterval(() => {
  if (botPaused || !lastChannelId || Date.now() - lastMessageTime < 300000) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel && memory.phrases.length > 0) {
    channel.send(memory.phrases[Math.floor(Math.random() * memory.phrases.length)]);
    lastMessageTime = Date.now();
  }
}, 60000);

client.login(process.env.BOT_TOKEN);
