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
http.createServer((req,res)=>res.end("PATROCLO HC FINAL")).listen(process.env.PORT||8080);

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
    sys="Respondé profesional.";
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
  console.log("🔥 PATROCLO FULL ONLINE");
}

// ================= MENSAJES =================
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // ===== APRENDIZAJE =====
  const texto = msg.content.trim().toLowerCase();
  if(!msg.content.startsWith("!") && texto.length>1){
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

  // ================= COMANDOS =================
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="bal"){
      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      return msg.reply(`💰 ${u.points}`);
    }

    if(cmd==="daily"){
      let u=await usersColl.findOne({userId:msg.author.id})||{};
      if(Date.now()-(u.lastDaily||0)<86400000) return msg.reply("⏳ ya usado");

      const reward=200+Math.floor(Math.random()*400);

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$set:{lastDaily:Date.now()},$inc:{points:reward}},
        {upsert:true}
      );

      return msg.reply(`🎁 +$${reward}`);
    }

    if(cmd==="work"){
      let u=await usersColl.findOne({userId:msg.author.id})||{};
      let reward=100+Math.floor(Math.random()*300);

      if(u.boostUntil> Date.now()) reward*=2;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:reward}},
        {upsert:true}
      );

      return msg.reply(`💼 +$${reward}`);
    }

    if(cmd==="pay"){
      const user=msg.mentions.users.first();
      const amount=parseInt(args[1]);

      if(!user||!amount||amount<=0) return msg.reply("uso: !pay @user cantidad");

      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      if(u.points<amount) return msg.reply("no money");

      await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-amount}});
      await usersColl.updateOne({userId:user.id},{$inc:{points:amount}},{upsert:true});

      return msg.reply("💸 enviado");
    }

    if(cmd==="slot"){
      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      if(u.points<50) return msg.reply("no money");

      const r=[rand(["🍒","💎","7️⃣"]),rand(["🍒","💎","7️⃣"]),rand(["🍒","💎","7️⃣"])];
      const win=r[0]===r[1]&&r[1]===r[2]?400:0;

      await usersColl.updateOne({userId:msg.author.id},{$inc:{points:win-50}});

      return msg.reply(`${r.join("|")} → ${win?"💰":"💀"}`);
    }

    if(cmd==="ruleta"){
      const bet=parseInt(args[0]);
      if(!bet) return msg.reply("apuesta inválida");

      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      if(u.points<bet) return msg.reply("no money");

      const win=Math.random()<0.45;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points: win?bet:-bet}}
      );

      return msg.reply(win?"🎉":"💀");
    }

    if(cmd==="coinflip"){
      const bet=parseInt(args[0]);
      if(!bet) return msg.reply("apuesta inválida");

      const win=Math.random()<0.5;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points: win?bet:-bet}}
      );

      return msg.reply(win?"🪙":"💀");
    }

    if(cmd==="comprar"){
      const item=args[0];

      const precios={escudo:1000,doble:1500};

      let u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      if(u.points<precios[item]) return msg.reply("no money");

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:-precios[item]}}
      );

      if(item==="escudo"){
        await usersColl.updateOne(
          {userId:msg.author.id},
          {$set:{shieldUntil:Date.now()+3600000}}
        );
      }

      if(item==="doble"){
        await usersColl.updateOne(
          {userId:msg.author.id},
          {$set:{boostUntil:Date.now()+3600000}}
        );
      }

      return msg.reply("comprado");
    }

    if(cmd==="place"){
      const img=await renderPlace();
      return msg.reply({files:[new AttachmentBuilder(img,"map.png")]});
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
      }

      await placeColl.updateOne(
        {x,y},
        {$set:{color,guildId:msg.guild.id}},
        {upsert:true}
      );

      return msg.reply(cost?"⚔️":"🎨");
    }

    if(cmd==="ayudacmd"){
  return msg.reply(`
📜 **PATROCLO COMANDOS**

🎨 MAPA
!place → ver mapa
!pixel x y color → dibujar
!zoom x1 x2 y1 y2 → zoom

📷 MULTIMEDIA
!gif palabra → buscar gif
!foto palabra → generar imagen

🌌 EXTRA
!universefacts → dato del universo

💰 ECONOMÍA
!bal → dinero
!daily → recompensa diaria
!work → ganar plata
!pay @user cantidad → transferir

🎰 CASINO
!slot → tragamonedas
!ruleta cantidad → apostar
!coinflip cantidad → cara/cruz

🏪 TIENDA
!comprar escudo → protección
!comprar doble → x2 ganancias

🧠 IA
!modo normal | ia | serio

🏆 RANKING
!topplace → servidores
!rich → usuarios

🔥 El bot aprende solo del chat
  `);
}

    return;
  }

  // ================= IA =================
  msgCounter++;
  if(msgCounter<3 && Math.random()>0.25) return;
  msgCounter=0;

  const r=await IA(msg.content,config.modoActual);
  return msg.reply(r||rand(config.phrases));
});

start();