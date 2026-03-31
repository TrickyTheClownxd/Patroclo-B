import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

// Servidor para Render
http.createServer((req, res) => { 
  res.writeHead(200);
  res.end("PATROCLO OPERATIVO"); 
}).listen(process.env.PORT || 8080);

console.log("🚀 Iniciando sistema...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, // ESTO ES VITAL
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

client.on('ready', () => {
  console.log(`✅ LOGUEADO EN DISCORD COMO: ${client.user.tag}`);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.content.toLowerCase() === 'ping') msg.reply('Pong! 🏓');
});

async function start() {
  try {
    await mongoClient.connect();
    console.log("✅ DB CONECTADA");
    
    console.log("⏳ Intentando conectar a Discord...");
    await client.login(process.env.TOKEN);
  } catch (e) {
    console.error("❌ ERROR CRÍTICO:", e.message);
  }
}

start();