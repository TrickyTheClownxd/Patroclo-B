import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import axios from 'axios';

// 1. SERVIDOR BÁSICO (Para que Render marque "Live")
http.createServer((req, res) => { 
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write("Patroclo-B B17.5 OMEGA ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

// 2. CONFIGURACIÓN DEL BOT
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
let usersColl;

// --- IDS Y CONFIG ---
const ID_CANAL_TEST = 'TU_ID_AQUI'; // Poné el ID de un canal para el grito de guerra
const ROLES_RANDOM = ["ID1", "ID2"]; // Pasame los IDs cuando puedas!

// 3. CONEXIÓN DB
async function connectDb() {
  try {
    await mongoClient.connect();
    usersColl = mongoClient.db('patroclo_bot').collection('users');
    console.log("✅ DB CONECTADA");
  } catch (e) {
    console.log("❌ ERROR DB:", e.message);
  }
}
connectDb();

// 4. EVENTOS DE DISCORD
client.on('ready', () => {
  console.log(`🤖 BOT ONLINE: ${client.user.tag}`);
  const canal = client.channels.cache.get(ID_CANAL_TEST);
  if (canal) canal.send("🔥 **PATROCLO-B ARRIBA.**");
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // Comando de prueba rápida
  if (msg.content.toLowerCase() === 'ping') return msg.reply('🏓 Pong!');

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'bal') {
    const user = await getUser(msg.author.id);
    msg.reply(`💰 Tenés **$${user.points}**.`);
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000 }; await usersColl.insertOne(u); }
  return u;
}

// 5. LOGIN CON DETECTOR DE ERRORES
client.login(process.env.TOKEN).catch(err => {
  console.error("❌ ERROR DE DISCORD:", err.message);
});