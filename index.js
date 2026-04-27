// --- IMPORTS ---
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

// --- FILES ---
const extras = JSON.parse(fs.readFileSync("./extras.json"));
const universe = JSON.parse(fs.readFileSync("./universe.json"));

// --- SERVER ---
const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req,res)=>{
  res.writeHead(200);
  res.end("PATROCLO GOD MODE");
}).listen(port);

// --- CLIENT ---
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let cachedConfig = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;
let userMsgCount = new Map();
let loopBotCounter = 0;

if(!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- UTILS ---
const rand = (a)=>a[Math.floor(Math.random()*a.length)];

// 🔥 FIX DISCORD LIMIT
async function enviarLargo(msg, texto){
  if(!texto) return;

  if(texto.length <= 2000) return msg.reply(texto);

  const partes = texto.match(/[\s\S]{1,1900}/g);
  for(const p of partes){
    await msg.channel.send(p);
  }
}

// --- CARTAS ---
const cartas = [
  "A♠️","2♠️","3♠️","4♠️","5♠️","6♠️","7♠️","8♠️","9♠️","10♠️","J♠️","Q♠️","K♠️",
  "A♥️","2♥️","3♥️","4♥️","5♥️","6♥️","7♥️","8♥️","9♥️","10♥️","J♥️","Q♥️","K♥️"
];

const valorCarta = (c)=>{
  if(c.startsWith("A")) return 11;
  if(["K","Q","J"].some(x=>c.startsWith(x))) return 10;
  return parseInt(c);
};

const puntos = (mano)=>{
  let total = mano.reduce((a,c)=>a+valorCarta(c),0);
  let ases = mano.filter(c=>c.startsWith("A")).length;

  while(total>21 && ases>0){
    total-=10;
    ases--;
  }
  return total;
};

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto){

  let systemPrompt;

  if(modo === "serio"){
    systemPrompt = `Sos un asistente profesional, claro y breve. Responde en menos de 500 palabras.`;
  } 
  else {
    systemPrompt = usuarioInsulto
      ? `Sos argentino picante. Bardeá fuerte.`
      : `Sos Patroclo, argentino sarcástico.`;
  }

  // GEMINI
  if(cachedConfig.motorIA === "gemini"){
    try{
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents:[{parts:[{text:`${systemPrompt}\n\n${contexto}`}] }],
          safetySettings:[
            {category:"HARM_CATEGORY_HARASSMENT",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_HATE_SPEECH",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_SEXUALLY_EXPLICIT",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_DANGEROUS_CONTENT",threshold:"BLOCK_NONE"}
          ]
        }
      );

      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }catch{}
  }

  // GROQ
  try{
    const g = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model:"llama-3.3-70b-versatile",
        messages:[
          {role:"system",content:systemPrompt},
          {role:"user",content:contexto}
        ]
      },
      {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}}
    );

    return g.data.choices[0].message.content;
  }catch{
    return "Me quemé 🔥";
  }
}

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

// --- START ---
async function start(){
  await mongoClient.connect();
  const db = mongoClient.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) cachedConfig = {...cachedConfig,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 ONLINE");
}

// --- BOTONES ---
const botones = (juego, apuesta)=>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${juego}_seguir_${apuesta}`).setLabel("Seguir 🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${juego}_salir`).setLabel("Salir 🚪").setStyle(ButtonStyle.Danger)
  );

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- REACCIONES AUTO ---
  if(extras.reacciones_auto.palabras_clave.some(p=>content.includes(p))){
    msg.react(rand(extras.reacciones_auto.emojis)).catch(()=>{});
  }

  // --- ADN ---
  if(!msg.content.startsWith("!") && msg.content.length > 4){
    if(!cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:cachedConfig},{upsert:true});
    }
  }

  // --- CONTADOR POR USUARIO ---
  userMsgCount.set(msg.author.id, (userMsgCount.get(msg.author.id)||0)+1);

  const respondeCada3 = userMsgCount.get(msg.author.id) >= 3;
  if(respondeCada3) userMsgCount.set(msg.author.id,0);

  const trigger =
    respondeCada3 ||
    content.includes("patro") ||
    content.includes("patroclo") ||
    msg.mentions.has(client.user.id) ||
    msg.reference;

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      cachedConfig.modoActual = args[0];
      return msg.reply(`Modo: ${args[0]}`);
    }

    if(cmd==="motor"){
      cachedConfig.motorIA = args[0];
      return msg.reply(`Motor: ${args[0]}`);
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="daily"){
      if(Date.now()-user.lastDaily < 86400000)
        return msg.reply("Ya cobraste");

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:1500},$set:{lastDaily:Date.now()}}
      );

      return msg.reply("💵 +1500");
    }

    if(cmd==="universefacts"){
      const fact = rand(universe.facts);
      return msg.reply(fact);
    }

    if(cmd==="gif"){
      const q = args.join(" ");
      const r = await axios.get(
        `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`
      );
      return msg.reply(r.data.data[0]?.images?.original?.url || "Nada");
    }

    if(cmd==="foto"){
      return msg.reply("🧠 IA de imágenes próximamente");
    }

    return;
  }

  // ================= IA =================
  if(trigger){
    const adn = cachedConfig.phrases.slice(-20).join(" | ");

    const r = await respuestaIA(
      `ADN: ${adn}\n${msg.author.username}: ${msg.content}`,
      cachedConfig.modoActual
    );

    return enviarLargo(msg, r + " " + rand(extras.emojis));
  }

});

// --- START ---
start();