import {
  Client, GatewayIntentBits, Partials,
  AttachmentBuilder
} from "discord.js";

import { MongoClient } from "mongodb";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

// ================= SERVER =================
http.createServer((req,res)=>res.end("PATROCLO HC ADN+++")).listen(process.env.PORT||8080);

// ================= JSON =================
function safeJSON(path, def){
  try{
    if(!fs.existsSync(path)){
      fs.writeFileSync(path, JSON.stringify(def,null,2));
      return def;
    }
    return JSON.parse(fs.readFileSync(path,"utf-8"));
  }catch{return def;}
}

let memoria = safeJSON("./memoria.json",{chat:[],users:{},phrases:[]});
const extras = safeJSON("./extras.json",{phrases:[],facts:[],reacciones_auto:{}});
let universe = safeJSON("./universe.json",{facts:[],usedToday:[]});

const saveMem = ()=>fs.writeFileSync("./memoria.json",JSON.stringify(memoria,null,2));
const saveUniverse = ()=>fs.writeFileSync("./universe.json",JSON.stringify(universe,null,2));

// ================= CLIENT =================
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, placeColl, asociaColl, userMemColl;

let config = { phrases:[], modoActual:"ia" };

const rand = a=>a[Math.floor(Math.random()*a.length)];
const cortar = t=>t?.slice(0,1900);

let msgCounter=0;

// ================= IA =================
async function IA(contexto, modo){
  let sys;

  if(modo==="normal"){
    sys="Elegí UNA frase del ADN que encaje mejor. NO inventes.";
  } else if(modo==="serio"){
    sys="Respondé de forma profesional.";
  } else {
    sys="Sos argentino sarcástico.";
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {contents:[{parts:[{text:sys+"\n\n"+contexto}]}]}
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }catch{return null;}
}

// ================= EMOCIONES =================
function updateEmotion(userId, content){
  const u = memoria.users[userId] || {messages:[], rep:0, mood:0};

  const pos = ["gracias","bien","genial","joya","crack"];
  const neg = ["boludo","hdp","forro","pajero","idiota","puto"];

  let delta=0;
  if(pos.some(w=>content.includes(w))) delta+=1;
  if(neg.some(w=>content.includes(w))) delta-=2;

  u.rep += delta;
  u.mood = Math.max(-5, Math.min(5, u.mood+delta));

  memoria.users[userId]=u;
}

function styleByEmotion(userId){
  const u = memoria.users[userId]||{};
  if(u.mood<=-3) return "irónico";
  if(u.mood>=3) return "amigable";
  return "neutral";
}

// ================= PLACE =================
const SIZE=128, SCALE=4;
const cooldown = new Map();

async function getServerPower(id){
  return await placeColl.countDocuments({guildId:id});
}

async function renderPlace(){
  const canvas = createCanvas(SIZE*SCALE,SIZE*SCALE);
  const ctx = canvas.getContext("2d");

  try{
    const bg = await loadImage("./maps/world.png");
    ctx.drawImage(bg,0,0,canvas.width,canvas.height);
  }catch{}

  const pixels = await placeColl.find().toArray();

  pixels.forEach(p=>{
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x*SCALE,p.y*SCALE,SCALE,SCALE);
  });

  return canvas.toBuffer();
}

async function renderZoom(minX,maxX,minY,maxY){
  const canvas = createCanvas((maxX-minX)*SCALE,(maxY-minY)*SCALE);
  const ctx = canvas.getContext("2d");

  const pixels = await placeColl.find({
    x:{$gte:minX,$lte:maxX},
    y:{$gte:minY,$lte:maxY}
  }).toArray();

  pixels.forEach(p=>{
    ctx.fillStyle=p.color;
    ctx.fillRect((p.x-minX)*SCALE,(p.y-minY)*SCALE,SCALE,SCALE);
  });

  return canvas.toBuffer();
}

// ================= START =================
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl=db.collection("users");
  dataColl=db.collection("bot_data");
  placeColl=db.collection("place_pixels");
  asociaColl=db.collection("asociaciones");
  userMemColl=db.collection("user_memory");

  const d = await dataColl.findOne({id:"main_config"});

  config.phrases = Array.from(new Set([
    ...(d?.phrases||[]),
    ...(memoria.phrases||[])
  ]));

  memoria.phrases=config.phrases;
  saveMem();

  await client.login(process.env.TOKEN);
  console.log("🔥 ONLINE FULL ADN+++");
}

// ================= MENSAJES =================
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // ===== MEMORIA =====
  if(!memoria.users[msg.author.id]){
    memoria.users[msg.author.id]={messages:[],rep:0,mood:0};
  }

  memoria.users[msg.author.id].messages.push(msg.content);
  if(memoria.users[msg.author.id].messages.length>10){
    memoria.users[msg.author.id].messages.shift();
  }

  updateEmotion(msg.author.id, content);

  await userMemColl.updateOne(
    {userId:msg.author.id},
    {$inc:{msg:1}},
    {upsert:true}
  );

  // ===== APRENDIZAJE =====
  const texto = msg.content.trim().toLowerCase();
  const esSpam = /(.)\1{6,}/.test(texto);

  if(!msg.content.startsWith("!") && texto.length>1 && !esSpam){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      memoria.phrases.push(msg.content);

      await dataColl.updateOne(
        {id:"main_config"},
        {$set:{phrases:config.phrases}},
        {upsert:true}
      );

      saveMem();
    }
  }

  // ===== CHAT =====
  memoria.chat.push(msg.content);
  if(memoria.chat.length>20) memoria.chat.shift();

  // ===== REACCIONES =====
  extras.reacciones_auto?.palabras_clave?.forEach(p=>{
    if(content.includes(p)){
      msg.react(rand(extras.reacciones_auto.emojis||["🔥"])).catch(()=>{});
    }
  });

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      config.modoActual=args[0]||"ia";
      return msg.reply("Modo: "+config.modoActual);
    }

    if(cmd==="asocia"){
      const t=args.join(" ").split(">");
      await asociaColl.updateOne(
        {clave:t[0].trim().toLowerCase()},
        {$set:{respuesta:t[1].trim()}},
        {upsert:true}
      );
      return msg.reply("ok");
    }

    if(cmd==="gif"){
      try{
        const r=await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
        return msg.reply(r.data.data[0]?.url||"no");
      }catch{return msg.reply("error");}
    }

    if(cmd==="foto"){
      try{
        const r=await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          {inputs:args.join(" ")},
          {headers:{Authorization:`Bearer ${process.env.HF_API_KEY}`},responseType:"arraybuffer"}
        );
        return msg.reply({files:[new AttachmentBuilder(Buffer.from(r.data),"img.png")]});
      }catch{return msg.reply("error img");}
    }

    if(cmd==="universefacts"){
      let disp=universe.facts.filter(f=>!universe.usedToday.includes(f));
      if(!disp.length){universe.usedToday=[];disp=universe.facts;}
      const f=rand(disp);
      universe.usedToday.push(f);
      saveUniverse();
      return msg.reply(f);
    }

    if(cmd==="place"){
      const img=await renderPlace();
      return msg.reply({files:[new AttachmentBuilder(img,"map.png")]});
    }

    if(cmd==="zoom"){
      const img=await renderZoom(0,50,0,50);
      return msg.reply({files:[new AttachmentBuilder(img,"zoom.png")]});
    }

    if(cmd==="pixel"){
      const x=parseInt(args[0]);
      const y=parseInt(args[1]);
      const color=args[2]||"#fff";

      const last=cooldown.get(msg.author.id)||0;
      if(Date.now()-last<3000) return msg.reply("espera");

      cooldown.set(msg.author.id,Date.now());

      const existing=await placeColl.findOne({x,y});
      let cost=0;

      if(existing && existing.guildId!==msg.guild.id){
        const p1=await getServerPower(existing.guildId);
        const p2=await getServerPower(msg.guild.id);
        cost=p1>p2?1000:200;

        let u=await usersColl.findOne({userId:msg.author.id});
        if(!u||u.points<cost) return msg.reply("no money");

        await usersColl.updateOne(
          {userId:msg.author.id},
          {$inc:{points:-cost}},
          {upsert:true}
        );
      }

      await placeColl.updateOne(
        {x,y},
        {$set:{color,guildId:msg.guild.id}},
        {upsert:true}
      );

      return msg.reply(cost?"⚔️":"🎨");
    }

    if(cmd==="topplace"){
      const top=await placeColl.aggregate([
        {$group:{_id:"$guildId",total:{$sum:1}}},
        {$sort:{total:-1}},
        {$limit:5}
      ]).toArray();

      return msg.reply(top.map((t,i)=>`${i+1}. ${t.total}`).join("\n"));
    }

    if(cmd==="bal"){
      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      return msg.reply(`💰 ${u.points}`);
    }

    return;
  }

  // ================= RESPUESTA =================
  msgCounter++;
  if(msgCounter<3 && Math.random()>0.25) return;
  msgCounter=0;

  const asoc=await asociaColl.findOne({clave:content});
  if(asoc) return msg.reply(asoc.respuesta);

  if(config.modoActual==="normal"){
    const pool=config.phrases.length?config.phrases:extras.phrases;
    const r=await IA(msg.content,"normal");
    return msg.reply(r||rand(pool));
  }

  const r=await IA(msg.content,config.modoActual);
  return msg.reply(r||rand(config.phrases));
});

start();