// ==========================================
// PATROCLO ULTRA FINAL GOD - FULL FINAL
// ==========================================

import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, AttachmentBuilder
} from 'discord.js';

import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from "fs";

dotenv.config();

// ================= SERVER =================
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO FINAL GOD")).listen(port);

// ================= CONFIG =================
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const ID_OWNER = '986680845031059526';

// ================= FILES =================
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

const extras = safeJSON("./extras.json", {
  phrases:[], facts:[], emojis:[],
  reacciones_auto:{palabras_clave:[], emojis:[]}
});

let universe = safeJSON("./universe.json", { facts:[], usedToday:[] });
let memoria = safeJSON("./memoria.json", { chat:[], users:{} });

function saveMem(){
  fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2));
}

// ================= CLIENT =================
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, asociaColl;

let config = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;
let loopBotCounter = 0;

if(!client.retos) client.retos = new Map();

// ================= UTILS =================
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// ================= IA =================
async function IA(contexto, modo, usuarioInsulto=false){

  let sys;

  if(modo==="serio"){
    sys="Sos un asistente profesional argentino, claro y educado.";
  }
  else if(modo==="ia"){
    sys = usuarioInsulto
      ? "Sos Patroclo, argentino picante. Respondé con bardo fuerte y sarcasmo."
      : "Sos Patroclo, argentino, sarcástico y gracioso.";
  }
  else{
    sys="Elegí SOLO una frase del ADN. PROHIBIDO inventar.";
  }

  try{
    if(config.motorIA==="gemini"){
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { contents:[{parts:[{text:sys+"\n\n"+contexto}]}] }
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
    return null;
  }
}

// ================= CARTAS =================
function generarCarta(){
  const v = [
    {n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},
    {n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},
    {n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}
  ];
  const i = rand(v);
  return { txt:`${i.n}${rand(['♠️','♥️','♦️','♣️'])}`, val:i.v };
}

function calcularPuntos(m){
  let p = m.reduce((a,c)=>a+c.val,0);
  let ases = m.filter(c=>c.txt.startsWith("A")).length;
  while(p>21 && ases>0){ p-=10; ases--; }
  return p;
}

// ================= UNIVERSE FACTS =================
function getFact(){
  if(universe.facts.length === 0 && extras.facts.length){
    return rand(extras.facts);
  }

  if(universe.usedToday.length >= universe.facts.length){
    universe.usedToday = [];
  }

  let disponibles = universe.facts.filter(f => !universe.usedToday.includes(f));
  const fact = rand(disponibles);

  universe.usedToday.push(fact);
  fs.writeFileSync("./universe.json", JSON.stringify(universe,null,2));

  return fact;
}

// ================= START =================
async function start(){
  await mongo.connect();

  const db = mongo.db("patroclo_bot");
  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  asociaColl = db.collection("asociaciones");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO FINAL GOD ONLINE");
}

// ================= MENSAJES =================
client.on("messageCreate", async msg=>{
  if(!msg.author) return;

  // anti-loop
  if(msg.author.id === ID_PATROCLO_ORIGINAL){
    loopBotCounter++;
    if(loopBotCounter >= 3) return;
  } else if(!msg.author.bot){
    loopBotCounter = 0;
  }

  if(msg.author.bot) return;

  let user = await usersColl.findOne({userId:msg.author.id}) 
    || {userId:msg.author.id, points:1000};

  const content = msg.content.toLowerCase();

  // memoria chat
  memoria.chat.push(`${msg.author.username}: ${msg.content}`);
  if(memoria.chat.length > 20) memoria.chat.shift();
  saveMem();

  // reacciones auto
  extras.reacciones_auto.palabras_clave.forEach(p=>{
    if(content.includes(p)){
      msg.react(rand(extras.reacciones_auto.emojis)).catch(()=>{});
    }
  });

  // guardar ADN
  if(!msg.content.startsWith("!") && msg.content.length > 5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:config},{upsert:true});
    }
  }

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(["modo","asocia","olvida"].includes(cmd) && msg.author.id !== ID_OWNER) return;

    if(cmd==="modo"){
      config.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:config},{upsert:true});
      return msg.reply(`Modo: ${args[0]}`);
    }

    if(cmd==="asocia"){
      const p = args.join(" ").split(">");
      if(p.length < 2) return msg.reply("Uso: !asocia clave > respuesta");

      await asociaColl.updateOne(
        {clave:p[0].trim().toLowerCase()},
        {$set:{respuesta:p[1].trim()}},
        {upsert:true}
      );

      return msg.reply("Guardado.");
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="gif"){
      const r = await axios.get(
        `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`
      );
      return msg.reply(r.data.data[0]?.images?.original?.url || "Nada");
    }

    if(cmd==="foto"){
      try{
        const res = await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          { inputs: args.join(" ") },
          { headers:{Authorization:`Bearer ${process.env.HF_API_KEY}`}, responseType:'arraybuffer' }
        );

        return msg.reply({
          files:[new AttachmentBuilder(Buffer.from(res.data), {name:"img.png"})]
        });
      }catch{
        return msg.reply("Error generando imagen");
      }
    }

    if(cmd==="universefacts"){
      return msg.reply(getFact());
    }

    if(cmd==="bj"){
      const m = parseInt(args[0])||100;
      if(user.points < m) return msg.reply("No tenés plata");

      const manoU = [generarCarta(), generarCarta()];

      client.retos.set(`bj_${msg.author.id}`, {
        monto:m,
        manoU,
        manoB:[generarCarta()]
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
      );

      return msg.reply({
        content:`🃏 ${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`,
        components:[row]
      });
    }

    return;
  }

  // ================= TRIGGERS =================
  const insultos = ["pelotudo","boludo","hdp","forro","pajero"];
  const usuarioInsulto = insultos.some(i => content.includes(i));

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

  // ===== MODO NORMAL =====
  if(config.modoActual === "normal"){

    const asoc = await asociaColl.findOne({clave:content});
    if(asoc) return msg.reply(asoc.respuesta);

    const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,50);

    const r = await IA(
      `ADN: [${muestra.join(" | ")}]\nMensaje: "${msg.content}"\nElegí SOLO una.`,
      "normal"
    );

    return msg.reply(cortar(r) || rand(config.phrases));
  }

  // ===== IA / SERIO =====
  const adn = config.phrases.slice(-20).join(" | ");

  const r = await IA(
    `ADN: ${adn}\nUsuario: ${msg.content}`,
    config.modoActual,
    usuarioInsulto
  );

  return msg.reply(cortar(r) || rand(config.phrases));
});

// ================= INTERACCIONES =================
client.on("interactionCreate", async int=>{
  if(!int.isButton()) return;

  const d = client.retos.get(`bj_${int.user.id}`);
  if(!d) return;

  if(int.customId==="bj_pedir"){
    d.manoU.push(generarCarta());
    const p = calcularPuntos(d.manoU);

    if(p>21){
      await usersColl.updateOne(
        {userId:int.user.id},
        {$inc:{points:-d.monto}},
        {upsert:true}
      );
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({content:`💀 ${p} Perdiste`,components:[]});
    }

    return int.update({content:`🃏 ${d.manoU.map(c=>c.txt).join(" ")} (${p})`});
  }

  if(int.customId==="bj_plantarse"){
    let pb = calcularPuntos(d.manoB);
    while(pb<17){
      d.manoB.push(generarCarta());
      pb = calcularPuntos(d.manoB);
    }

    const pu = calcularPuntos(d.manoU);
    const win = pb>21 || pu>pb;

    await usersColl.updateOne(
      {userId:int.user.id},
      {$inc:{points:win?d.monto:-d.monto}},
      {upsert:true}
    );

    client.retos.delete(`bj_${int.user.id}`);

    return int.update({
      content: win ? "🏆 Ganaste" : "💀 Perdiste",
      components:[]
    });
  }
});

start();