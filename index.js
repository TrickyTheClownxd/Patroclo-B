import fs from 'fs';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Archivos JSON
const MEMORY_FILE = './memory.json';
const EXTRAS_FILE = './extras.json';
const UNIVERSE_FILE = './universe.json';

// Función para validar y crear JSON base
function validateJSON(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[INFO] ${filePath} no existe. Creando archivo con datos base.`);
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) throw new Error('Archivo vacío');
    return JSON.parse(raw);
  } catch (error) {
    console.log(`[WARN] ${filePath} corrupto o inválido. Reemplazando con base segura.`);
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

// Datos base seguros
const baseMemory = { words: {}, phrases: [], emojis: [] };
const baseExtras = { emojis: [], customEmojis: [], stickers: [], spaceData: [] };
const baseUniverse = { facts: [], usedToday: [] };

// Cargar archivos con validación
const memory = validateJSON(MEMORY_FILE, baseMemory);
const extras = validateJSON(EXTRAS_FILE, baseExtras);
const universe = validateJSON(UNIVERSE_FILE, baseUniverse);

// Evento ready
client.on('ready', () => {
  console.log(`Bot listo! Memory: ${Object.keys(memory.words).length} palabras, Extras: ${extras.spaceData.length} datos, Universe: ${universe.facts.length} hechos.`);
});

// Aquí van tus comandos, Markov, universe, etc.

// Token desde variable de Railways
client.login(process.env.BOT_TOKEN);