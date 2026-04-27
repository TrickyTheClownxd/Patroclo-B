// --- IMPORTS ---
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from "fs";

dotenv.config();

// --- SERVER ---
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO GOD")).listen(port);

// --- SAFE FILE LOAD ---
function loadJSON(path, fallback){
  try{
    return JSON.parse(fs.readFileSync(path,"utf-8"));
  }catch{
    fs.writeFileSync(path, JSON.stringify(fallback,null,2));
    return fallback;
  }
}

let extras = loadJSON("./extras.json",{phrases:[],reacciones_auto:{palabras_clave:[],emojis:[]}});
let universe = loadJSON("./universe.json",{facts:[]});
let memoriaLocal = loadJSON("./memoria.json",{users:{},chat:[]});

// --- CLIENT ---
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, memoryColl;

let config = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;

// --- UTILS ---
const rand = a=>a[Math.floor(Math.random()*a.length)];

function send(msg,text){
  if(!text) return;
  if(text.length<=2000) return msg.reply(text);

  text.match(/.{1,2000}/g).forEach(t=>msg.channel.send(t));
}

// --- IA ---
async function IA(contexto, modo){
  const sys = modo==="serio"
    ? "Sos un asistente profesional."
    : "Sos Patroclo, argentino sarcástico.";

  try{
    if(config.motorIA==="gemini"){
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {contents:[{parts:[{text:sys+"\n"+contexto}]}]}
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    const g = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model:"llama-3.3-70b-versatile",
        messages:[
          {role:"system",content:sys},
          {role:"user",content:contexto}
        ]
      },
      {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}}
    );

    return g.data.choices[0].message.content;

  }catch{
    return "meh";
  }
}

// --- START ---
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  memoryColl = db.collection("memory");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // =========================
  // 🧠 CHAT CONTEXTO (MONGO + CACHE)
  // =========================
  await memoryColl.updateOne(
    {id:"chat"},
    {$push:{messages:`${msg.author.username}: ${msg.content}`}},
    {upsert:true}
  );

  let chatData = await memoryColl.findOne({id:"chat"});
  let chat = chatData?.messages || [];

  if(chat.length > 20){
    chat = chat.slice(-20);
    await memoryColl.updateOne({id:"chat"},{$set:{messages:chat}});
  }

  // fallback local
  memoriaLocal.chat = chat;
  fs.writeFileSync("./memoria.json", JSON.stringify(memoriaLocal,null,2));

  // =========================
  // 🧠 MEMORIA SOCIAL
  // =========================
  const match = msg.content.match(/^(\w+)\s+es\s+(.+)/i);
  if(match){
    await memoryColl.updateOne(
      {id:"social",user:match[1].toLowerCase()},
      {$push:{desc:match[2].toLowerCase()}},
      {upsert:true}
    );
  }

  // =========================
  // 🔥 ADN (40K+ OK)
  // =========================
  if(!msg.content.startsWith("!") && msg.content.length>4){
    await dataColl.updateOne(
      {id:"phrases"},
      {$addToSet:{list:msg.content}},
      {upsert:true}
    );
  }

  // =========================
  // 🎮 COMANDOS
  // =========================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="universefacts"){
      return msg.reply(rand(universe.facts));
    }

    return;
  }

  // =========================
  // 🤖 TRIGGERS
  // =========================
  msgCounter++;

  const trigger =
    msg.mentions.has(client.user.id) ||
    /(patro|patroclo|patroclin)/i.test(content) ||
    msgCounter>=3;

  if(trigger){
    msgCounter = 0;

    // --- MODO NORMAL (USA MONGO)
    if(config.modoActual==="normal"){
      const data = await dataColl.findOne({id:"phrases"});
      const frases = data?.list || [];

      return msg.reply(rand(frases));
    }

    // --- IA
    const contexto = chat.join("\n");

    const r = await IA(
      `Contexto:\n${contexto}\n\nMensaje:${msg.content}`,
      config.modoActual
    );

    return send(msg,r);
  }

});

start();