import fs from 'fs';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Archivos JSON
const MEMORY_FILE = './memory.json';
const EXTRAS_FILE = './extras.json';
const UNIVERSE_FILE = './universe.json';

// Cargar archivos seguros
let memory = {};
let extras = {};
let universe = {};

function loadFiles() {
  memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8') || '{"words":{},"phrases":[],"emojis":[]}');
  extras = JSON.parse(fs.readFileSync(EXTRAS_FILE, 'utf8') || '{"emojis":[],"customEmojis":[],"stickers":[],"spaceData":[]}');
  universe = JSON.parse(fs.readFileSync(UNIVERSE_FILE, 'utf8') || '{"facts":[],"usedToday":[]}');
}

loadFiles();

// Evento de inicio
client.on('clientReady', () => {
  console.log(`Bot listo! Memory: ${Object.keys(memory.words).length} palabras, Extras: ${extras.spaceData.length} datos, Universe: ${universe.facts.length} hechos.`);
});

// Aquí van tus comandos, Markov, universe, etc.

client.login(process.env.BOT_TOKEN);