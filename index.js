// ==========================================
// PATROCLO HC++++ FINAL
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
import { createCanvas } from "canvas";

dotenv.config();

// ================= SERVER =================
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO HC++++ ONLINE")).listen(port);

// ================= SAFE JSON =================
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

let memoria = safeJSON("./memoria.json",{chat:[], users:{}});
let extras = safeJSON("./extras.json",{phrases:[],facts:[],reacciones_auto:{palabras_clave:[],emojis:[]}});
let universe = safeJSON("./universe.json",{facts:[],usedToday:[]});

// ================= CLIENT =================
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, placeColl, asociaColl;

// ================= CONFIG =================
let config = { phrases: [], modoActual: "ia", motorIA: "gemini" };

let msgCounter = 0;
if(!client.retos) client.retos = new Map();

// ================= UTILS =================
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// ================= IA =================
async function IA(contexto, modo, insulto=false){
  let sys;

  if(modo==="serio"){
    sys="Sos un asistente profesional.";
  }
  else if(modo==="ia"){
    sys = insulto
      ? "Sos Patroclo argentino, agresivo y bardero."
      : "Sos Patroclo argentino, sarcástico.";
  }
  else{
    sys="Elegí UNA frase. No inventes.";
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {contents:[{parts:[{text:sys+"\n\n"+contexto}]}]}
    );

    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }catch{
    return null;
  }
}

// ================= START =================
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  placeColl = db.collection("place");
  asociaColl = db.collection("asociaciones");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO HC++++ ONLINE");
}

// ================= CARTAS =================
function generarCarta(){
  const v=[{n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}];
  const i=rand(v);
  return {txt:`${i.n}${rand(['♠️','♥️','♦️','♣️'])}`,val:i.v};
}

function puntos(m){
  let p=m.reduce((a,c)=>a+c.val,0);
  let ases=m.filter(c=>c.txt.startsWith("A")).length;
  while(p>21 && ases>0){p-=10;ases--;}
  return p;
}

// ================= MENSAJES =================
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  let user = await usersColl.findOne({userId:msg.author.id}) || {userId:msg.author.id, points:1000, rep:0};

  const content = msg.content.toLowerCase();

  // ===== MEMORIA POR USUARIO (HC+++) =====
  if(!memoria.users[msg.author.id]){
    memoria.users[msg.author.id] = { mensajes:[], personalidad:{} };
  }

  memoria.users[msg.author.id].mensajes.push(msg.content);
  if(memoria.users[msg.author.id].mensajes.length > 20)
    memoria.users[msg.author.id].mensajes.shift();

  fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2));

  // ===== ADN =====
  if(!msg.content.startsWith("!") && msg.content.length > 5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"}, {$set:config},{upsert:true});
    }
  }

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      config.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"}, {$set:config},{upsert:true});
      return msg.reply("Modo: "+args[0]);
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="stats"){
      return msg.reply(`🧠 ${config.phrases.length} frases\n💰 $${user.points}`);
    }

    if(cmd==="asocia"){
      const p = args.join(" ").split(">");
      await asociaColl.updateOne(
        {clave:p[0].trim()},
        {$set:{respuesta:p[1].trim()}},
        {upsert:true}
      );
      return msg.reply("Guardado.");
    }

    if(cmd==="gif"){
      const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
      return msg.reply(r.data.data[0]?.images?.original?.url || "Nada");
    }

    if(cmd==="foto"){
      try{
        const r = await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          {inputs: args.join(" ")},
          {headers:{Authorization:`Bearer ${process.env.HF_API_KEY}`},responseType:"arraybuffer"}
        );
        return msg.reply({files:[new AttachmentBuilder(Buffer.from(r.data),{name:"img.png"})]});
      }catch{
        return msg.reply("Error generando imagen");
      }
    }

    if(cmd==="universefacts"){
      let pool = [...universe.facts.filter(f=>!universe.usedToday.includes(f)), ...extras.facts];
      const fact = rand(pool);

      universe.usedToday.push(fact);
      if(universe.usedToday.length > universe.facts.length)
        universe.usedToday = [];

      fs.writeFileSync("./universe.json", JSON.stringify(universe,null,2));

      return msg.reply(fact);
    }

    // ===== W PLACE =====
    if(cmd==="place"){
      const x=parseInt(args[0]);
      const y=parseInt(args[1]);
      const color=args[2]||"#fff";

      await placeColl.updateOne(
        {x,y},
        {$set:{color,server:msg.guild.id}},
        {upsert:true}
      );

      return msg.reply(`Pixel (${x},${y})`);
    }

    if(cmd==="mapa"){
      const size=64, scale=10;
      const canvas=createCanvas(size*scale,size*scale);
      const ctx=canvas.getContext("2d");

      ctx.fillStyle="#111";
      ctx.fillRect(0,0,canvas.width,canvas.height);

      const pixels=await placeColl.find().toArray();
      pixels.forEach(p=>{
        ctx.fillStyle=p.color;
        ctx.fillRect(p.x*scale,p.y*scale,scale,scale);
      });

      return msg.reply({
        files:[new AttachmentBuilder(canvas.toBuffer(),{name:"mapa.png"})]
      });
    }

    // ===== RULETA =====
    if(cmd==="ruleta"){
      const m=parseInt(args[0])||100;
      const numero=Math.floor(Math.random()*37);
      const color=numero===0?"verde":numero%2?"rojo":"negro";

      const win = args[1]==numero || args[1]==color;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points: win?m*2:-m}},
        {upsert:true}
      );

      return msg.reply(`${numero} (${color}) ${win?"GANASTE":"PERDISTE"}`);
    }

    return;
  }

  // ================= TRIGGER =================
  const insultos = ["pelotudo","boludo","hdp","forro"];
  const insulto = insultos.some(i=>content.includes(i));

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
  if(config.modoActual==="normal"){
    const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,50);

    const r = await IA(
      `Frases: [${muestra.join(" | ")}]\nMensaje: ${msg.content}`,
      "normal"
    );

    return msg.reply(r || rand(config.phrases));
  }

  // ===== IA =====
  const r = await IA(msg.content, config.modoActual, insulto);

  return msg.reply(cortar(r) || rand(config.phrases));
});

start();