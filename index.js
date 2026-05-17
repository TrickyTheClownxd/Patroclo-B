import {
  Client,
  GatewayIntentBits,
  Partials,
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
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

// ================= DBS =================
let usersColl;
let dataColl;
let placeColl;
let asociaColl;
let userMemColl;
let lotsColl;
let warsColl;
let casinoColl;

// ================= CONFIG =================
let config = {
  phrases:[],
  modoActual:"ia"
};

const rand = a=>a[Math.floor(Math.random()*a.length)];
const cortar=t=>t?.slice(0,1900);

let msgCounter=0;

// ================= MAPA =================
const SIZE=256;
const SCALE=4;

const cooldown = new Map();

function latLonToXY(lat, lon){
  lat = Math.max(-90, Math.min(90, lat));
  lon = Math.max(-180, Math.min(180, lon));

  const x = ((lon + 180) / 360) * (SIZE - 1);
  const y = ((90 - lat) / 180) * (SIZE - 1);

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

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
  const width=(maxX-minX)+1;
  const height=(maxY-minY)+1;

  const canvas=createCanvas(width*SCALE,height*SCALE);
  const ctx=canvas.getContext("2d");

  const pixels=await placeColl.find({
    x:{$gte:minX,$lte:maxX},
    y:{$gte:minY,$lte:maxY}
  }).toArray();

  pixels.forEach(p=>{
    ctx.fillStyle=p.color;
    ctx.fillRect(
      (p.x-minX)*SCALE,
      (p.y-minY)*SCALE,
      SCALE,
      SCALE
    );
  });

  return canvas.toBuffer();
}

// ================= IA =================
async function IA(contexto, modo){
  let sys;

  if(modo==="normal"){
    sys="Elegí UNA frase del ADN que encaje mejor. NO inventes.";
  }else if(modo==="serio"){
    sys="Respondé profesional y claro.";
  }else{
    sys="Sos argentino sarcástico y divertido.";
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents:[{
          parts:[{text:sys+"\n\n"+contexto}]
        }]
      }
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

  usersColl=db.collection("users");
  dataColl=db.collection("bot_data");
  placeColl=db.collection("place_pixels");
  asociaColl=db.collection("asociaciones");
  userMemColl=db.collection("user_memory");
  lotsColl=db.collection("lots");
  warsColl=db.collection("wars");
  casinoColl=db.collection("casino_stats");

  const d = await dataColl.findOne({id:"main_config"});

  config.phrases = Array.from(new Set([
    ...(d?.phrases||[]),
    ...(memoria.phrases||[])
  ]));

  memoria.phrases=config.phrases;
  saveMem();

  await client.login(process.env.TOKEN);

  console.log("🔥 PATROCLO HC FINAL ONLINE");
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

    // ================= IA =================
    if(cmd==="modo"){
      config.modoActual=args[0]||"ia";
      return msg.reply("🧠 modo: "+config.modoActual);
    }

    if(cmd==="asocia"){
      const t=args.join(" ").split(">");

      await asociaColl.updateOne(
        {clave:t[0].trim().toLowerCase()},
        {$set:{respuesta:t[1].trim()}},
        {upsert:true}
      );

      return msg.reply("✅ asociación guardada");
    }

    // ================= MULTIMEDIA =================
    if(cmd==="gif"){
      try{
        const r=await axios.get(
          `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`
        );

        return msg.reply(r.data.data[0]?.url||"no encontré");
      }catch{
        return msg.reply("❌ error gif");
      }
    }

    if(cmd==="foto"){
      try{
        const r = await axios.post(
          "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
          {inputs:args.join(" ")},
          {
            headers:{
              Authorization:`Bearer ${process.env.HF_API_KEY}`
            },
            responseType:"arraybuffer"
          }
        );

        return msg.reply({
          files:[
            new AttachmentBuilder(Buffer.from(r.data),"img.png")
          ]
        });
      }catch{
        return msg.reply("❌ error imagen");
      }
    }

    // ================= ECONOMIA =================
    if(cmd==="bal"){
      const u=await usersColl.findOne({userId:msg.author.id})||{points:0};
      return msg.reply(`💰 ${u.points}`);
    }

    if(cmd==="daily"){
      const u=await usersColl.findOne({userId:msg.author.id})||{};

      if(Date.now()-(u.lastDaily||0)<86400000){
        return msg.reply("⏳ ya reclamaste hoy");
      }

      const reward=200+Math.floor(Math.random()*500);

      await usersColl.updateOne(
        {userId:msg.author.id},
        {
          $set:{lastDaily:Date.now()},
          $inc:{points:reward}
        },
        {upsert:true}
      );

      return msg.reply(`🎁 +$${reward}`);
    }

    if(cmd==="work"){
      const reward=100+Math.floor(Math.random()*300);

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:reward}},
        {upsert:true}
      );

      return msg.reply(`💼 trabajaste y ganaste $${reward}`);
    }

    if(cmd==="pay"){
      const user=msg.mentions.users.first();
      const amount=parseInt(args[1]);

      if(!user || !amount || amount<=0){
        return msg.reply("uso: !pay @user cantidad");
      }

      const u=await usersColl.findOne({userId:msg.author.id})||{points:0};

      if(u.points<amount){
        return msg.reply("❌ no money");
      }

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:-amount}}
      );

      await usersColl.updateOne(
        {userId:user.id},
        {$inc:{points:amount}},
        {upsert:true}
      );

      return msg.reply("💸 enviado");
    }

    // ================= CASINO =================
    if(cmd==="slot"){
      const bet=50;

      const r=[
        rand(["🍒","💎","7️⃣"]),
        rand(["🍒","💎","7️⃣"]),
        rand(["🍒","💎","7️⃣"])
      ];

      const win=r[0]===r[1]&&r[1]===r[2]?400:0;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:win-bet}},
        {upsert:true}
      );

      return msg.reply(`${r.join(" | ")} → ${win?`💰 +${win}`:"💀"}`);
    }

    if(cmd==="ruleta"){
      const bet=parseInt(args[0]);
      if(!bet) return msg.reply("❌ apuesta inválida");

      const win=Math.random()<0.45;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:win?bet:-bet}},
        {upsert:true}
      );

      return msg.reply(win?"🎉 GANASTE":"💀 perdiste");
    }

    if(cmd==="coinflip"){
      const bet=parseInt(args[0]);
      if(!bet) return msg.reply("❌ apuesta inválida");

      const win=Math.random()<0.5;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:win?bet:-bet}},
        {upsert:true}
      );

      return msg.reply(win?"🪙 GANASTE":"💀 perdiste");
    }

    if(cmd==="poker"){
      const bet=parseInt(args[0])||100;

      const hands=[
        ["Par",1.5],
        ["Doble Par",2],
        ["Trío",3],
        ["Escalera",5],
        ["Color",8]
      ];

      const hand=rand(hands);
      const gain=Math.floor(bet*hand[1]);

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:gain-bet}},
        {upsert:true}
      );

      return msg.reply(`🃏 ${hand[0]} → +$${gain}`);
    }

    if(cmd==="balatro"){
      const bet=parseInt(args[0])||100;

      const multi=Math.floor(Math.random()*20)+1;
      const gain=bet*multi;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:gain-bet}},
        {upsert:true}
      );

      return msg.reply(`🎴 BALATRO x${multi} → +$${gain}`);
    }

    if(cmd==="bj"){
      const bet=parseInt(args[0])||100;

      const player=Math.floor(Math.random()*11)+15;
      const dealer=Math.floor(Math.random()*11)+15;

      let result;
      let delta;

      if(player>21){
        result="💀 te pasaste";
        delta=-bet;
      }else if(dealer>21 || player>dealer){
        result="🎉 ganaste";
        delta=bet;
      }else{
        result="💀 perdiste";
        delta=-bet;
      }

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:delta}},
        {upsert:true}
      );

      return msg.reply(`🃏 vos:${player} dealer:${dealer}\n${result}`);
    }

    if(cmd==="penal"){
      const bet=parseInt(args[0])||100;

      const gol=Math.random()<0.6;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:gol?bet:-bet}},
        {upsert:true}
      );

      return msg.reply(gol?"⚽ GOL":"🧤 ATAJADO");
    }

    // ================= MAPA =================
    if(cmd==="place"){
      const img=await renderPlace();

      return msg.reply({
        files:[new AttachmentBuilder(img,"map.png")]
      });
    }

    if(cmd==="zoom"){
      const x1=parseInt(args[0]);
      const x2=parseInt(args[1]);
      const y1=parseInt(args[2]);
      const y2=parseInt(args[3]);

      const img=await renderZoom(x1,x2,y1,y2);

      return msg.reply({
        files:[new AttachmentBuilder(img,"zoom.png")]
      });
    }

    if(cmd==="zoomlat"){
      const lat1=parseFloat(args[0]);
      const lon1=parseFloat(args[1]);
      const lat2=parseFloat(args[2]);
      const lon2=parseFloat(args[3]);

      const p1=latLonToXY(lat1,lon1);
      const p2=latLonToXY(lat2,lon2);

      const minX=Math.min(p1.x,p2.x);
      const maxX=Math.max(p1.x,p2.x);
      const minY=Math.min(p1.y,p2.y);
      const maxY=Math.max(p1.y,p2.y);

      const img=await renderZoom(minX,maxX,minY,maxY);

      return msg.reply({
        files:[new AttachmentBuilder(img,"zoom.png")]
      });
    }

    if(cmd==="pixel"){
      let x;
      let y;

      const a=parseFloat(args[0]);
      const b=parseFloat(args[1]);

      if(a>=-90 && a<=90 && b>=-180 && b<=180){
        const pos=latLonToXY(a,b);
        x=pos.x;
        y=pos.y;
      }else{
        x=parseInt(args[0]);
        y=parseInt(args[1]);
      }

      const color=args[2]||"#fff";

      if(x<0 || x>=SIZE || y<0 || y>=SIZE){
        return msg.reply("❌ fuera del mapa");
      }

      const last=cooldown.get(msg.author.id)||0;

      if(Date.now()-last<3000){
        return msg.reply("⏳ espera 3 segundos");
      }

      cooldown.set(msg.author.id,Date.now());

      await placeColl.updateOne(
        {x,y},
        {
          $set:{
            color,
            guildId:msg.guild.id
          }
        },
        {upsert:true}
      );

      return msg.reply(`🎨 pixel puesto (${x},${y})`);
    }

    if(cmd==="topplace"){
      const top=await placeColl.aggregate([
        {$group:{_id:"$guildId",total:{$sum:1}}},
        {$sort:{total:-1}},
        {$limit:10}
      ]).toArray();

      return msg.reply(
        top.map((t,i)=>`${i+1}. ${t.total} px`).join("\n")
      );
    }

    if(cmd==="territorio"){
      const total=await placeColl.countDocuments({guildId:msg.guild.id});
      return msg.reply(`🌍 territorio del server: ${total} píxeles`);
    }

    if(cmd==="comprarlote"){
      const x1=parseInt(args[0]);
      const y1=parseInt(args[1]);
      const x2=parseInt(args[2]);
      const y2=parseInt(args[3]);

      const width=Math.abs(x2-x1)+1;
      const height=Math.abs(y2-y1)+1;

      const cost=width*height*10;

      const u=await usersColl.findOne({userId:msg.author.id})||{points:0};

      if(u.points<cost){
        return msg.reply(`❌ necesitás $${cost}`);
      }

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:-cost}}
      );

      await lotsColl.insertOne({
        ownerId:msg.author.id,
        guildId:msg.guild.id,
        x1,y1,x2,y2,
        createdAt:Date.now()
      });

      return msg.reply(`🏠 lote comprado por $${cost}`);
    }

    if(cmd==="guerra"){
      await warsColl.updateOne(
        {guildId:msg.guild.id},
        {$set:{active:true,start:Date.now()}},
        {upsert:true}
      );

      return msg.reply("⚔️ guerra activada");
    }

    // ================= RANKINGS =================
    if(cmd==="rich"){
      const top=await usersColl.find()
        .sort({points:-1})
        .limit(10)
        .toArray();

      return msg.reply(
        top.map((u,i)=>`${i+1}. $${u.points}`).join("\n")
      );
    }

    if(cmd==="casinotop"){
      const top=await usersColl.find()
        .sort({points:-1})
        .limit(10)
        .toArray();

      return msg.reply(
        top.map((u,i)=>`${i+1}. $${u.points}`).join("\n")
      );
    }

    // ================= UNIVERSO =================
    if(cmd==="universefacts"){
      let disp=universe.facts.filter(f=>!universe.usedToday.includes(f));

      if(!disp.length){
        universe.usedToday=[];
        disp=universe.facts;
      }

      const f=rand(disp);

      universe.usedToday.push(f);
      saveUniverse();

      return msg.reply(f||"🌌 no hay datos");
    }

    // ================= AYUDA =================
    if(cmd==="ayudacmd"){
      return msg.reply(`
📜 PATROCLO HC FINAL

🎨 MAPA
!place
!pixel
!zoom
!zoomlat
!territorio
!comprarlote
!guerra
!topplace

📷 MULTIMEDIA
!gif
!foto

🌌 EXTRAS
!universefacts

💰 ECONOMÍA
!bal
!daily
!work
!pay
!rich

🎰 CASINO
!slot
!ruleta
!coinflip
!bj
!poker
!balatro
!penal
!casinotop

🧠 IA
!modo
!asocia

🔥 aprende automáticamente
      `);
    }

    return;
  }

  // ================= RESPUESTAS IA =================

const esReply = !!msg.reference;

msgCounter++;

if(!esReply){
  if(msgCounter<3 && Math.random()>0.25) return;
}

msgCounter=0;

// asociaciones inteligentes
const allAsoc = await asociaColl.find().toArray();

const asoc = allAsoc.find(a =>
  content.includes(a.clave)
);

if(asoc){
  return msg.reply(asoc.respuesta);
}

// contexto IA
let contexto = msg.content;

if(esReply){
  try{
    const replied = await msg.fetchReference();

    contexto =
`MENSAJE ORIGINAL:
${replied.content}

RESPUESTA DEL USUARIO:
${msg.content}`;
  }catch{}
}

const r = await IA(contexto, config.modoActual);

let finalReply = r || rand(config.phrases) || "...";

finalReply = String(finalReply).trim();

if(
  finalReply.length <= 1 ||
  finalReply === "u" ||
  finalReply === "undefined"
){
  finalReply = rand([
    "XD",
    "na bueno",
    "qué",
    "patroclo quedó pensando",
    "._.",
    "💀"
  ]);
}

return msg.reply(finalReply);

});

start();