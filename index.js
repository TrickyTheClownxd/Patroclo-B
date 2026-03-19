import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { res.write("Patroclo-B B09.5 OMEGA ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = { 
  phrases: [], 
  universeFacts: [],
  phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "El bardo es para Giles."], 
  lastChannelId: null, 
  mantenimiento: false,
  modoBot: "ia" 
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

const ITEMS_TIENDA = [
  { id: 1, nombre: "Rango Facha", precio: 5000 },
  { id: 2, nombre: "Escudo Galactico", precio: 2500 },
  { id: 3, nombre: "VIP Pass", precio: 10000 }
];

// --- LÓGICA DE CARTAS ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [
    { n: 'A', v: 11 }, { n: '2', v: 2 }, { n: '3', v: 3 }, { n: '4', v: 4 }, { n: '5', v: 5 },
    { n: '6', v: 6 }, { n: '7', v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 }, { n: '10', v: 10 },
    { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }
  ];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

const calcularPuntos = (mano) => {
  let puntos = mano.reduce((acc, c) => acc + c.val, 0);
  let ases = mano.filter(c => c.txt.startsWith('A')).length;
  while (puntos > 21 && ases > 0) { puntos -= 10; ases--; }
  return puntos;
};

// --- MOTORES ---
async function respuestaIA(contexto) {
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

// --- DB ---
async function connectDb() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db('patroclo_bot');
    usersColl = database.collection('users');
    dataColl = database.collection('bot_data');
    const dbData = await dataColl.findOne({ id: "main_config" });
    if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
    console.log("✅ SISTEMA OMEGA B09.5 CONECTADO");
  } catch (e) { console.log("❌ Error DB"); }
}
connectDb();

// --- MENSAJES ---
client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // ADN y Social (25%)
  if (!msg.content.startsWith('!')) {
    if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }
    const menc = content.includes("patroclo") || msg.mentions?.has(client.user.id);
    const esReply = msg.reference && (await msg.channel.messages.fetch(msg.reference.messageId)).author.id === client.user.id;
    if (menc || esReply || Math.random() < 0.25) {
      if (cachedConfig.modoBot === "ia") {
        const adn = cachedConfig.phrases.slice(-30).join(" | ");
        const r = await respuestaIA(`Patroclo-B facha. ADN: ${adn}. Responde a ${msg.author.username}: ${msg.content}`);
        if (r) return msg.reply(r);
      }
      return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "...");
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- BLACKJACK COMMAND ---
  if (cmd === 'bj' || cmd === 'blackjack') {
    const monto = parseInt(args[0]) || 500;
    if (user.points < monto) return msg.reply("No tenés ni para el bondi, menos para apostar.");
    
    const manoU = [generarCarta(), generarCarta()];
    const manoB = [generarCarta(), generarCarta()];
    
    client.retos.set(`bj_${msg.author.id}`, { monto, manoU, manoB, status: 'playing' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_pedir').setLabel('Pedir 🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_plantarse').setLabel('Plantarse ✋').setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('🃏 BLACKJACK TABLE')
      .setColor('#2b2d31')
      .addFields(
        { name: 'Tu Mano', value: `${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`, inline: true },
        { name: 'Crupier', value: `${manoB[0].txt} [❓]`, inline: true }
      ).setFooter({ text: `Apuesta: ${monto} PP` });

    return msg.reply({ embeds: [embed], components: [row] });
  }

  // --- STATS CON PROMEDIO ---
  if (cmd === 'stats') {
    const promedio = cachedConfig.phrases.length ? (cachedConfig.phrases.join(" ").split(" ").length / cachedConfig.phrases.length).toFixed(2) : 0;
    const e = new EmbedBuilder().setTitle("📊 PATRO-STATS").setColor("#00ffcc")
      .addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
        { name: '📈 Léxico', value: `${promedio} p/f`, inline: true },
        { name: '🤖 IA', value: cachedConfig.modoBot.toUpperCase(), inline: true }
      );
    return msg.reply({ embeds: [e] });
  }

  // --- NOTICIAS BOSS ---
  if (cmd === 'noticias' && msg.author.id === MI_ID_BOSS) {
    const e = new EmbedBuilder().setTitle("🗞️ PATRO-NEWS B09.5").setColor("#7D26CD")
      .setDescription("Se activó el Blackjack con IA y el sistema de conteo de léxico.");
    return msg.channel.send({ content: "@everyone", embeds: [e] });
  }
});

// --- INTERACCIONES BLACKJACK ---
client.on('interactionCreate', async (int) => {
  if (!int.isButton()) return;
  const gameKey = `bj_${int.user.id}`;
  const game = client.retos.get(gameKey);
  if (!game) return;

  let userPts = calcularPuntos(game.manoU);

  if (int.customId === 'bj_pedir') {
    game.manoU.push(generarCarta());
    userPts = calcularPuntos(game.manoU);
    if (userPts > 21) {
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -game.monto } });
      client.retos.delete(gameKey);
      return int.update({ content: `💥 **TE PASASTE!** (${userPts}). Perdiste ${game.monto} PP.`, embeds: [], components: [] });
    }
  }

  if (int.customId === 'bj_plantarse' || userPts === 21) {
    let dealerPts = calcularPuntos(game.manoB);
    while (dealerPts < 17) {
      game.manoB.push(generarCarta());
      dealerPts = calcularPuntos(game.manoB);
    }
    
    let resultado = "";
    if (dealerPts > 21 || userPts > dealerPts) {
      resultado = `🏆 **GANASTE!** Cobraste **${game.monto} PP**.`;
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: game.monto } });
    } else if (dealerPts === userPts) {
      resultado = "🤝 **EMPATE.** Se te devuelve la plata.";
    } else {
      resultado = `💀 **PERDISTE.** El Crupier gana con ${dealerPts}.`;
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -game.monto } });
    }
    client.retos.delete(gameKey);
    return int.update({ 
      content: `${resultado}\nTu: ${userPts} | Dealer: ${dealerPts}\n[${game.manoB.map(c=>c.txt).join(" ")}]`, 
      embeds: [], components: [] 
    });
  }

  const upEmbed = new EmbedBuilder().setTitle('🃏 BLACKJACK TABLE').setColor('#2b2d31')
    .addFields(
      { name: 'Tu Mano', value: `${game.manoU.map(c=>c.txt).join(" ")} (${userPts})`, inline: true },
      { name: 'Crupier', value: `${game.manoB[0].txt} [❓]`, inline: true }
    );
  await int.update({ embeds: [upEmbed] });
});

async function getUser(id) {
  if (!usersColl) return { points: 0 };
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
  return u;
}

client.login(process.env.TOKEN);