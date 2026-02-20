import fs from 'fs';
import http from 'http';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Servidor Keep-Alive para Railway
http.createServer((req, res) => { 
  res.write("Patroclo-B B01 esta ATR"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ]
});

// --- PERSISTENCIA Y BASES DE DATOS ---
const FILES = { memory: './memory.json', universe: './universe.json', extras: './extras.json' };
let db, universe, extras;
let lastChannelId = null, lastMessageTime = Date.now();

const loadData = () => {
  try {
    if (!fs.existsSync(FILES.memory)) fs.writeFileSync(FILES.memory, JSON.stringify({ phrases: [], users: {} }));
    if (!fs.existsSync(FILES.universe)) fs.writeFileSync(FILES.universe, JSON.stringify({ facts: ["La Nebulosa de la Tarántula es la región de formación estelar más brillante de nuestro vecindario galáctico."] }));
    if (!fs.existsSync(FILES.extras)) fs.writeFileSync(FILES.extras, JSON.stringify({ stickers: [] }));

    db = JSON.parse(fs.readFileSync(FILES.memory, 'utf8'));
    universe = JSON.parse(fs.readFileSync(FILES.universe, 'utf8'));
    extras = JSON.parse(fs.readFileSync(FILES.extras, 'utf8'));
    
    if (!db.users) db.users = {}; 
    console.log("✅ Bases de datos B01 vinculadas.");
  } catch (e) { console.error("❌ Error cargando JSON:", e); }
};
loadData();

const save = () => fs.writeFileSync(FILES.memory, JSON.stringify(db, null, 2));
const checkUser = (id) => { if (!db.users[id]) db.users[id] = { points: 500, lastDaily: 0 }; };

// --- EVENTO READY (ENTRADA TRIUNFAL OBLIGATORIA) ---
client.on('ready', () => {
  console.log(`🔥 ${client.user.tag} ONLINE - FASE B01`);

  const channel = client.channels.cache.find(ch => 
    ch.type === 0 && ch.permissionsFor(client.user).has("SendMessages")
  );

  if (channel) {
    channel.send("Ya llegué perritas 🔥. Escuchen bien: las versiones **V** fueron mi etapa Alfa, puro experimento mientras aprendía de ustedes. Ahora entramos en la **Fase B (Beta)** con el código **B01**. Soy más estable, más bardo y mi memoria está más picante que nunca. ¡A darle mecha!");
  }
});

// --- SISTEMA DE BIENVENIDA ---
client.on('guildMemberAdd', (member) => {
  const channel = member.guild.channels.cache.find(ch => ch.name === 'bienvenida' || ch.name === 'general');
  if (channel) {
    channel.send(`¡Bienvenido/a **${member.user.username}**! Soy Patroclo-B, la evolución. Tirate un \`!fase\` para entender qué onda el server.`);
  }
});

// --- LÓGICA DE MENSAJES Y COMANDOS ---
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  checkUser(msg.author.id);
  lastChannelId = msg.channel.id;
  lastMessageTime = Date.now();

  // Aprendizaje Automático (ADN B01)
  if (!msg.content.startsWith('!') && msg.content.length > 2) {
    if (!db.phrases.includes(msg.content)) { 
      db.phrases.push(msg.content); 
      save(); 
    }
  }

  // Menciones y Respuestas
  if (msg.mentions.has(client.user) || msg.content.toLowerCase().includes("patroclo")) {
    const rando = db.phrases[Math.floor(Math.random() * db.phrases.length)] || "Qué onda gato, acá estoy.";
    return msg.reply(rando);
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS OBLIGATORIOS ---
  
  if (cmd === 'fase') {
    return msg.reply("Fase B01 (Beta): Las versiones V ya fueron. Ahora mando yo con motor optimizado y memoria persistente.");
  }

  if (cmd === 'daily') {
    const now = Date.now();
    if (now - db.users[msg.author.id].lastDaily < 86400000) return msg.reply("❌ No seas manija, volvé mañana por tus puntos.");
    db.users[msg.author.id].points += 500;
    db.users[msg.author.id].lastDaily = now;
    save();
    return msg.reply("🎁 Reclamaste tus **500 puntos** diarios. ¡Usalos bien!");
  }

  if (cmd === 'perfil' || cmd === 'bal') {
    return msg.reply(`👤 **Usuario:** ${msg.author.username}\n💰 **Patro-Pesos:** ${db.users[msg.author.id].points}`);
  }

  if (cmd === 'suerte') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt <= 0 || amt > db.users[msg.author.id].points) return msg.reply("❌ Poné una cantidad válida, no te hagas el vivo.");
    const win = Math.random() > 0.5;
    db.users[msg.author.id].points += win ? amt : -amt;
    save();
    return msg.reply(win ? `✅ ¡Duplicaste! Tenés **${db.users[msg.author.id].points}**.` : `❌ Al horno. Te quedan **${db.users[msg.author.id].points}**.`);
  }

  if (cmd === 'bardo') {
    const b = ["¿Qué mirás, bobo?", "Cerrá el orto.", "Sos un descanso.", "Tomátela, salame.", "Flasheas confianza vos."];
    return msg.reply(b[Math.floor(Math.random()*b.length)]);
  }

  if (cmd === 'spoty') {
    return (Math.random() > 0.5) 
      ? msg.reply("🔥 **ATR:** https://open.spotify.com/track/perreo-viejo")
      : msg.reply(`🌌 **Dato Espacial:** ${universe.facts[Math.floor(Math.random()*universe.facts.length)]}`);
  }

  if (cmd === 'ayudacmd') {
    return msg.reply("📜 **MANUAL B01:**\n!fase, !daily, !perfil, !suerte [m], !bardo, !spoty, !stats, !reloadjson, !confesion, !nekoask");
  }

  if (cmd === 'stats') {
    return msg.reply(`📊 **ESTADO B01:**\n- Memoria: ${db.phrases.length} frases\n- Jugadores: ${Object.keys(db.users).length}`);
  }

  if (cmd === 'reloadjson') { 
    loadData(); 
    return msg.reply("✅ Bases de datos recargadas en caliente."); 
  }
});

// --- EL REVIVIDOR (CADA 5 MINUTOS) ---
setInterval(() => {
  if (!lastChannelId || Date.now() - lastMessageTime < 300000) return;
  const channel = client.channels.cache.get(lastChannelId);
  if (channel && db.phrases.length > 0) {
    channel.send(db.phrases[Math.floor(Math.random() * db.phrases.length)]);
  }
}, 300000);

client.login(process.env.TOKEN).catch(e => console.error("❌ Falló el Token:", e.message));
