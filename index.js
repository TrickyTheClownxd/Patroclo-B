// --- IMPORTS ---
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
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
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

// 🔥 CONFIG BASE (NO VACÍA MONGO)
let cachedConfig = {
  phrases: null,
  modoActual: "normal",
  motorIA: "gemini"
};

let msgCounter = 0;

// --- SAFE JSON LOAD ---
let backupMemory = { phrases: [] };

try {
  if(fs.existsSync("./memoria.json")){
    backupMemory = JSON.parse(fs.readFileSync("./memoria.json"));
    console.log("✅ Backup cargado");
  } else {
    console.log("⚠️ memoria.json no existe");
  }
} catch {
  console.log("⚠️ Error leyendo backup");
}

// --- UTILS ---
const rand = (a)=>a[Math.floor(Math.random()*a.length)];
const cortar = (t)=> t?.slice(0,2000);

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto){

  let systemPrompt = "";

  if(modo === "serio"){
    systemPrompt = "Sos un asistente profesional.";
  }
  else if(modo === "ia"){
    systemPrompt = usuarioInsulto
      ? "Respondé con bardo argentino fuerte."
      : "Sos argentino sarcástico.";
  }
  else if(modo === "normal"){
    systemPrompt = "Elegí UNA frase exacta de la lista.";
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents:[{parts:[{text:`${systemPrompt}\n${contexto}`}] }]
      }
    );

    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }catch{
    return null;
  }
}

// --- DB USER ---
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

  if(d){
    cachedConfig = {...cachedConfig, ...d};
    console.log("🧠 Frases Mongo:", cachedConfig.phrases?.length || 0);
  }

  // 🔥 RECUPERACIÓN SI MONGO ESTÁ VACÍO
  if(!cachedConfig.phrases || cachedConfig.phrases.length === 0){
    console.log("⚠️ Mongo vacío, usando backup");

    cachedConfig.phrases = backupMemory.phrases || [];

    if(cachedConfig.phrases.length > 0){
      await dataColl.updateOne(
        {id:"main_config"},
        {$set:{phrases:cachedConfig.phrases}},
        {upsert:true}
      );
      console.log("✅ Restaurado desde backup");
    }
  }

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- ADN GUARDADO ---
  if(!msg.content.startsWith("!") && msg.content.length > 4){
    if(!cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);

      await dataColl.updateOne(
        {id:"main_config"},
        {$set:{phrases:cachedConfig.phrases}},
        {upsert:true}
      );
    }
  }

  // =================
  // 🎮 COMANDOS
  // =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
      return msg.reply(`Modo: ${args[0]}`);
    }

    if(cmd==="stats"){
      return msg.reply(`🧠 Frases: ${cachedConfig.phrases.length}`);
    }

    return;
  }

  // =================
  // 🤖 TRIGGERS ADN
  // =================
  const insultos = ["pelotudo","boludo","hdp","forro","pajero"];
  const usuarioInsulto = insultos.some(i => content.includes(i));

  const trigger =
    msg.mentions.has(client.user.id) ||
    content.includes("patro") ||
    msg.reference ||
    msgCounter >= 3;

  if (!trigger) {
    msgCounter++;
    return;
  }

  msgCounter = 0;
  msg.channel.sendTyping();

  // =================
  // 🧠 MODO NORMAL (CLAVE)
  // =================
  if (cachedConfig.modoActual === "normal") {

    const muestraADN = cachedConfig.phrases
      .sort(() => 0.5 - Math.random())
      .slice(0, 50);

    const prompt = `
Lista: ${muestraADN.join(" | ")}

Mensaje: "${msg.content}"

Elegí UNA frase exacta de la lista que mejor responda.
NO inventes nada nuevo.
`;

    const r = await respuestaIA(prompt, "normal", false);

    return msg.reply(cortar(r) || rand(cachedConfig.phrases));
  }

  // =================
  // 🤖 IA NORMAL
  // =================
  const adn = cachedConfig.phrases.slice(-20).join(" | ");

  const r = await respuestaIA(
    `ADN: ${adn}\nUsuario: ${msg.content}`,
    cachedConfig.modoActual,
    usuarioInsulto
  );

  return msg.reply(cortar(r));
});

start();