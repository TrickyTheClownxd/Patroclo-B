import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, AttachmentBuilder
} from "discord.js";

import { MongoClient } from "mongodb";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

// ===== SERVER =====
http.createServer((req,res)=>res.end("PATROCLO HC++++++++")).listen(process.env.PORT||8080);

// ===== FILES =====
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
const extras = safeJSON("./extras.json",{});
let universe = safeJSON("./universe.json",{facts:[],usedToday:[]});

const saveMem = ()=>fs.writeFileSync("./memoria.json",JSON.stringify(memoria,null,2));
const saveUniverse = ()=>fs.writeFileSync("./universe.json",JSON.stringify(universe,null,2));

// ===== CLIENT =====
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, placeColl;

let config = { phrases:[], modoActual:"ia", motorIA:"gemini" };

let msgCounter = 0;
const rand = a=>a[Math.floor(Math.random()*a.length)];
const cortar = t=>t?.slice(0,1900);

// ===== IA =====
async function IA(contexto, modo){
  let sys;

  if(modo==="normal"){
    sys="Elegí UNA frase de la lista que mejor encaje con el contexto. NO inventes.";
  } else if(modo==="serio"){
    sys="Sos un asistente profesional.";
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

// ===== PLACE =====
const SIZE=128, SCALE=4;
const cooldown = new Map();

async function getServerPower(guildId){
  return await placeColl.countDocuments({guildId});
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

// ===== START =====
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl=db.collection("users");
  dataColl=db.collection("bot_data");
  placeColl=db.collection("place_pixels");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config={...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 ONLINE");
}

// ===== MENSAJES =====
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // ===== ADN =====
  if(!msg.content.startsWith("!") && msg.content.length>5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      memoria.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:config},{upsert:true});
      saveMem();
    }
  }

  // ===== CHAT MEM =====
  memoria.chat.push(`${msg.author.username}: ${msg.content}`);
  if(memoria.chat.length>20) memoria.chat.shift();
  saveMem();

  // ===== REACCIONES =====
  extras.reacciones_auto?.palabras_clave?.forEach(p=>{
    if(content.includes(p)){
      msg.react(rand(extras.reacciones_auto.emojis)).catch(()=>{});
    }
  });

  // ===== COMANDOS =====
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="universefacts"){
      let disponibles = universe.facts.filter(f=>!universe.usedToday.includes(f));
      if(disponibles.length===0){
        universe.usedToday=[];
        disponibles=universe.facts;
      }

      const fact = rand(disponibles);
      universe.usedToday.push(fact);

      if(universe.usedToday.length>=universe.facts.length){
        universe.facts.push(...extras.facts);
      }

      saveUniverse();
      return msg.reply(fact);
    }

    if(cmd==="pixel"){
      const x=parseInt(args[0]);
      const y=parseInt(args[1]);
      const color=args[2]||"#ffffff";

      const existing = await placeColl.findOne({x,y});
      let cost=0;

      if(existing && existing.guildId !== msg.guild.id){
        const powerEnemy = await getServerPower(existing.guildId);
        const powerMe = await getServerPower(msg.guild.id);
        cost = powerEnemy > powerMe ? 1000 : 200;

        let user = await usersColl.findOne({userId:msg.author.id});
        if(!user || user.points < cost) return msg.reply("💀 Sin plata");

        await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-cost}},{upsert:true});
      }

      await placeColl.updateOne(
        {x,y},
        {$set:{color,guildId:msg.guild.id,ownerId:msg.author.id}},
        {upsert:true}
      );

      return msg.reply(cost?`⚔️ Conquista $${cost}`:"🎨 Pintado");
    }

    if(cmd==="place"){
      const img = await renderPlace();
      return msg.reply({files:[new AttachmentBuilder(img,"map.png")]});
    }

    if(cmd==="zoom"){
      const img = await renderZoom(0,50,0,50);
      return msg.reply({files:[new AttachmentBuilder(img,"zoom.png")]});
    }

    if(cmd==="topplace"){
      const top = await placeColl.aggregate([
        {$group:{_id:"$guildId",total:{$sum:1}}},
        {$sort:{total:-1}},
        {$limit:5}
      ]).toArray();

      return msg.reply("🏆\n"+top.map((t,i)=>`${i+1}. ${t._id} → ${t.total}`).join("\n"));
    }

    return;
  }

  // ===== TRIGGERS =====
  msgCounter++;

  const invocado =
    msg.mentions.has(client.user.id) ||
    content.includes("patro");

  const randomTrigger = Math.random() < 0.25;
  const forcedTrigger = msgCounter >= 3;

  if(!invocado && !randomTrigger && !forcedTrigger) return;

  msgCounter = 0;

  // ===== MODO NORMAL (ADN INTELIGENTE) =====
  if(config.modoActual==="normal"){

    const pool = [...config.phrases, ...extras.phrases].slice(-40);

    const r = await IA(
      `Contexto:\n${memoria.chat.join("\n")}\n\nFrases:\n${pool.join("\n")}`,
      "normal"
    );

    if(r && pool.includes(r.trim())){
      return msg.reply(r.trim());
    }

    return msg.reply(rand(pool));
  }

  // ===== IA NORMAL =====
  const r = await IA(msg.content,config.modoActual);
  return msg.reply(r || rand(config.phrases));
});

start();