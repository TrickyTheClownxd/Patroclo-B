// ==========================================
// PATROCLO HC+++++ FINAL (MAPA + GUERRAS + BONUS)
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

// ===== SERVER =====
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO HC+++++ ONLINE")).listen(port);

// ===== JSON =====
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

let memoria = safeJSON("./memoria.json",{chat:[],users:{}});
let extras = safeJSON("./extras.json",{phrases:[],facts:[],reacciones_auto:{palabras_clave:[],emojis:[]}});
let universe = safeJSON("./universe.json",{facts:[],usedToday:[]});

// ===== CLIENT =====
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl, territoriosColl;

// ===== CONFIG =====
let config = { phrases: [], modoActual: "ia", motorIA: "gemini" };
if(!client.retos) client.retos = new Map();

// ===== UTILS =====
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// ===== IA =====
async function IA(contexto, modo, insulto=false){
  let sys;

  if(modo==="serio") sys="Sos un asistente profesional.";
  else if(modo==="ia"){
    sys = insulto
      ? "Sos Patroclo argentino bardero."
      : "Sos Patroclo sarcástico.";
  } else {
    sys="Elegí UNA frase de la lista. No inventes.";
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

// ===== START =====
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");
  territoriosColl = db.collection("territorios");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO HC+++++ ONLINE");
}

// ===== PODER TERRITORIAL =====
async function getPoder(guildId){
  return await territoriosColl.countDocuments({owner:guildId});
}

// ===== COSTO Y PROB =====
function getStats(poder){
  if(poder <= 3) return {costo:200, prob:0.7};
  if(poder <= 7) return {costo:500, prob:0.5};
  return {costo:1000, prob:0.3};
}

// ===== BONUS =====
function getBonus(poder){
  if(poder <= 3) return 200;
  if(poder <= 7) return 500;
  return 1000;
}

// ===== MENSAJES =====
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  let user = await usersColl.findOne({userId:msg.author.id}) || {userId:msg.author.id, points:1000};

  const content = msg.content.toLowerCase();

  // ===== ADN =====
  if(!msg.content.startsWith("!") && msg.content.length > 5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"}, {$set:config},{upsert:true});
    }
  }

  // ===== COMANDOS =====
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      config.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"}, {$set:config},{upsert:true});
      return msg.reply("Modo: "+args[0]);
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="universefacts"){
      return msg.reply(rand([...universe.facts,...extras.facts]));
    }

    // ===== CLAIM =====
    if(cmd==="claim"){
      const pais = args[0]?.toUpperCase();
      if(!pais) return msg.reply("Ej: !claim AR");

      const existe = await territoriosColl.findOne({country:pais});
      if(existe) return msg.reply("Ya tiene dueño.");

      const color = "#"+Math.floor(Math.random()*16777215).toString(16);

      await territoriosColl.insertOne({
        country:pais,
        owner:msg.guild.id,
        color
      });

      return msg.reply(`🌍 Conquistaste ${pais}`);
    }

    // ===== ATAQUE =====
    if(cmd==="atacar"){
      const pais = args[0]?.toUpperCase();
      if(!pais) return msg.reply("Ej: !atacar AR");

      const target = await territoriosColl.findOne({country:pais});
      if(!target) return msg.reply("Ese país no tiene dueño.");

      const poder = await getPoder(target.owner);
      const {costo, prob} = getStats(poder);

      if(user.points < costo) return msg.reply("No tenés plata para atacar.");

      const win = Math.random() < prob;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:-costo}},
        {upsert:true}
      );

      if(win){
        await territoriosColl.updateOne(
          {country:pais},
          {$set:{owner:msg.guild.id}}
        );
        return msg.reply(`⚔️ GANASTE ${pais}`);
      }else{
        return msg.reply(`💀 Perdiste el ataque`);
      }
    }

    // ===== RANK =====
    if(cmd==="topterritorios"){
      const data = await territoriosColl.aggregate([
        {$group:{_id:"$owner", total:{$sum:1}}},
        {$sort:{total:-1}}
      ]).toArray();

      return msg.reply(
        data.map((d,i)=>`${i+1}. ${d._id} - ${d.total}`).join("\n") || "Nada"
      );
    }

    // ===== BONUS MANUAL =====
    if(cmd==="bonus"){
      const poder = await getPoder(msg.guild.id);
      const bonus = getBonus(poder);

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:bonus}},
        {upsert:true}
      );

      return msg.reply(`💰 Bonus: +${bonus}`);
    }

    return;
  }

  // ===== IA =====
  const trigger = msg.mentions.has(client.user.id) || content.includes("patro");

  if(!trigger) return;

  msg.channel.sendTyping();

  if(config.modoActual==="normal"){
    return msg.reply(rand(config.phrases));
  }

  const r = await IA(msg.content, config.modoActual);

  return msg.reply(r || rand(config.phrases));
});

start();