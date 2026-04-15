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

let cachedConfig = {
  phrases: [],
  mantenimiento: false,
  modoActual: "ia",
  agite: 25,
  ultimaPalabra: "ninguna"
};

let msgCounter = 0;
let loopBotCounter = 0;

if (!client.retos) client.retos = new Map();

const ID_OWNER = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTOR IA ---
async function respuestaIA(contexto, modo, usuarioInsulto) {
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let bardoPrompt = usuarioInsulto
    ? "Respondé como argentino re bardo."
    : "Respondé con humor y sarcasmo.";

  let systemPrompt = modo === "serio"
    ? "Sos un asistente serio."
    : `Sos Patroclo-B, argentino. ${bardoPrompt}`;

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${contexto}` }] }],
        safetySettings
      },
      { timeout: 8000 }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch {
    try {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contexto }
          ]
        },
        {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        }
      );

      return groqRes.data.choices[0].message.content;

    } catch {
      return "Se me quemó el cerebro.";
    }
  }
}

// --- CARTAS ---
const generarCarta = () => {
  const palos = ['♠️','♥️','♦️','♣️'];
  const valores = [
    {n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},
    {n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},
    {n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}
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

// --- POKER ---
function evaluarManoPoker(cartas){
  const valores = cartas.map(c=>{
    const v = c.txt.replace(/[^0-9AJQK]/g,'');
    return v==='10'?'T':v;
  });

  const rankMap = {A:14,K:13,Q:12,J:11,T:10};
  const ranks = valores.map(v=>rankMap[v]||parseInt(v));

  const counts = {};
  ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
  const countsArr = Object.values(counts).sort((a,b)=>b-a);

  const sorted = [...new Set(ranks)].sort((a,b)=>a-b);
  let straight=false;

  for(let i=0;i<=sorted.length-5;i++){
    if(sorted[i+4]-sorted[i]===4) straight=true;
  }
  if(!straight && [14,2,3,4,5].every(v=>sorted.includes(v))) straight=true;

  if(countsArr[0]===4) return {name:'Póker',mult:10};
  if(countsArr[0]===3 && countsArr[1]===2) return {name:'Full',mult:6};
  if(straight) return {name:'Escalera',mult:5};
  if(countsArr[0]===3) return {name:'Trío',mult:3};
  if(countsArr[0]===2 && countsArr[1]===2) return {name:'Doble Par',mult:2};
  if(countsArr[0]===2) return {name:'Par',mult:1.5};
  return {name:'Carta alta',mult:0};
}

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = {userId:id,points:1000,lastDaily:0};
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
  if(d) cachedConfig = {...cachedConfig,...d};

  await client.login(process.env.TOKEN);
  console.log("✅ ONLINE");
}

// --- MENSAJES ---
client.on('messageCreate', async (msg)=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // APRENDER
  if(!msg.content.startsWith('!')){
    if(msg.content.length>4 && !cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);
      cachedConfig.ultimaPalabra = msg.content.split(" ").pop();

      await dataColl.updateOne(
        {id:"main_config"},
        {$set:cachedConfig},
        {upsert:true}
      );
    }

    msgCounter++;

    const menc = content.includes("patro") || msg.mentions?.has(client.user.id);

    if(menc || msgCounter>=8){
      msgCounter=0;

      msg.channel.sendTyping();
      const adn = cachedConfig.phrases.slice(-25).join(" | ");

      const r = await respuestaIA(
        `ADN: ${adn}\n${msg.author.username}: ${msg.content}`,
        cachedConfig.modoActual,
        false
      );

      if(r) msg.reply(r);
    }

    return;
  }

  const args = msg.content.slice(1).split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS ---
  if(cmd==="bal"){
    return msg.reply(`💰 Tenés $${user.points}`);
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

  // --- BINGO FIXED ---
  if(cmd==="bingo"){
    const monto = parseInt(args[0]) || 100;

    const numeros = Array.from({length:75},(_,i)=>i+1);
    const carton = [];

    for(let i=0;i<25;i++){
      carton.push(numeros.splice(Math.random()*numeros.length|0,1)[0]);
    }

    const bolas = [];
    const pool = Array.from({length:75},(_,i)=>i+1);

    for(let i=0;i<30;i++){
      bolas.push(pool.splice(Math.random()*pool.length|0,1)[0]);
    }

    let win=false;

    for(let r=0;r<5;r++){
      const rowNums = carton.slice(r*5, r*5+5);
      if(rowNums.every(n=>bolas.includes(n))) win=true;
    }

    return msg.reply(win ? "🎉 BINGO" : "❌ Perdiste");
  }

});

start();