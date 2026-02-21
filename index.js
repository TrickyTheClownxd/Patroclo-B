import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor Railway 24/7
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

const ID_PATROCLO_ORIGINAL = '974297735559806986'; 
const MI_ID_BOSS = '986680845031059526';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// Base de datos de la Tienda
const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil." },
  { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Proteccion contra bardo." },
  { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Acceso a zona premium." }
];

async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    await loadConfig();
    console.log("✅ Sistema ADN y DB Conectados");
  } catch (e) { console.log("❌ Error DB"); }
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
      const reporteHistorico = `
REPORTE HISTORICO DE EVOLUCION PATROCLO-B
ESTADO: OPERATIVO TOTAL | VERSION: B01.8

CRONOLOGIA:
- V 0.01: NACIMIENTO ADN.
- V 0.50: RESPUESTAS POR AZAR.
- V 1.00: ESTABILIZACION COMANDOS.
- B 01.0: MIGRACION MONGODB.
- B 01.2: SISTEMA ECONOMICO (PATRO-PESOS).
- B 01.5: MULTIMEDIA GIPHY Y HOROSCOPO.
- B 01.8: DUELOS 1VS1, TIENDA, SINCRO BOSS Y PERSISTENCIA.
`;
      await channel.send("```" + reporteHistorico + "```");
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

  // --- TIENDA Y COMPRA (AGREGADOS) ---
  if (cmd === 'tienda') {
    let lista = ITEMS_TIENDA.map(i => `ID: ${i.id} | **${i.nombre}** - 💰${i.precio}\n_${i.desc}_`).join('\n\n');
    return msg.reply(`🛒 **TIENDA PATROCLO**\n\n${lista}\n\nUsa \`!comprar [ID]\``);
  }

  if (cmd === 'comprar') {
    const itemID = parseInt(args[0]);
    const item = ITEMS_TIENDA.find(i => i.id === itemID);
    if (!item) return msg.reply("Ese item no existe, facha.");
    if (user.points < item.precio) return msg.reply("No te alcanza la guita.");

    await usersColl.updateOne({ userId: msg.author.id }, { 
      $inc: { points: -item.precio }, 
      $push: { inventario: item.nombre } 
    });
    return msg.reply(`✅ Compraste **${item.nombre}** por **${item.precio}**. ¡Quedaste facha!`);
  }

  // --- MISTICA ---
  if (cmd === 'bardo') {
    const f = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
    return msg.channel.send(f || "No hay bardo.");
  }

  if (cmd === 'gif' || cmd === 'foto') {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ')||'galaxy'}&limit=1`);
      return msg.reply(res.data.data[0]?.url || "Nada facha por acá.");
    } catch (e) { return msg.reply("Error API."); }
  }

  // --- DUELOS ---
  if (cmd === 'poker' || cmd === 'penal') {
    const mencion = msg.mentions.users.first();
    const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
    if (user.points < monto || monto <= 0) return msg.reply("Pobre detected.");
    if (mencion) {
      client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
      return msg.channel.send(`⚔️ **RETO:** ${mencion}, duelo de ${cmd} por **${monto}**. \`!aceptar\`.`);
    } else {
      const gano = Math.random() < 0.5;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
      return msg.reply(gano ? `✅ Ganaste **${monto}**.` : `💀 Perdiste **${monto}**.`);
    }
  }

  if (cmd === 'aceptar') {
    const reto = client.retos.get(msg.author.id);
    if (!reto) return msg.reply("Nadie te reto.");
    const win = Math.random() < 0.5;
    const g = win ? reto.retador : msg.author.id;
    const p = win ? msg.author.id : reto.retador;
    await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
    await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
    client.retos.delete(msg.author.id);
    return msg.channel.send(`🏆 **RESULTADO:** <@${g}> gano los **${reto.monto}**.`);
  }

  // --- AYUDACMD ---
  if (cmd === 'ayudacmd') {
    const embed = new EmbedBuilder()
      .setTitle('📜 BIBLIA PATROCLO-B (B01.8)')
      .setColor('#FF4500')
      .setDescription('**🎮 DUELOS:** !poker, !penal, !aceptar\n**💰 ECONOMIA:** !bal, !trabajar, !daily, !tienda, !comprar\n**🌌 MISTICA:** !spoty, !cuanto, !bardo, !gif\n**🛠️ SISTEMA:** !stats, !reload')
      .setImage(IMG_PATROCLO_FUERTE)
      .setFooter({ text: 'Patroclo-B | Musculo y ADN' });
    return msg.channel.send({ embeds: [embed] });
  }

  // (Mantenemos bal, daily, stats, reload, reloadjson...)
  if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}**.`);
  if (cmd === 'daily') {
    if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
    await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 300 }, $set: { lastDaily: Date.now() } });
    return msg.reply("💵 +300.");
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
