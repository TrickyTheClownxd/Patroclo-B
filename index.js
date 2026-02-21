import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para Railway
http.createServer((req, res) => { 
  res.write("Patroclo-B B01.8 SISTEMA GALACTICO ONLINE"); 
  res.end(); 
}).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], universeFacts: [], lastChannelId: null };
if (!client.retos) client.retos = new Map();

let statsSesion = { comandosUsados: 0, inicio: Date.now() };

// IDENTIDADES SAGRADAS
const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg'; // Usá el link directo de tu imagen

const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil galáctico." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección contra bardo aleatorio." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Acceso a zona de mística premium." }
];

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    await loadConfig();
    console.log("✅ Motor ADN y MongoDB en línea.");
  } catch (e) { console.log("❌ Error en la conexión DB."); }
}

async function loadConfig() {
  const dbData = await dataColl.findOne({ id: "main_config" });
  if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
}

connectDb();

// --- BIENVENIDA Y REPORTE DE VERSIONES ---
client.once('ready', async () => {
  if (cachedConfig.lastChannelId) {
    const channel = await client.channels.fetch(cachedConfig.lastChannelId).catch(() => null);
    if (channel) {
      await channel.send("ya llegué perritas 🔥");
      const reporte = `
REPORTE HISTORICO DE EVOLUCION PATROCLO-B
ESTADO: OPERATIVO TOTAL | VERSION: B01.8

CRONOLOGIA:
- V 0.01: NACIMIENTO ADN Y MOTOR DE APRENDIZAJE.
- V 0.50: RESPUESTAS AUTOMATICAS Y AZAR.
- V 1.00: ESTABILIZACION DE COMANDOS BASICOS.
- B 01.0: MIGRACION COMPLETA A MONGODB CLOUD.
- B 01.2: SISTEMA ECONOMICO Y LABURO ACTIVO.
- B 01.5: MULTIMEDIA GIPHY API Y HOROSCOPO.
- B 01.8: DUELOS 1VS1 (POKER/PENAL), TIENDA, SINCRO BOSS Y PERSISTENCIA.
`;
      await channel.send("```" + reporte + "```");
    }
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL) return;

  if (cachedConfig.lastChannelId !== msg.channel.id) {
    cachedConfig.lastChannelId = msg.channel.id;
    await dataColl.updateOne({ id: "main_config" }, { $set: { lastChannelId: msg.channel.id } }, { upsert: true });
  }

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  // ADN: APRENDIZAJE Y HABLA AUTOMATICA
  if (!msg.author.bot && !content.startsWith('!') && msg.content.length > 3) {
    if (!cachedConfig.phrases.includes(msg.content)) {
      await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      cachedConfig.phrases.push(msg.content);
    }
    const apodos = ["patroclo", "patro", "bot", "facha"];
    if (apodos.some(a => content.includes(a)) || msg.mentions.has(client.user.id) || Math.random() < 0.15) {
      if (cachedConfig.phrases.length > 0) {
        return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
      }
    }
  }

  if (!msg.content.startsWith('!')) return;
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();
  statsSesion.comandosUsados++;

  // --- TIENDA Y COMPRA ---
  if (cmd === 'tienda') {
    let lista = ITEMS_TIENDA.map(i => `ID: ${i.id} | **${i.nombre}** - 💰${i.precio}\n_${i.desc}_`).join('\n\n');
    return msg.reply(`🛒 **TIENDA PATROCLO**\n\n${lista}\n\nUsa \`!comprar [ID]\``);
  }

  if (cmd === 'comprar') {
    const itemID = parseInt(args[0]);
    const item = ITEMS_TIENDA.find(i => i.id === itemID);
    if (!item) return msg.reply("Ese ID no existe.");
    if (user.points < item.precio) return msg.reply("No tenés guita suficiente.");

    await usersColl.updateOne({ userId: msg.author.id }, { 
      $inc: { points: -item.precio }, 
      $push: { inventario: item.nombre } 
    });
    return msg.reply(`✅ Compraste **${item.nombre}**. ¡Nivel de facha aumentado!`);
  }

  // --- MISTICA Y BARDO ---
  if (cmd === 'bardo') {
    const f = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(f || "No hay bardo en el tanque.");
  }

  if (cmd === 'gif' || cmd === 'foto') {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'facha'}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "No encontré nada.");
    } catch (e) { return msg.reply("Error en la mística visual."); }
  }

  // --- DUELOS 1VS1 ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("No tenés esa plata.");
    if (mencion) {
      if (mencion.id === msg.author.id) return msg.reply("No te podés jugar a vos mismo.");
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **RETO:** ${mencion}, duelo de ${cmd} por **${monto}**. Usa \`!aceptar\`.`);
    } else {
      const gano = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
      return msg.reply(gano ? `✅ ¡Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("No tenés retos pendientes.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **FINAL:** <@${g}> ganó los **${reto.monto}** en el duelo.`);
  }

  // --- AYUDACMD CON IMAGEN ---
  if (cmd === 'ayudacmd') {
    const embed = new EmbedBuilder()
      .setTitle('📜 BIBLIA PATROCLO-B (B01.8)')
      .setColor('#7D26CD')
      .setDescription('**🎮 DUELOS:** !poker, !penal, !aceptar\n**💰 ECONOMIA:** !bal, !trabajar, !daily, !tienda, !comprar\n**🌌 MISTICA:** !spoty, !cuanto, !bardo, !gif\n**🛠️ SISTEMA:** !stats, !reload')
      .setImage(IMG_PATROCLO_FUERTE)
      .setFooter({ text: 'Patroclo-B | Versión Final B01.8' });
    return msg.channel.send({ embeds: [embed] });
  }

  // --- ECONOMIA Y SISTEMA ---
  if (cmd === 'bal') return msg.reply(`💰 Billetera: **${user.points}** Patro-Pesos.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Ya pediste tu bono, volvé mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +300 depositados.");
  }
  if (cmd === 'stats') {
    const uptime = Math.floor((Date.now() - statsSesion.inicio) / 60000);
    return msg.reply("```" + `📊 STATS B01.8\n- ADN Frases: ${cachedConfig.phrases.length}\n- Uptime: ${uptime}m\n- MongoDB: Online ✅` + "```");
  }

  // --- BOSS ONLY ---
  if (cmd === 'reloadjson' && msg.author.id === MI_ID_BOSS) {
    try {
      const extra = JSON.parse(fs.readFileSync('./extras.json', 'utf8'));
      await dataColl.updateOne({ id: "main_config" }, { $set: { phrases: extra.phrases } }, { upsert: true });
      await loadConfig();
      return msg.reply("♻️ ADN Sincronizado, Boss.");
    } catch (e) { return msg.reply("❌ Error leyendo JSON."); }
  }
});

async function getUser(id) {
  let user = await usersColl.findOne({ userId: id });
  if (!user) {
    user = { userId: id, points: 500, lastDaily: 0, lastWork: 0, inventario: [] };
    await usersColl.insertOne(user);
  }
  return user;
}

client.login(process.env.TOKEN);
