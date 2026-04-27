// =======================
// --- IMPORTS ---
// =======================
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} from 'discord.js';

import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from "fs";

dotenv.config();

// =======================
// --- SERVER ---
// =======================
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO GOD")).listen(port);

// =======================
// --- SAFE FILE LOAD ---
// =======================
function safeJSON(path, def){
  try{
    if(!fs.existsSync(path)){
      fs.writeFileSync(path, JSON.stringify(def,null,2));
      return def;
    }
    return JSON.parse(fs.readFileSync(path,"utf-8"));
  }catch{
    return def;
  }
}

let memoria = safeJSON("./memoria.json", {
  chat: [],
  users: {}
});

function saveMem(){
  fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2));
}

// =======================
// --- CLIENT ---
// =======================
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
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

if(!client.retos) client.retos = new Map();

// =======================
// --- UTILS ---
// =======================
const rand = a=>a[Math.floor(Math.random()*a.length)];

function cortar(t){
  if(!t) return "";
  return t.slice(0,2000);
}

// =======================
// --- IA ---
// =======================
async function IA(contexto, modo){

  let sys;

  if(modo==="serio"){
    sys="Sos un asistente profesional.";
  }else if(modo==="ia"){
    sys="Sos Patroclo, argentino, sarcástico y gracioso.";
  }else{
    sys="Elegí una frase existente, no inventes.";
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

// =======================
// --- MEMORIA SOCIAL ---
// =======================
function getSocial(nombre){
  const d = memoria.users[nombre];
  if(!d) return null;

  const count = {};
  d.forEach(x=>count[x]=(count[x]||0)+1);

  return `${nombre} es ${Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0]}`;
}

// =======================
// --- DB ---
// =======================
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

// =======================
// --- START ---
// =======================
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

// =======================
// --- CARTAS ---
// =======================
const generarCarta = () => {
  const palos = ['♠️','♥️','♦️','♣️'];
  const valores = [
    { n:'A', v:11 },{ n:'2', v:2 },{ n:'3', v:3 },
    { n:'4', v:4 },{ n:'5', v:5 },{ n:'6', v:6 },
    { n:'7', v:7 },{ n:'8', v:8 },{ n:'9', v:9 },
    { n:'10', v:10 },{ n:'J', v:10 },{ n:'Q', v:10 },{ n:'K', v:10 }
  ];
  const item = rand(valores);
  return { txt:`${item.n}${rand(palos)}`, val:item.v };
};

const calcularPuntos = (mano)=>{
  let p = mano.reduce((a,c)=>a+c.val,0);
  let ases = mano.filter(c=>c.txt.startsWith("A")).length;
  while(p>21 && ases>0){ p-=10; ases--; }
  return p;
};

// =======================
// --- MENSAJES ---
// =======================
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

  // --- ADN (Mongo) ---
  if(!msg.content.startsWith("!") && msg.content.length>4){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await dataColl.updateOne(
        {id:"main_config"},
        {$set:config},
        {upsert:true}
      );
    }
  }

  // =======================
  // 🎮 COMANDOS
  // =======================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      config.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
      return msg.reply("Modo: "+args[0]);
    }

    if(cmd==="bal") return msg.reply(`💰 ${user.points}`);

    if(cmd==="stats"){
      return msg.reply(
        `🧠 Frases: ${config.phrases.length}\n⚙️ ${config.modoActual}\n💰 ${user.points}`
      );
    }

    // ===== BLACKJACK =====
    if(cmd==="bj"){
      const monto = parseInt(args[0])||500;
      if(user.points < monto) return msg.reply("No tenés plata.");

      const manoU = [generarCarta(), generarCarta()];
      const manoB = [generarCarta()];

      client.retos.set(`bj_${msg.author.id}`,{monto,manoU,manoB});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
      );

      return msg.reply({
        embeds:[new EmbedBuilder()
          .setTitle("🃏 BLACKJACK")
          .setDescription(`${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`)
        ],
        components:[row]
      });
    }

    return;
  }

  // =======================
  // 🤖 TRIGGERS
  // =======================
  const insultos = ["pelotudo","boludo","hdp","forro","pajero"];
  const usuarioInsulto = insultos.some(i=>content.includes(i));

  const trigger =
    msg.mentions.has(client.user.id) ||
    content.includes("patro") ||
    msg.reference ||
    msgCounter >= 3;

  if(!trigger){
    msgCounter++;
    return;
  }

  msgCounter = 0;
  msg.channel.sendTyping();

  // ===== MODO NORMAL (IA SELECTOR ADN) =====
  if(config.modoActual==="normal"){

    const muestra = config.phrases
      .sort(()=>0.5-Math.random())
      .slice(0,50);

    const prompt = `
    Elegí UNA frase de esta lista:
    [${muestra.join(" | ")}]

    Para responder a:
    "${msg.content}"

    NO inventes texto.
    `;

    const r = await IA(prompt,"normal");

    return msg.reply(cortar(r) || rand(config.phrases));
  }

  // ===== IA NORMAL =====
  const contexto = memoria.chat.join("\n");

  const r = await IA(
    `Contexto:\n${contexto}\n\nMensaje:${msg.content}`,
    config.modoActual,
    usuarioInsulto
  );

  return msg.reply(cortar(r));
});

// =======================
start();