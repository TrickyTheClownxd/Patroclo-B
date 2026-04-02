import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

http.createServer((req, res) => { res.write("PATROCLO B17.5 ULTRA OMEGA ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;
let cachedConfig = { phrases: [], mantenimiento: false, modoBot: "ia", mejorMensaje: "Sin recuerdos." };
let msgCounter = 0; 
let loopBotCounter = 0;
if (!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- LÓGICA DE JUEGOS ---
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

async function respuestaIA(contexto) {
  try {
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
      { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 8000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
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
  } catch (e) { console.log("Error DB"); }
}

// --- INTERACCIONES BOTONES (Blackjack) ---
client.on('interactionCreate', async (int) => {
  if (!int.isButton()) return;
  const data = client.retos.get(`bj_${int.user.id}`);
  if (!data) return int.reply({ content: "Partida no encontrada.", ephemeral: true });

  if (int.customId === 'bj_pedir') {
    data.uM.push(generarCarta());
    if (calcularPuntos(data.uM) > 21) {
      await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: -data.mbj } });
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({ content: `💥 **Te pasaste!** Perdiste $${data.mbj}.`, embeds: [], components: [] });
    }
  } else if (int.customId === 'bj_plantarse') {
    let ptsB = calcularPuntos(data.bM);
    while (ptsB < 17) { data.bM.push(generarCarta()); ptsB = calcularPuntos(data.bM); }
    const ptsU = calcularPuntos(data.uM);
    const win = ptsB > 21 || ptsU > ptsB;
    const empate = ptsU === ptsB;
    if (!empate) await usersColl.updateOne({ userId: int.user.id }, { $inc: { points: win ? data.mbj : -data.mbj } });
    client.retos.delete(`bj_${int.user.id}`);
    return int.update({ content: empate ? "🤝 **Empate.**" : win ? `🏆 **Ganaste!** Bot tenía ${ptsB}. +$${data.mbj}` : `💀 **Perdiste.** Bot tenía ${ptsB}. -$${data.mbj}`, embeds: [], components: [] });
  }
  const emb = new EmbedBuilder().setTitle('🃏 BLACKJACK').addFields({ name: 'Tu Mano', value: `${data.uM.map(c=>c.txt).join(" ")} (${calcularPuntos(data.uM)})`, inline: true }, { name: 'Crupier', value: `${data.bM[0].txt} [❓]`, inline: true }).setColor('#2b2d31');
  await int.update({ embeds: [emb] });
});

client.on('messageCreate', async (msg) => {
  if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
  if (msg.author.id === client.user.id) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  if (cachedConfig.mantenimiento && msg.author.id !== '986680845031059526') return;

  // --- LÓGICA DE DIÁLOGO (TU INDEX ORIGINAL) ---
  if (!msg.content.startsWith('!')) {
    msgCounter++;
    if (msg.author.id === ID_PATROCLO_ORIGINAL) loopBotCounter++; else loopBotCounter = 0;
    if (loopBotCounter > 5) return;

    if (msg.content.length > 5 && !msg.content.includes('http') && !msg.author.bot) {
      if (!cachedConfig.phrases.includes(msg.content)) {
        cachedConfig.phrases.push(msg.content);
        await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
      }
    }

    const apodos = ["patroclo", "patroclin", "patro", "facha"];
    const menc = apodos.some(a => content.includes(a)) || msg.mentions?.has(client.user.id);
    const triggerHableSolo = msgCounter >= Math.floor(Math.random() * (4 - 2) + 2);

    if (menc || triggerHableSolo) {
      msgCounter = 0;
      const adn = cachedConfig.phrases.slice(-25).join(" | ");
      const promptIA = `Sos Patroclo-B, bot argentino, bardo y facha. ADN: ${adn}. Responde corto a ${msg.author.username}: ${msg.content}`;
      const r = await respuestaIA(promptIA);
      return msg.reply(r || cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)]);
    }
    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  switch (cmd) {
    case 'stats':
      msg.reply({ embeds: [new EmbedBuilder().setTitle('📊 STATS').setColor('#0099ff').addFields(
        { name: '🧠 ADN', value: `${cachedConfig.phrases.length} frases`, inline: true },
        { name: '📝 ÚLTIMA', value: `"${cachedConfig.phrases.slice(-1)}"` },
        { name: '🏆 RECUERDO', value: cachedConfig.mejorMensaje }
      )] });
      break;

    case 'trabajar':
      const ahora = Date.now();
      if (ahora - (user.lastWork || 0) < 3600000) return msg.reply("Pará un poco, esclavo. Cada 1 hora.");
      const laburos = ["Trapito", "Admin de bardo", "Vendedor de medias", "Programador"];
      const pago = Math.floor(Math.random() * 1500) + 500;
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: pago }, $set: { lastWork: ahora } });
      msg.reply(`👷 Laburaste de **${laburos[Math.floor(Math.random()*laburos.length)]}** y te pagaron **$${pago}**.`);
      break;

    case 'bj':
      const mbj = parseInt(args[0]) || 500;
      if (user.points < mbj) return msg.reply("No tenés guita.");
      const uM = [generarCarta(), generarCarta()], bM = [generarCarta(), generarCarta()];
      client.retos.set(`bj_${msg.author.id}`, { mbj, uM, bM });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj_pedir').setLabel('Pedir 🃏').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj_plantarse').setLabel('Plantarse ✋').setStyle(ButtonStyle.Danger)
      );
      msg.reply({ embeds: [new EmbedBuilder().setTitle('🃏 BLACKJACK').addFields({ name: 'Tu Mano', value: `${uM.map(c=>c.txt).join(" ")} (${calcularPuntos(uM)})`, inline: true }, { name: 'Crupier', value: `${bM[0].txt} [❓]`, inline: true }).setColor('#2b2d31')], components: [row] });
      break;

    case 'reto':
      const mr = parseInt(args[1]) || 500;
      if (user.points < mr) return msg.reply("No tenés un mango.");
      if (args[0] === 'patroclo' || msg.mentions.has(client.user.id)) {
        const winR = Math.random() > 0.65;
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: winR ? mr : -mr } });
        return msg.reply(winR ? `🏆 Me ganaste. +$${mr}` : `💀 Te domé. -$${mr}`);
      }
      const op = msg.mentions.users.first();
      if (!op) return msg.reply("!reto @user [monto]");
      client.retos.set(op.id, { retador: msg.author.id, monto: mr });
      msg.reply(`⚔️ ${msg.author.username} retó a ${op} por $${mr}. !aceptar.`);
      break;

    case 'aceptar':
      const r = client.retos.get(msg.author.id);
      if (!r) return msg.reply("No hay retos.");
      const g = Math.random() > 0.5 ? msg.author.id : r.retador;
      await usersColl.updateOne({ userId: g }, { $inc: { points: r.monto } });
      await usersColl.updateOne({ userId: g === msg.author.id ? r.retador : msg.author.id }, { $inc: { points: -r.monto } });
      msg.channel.send(`🏆 **GANADOR:** <@${g}> se lleva $${r.monto}.`);
      client.retos.delete(msg.author.id);
      break;

    case 'bingo':
      const mb = parseInt(args[0]) || 500;
      if (user.points < mb) return msg.reply("No tenés plata.");
      const n = Array.from({length: 3}, () => Math.floor(Math.random() * 5));
      const winB = n.every(val => val === n[0]);
      await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: winB ? mb * 10 : -mb } });
      msg.reply(`🎱 [${n.join(" - ")}]. ${winB ? '¡BINGO! x10' : 'Casi.'}`);
      break;

    case 'bal': case 'plata': msg.reply(`💰 Tenés **$${user.points}**.`); break;
    case 'daily':
        const t = Date.now(); if (t - (user.lastDaily || 0) < 86400000) return msg.reply("Ya cobraste.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 1500 }, $set: { lastDaily: t } });
        msg.reply("💵 Cobraste $1500.");
        break;
  }
});

async function getUser(id) {
  let u = await usersColl.findOne({ userId: id });
  if (!u) { u = { userId: id, points: 1000, lastWork: 0, lastDaily: 0 }; await usersColl.insertOne(u); }
  return u;
}
start();