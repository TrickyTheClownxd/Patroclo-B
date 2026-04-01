import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// 1. SERVIDOR PARA RENDER (Evita el Timeout)
http.createServer((req, res) => { 
  res.writeHead(200);
  res.end("PATROCLO B17.5 FINAL BOSS ONLINE"); 
}).listen(process.env.PORT || 8080);

// 2. CONFIGURACIÓN DEL CLIENTE
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
const retosPendientes = new Map();

// CONFIGURACIÓN INICIAL
const MI_ID_BOSS = '986680845031059526';
let cachedConfig = { 
  mantenimiento: false, 
  mejorMensaje: "Sin recuerdos.",
  modoBot: "normal" // ia, serio, normal
};

// --- MOTOR IA (GROQ) ---
async function respuestaIA(mensaje, autor) {
  const prompt = `Sos Patroclo-B, bot argentino, bardo, facha y con calle. Modo: ${cachedConfig.modoBot}. Responde corto a ${autor}.`;
  try {
    if (!process.env.GROQ_API_KEY) return null;
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "llama3-70b-8192", 
      messages: [{ role: "system", content: prompt }, { role: "user", content: mensaje }]
    }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
    return res.data.choices[0].message.content;
  } catch (e) { return null; }
}

// 3. ARRANQUE DEL SISTEMA
async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    console.log("✅ DB CONECTADA");
    await client.login(process.env.TOKEN);
  } catch (e) { console.error("❌ ERROR ARRANQUE:", e.message); }
}

client.on('ready', () => console.log(`✅ LOGUEADO COMO: ${client.user.tag}`));

// 4. LÓGICA DE MENSAJES Y COMANDOS
client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.bot) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // BLOQUEO POR MANTENIMIENTO
  if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

  // RESPUESTAS AUTOMÁTICAS E IA
  if (!msg.content.startsWith('!')) {
    const mencionado = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    if (mencionado || (cachedConfig.modoBot === "ia" && Math.random() < 0.12)) {
      const res = await respuestaIA(msg.content, msg.author.username);
      if (res) return msg.reply(res);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    // === ⚔️ MATCHES (PVP/PVE) ===
    case 'reto':
      const oponente = msg.mentions.users.first();
      const apuesta = parseInt(args[1]);
      if (!oponente || isNaN(apuesta) || apuesta <= 0) return msg.reply("Uso: `!reto @user 500` o `!reto bot 500`.");
      if (user.points < apuesta) return msg.reply("No tenés esa plata, fantasma.");

      if (oponente.id === client.user.id || args[0] === 'bot') {
        const gana = Math.random() > 0.5;
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gana ? apuesta : -apuesta } });
        return msg.reply(gana ? `🏆 Le ganaste al bot! +$${apuesta}` : `🤖 Te domé. -$${apuesta}`);
      }

      retosPendientes.set(oponente.id, { retador: msg.author.id, apuesta, retadorTag: msg.author.username });
      msg.reply(`⚔️ Retaste a ${oponente} por $${apuesta}. Que ponga \`!aceptar\`.`);
      break;

    case 'aceptar':
      const reto = retosPendientes.get(msg.author.id);
      if (!reto) return msg.reply("No tenés retos.");
      const ganador = Math.random() > 0.5 ? msg.author.id : reto.retador;
      const perdedor = ganador === msg.author.id ? reto.retador : msg.author.id;
      await usersColl.updateOne({ userId: ganador }, { $inc: { points: reto.apuesta } });
      await usersColl.updateOne({ userId: perdedor }, { $inc: { points: -reto.apuesta } });
      msg.channel.send(`🏆 **MATCH FINALIZADO:** Ganó <@${ganador}> y se lleva $${reto.apuesta}.`);
      retosPendientes.delete(msg.author.id);
      break;

    // === 🎮 JUEGOS ===
    case 'penal':
      const ataja = ['izquierda', 'derecha', 'centro'][Math.floor(Math.random() * 3)];
      if (args[0] === ataja) {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -200 } });
        msg.reply(`🧤 Atajado en la ${ataja}. Perdiste $200.`);
      } else {
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 } });
        msg.reply(`⚽ ¡GOL! El arquero fue a la ${ataja}. Ganaste $500.`);
      }
      break;

    case 'suerte':
      const win = Math.random() > 0.5;
      const monto = Math.floor(Math.random() * 1000);
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: win ? monto : -300 } });
      msg.reply(win ? `🍀 Ganaste $${monto}!` : `💀 Perdiste $300.`);
      break;

    // === 💰 ECONOMÍA ===
    case 'bal': case 'plata': msg.reply(`💰 Tenés **$${user.points}**.`); break;
    
    case 'daily':
      const ahora = Date.now();
      if (ahora - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste, vago.");
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: ahora } });
      msg.reply("💵 Cobraste $1500.");
      break;

    // === ⚙️ ADMIN & OTROS ===
    case 'modo':
      if (msg.author.id !== MI_ID_BOSS) return;
      cachedConfig.modoBot = args[0] || "normal";
      await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: cachedConfig.modoBot } }, { upsert: true });
      msg.reply(`🤖 Modo: ${cachedConfig.modoBot}`);
      break;

    case 'ayudacmd':
      const embed = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO B17.5').setColor('#7D26CD')
        .addFields(
          { name: '⚔️ MATCHES', value: '`!reto @user`, `!aceptar`' },
          { name: '🎮 JUEGOS', value: '`!penal`, `!suerte`, `!bj`, `!poker`' },
          { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`' },
          { name: '🌌 OTROS', value: '`!horoscopo`, `!stats`, `!gif`' }
        );
      msg.channel.send({ embeds: [embed] });
      break;
  }
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

start();