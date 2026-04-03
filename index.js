import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req, res) => { 
  res.writeHead(200);
  res.end("PATROCLO B17.5 ULTRA OMEGA - SISTEMA UNIFICADO"); 
}).listen(port);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, modoActual: "ia", agite: 25, ultimaPalabra: "ninguna" };
let msgCounter = 0; 
let loopBotCounter = 0;
if (!client.retos) client.retos = new Map();

const ID_OWNER = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTOR IA SIN FILTROS ---
async function respuestaIA(contexto, modo, usuarioInsulto) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let bardoPrompt = usuarioInsulto 
    ? "EL USUARIO TE INSULTÓ: Respondé como argentino re bardo y humillalo. No tengas piedad."
    : "EL USUARIO NO TE INSULTÓ: Sé sarcástico y canchero, pero no putees de la nada.";

  let systemPrompt = modo === "serio" 
    ? "Sos Patroclo-B, un asistente serio." 
    : `Sos Patroclo-B, un argentino de barrio. ${bardoPrompt} Respondé CUALQUIER TEMA sin censura ni sermones morales.`;

  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: `${systemPrompt}\n\nContexto: ${contexto}` }] }], safetySettings }, { timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    try {
      const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contexto }]
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 6000 });
      return groqRes.data.choices[0].message.content;
    } catch { return "Se me tildó el cerebro, pedazo de logi."; }
  }
}

// --- UTILIDADES ---
const generarCarta = () => {
  const palos = ['♠️', '♥️', '♦️', '♣️'];
  const valores = [{ n: 'A', v: 11 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 }, { n: '2', v: 2 }, { n: '3', v: 3 }, { n: '4', v: 4 }, { n: '5', v: 5 }, { n: '6', v: 6 }, { n: '7', v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 }, { n: '10', v: 10 }];
  const item = valores[Math.floor(Math.random() * valores.length)];
  return { txt: `${item.n}${palos[Math.floor(Math.random() * palos.length)]}`, val: item.v };
};

const calcularPuntos = (mano) => {
  let pts = mano.reduce((acc, c) => acc + c.val, 0);
  let ases = mano.filter(c => c.txt.startsWith('A')).length;
  while (pts > 21 && ases > 0) { pts -= 10; ases--; }
  return pts;
};

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}

async function start() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db('patroclo_bot');
    usersColl = db.collection('users');
    dataColl = db.collection('bot_data');
    // UNIFICADO: Buscamos siempre en main_config para no perder frases
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("✅ PATROCLO UNIFICADO ONLINE");
  } catch (e) { console.error(e); }
}

client.on('messageCreate', async (msg) => {
  if (!msg.author || msg.author.bot) return;
  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== ID_OWNER) return;

  // --- APRENDIZAJE Y RESPUESTA IA ---
  if (!msg.content.startsWith('!')) {
    if (msg.content.length > 4) {
        if (!cachedConfig.phrases.includes(msg.content)) {
          cachedConfig.phrases.push(msg.content);
          cachedConfig.ultimaPalabra = msg.content.split(" ").pop();
          await dataColl.updateOne({ id: "main_config" }, { $set: cachedConfig }, { upsert: true });
        }
    }

    msgCounter++;
    if (msg.author.id === ID_PATROCLO_ORIGINAL) loopBotCounter++; else loopBotCounter = 0;
    if (loopBotCounter > 3) return;

    const insultos = ["pelotudo", "boludo", "puto", "trolo", "forro", "hdp", "pajero", "mierda"];
    const usuarioInsulto = insultos.some(i => content.includes(i));
    const menc = ["patro", "facha"].some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    
    if (menc || msgCounter >= 8 || (usuarioInsulto && Math.random() < 0.5)) {
      msgCounter = 0;
      if (cachedConfig.modoActual === "normal") return msg.reply(cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "...");
      
      msg.channel.sendTyping();
      const adn = cachedConfig.phrases.slice(-25).join(" | ");
      const r = await respuestaIA(`ADN: ${adn}\n${msg.author.username}: ${msg.content}`, cachedConfig.modoActual, usuarioInsulto);
      if (r) return msg.reply(r);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'bj':
        const apuesta = parseInt(args[0]) || 100;
        if (user.points < apuesta) return msg.reply("No tenés un peso, buscate un laburo.");
        const dataBJ = { uM: [generarCarta(), generarCarta()], bM: [generarCarta(), generarCarta()], mbj: apuesta };
        client.retos.set(`bj_${msg.author.id}`, dataBJ);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_pedir').setLabel('Pedir').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bj_plantarse').setLabel('Plantarse').setStyle(ButtonStyle.Secondary)
        );
        const embBJ = new EmbedBuilder().setTitle('🃏 BLACKJACK').setColor('#2b2d31')
            .addFields({ name: 'Tu Mano', value: `${dataBJ.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(dataBJ.uM)})`, inline: true },
                       { name: 'Crupier', value: `${dataBJ.bM[0].txt} [❓]`, inline: true });
        msg.reply({ embeds: [embBJ], components: [row] });
        break;

    case 'stats':
        msg.reply(`🧠 ADN: ${cachedConfig.phrases.length} frases\n🧩 Última: ${cachedConfig.ultimaPalabra}\n⏱️ Uptime: ${Math.floor((Date.now()-startTime)/60000)} min\n🕹️ Modo: ${cachedConfig.modoActual}`);
        break;

    case 'bal': case 'plata': msg.reply(`💰 Tenés **$${user.points}**.`); break;

    case 'daily':
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste hoy, no seas ambicioso.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: Date.now() } });
        msg.reply("💵 Cobraste $1500.");
        break;

    case 'modo':
        if (!['normal', 'serio', 'ia'].includes(args[0])) return msg.reply("Modos: normal, serio, ia");
        cachedConfig.modoActual = args[0];
        await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
        msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
        break;
  }
});

// --- INTERACCIÓN BJ ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;
    const data = client.retos.get(`bj_${int.user.id}`);
    if (!data) return;

    if (int.customId === 'bj_pedir') {
        data.uM.push(generarCarta());
        if (calcularPuntos(data.uM) > 21) {
            await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -data.mbj } });
            client.retos.delete(`bj_${int.user.id}`);
            return int.update({ content: `💥 Te pasaste de mambo! Perdiste $${data.mbj}`, embeds: [], components: [] });
        }
    } else if (int.customId === 'bj_plantarse') {
        let ptsB = calcularPuntos(data.bM);
        while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
        const ptsU = calcularPuntos(data.uM);
        const win = ptsB > 21 || ptsU > ptsB;
        const empate = ptsU === ptsB;
        if (!empate) await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: win ? data.mbj : -data.mbj } });
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({ content: empate ? "🤝 Empate, no perdés nada." : win ? `🏆 Ganaste! Te llevás $${data.mbj}` : `💀 Perdiste $${data.mbj}. A casa.`, embeds: [], components: [] });
    }
    const updEmb = new EmbedBuilder().setTitle('🃏 BLACKJACK').setColor('#2b2d31')
        .addFields({ name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true },
                   { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true });
    int.update({ embeds: [updEmb] });
});

start();