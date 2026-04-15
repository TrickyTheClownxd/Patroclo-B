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

// --- CLIENT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let cachedConfig = {
  phrases: [],
  mantenimiento: false,
  modoActual: "ia",
  ultimaPalabra: "ninguna"
};

let msgCounter = 0;
let loopBotCounter = 0;

if (!client.retos) client.retos = new Map();

const ID_OWNER = '986680845031059526';
const IDPATROCLOORIGINAL = '974297735559806986';

// --- MOTOR IA ---
async function respuestaIA(contexto, modo, usuarioInsulto) {

  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let systemPrompt;

  if (modo === "serio") {
    systemPrompt = `Sos un asistente serio, educado y claro.`;
  } else {
    systemPrompt = usuarioInsulto
      ? `Sos un argentino picante. El usuario te insultó, respondé con bardo fuerte.`
      : `Sos Patroclo-B, un argentino de barrio sarcástico y canchero.`;
  }

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${contexto}` }] }],
        safetySettings
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch {
    try {
      const groqRes = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contexto }
          ]
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
        }
      );

      return groqRes.data.choices[0].message.content;

    } catch {
      return "Se me tildó el cerebro.";
    }
  }
}

// --- CARTAS ---
const generarCarta = () => {
  const palos = ['♠️','♥️','♦️','♣️'];
  const valores = [
    {n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},
    {n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},
    {n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}
  ];
  const item = valores[Math.floor(Math.random()*valores.length)];
  return { txt:`${item.n}${palos[Math.floor(Math.random()*4)]}`, val:item.v };
};

const calcularPuntos = (mano) => {
  let pts = mano.reduce((a,c)=>a+c.val,0);
  let ases = mano.filter(c=>c.txt.startsWith('A')).length;
  while(pts>21 && ases>0){ pts-=10; ases--; }
  return pts;
};

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

async function start(){
  await mongoClient.connect();
  const db = mongoClient.db('patroclo_bot');

  usersColl = db.collection('users');
  dataColl = db.collection('bot_data');

  const d = await dataColl.findOne({id:"main_config"});
  if(d) cachedConfig = { ...cachedConfig, ...d };

  await client.login(process.env.TOKEN);
  console.log("✅ PATROCLO ONLINE");
}

// --- MENSAJES ---
client.on('messageCreate', async (msg)=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // ANTI LOOP
  if (msg.author.id === IDPATROCLOORIGINAL) {
    loopBotCounter++;
    if (loopBotCounter > 3) return;
  } else {
    loopBotCounter = 0;
  }

  // APRENDIZAJE
  if(!msg.content.startsWith('!')){

    if(msg.content.length > 4 && !cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);
      cachedConfig.ultimaPalabra = msg.content.split(" ").pop();

      await dataColl.updateOne(
        {id:"main_config"},
        {$set:cachedConfig},
        {upsert:true}
      );
    }

    msgCounter++;

    const insultos = ["pelotudo","boludo","hdp","forro"];
    const usuarioInsulto = insultos.some(i => content.includes(i));

    const menc = content.includes("patro") || msg.mentions?.has(client.user.id);

    if(menc || msgCounter >= 8 || usuarioInsulto){
      msgCounter = 0;

      // MODO NORMAL (ADN)
      if(cachedConfig.modoActual === "normal"){
        return msg.reply(
          cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "..."
        );
      }

      msg.channel.sendTyping();

      const adn = cachedConfig.phrases.slice(-25).join(" | ");

      const r = await respuestaIA(
        `ADN: ${adn}\n${msg.author.username}: ${msg.content}`,
        cachedConfig.modoActual,
        usuarioInsulto
      );

      if(r) return msg.reply(r);
    }

    return;
  }

  // --- COMANDOS ---
  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if(cmd==="bal") return msg.reply(`💰 Tenés $${user.points}`);

  if(cmd==="stats"){
    return msg.reply(`🧠 Frases: ${cachedConfig.phrases.length}
🕹️ Modo: ${cachedConfig.modoActual}
⏱️ Uptime: ${Math.floor((Date.now()-startTime)/60000)} min`);
  }

  if(cmd==="modo"){
    if(!['normal','serio','ia'].includes(args[0]))
      return msg.reply("Modos: normal, serio, ia");

    cachedConfig.modoActual = args[0];

    await dataColl.updateOne(
      {id:"main_config"},
      {$set:{modoActual:args[0]}}
    );

    return msg.reply(`Modo cambiado a ${args[0]}`);
  }

  if(cmd==="daily"){
    if(Date.now()-user.lastDaily<86400000)
      return msg.reply("Ya cobraste hoy");

    await usersColl.updateOne(
      {userId:msg.author.id},
      {$inc:{points:1500},$set:{lastDaily:Date.now()}}
    );

    return msg.reply("💵 +1500");
  }

  // --- GIF ---
  if(cmd==="gif"){
    const q = args.join(" ");
    const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
    const gif = res.data.data[0]?.images?.original?.url;
    return msg.reply(gif || "No encontré nada");
  }

});

// --- INTERACCIONES ---
client.on('interactionCreate', async (int)=>{
  if(!int.isButton()) return;

  if(int.customId.endsWith("_salir")){
    return int.reply({content:"🚪 Saliste",ephemeral:true});
  }

  if(int.customId.endsWith("_seguir")){
    return int.reply({content:"🔁 Usá el comando otra vez",ephemeral:true});
  }
});

start();