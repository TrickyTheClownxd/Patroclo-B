require('dotenv').config(); // Para que funcione si se corre local
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ======= CLIENTE DISCORD =======
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ======= EXPRESS PARA PINGS =======
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("🔥 Patroclo activo 🔥"));
app.listen(PORT, () => console.log(`Express corriendo en puerto ${PORT}`));

// ======= CARGA DE MEMORIA Y EXTRAS =======
let memory = { words: {}, phrases: [], emojis: [] };
let extras = { spaceData: [] };
let universe = { facts: [], usedToday: [] };

const memoryFile = path.join(__dirname, 'memory.json');
const extrasFile = path.join(__dirname, 'extras.json');
const universeFile = path.join(__dirname, 'universe.json');

if (fs.existsSync(memoryFile)) memory = require(memoryFile);
if (fs.existsSync(extrasFile)) extras = require(extrasFile);
if (fs.existsSync(universeFile)) universe = require(universeFile);

// ======= FUNCIONES =======
function saveAll() {
  fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
  fs.writeFileSync(extrasFile, JSON.stringify(extras, null, 2));
  fs.writeFileSync(universeFile, JSON.stringify(universe, null, 2));
}

function generatePhrase() {
  if (memory.phrases.length === 0) return "Patroclo no tiene nada que decir 😅";
  const idx = Math.floor(Math.random() * memory.phrases.length);
  return memory.phrases[idx];
}

function getSpaceFact() {
  const available = universe.facts.filter(f => !universe.usedToday.includes(f));
  if (available.length === 0) {
    const bonus = "🌠 Bonus: La Nebulosa de la Tarántula está en la Gran Nube de Magallanes y es una de las más activas en formación estelar.";
    return bonus;
  }
  const idx = Math.floor(Math.random() * available.length);
  const fact = available[idx];
  universe.usedToday.push(fact);

  if (available.length === 1 && extras.spaceData.length > 0) {
    const newFact = extras.spaceData.shift();
    universe.facts.push(newFact);
  }

  saveAll();
  return fact;
}

// ======= AUTO MESSAGES =======
let autoTalking = true;
setInterval(() => {
  if (!autoTalking) return;
  client.guilds.cache.forEach(guild => {
    const channel = guild.channels.cache.find(ch => ch.isTextBased());
    if (channel) channel.send(generatePhrase());
  });
}, 1000 * 60 * 2);

// ======= EVENTO MESSAGE =======
client.on('messageCreate', message => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    message.reply(generatePhrase());
  }

  const args = message.content.trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (command === '!pausar') {
    autoTalking = false;
    message.channel.send("Patroclo pausó los mensajes automáticos 😴");
  }

  if (command === '!reanudar') {
    autoTalking = true;
    message.channel.send("Patroclo reanudó los mensajes automáticos 🔥");
  }

  if (command === '!frase') {
    message.channel.send(generatePhrase());
  }

  if (command === '!espacio') {
    message.channel.send(getSpaceFact());
  }

  // ===== APRENDIZAJE =====
  const words = message.content.split(' ');
  words.forEach(word => memory.words[word] = (memory.words[word] || 0) + 1);
  memory.phrases.push(message.content);

  if