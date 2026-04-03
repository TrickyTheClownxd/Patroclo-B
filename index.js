// --- IMPORTS Y SETUP ---
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

// --- UTILIDADES (CARTAS / PUNTOS) ---
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
  let pts = mano.reduce((acc, c) => acc + c.val, 0);
  let ases = mano.filter(c => c.txt.startsWith('A')).length;
  while (pts > 21 && ases > 0) { pts -= 10; ases--; }
  return pts;
};

// --- DB / USUARIO ---
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
    const d = await dataColl.findOne({ id: "main_config" });
    if (d) cachedConfig = { ...cachedConfig, ...d };
    await client.login(process.env.TOKEN);
    console.log("✅ PATROCLO UNIFICADO ONLINE");
  } catch (e) { console.error(e); }
}

// --- LÓGICA DE MENSAJES (COMANDOS) ---
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
    // --- BLACKJACK ---
    case 'bj':
    case 'blackjack': {
        const apuesta = parseInt(args[0]) || 100;
        if (user.points < apuesta) return msg.reply("No tenés un peso, buscate un laburo.");
        const dataBJ = { uM: [generarCarta(), generarCarta()], bM: [generarCarta(), generarCarta()], mbj: apuesta };
        client.retos.set(`bj_${msg.author.id}`, dataBJ);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_pedir').setLabel('Pedir').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('bj_plantarse').setLabel('Plantarse').setStyle(ButtonStyle.Secondary)
        );
        const embBJ = new EmbedBuilder().setTitle('🃏 BLACKJACK').setColor('#2b2d31')
            .addFields(
              { name: 'Tu Mano', value: `${dataBJ.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(dataBJ.uM)})`, inline: true },
              { name: 'Crupier', value: `${dataBJ.bM[0].txt} [❓]`, inline: true }
            );
        msg.reply({ embeds: [embBJ], components: [row] });
        break;
    }

    // --- RULETA ---
    case 'ruleta': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");
        const apuesta = args[1]?.toLowerCase();
        if (!apuesta) return msg.reply("Tenés que elegir número o color (rojo/negro). Ej: !ruleta 100 rojo");

        client.retos.set(`ruleta_${msg.author.id}`, { monto, apuesta, status: 'playing' });

        const emb = new EmbedBuilder().setTitle('🎲 RULETA').setColor('#2b2d31')
          .addFields({ name: 'Apuesta', value: apuesta, inline: true }, { name: 'Monto', value: `${monto}`, inline: true });
        msg.reply({ embeds: [emb] });
        break;
    }

    // --- PÓKER (mano simple) ---
    case 'poker': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");
        const cartas = [];
        for (let i = 0; i < 5; i++) cartas.push(generarCarta());
        client.retos.set(`poker_${msg.author.id}`, { monto, cartas, status: 'playing' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('poker_seguir').setLabel('Seguir').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('poker_salir').setLabel('Salir').setStyle(ButtonStyle.Danger)
        );

        const emb = new EmbedBuilder().setTitle('♠️ PÓKER').setColor('#2b2d31')
          .addFields({ name: 'Tus cartas', value: cartas.map(c=>c.txt).join(" "), inline: true }, { name: 'Apuesta', value: `${monto} PP`, inline: true });
        msg.reply({ embeds: [emb], components: [row] });
        break;
    }

    // --- BINGO ---
    case 'bingo': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");
        const numeros = Array.from({ length: 75 }, (_, i) => i + 1);
        const carton = [];
        for (let i = 0; i < 25; i++) carton.push(numeros.splice(Math.floor(Math.random() * numeros.length), 1)[0]);
        client.retos.set(`bingo_${msg.author.id}`, { monto, carton, status: 'playing' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('bingo_seguir').setLabel('Seguir').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('bingo_salir').setLabel('Salir').setStyle(ButtonStyle.Danger)
        );

        const emb = new EmbedBuilder().setTitle('🔢 BINGO').setColor('#2b2d31')
          .setDescription(`Tu cartón: ${carton.join(" ")}`).setFooter({ text: `Apuesta: ${monto} PP` });
        msg.reply({ embeds: [emb], components: [row] });
        break;
    }

    // --- SLOTS / TRAGAMONEDAS ---
    case 'slots':
    case 'tragamonedas': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");
        const symbols = ['🍒','🍋','🔔','⭐','💎'];
        const spin = () => symbols[Math.floor(Math.random() * symbols.length)];
        const resultado = [spin(), spin(), spin()];
        let win = false;
        let payout = 0;
        if (resultado[0] === resultado[1] && resultado[1] === resultado[2]) { win = true; payout = monto * 5; } // triple
        else if (resultado[0] === resultado[1] || resultado[1] === resultado[2] || resultado[0] === resultado[2]) { win = true; payout = monto * 2; } // doble

        if (win) await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: payout } });
        else await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('slots_seguir').setLabel('Seguir').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('slots_salir').setLabel('Salir').setStyle(ButtonStyle.Danger)
        );

        const emb = new EmbedBuilder().setTitle('🎰 TRAGAMONEDAS').setColor('#2b2d31')
          .setDescription(`Resultado: ${resultado.join(" ")}`)
          .addFields(
            { name: 'Ganaste?', value: win ? `Sí — Ganaste $${payout}` : `No — Perdiste $${monto}`, inline: true },
            { name: 'Apuesta', value: `${monto} PP`, inline: true }
          );
        msg.reply({ embeds: [emb], components: [row] });
        break;
    }

    // --- DADOS (Craps simplificado) ---
    case 'dados':
    case 'craps': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");
        const dado1 = Math.floor(Math.random() * 6) + 1;
        const dado2 = Math.floor(Math.random() * 6) + 1;
        const total = dado1 + dado2;
        let resultado;
        let delta = 0;
        if (total === 7 || total === 11) { resultado = "¡Ganaste!"; delta = monto; }
        else if ([2,3,12].includes(total)) { resultado = "Perdiste"; delta = -monto; }
        else { resultado = "Neutral, tirá de nuevo..."; delta = 0; }

        if (delta !== 0) await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: delta } });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('dados_seguir').setLabel('Seguir').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('dados_salir').setLabel('Salir').setStyle(ButtonStyle.Danger)
        );

        const emb = new EmbedBuilder().setTitle('🎲 DADOS').setColor('#2b2d31')
          .setDescription(`Tiraste: 🎲 ${dado1} + ${dado2} = ${total}\n${resultado}`)
          .setFooter({ text: `Apuesta: ${monto} PP` });
        msg.reply({ embeds: [emb], components: [row] });
        break;
    }

    // --- ARCADE POKER / BALATRO (comando !🃏) ---
    case '🃏':
    case 'balatro':
    case 'bal': {
        const monto = parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("No tenés un peso, buscate un laburo.");

        const cartas = [];
        for (let i = 0; i < 5; i++) cartas.push(generarCarta());
        const poderes = [
          { id: 'x2', nombre: "Multiplicador x2", efecto: "Duplica tu ganancia si ganás." },
          { id: 'extra', nombre: "Carta Extra", efecto: "Robás una carta adicional." },
          { id: 'plus5', nombre: "Suma +5", efecto: "Agrega 5 puntos a tu mano." }
        ];
        const cartaEspecial = poderes[Math.floor(Math.random() * poderes.length)];

        client.retos.set(`balatro_${msg.author.id}`, { monto, cartas, cartaEspecial, used: false, status: 'playing' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('balatro_usar').setLabel('Usar carta especial').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('balatro_seguir').setLabel('Seguir').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('balatro_salir').setLabel('Salir').setStyle(ButtonStyle.Danger)
        );

        const emb = new EmbedBuilder().setTitle('🃏 ARCADE POKER').setColor('#2b2d31')
          .addFields(
            { name: 'Tus cartas', value: cartas.map(c=>c.txt).join(" "), inline: true },
            { name: 'Carta especial', value: `${cartaEspecial.nombre} — ${cartaEspecial.efecto}`, inline: true },
            { name: 'Apuesta', value: `${monto} PP`, inline: true }
          );
        msg.reply({ embeds: [emb], components: [row] });
        break;
    }

    // --- STATS / OTRAS ---
    case 'stats': {
        msg.reply(`🧠 ADN: ${cachedConfig.phrases.length} frases\n🧩 Última: ${cachedConfig.ultimaPalabra}\n⏱️ Uptime: ${Math.floor((Date.now()-startTime)/60000)} min\n🕹️ Modo: ${cachedConfig.modoActual}`);
        break;
    }

    case 'plata': case 'bal': {
        msg.reply(`💰 Tenés **$${user.points}**.`);
        break;
    }

    case 'daily': {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste hoy, no seas ambicioso.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: Date.now() } });
        msg.reply("💵 Cobraste $1500.");
        break;
    }

    case 'modo': {
        if (!['normal', 'serio', 'ia'].includes(args[0])) return msg.reply("Modos: normal, serio, ia");
        cachedConfig.modoActual = args[0];
        await dataColl.updateOne({ id: "main_config" }, { $set: { modoActual: args[0] } });
        msg.reply(`🕹️ Modo: **${args[0].toUpperCase()}**`);
        break;
    }

    default:
      // comando no reconocido
      break;
  }
});

// --- INTERACCIONES / BOTONES ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;

    const uid = int.user.id;
    const cid = int.customId;

    // --- BLACKJACK ---
    if (cid.startsWith('bj_')) {
        const data = client.retos.get(`bj_${uid}`);
        if (!data) return int.reply({ content: "No tenés una partida activa de BJ.", ephemeral: true });

        if (cid === 'bj_pedir') {
            data.uM.push(generarCarta());
            if (calcularPuntos(data.uM) > 21) {
                await usersColl.updateOne({ userId: uid }, { $inc: { points: -data.mbj } });
                client.retos.delete(`bj_${uid}`);
                return int.update({ content: `💥 Te pasaste de mambo! Perdiste $${data.mbj}`, embeds: [], components: [] });
            }
            const updEmb = new EmbedBuilder().setTitle('🃏 BLACKJACK').setColor('#2b2d31')
              .addFields(
                { name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true },
                { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true }
              );
            return int.update({ embeds: [updEmb] });
        }

        if (cid === 'bj_plantarse') {
            let ptsB = calcularPuntos(data.bM);
            while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
            const ptsU = calcularPuntos(data.uM);
            const win = ptsB > 21 || ptsU > ptsB;
            const empate = ptsU === ptsB;
            if (!empate) await usersColl.updateOne({ userId: uid }, { $inc: { points: win ? data.mbj : -data.mbj } });
            client.retos.delete(`bj_${uid}`);
            return int.update({ content: empate ? "🤝 Empate, no perdés nada." : win ? `🏆 Ganaste! Te llevás $${data.mbj}` : `💀 Perdiste $${data.mbj}. A casa.`, embeds: [], components: [] });
        }
    }

    // --- RULETA (resolución inmediata al presionar cualquier botón de confirmación) ---
    if (cid === 'ruleta_spin') {
        const data = client.retos.get(`ruleta_${uid}`);
        if (!data) return int.reply({ content: "No tenés una apuesta de ruleta activa.", ephemeral: true });
        const result = Math.floor(Math.random() * 37); // 0-36
        const color = result === 0 ? 'verde' : (result % 2 === 0 ? 'negro' : 'rojo');
        let win = false;
        let payout = 0;
        if (!isNaN(parseInt(data.apuesta)) && parseInt(data.apuesta) === result) { win = true; payout = data.monto * 35; }
        else if (data.apuesta === color) { win = true; payout = data.monto * 2; }

        if (win) await usersColl.updateOne({ userId: uid }, { $inc: { points: payout } });
        else await usersColl.updateOne({ userId: uid }, { $inc: { points: -data.monto } });

        client.retos.delete(`ruleta_${uid}`);
        return int.update({ content: `La ruleta cayó en **${result} (${color})**. ${win ? `Ganaste $${payout}` : `Perdiste $${data.monto}`}`, embeds: [], components: [] });
    }

    // --- POKER botones ---
    if (cid === 'poker_seguir' || cid === 'poker_salir') {
        const data = client.retos.get(`poker_${uid}`);
        if (!data) return int.reply({ content: "No tenés una partida de póker activa.", ephemeral: true });
        if (cid === 'poker_salir') { client.retos.delete(`poker_${uid}`); return int.update({ content: "🚪 Saliste de la mesa de póker.", embeds: [], components: [] }); }
        // Seguir: hacemos una resolución simple: si hay par/trio/triple etc.
        const ranks = data.cartas.map(c => c.txt.replace(/[♠️♥️♦️♣️]/g, '').replace('10','T'));
        const counts = {};
        ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
        const maxCount = Math.max(...Object.values(counts));
        let win = false, payout = 0;
        if (maxCount === 5) { win = true; payout = data.monto * 50; }
        else if (maxCount === 4) { win = true; payout = data.monto * 25; }
        else if (maxCount === 3) { win = true; payout = data.monto * 5; }
        else if (maxCount === 2) { win = true; payout = data.monto * 2; }

        if (win) await usersColl.updateOne({ userId: uid }, { $inc: { points: payout } });
        else await usersColl.updateOne({ userId: uid }, { $inc: { points: -data.monto } });

        client.retos.delete(`poker_${uid}`);
        return int.upd