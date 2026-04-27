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
http.createServer((req,res)=>res.end("PATROCLO FINAL")).listen(port);

// --- FILES ---
const extras = JSON.parse(fs.readFileSync("./extras.json","utf-8"));
let universe = JSON.parse(fs.readFileSync("./universe.json","utf-8"));
let memoria = JSON.parse(fs.readFileSync("./memoria.json","utf-8"));

function saveMem(){
  fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2));
}

// --- CLIENT ---
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let config = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;

// --- UTILS ---
const rand = a=>a[Math.floor(Math.random()*a.length)];

function send(msg, text){
  if(!text) return;

  if(text.length <= 2000){
    return msg.reply(text);
  }

  text.match(/.{1,2000}/g).forEach(t=>msg.channel.send(t));
}

// --- IA ---
async function IA(contexto, modo){

  let sys;

  if(modo==="serio"){
    sys="Sos un asistente profesional, claro y educado.";
  }else{
    sys="Sos Patroclo, argentino, sarcástico, gracioso.";
  }

  if(config.motorIA==="gemini"){
    try{
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents:[{parts:[{text:sys+"\n\n"+contexto}]}]
        }
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }catch{}
  }

  try{
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
    return "Se me quemó el cerebro.";
  }
}

// --- MEMORIA SOCIAL ---
function getSocial(nombre){
  const d = memoria.users[nombre];
  if(!d) return null;

  const count = {};
  d.forEach(x=>count[x]=(count[x]||0)+1);

  return `${nombre} es ${Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0]}`;
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
  await mongo.connect();

  const db = mongo.db("patroclo_bot");
  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO FINAL ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // --- GUARDAR CHAT ---
  memoria.chat.push(`${msg.author.username}: ${msg.content}`);
  if(memoria.chat.length > 20) memoria.chat.shift();
  saveMem();

  // --- MEMORIA SOCIAL ---
  const m = msg.content.match(/^(\w+)\s+es\s+(.+)/i);
  if(m){
    const nombre = m[1].toLowerCase();
    const desc = m[2].toLowerCase();

    if(!memoria.users[nombre]) memoria.users[nombre]=[];
    memoria.users[nombre].push(desc);

    saveMem();
  }

  // --- REACCIONES AUTO ---
  extras.reacciones_auto.palabras_clave.forEach(p=>{
    if(content.includes(p)){
      msg.react(rand(extras.reacciones_auto.emojis)).catch(()=>{});
    }
  });

  // --- ADN ---
  if(!msg.content.startsWith("!") && msg.content.length>4){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:config},{upsert:true});
    }
  }

  // =====================
  // 🎮 COMANDOS
  // =====================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      config.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
      return msg.reply("Modo: "+args[0]);
    }

    if(cmd==="motor"){
      config.motorIA = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{motorIA:args[0]}});
      return msg.reply("Motor: "+args[0]);
    }

    if(cmd==="bal") return msg.reply(`💰 ${user.points}`);

    if(cmd==="daily"){
      if(Date.now()-user.lastDaily < 86400000)
        return msg.reply("Ya cobraste hoy");

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:1500},$set:{lastDaily:Date.now()}}
      );

      return msg.reply("💵 +1500");
    }

    if(cmd==="stats"){
      return msg.reply(
        `🧠 Frases: ${config.phrases.length}\n⚙️ ${config.modoActual}\n💰 ${user.points}`
      );
    }

    if(cmd==="gif"){
      const q = args.join(" ");
      const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
      return msg.reply(r.data.data[0]?.images?.original?.url || "Nada");
    }

    if(cmd==="universefacts"){
      return msg.reply(rand(universe.facts));
    }

    return;
  }

  // =====================
  // 🤖 TRIGGERS
  // =====================
  msgCounter++;

  const triggerDirecto =
    msg.mentions.has(client.user.id) ||
    msg.reference ||
    /(patro|patroclo|patroclin)/i.test(content);

  const triggerRandom = msgCounter >= 3;

  if(triggerDirecto || triggerRandom){

    msgCounter = 0;

    const nombre = content.split(" ")[0];
    const social = getSocial(nombre);

    // --- MODO NORMAL (ARREGLADO) ---
    if(config.modoActual==="normal"){

      const pool = [...config.phrases, ...extras.phrases];

      if(triggerDirecto && social){
        return msg.reply(social);
      }

      return msg.reply(rand(pool));
    }

    // --- IA CON CONTEXTO ---
    const contexto = memoria.chat.join("\n");

    const r = await IA(
      `Contexto:\n${contexto}\n\nMensaje: ${msg.content}`,
      config.modoActual
    );

    return send(msg,r);
  }

});

start();