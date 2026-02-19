// index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const express = require('express');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const app = express();

// ======= EXPRESS ENDPOINT PARA PINGS =======
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🔥 Patroclo está vivo 24/7 🔥"));
app.listen(PORT, () => console.log(`Express corriendo en puerto ${PORT}`));

// ======= CARGA DE MEMORIA Y EXTRAS =======
let memory = { words: {}, phrases: [], emojis: [] };
let extras = { spaceData: [] };

if (fs.existsSync('memory.json')) memory = JSON.parse(fs.readFileSync('memory.json'));
if (fs.existsSync('extras.json')) extras = JSON.parse(fs.readFileSync('extras.json'));

// ======= FUNCIONES DE PATROCLO =======

// Guardar memoria periódicamente
function saveMemory() {
  fs.writeFileSync('memory.json', JSON.stringify(memory, null, 2));
  fs.writeFileSync('extras.json', JSON.stringify(extras, null, 2));
}

// Generar frase aleatoria usando Markov / palabras aprendidas
function generatePhrase() {
  if (memory.phrases.length === 0) return "Patroclo no tiene nada que decir 😅";
  const idx = Math.floor(Math.random() * memory.phrases.length);
  return memory.phrases[idx];
}

// Generar dato del espacio aleatorio
function getSpaceFact() {
  if (!extras.spaceData || extras.spaceData.length === 0) return "No hay datos disponibles.";
  const idx = Math.floor(Math.random() * extras.spaceData.length);
  return extras.spaceData[idx];
}

// ======= AUTOMESSAGES =======
let autoTalking = true;
setInterval(() => {
  if (!autoTalking) return;
  const guilds = client.guilds.cache;
  guilds.forEach(guild => {
    const channel = guild.channels.cache.find(ch => ch.isTextBased());
    if (channel) channel.send(generatePhrase());
  });
}, 1000 * 60 * 2); // cada 2 minutos

// ======= COMANDOS =======
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // ======= RESPONDER MENCIÓN =======
  if (message.mentions.has(client.user)) {
    message.reply(generatePhrase());
  }

  // ======= COMANDOS =======
  const args = message.content.trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (command === '!pausar') {
    autoTalking = false;
    message.channel.send("Patroclo ha pausado los mensajes automáticos 😴");
  }

  if (command === '!reanudar') {
    autoTalking = true;
    message.channel.send("Patroclo ha reanudado los mensajes automáticos 🔥");
  }

  if (command === '!frase') {
    message.channel.send(generatePhrase());
  }

  if (command === '!espacio') {
    message.channel.send(getSpaceFact());
  }

  // ======= APRENDIZAJE =======
  const words = message.content.split(' ');
  words.forEach(word => {
    memory.words[word] = (memory.words[word] || 0) + 1;
  });
  memory.phrases.push(message.content);

  // Guardar emojis usados
  message.emojis.cache.forEach(emoji => {
    if (!memory.emojis.includes(emoji.name)) memory.emojis.push(emoji.name);
  });

  saveMemory();
});

// ======= EVENTO READY =======
client.on('clientReady', () => {
  console.log(`${client.user.tag} está online como Patroclo🔥`);
});

// ======= LOGIN =======
client.login(process.env.TOKEN);