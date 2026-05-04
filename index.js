// ================= IMPORTS =================
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
http.createServer((req,res)=>res.end("PATROCLO HC FINAL 100%")).listen(process.env.PORT||8080);

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
let universe = safeJSON("./universe.json",{facts:[],usedToday:[]});

const saveMem = ()=>fs.writeFileSync("./memoria.json",JSON.stringify(memoria,null,2));
const saveUniverse = ()=>fs.writeFileSync("./universe.json",JSON.stringify(universe,null,2));

// ================= CLIENT =================
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, placeColl, asociaColl;

let config = { phrases:[], modoActual:"ia" };

const rand = a=>a[Math.floor(Math.random()*a.length)];
let msgCounter=0;

// ================= IA =================
async function IA(contexto, modo, pool=[]){
  let sys;

  if(modo==="normal"){
    sys=`Elegí SOLO una frase de esta lista:\n${pool.join("\n")}`;
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

  ctx.fillStyle="#111";
  ctx.fillRect(0,0,canvas.width,canvas.height);

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

  const d = await dataColl.findOne({id:"main_config"});

  config.phrases = Array.from(new Set([
    ...(d?.phrases||[]),
    ...(memoria.phrases||[])
  ]));

  memoria.phrases=config.phrases;
  saveMem();

  await client.login(process.env.TOKEN);
  console.log("🔥 HC FINAL 100%");
}

// ================= MENSAJES =================
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();

  memoria.chat.push(msg.content);
  if(memoria.chat.length>20) memoria.chat.shift();

  // ===== ADN =====
  if(!msg.content.startsWith("!") && msg.content.length>1){
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

    // ===== HELP =====
    if(cmd==="ayudacmd"){
      return msg.reply(`
📜 COMANDOS COMPLETOS

🎨 !place | !pixel x y color | !zoom x1 x2 y1 y2
📷 !gif | !foto
🌌 !universefacts
💰 !bal | !daily | !work | !pay @user cantidad
🎰 !slot | !ruleta cant | !coinflip cant | !penal | !bj
🏪 !comprar escudo | doble
🧠 !modo | !asocia clave > respuesta
🏆 !rich | !topplace
      `);
    }

    // ===== ECONOMÍA =====
    async function getUser(id){
      return await usersColl.findOne({userId:id})||{points:0};
    }

    function noMoney(u, amt){
      return (!amt || amt<=0 || u.points<amt);
    }

    if(cmd==="bal"){
      let u=await getUser(msg.author.id);
      return msg.reply(`💰 ${u.points}`);
    }

    if(cmd==="daily"){
      let u=await getUser(msg.author.id);
      if(Date.now()-(u.lastDaily||0)<86400000) return msg.reply("⏳");
      let reward=200+Math.floor(Math.random()*400);
      await usersColl.updateOne({userId:msg.author.id},
        {$set:{lastDaily:Date.now()},$inc:{points:reward}},
        {upsert:true}
      );
      return msg.reply(`🎁 +$${reward}`);
    }

    if(cmd==="work"){
      let u=await getUser(msg.author.id);
      let reward=100+Math.floor(Math.random()*300);
      if(u.boostUntil>Date.now()) reward*=2;
      await usersColl.updateOne({userId:msg.author.id},
        {$inc:{points:reward}},
        {upsert:true}
      );
      return msg.reply(`💼 +$${reward}`);
    }

    if(cmd==="pay"){
      const user=msg.mentions.users.first();
      const amount=parseInt(args[1]);
      let u=await getUser(msg.author.id);

      if(!user || noMoney(u,amount)) return msg.reply("error");

      await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-amount}});
      await usersColl.updateOne({userId:user.id},{$inc:{points:amount}},{upsert:true});

      return msg.reply("💸 enviado");
    }

    // ===== TIENDA =====
    if(cmd==="comprar"){
      const item=args[0];
      let u=await getUser(msg.author.id);

      const precios={escudo:1000,doble:1500};

      if(!precios[item] || u.points<precios[item]) return msg.reply("no money");

      await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-precios[item]}});

      if(item==="escudo"){
        await usersColl.updateOne({userId:msg.author.id},{$set:{shieldUntil:Date.now()+3600000}});
      }

      if(item==="doble"){
        await usersColl.updateOne({userId:msg.author.id},{$set:{boostUntil:Date.now()+3600000}});
      }

      return msg.reply("comprado");
    }

    // ===== CASINO =====
    if(cmd==="slot"){
      let u=await getUser(msg.author.id);
      if(noMoney(u,50)) return msg.reply("no money");

      const r=[rand(["🍒","💎","7️⃣"]),rand(["🍒","💎","7️⃣"]),rand(["🍒","💎","7️⃣"])];
      const win=r[0]===r[1]&&r[1]===r[2]?400:0;

      await usersColl.updateOne({userId:msg.author.id},{$inc:{points:win-50}});
      return msg.reply(`${r.join("|")} → ${win?"💰":"💀"}`);
    }

    if(cmd==="ruleta"){
      const bet=parseInt(args[0]);
      let u=await getUser(msg.author.id);
      if(noMoney(u,bet)) return msg.reply("no money");

      const win=Math.random()<0.45;
      await usersColl.updateOne({userId:msg.author.id},{$inc:{points: win?bet:-bet}});
      return msg.reply(win?"🎉":"💀");
    }

    if(cmd==="coinflip"){
      const bet=parseInt(args[0]);
      let u=await getUser(msg.author.id);
      if(noMoney(u,bet)) return msg.reply("no money");

      const win=Math.random()<0.5;
      await usersColl.updateOne({userId:msg.author.id},{$inc:{points: win?bet:-bet}});
      return msg.reply(win?"🪙":"💀");
    }

    if(cmd==="penal"){
      let u=await getUser(msg.author.id);
      if(noMoney(u,100)) return msg.reply("no money");

      const win=Math.random()<0.3;
      await usersColl.updateOne({userId:msg.author.id},{$inc:{points: win?500:-100}});
      return msg.reply(win?"⚽ GOL":"❌ ATAJADO");
    }

    if(cmd==="bj"){
      let u=await getUser(msg.author.id);
      if(noMoney(u,150)) return msg.reply("no money");

      const win=Math.random()<0.48;
      await usersColl.updateOne({userId:msg.author.id},{$inc:{points: win?300:-150}});
      return msg.reply(win?"🃏 ganaste":"💀 perdiste");
    }

    // ===== MAPA =====
    if(cmd==="pixel"){
      const x=parseInt(args[0]);
      const y=parseInt(args[1]);
      const color=args[2]||"#fff";

      const existing=await placeColl.findOne({x,y});
      let cost=0;

      if(existing && existing.guildId!==msg.guild.id){
        const p1=await getServerPower(existing.guildId);
        const p2=await getServerPower(msg.guild.id);
        cost=p1>p2?1000:200;

        let u=await getUser(msg.author.id);
        if(u.points<cost) return msg.reply("no money");

        await usersColl.updateOne({userId:msg.author.id},{$inc:{points:-cost}});
      }

      await placeColl.updateOne(
        {x,y},
        {$set:{color,guildId:msg.guild.id,ownerId:msg.author.id}},
        {upsert:true}
      );

      return msg.reply(cost?"⚔️":"🎨");
    }

    if(cmd==="place"){
      const img=await renderPlace();
      return msg.reply({files:[new AttachmentBuilder(img,"map.png")]});
    }

    if(cmd==="zoom"){
      const [x1,x2,y1,y2]=args.map(Number);
      const img=await renderZoom(x1||0,x2||50,y1||0,y2||50);
      return msg.reply({files:[new AttachmentBuilder(img,"zoom.png")]});
    }

    // ===== RANK =====
    if(cmd==="rich"){
      const top=await usersColl.find().sort({points:-1}).limit(5).toArray();
      return msg.reply(top.map((u,i)=>`${i+1}. ${u.points}`).join("\n"));
    }

    if(cmd==="topplace"){
      const top=await placeColl.aggregate([
        {$group:{_id:"$guildId",total:{$sum:1}}},
        {$sort:{total:-1}},
        {$limit:5}
      ]).toArray();

      return msg.reply(top.map((t,i)=>`${i+1}. ${t.total}`).join("\n"));
    }

    return;
  }

  // ================= IA =================
  msgCounter++;
  if(msgCounter<3 && Math.random()>0.25) return;
  msgCounter=0;

  const asoc=await asociaColl.findOne({clave:content});
  if(asoc) return msg.reply(asoc.respuesta);

  if(config.modoActual==="normal"){
    const pool=config.phrases.slice(-50);
    const r=await IA(msg.content,"normal",pool);
    return msg.reply(r||rand(pool));
  }

  const r=await IA(msg.content,config.modoActual);
  return msg.reply(r||rand(config.phrases));
});

start();