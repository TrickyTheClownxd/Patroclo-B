// --- IMPORTS ---
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} from 'discord.js';

import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

// --- SERVER ---
const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req,res)=>{
  res.writeHead(200);
  res.end("PATROCLO GOD");
}).listen(port);

// --- CLIENT ---
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials:[Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

// --- CACHE ---
let cachedConfig = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;

// --- MEMORIA LOCAL ---
let memoriaLocal = { phrases: [] };

try{
  memoriaLocal = JSON.parse(fs.readFileSync("./memoria.json"));
}catch{
  console.log("⚠️ memoria.json no encontrada");
}

// --- UTILS ---
const rand = (a)=>a[Math.floor(Math.random()*a.length)];

const cortar = (txt)=>{
  if(!txt) return null;
  return txt.length > 1900 ? txt.slice(0,1900)+"..." : txt;
};

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto){

  let systemPrompt;

  if(modo === "serio"){
    systemPrompt = `Sos un asistente profesional, educado y claro.`;
  }
  else if(modo === "ia"){
    systemPrompt = usuarioInsulto
      ? `Sos argentino picante, bardero.`
      : `Sos Patroclo, sarcástico y de barrio.`;
  }
  else if(modo === "normal"){
    systemPrompt = `Seleccioná UNA frase de la lista dada. No inventes nada.`;
  }

  // GEMINI
  if(cachedConfig.motorIA === "gemini"){
    try{
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents:[{parts:[{text:`${systemPrompt}\n\n${contexto}`}] }]
        }
      );

      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }catch{}
  }

  // GROQ fallback
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
    return "Se me quemó el cerebro.";
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

  const configDB = await dataColl.findOne({id:"main_config"});
  if(configDB){
    cachedConfig.modoActual = configDB.modoActual || "ia";
    cachedConfig.motorIA = configDB.motorIA || "gemini";
  }

  const memoriaDB = await dataColl.findOne({id:"memoria_frases"});
  if(memoriaDB?.data){
    cachedConfig.phrases = memoriaDB.data;
  }else{
    cachedConfig.phrases = memoriaLocal.phrases || [];
  }

  console.log("🧠 Frases:", cachedConfig.phrases.length);

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- GUARDAR ADN ---
  if(!msg.content.startsWith("!") && msg.content.length > 4){
    await dataColl.updateOne(
      {id:"memoria_frases"},
      {$addToSet:{data: msg.content}},
      {upsert:true}
    );
  }

  // --- COMANDOS ---
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
      return msg.reply("Modo: " + args[0]);
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="stats"){
      return msg.reply(
        `🧠 ${cachedConfig.phrases.length} frases\n⚙️ ${cachedConfig.modoActual}\n💰 $${user.points}`
      );
    }

    // --- CASINO ---
    if(cmd==="slots"){
      const apuesta = parseInt(args[0])||100;
      const icons = ["🍒","🍋","💎","⭐"];

      const r = rand(icons)+" "+rand(icons)+" "+rand(icons);
      const win = Math.random()<0.5;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:win?apuesta:-apuesta}}
      );

      return msg.reply(`${r}\n${win?"🏆 Ganaste":"💀 Perdiste"}`);
    }

    return;
  }

  // --- TRIGGERS ---
  const insultos = ["pelotudo","boludo","hdp","forro","pajero"];
  const usuarioInsulto = insultos.some(i => content.includes(i));

  const trigger =
    msg.mentions.has(client.user.id) ||
    content.includes("patro") ||
    content.includes("patroclo") ||
    content.includes("patroclin") ||
    msg.reference ||
    msgCounter >= 3;

  if (!trigger) {
    msgCounter++;
    return;
  }

  msgCounter = 0;

  try{ await msg.channel.sendTyping(); }catch{}

  // =========================
  // 🧠 MODO NORMAL (GENAI ADN)
  // =========================
  if (cachedConfig.modoActual === "normal") {

    if(!cachedConfig.phrases.length){
      return msg.reply("No tengo ADN todavía...");
    }

    const muestraADN = [...cachedConfig.phrases]
      .sort(() => 0.5 - Math.random())
      .slice(0, 50);

    const promptNormal = `
Elegí UNA frase de esta lista que mejor responda al mensaje.
NO inventes nada.

Frases:
${muestraADN.join(" | ")}

Mensaje:
"${msg.content}"
`;

    let r = await respuestaIA(promptNormal, "normal", false);

    if(!r || r.length < 2){
      r = rand(muestraADN);
    }

    return msg.reply(cortar(r));
  }

  // =========================
  // 🤖 MODO IA / SERIO
  // =========================
  const adnContexto = cachedConfig.phrases.slice(-20).join(" | ");

  const contextoIA = `
ADN del grupo:
${adnContexto}

Usuario: ${msg.content}
`;

  const r = await respuestaIA(contextoIA, cachedConfig.modoActual, usuarioInsulto);

  return msg.reply(cortar(r));
});

// --- START ---
start();