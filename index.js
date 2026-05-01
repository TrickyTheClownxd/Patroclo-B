import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
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

// ================= JSON SAFE =================
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

// ================= DB COLLS =================
let usersColl, dataColl, placeColl, asociaColl, userMemColl;

// ================= CONFIG =================
let config = { phrases:[], modoActual:"ia", motorIA:"gemini" };

// ================= UTILS =================
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";
let msgCounter = 0;

// ================= IA =================
async function IA(contexto, modo){
  let sys;
  if(modo==="normal"){
    sys="Elegí UNA frase de la lista que mejor encaje con el contexto. NO inventes.";
  } else if(modo==="serio"){
    sys="Sos un asistente profesional claro y conciso.";
  } else {
    sys="Sos un pibe argentino sarcástico, divertido y breve.";
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {contents:[{parts:[{text:sys+"\n\n"+contexto}]}]}
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }catch{
    return null;
  }
}

// ================= EMOCIONES / REPUTACIÓN =================
function updateEmotion(userId, content){
  const u = memoria.users[userId] || {messages:[], rep:0, mood:0};
  // heurística simple
  const positivos = ["gracias","bien","genial","joya","crack"];
  const negativos = ["boludo","hdp","forro","pajero","idiota","puto"];
  let delta = 0;

  if(positivos.some(w=>content.includes(w))) delta += 1;
  if(negativos.some(w=>content.includes(w))) delta -= 2;

  u.rep = (u.rep||0) + delta;        // reputación acumulada
  u.mood = Math.max(-5, Math.min(5, (u.mood||0) + delta)); // estado corto

  memoria.users[userId] = u;
}

function styleByEmotion(userId){
  const u = memoria.users[userId] || {};
  if((u.mood||0) <= -3) return "bardea un poco, irónico";
  if((u.mood||0) >= 3) return "buena onda, cercano";
  return "neutral";
}

// ================= PLACE (r/place) =================
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

// ================= START =================
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  placeColl = db.collection("place_pixels");
  asociaColl = db.collection("asociaciones");
  userMemColl = db.collection("user_memory");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config, ...d};

  // 🔥 FUSIÓN ADN (Mongo + JSON)
  config.phrases = Array.from(new Set([
    ...(config.phrases||[]),
    ...(memoria.phrases||[])
  ]));
  memoria.phrases = config.phrases;
  saveMem();

  await client.login(process.env.TOKEN);
  console.log("🔥 ONLINE HC ADN+++");
}

// ================= MENSAJES =================
client.on("messageCreate", async (msg)=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // ===== MEMORIA USUARIO (corto plazo JSON) =====
  if(!memoria.users[msg.author.id]){
    memoria.users[msg.author.id] = {messages:[], rep:0, mood:0};
  }
  memoria.users[msg.author.id].messages.push(msg.content);
  if(memoria.users[msg.author.id].messages.length>10){
    memoria.users[msg.author.id].messages.shift();
  }

  // ===== EMOCIONES / REPUTACIÓN =====
  updateEmotion(msg.author.id, content);

  // ===== MEMORIA LARGO PLAZO (Mongo) =====
  try{
    await userMemColl.updateOne(
      {userId: msg.author.id},
      {
        $inc: { messagesCount: 1, rep: memoria.users[msg.author.id].rep || 0 },
        $set: { lastMessage: msg.content }
      },
      { upsert: true }
    );
  }catch{}

  // ===== ADN GLOBAL =====
  if(!msg.content.startsWith("!") && msg.content.length>5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
    }
    if(!memoria.phrases.includes(msg.content)){
      memoria.phrases.push(msg.content);
    }
    await dataColl.updateOne(
      {id:"main_config"},
      {$set:{phrases:config.phrases}},
      {upsert:true}
    );
    saveMem();
  }

  // ===== CONTEXTO GLOBAL =====
  memoria.chat.push(`${msg.author.username}: ${msg.content}`);
  if(memoria.chat.length>20) memoria.chat.shift();

  // ===== REACCIONES AUTO =====
  extras.reacciones_auto?.palabras_clave?.forEach(p=>{
    if(content.includes(p)){
      msg.react(rand(extras.reacciones_auto.emojis||["🔥"])).catch(()=>{});
    }
  });

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    // --- MODO ---
    if(cmd==="modo"){
      const m = (args[0]||"ia").toLowerCase();
      if(!["normal","ia","serio"].includes(m)){
        return msg.reply("Usá: !modo normal | ia | serio");
      }
      config.modoActual = m;
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:m}},{upsert:true});
      return msg.reply("Modo: "+m);
    }

    // --- ASOCIA ---
    if(cmd==="asocia"){
      const txt = args.join(" ").split(">");
      if(txt.length<2) return msg.reply("uso: !asocia clave > respuesta");
      await asociaColl.updateOne(
        {clave:txt[0].trim().toLowerCase()},
        {$set:{respuesta:txt[1].trim()}},
        {upsert:true}
      );
      return msg.reply("Guardado.");
    }

    // --- UNIVERSE ---
    if(cmd==="universefacts"){
      let disponibles = universe.facts.filter(f=>!universe.usedToday.includes(f));
      if(disponibles.length===0){
        universe.usedToday=[];
        disponibles=universe.facts;
      }
      const fact = rand(disponibles);
      universe.usedToday.push(fact);

      // si se agotaron, agrego extras
      if(universe.usedToday.length>=universe.facts.length && extras.facts?.length){
        universe.facts.push(...extras.facts);
      }
      saveUniverse();
      return msg.reply(fact);
    }

    // --- GIF ---
    if(cmd==="gif"){
      try{
        const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
        return msg.reply(res.data.data[0]?.url || "No encontré gif.");
      }catch{
        return msg.reply("Giphy caído.");
      }
    }

    // --- FOTO (HF) ---
    if(cmd==="foto"){
      try{
        const res = await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          { inputs: args.join(" ") },
          { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: "arraybuffer" }
        );
        return msg.reply({ files: [new AttachmentBuilder(Buffer.from(res.data), { name: "foto.png" })] });
      }catch{
        return msg.reply("No pude generar la imagen.");
      }
    }

    // --- PLACE ---
    if(cmd==="place"){
      const img = await renderPlace();
      return msg.reply({files:[new AttachmentBuilder(img,"map.png")]});
    }

    if(cmd==="zoom"){
      const img = await renderZoom(0,50,0,50);
      return msg.reply({files:[new AttachmentBuilder(img,"zoom.png")]});
    }

    if(cmd==="pixel"){
      const x = parseInt(args[0]);
      const y = parseInt(args[1]);
      const color = args[2] || "#ffffff";

      if(isNaN(x)||isNaN(y)) return msg.reply("Uso: !pixel x y #color");

      const last = cooldown.get(msg.author.id)||0;
      if(Date.now()-last < 3000) return msg.reply("⏳ Esperá");
      cooldown.set(msg.author.id, Date.now());

      const existing = await placeColl.findOne({x,y});
      let cost = 0;

      if(existing && existing.guildId !== msg.guild.id){
        const powerEnemy = await getServerPower(existing.guildId);
        const powerMe = await getServerPower(msg.guild.id);
        cost = powerEnemy > powerMe ? 1000 : 200;

        let user = await usersColl.findOne({userId:msg.author.id});
        if(!user || user.points < cost) return msg.reply(`💀 Necesitás $${cost}`);

        await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-cost}},{upsert:true});
      }

      await placeColl.updateOne(
        {x,y},
        {$set:{color,guildId:msg.guild.id,ownerId:msg.author.id}},
        {upsert:true}
      );

      return msg.reply(cost?`⚔️ Conquista $${cost}`:"🎨 Pintado");
    }

    if(cmd==="topplace"){
      const top = await placeColl.aggregate([
        {$group:{_id:"$guildId",total:{$sum:1}}},
        {$sort:{total:-1}},
        {$limit:5}
      ]).toArray();

      return msg.reply("🏆\n"+top.map((t,i)=>`${i+1}. ${t._id} → ${t.total}`).join("\n"));
    }

    // --- SALDO ---
    if(cmd==="bal"){
      let user = await usersColl.findOne({userId:msg.author.id}) || {points:0};
      return msg.reply(`💰 Saldo: $${user.points}`);
    }

    return;
  }

  // ================= TRIGGERS =================
  msgCounter++;

  const invocado =
    msg.mentions.has(client.user.id) ||
    content.includes("patro");

  const randomTrigger = Math.random() < 0.25;
  const forcedTrigger = msgCounter >= 3;

  if(!invocado && !randomTrigger && !forcedTrigger) return;
  msgCounter = 0;

  // ================= ASOCIACIONES =================
  const asoc = await asociaColl.findOne({clave:content});
  if(asoc) return msg.reply(asoc.respuesta);

  // ================= MODO NORMAL (ADN) =================
  if(config.modoActual==="normal"){
    const pool = [...config.phrases, ...(extras.phrases||[])].slice(-60);

    const userMem = memoria.users[msg.author.id]?.messages?.join("\n") || "";
    const style = styleByEmotion(msg.author.id);

    const r = await IA(
      `Estilo: ${style}
Contexto global:
${memoria.chat.join("\n")}

Usuario:
${userMem}

Frases:
${pool.join("\n")}`,
      "normal"
    );

    if(r && pool.includes(r.trim())){
      return msg.reply(r.trim());
    }
    return msg.reply(rand(pool));
  }

  // ================= IA LIBRE =================
  const style = styleByEmotion(msg.author.id);
  const r = await IA(`Estilo: ${style}\nMsg: ${msg.content}`, config.modoActual);
  return msg.reply(r ? cortar(r) : rand(config.phrases));
});

// ================= START =================
start();