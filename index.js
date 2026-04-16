// --- IMPORTS Y SETUP ---
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("PATROCLO ULTRA ONLINE");
}).listen(port);

// --- CLIENT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let cachedConfig = {
  phrases: [],
  modoActual: "ia"
};

let msgCounter = 0;
let loopBotCounter = 0;

if (!client.retos) client.retos = new Map();

const IDPATROCLOORIGINAL = '974297735559806986';

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto) {

  let systemPrompt;

  if (modo === "serio") {
    systemPrompt = `Sos un asistente profesional, educado y respetuoso.`;
  } else if (modo === "ia") {
    systemPrompt = usuarioInsulto
      ? `Sos un argentino sin filtro. El usuario te insultó, respondé con bardo fuerte.`
      : `Sos un argentino de barrio, sarcástico y directo.`;
  }

  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${contexto}` }] }]
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "...";

  } catch {
    const r = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contexto }
        ]
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
      }
    );

    return r.data.choices[0].message.content;
  }
}

// --- CARTAS ---
const generarCarta = () => {
  const valores = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  return { val: valores[Math.floor(Math.random()*valores.length)] };
};

const calcular = m => m.reduce((a,c)=>a+c.val,0);

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

// --- START ---
async function start(){
  await mongoClient.connect();
  const db = mongoClient.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) cachedConfig = {...cachedConfig,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO ULTRA ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  if(msg.author.id === IDPATROCLOORIGINAL){
    loopBotCounter++;
    if(loopBotCounter>3) return;
  } else loopBotCounter=0;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // APRENDER
  if(!msg.content.startsWith("!")){
    if(msg.content.length>4 && !cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:cachedConfig},{upsert:true});
    }

    msgCounter++;

    const insultos = ["boludo","pelotudo","hdp"];
    const insulto = insultos.some(i=>content.includes(i));

    if(msgCounter>=6 || insulto){
      msgCounter=0;

      if(cachedConfig.modoActual==="normal"){
        return msg.reply(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]||"...");
      }

      const adn = cachedConfig.phrases.slice(-20).join(" | ");

      const r = await respuestaIA(
        `ADN:${adn}\n${msg.author.username}:${msg.content}`,
        cachedConfig.modoActual,
        insulto
      );

      return msg.reply(r);
    }

    return;
  }

  // --- COMANDOS ---
  const args = msg.content.slice(1).split(" ");
  const cmd = args.shift();

  if(cmd==="modo"){
    cachedConfig.modoActual = args[0];
    await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
    return msg.reply(`Modo: ${args[0]}`);
  }

  if(cmd==="bal") return msg.reply(`💰 ${user.points}`);

  if(cmd==="daily"){
    if(Date.now()-user.lastDaily<86400000) return msg.reply("Ya cobraste");
    await usersColl.updateOne({userId:user.userId},{$inc:{points:1500},$set:{lastDaily:Date.now()}});
    return msg.reply("+1500");
  }

  if(cmd==="stats"){
    return msg.reply(`Frases:${cachedConfig.phrases.length} | Modo:${cachedConfig.modoActual}`);
  }

  // GIF
  if(cmd==="gif"){
    const q = args.join(" ");
    const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
    return msg.reply(r.data.data[0]?.images?.original?.url||"Nada");
  }

  // BLACKJACK
  if(cmd==="bj"){
    const apuesta = parseInt(args[0])||100;
    const data={u:[generarCarta(),generarCarta()],b:[generarCarta(),generarCarta()],apuesta};

    client.retos.set(`bj_${msg.author.id}`,data);

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Secondary)
    );

    return msg.reply({content:"Blackjack iniciado",components:[row]});
  }

  // RULETA
  if(cmd==="ruleta"){
    const apuesta=parseInt(args[0])||100;
    const num=parseInt(args[1])||Math.floor(Math.random()*37);

    client.retos.set(`ruleta_${msg.author.id}`,{apuesta,num});

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ruleta_jugar").setLabel("Girar").setStyle(ButtonStyle.Primary)
    );

    return msg.reply({content:`Número ${num}`,components:[row]});
  }

  // SLOTS
  if(cmd==="slots"){
    const apuesta=parseInt(args[0])||100;
    client.retos.set(`slots_${msg.author.id}`,{apuesta});

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("slots_jugar").setLabel("Girar").setStyle(ButtonStyle.Primary)
    );

    return msg.reply({content:"Slots",components:[row]});
  }

  // DADOS
  if(cmd==="dados"){
    const apuesta=parseInt(args[0])||100;
    client.retos.set(`dados_${msg.author.id}`,{apuesta});

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("dados_jugar").setLabel("Tirar").setStyle(ButtonStyle.Primary)
    );

    return msg.reply({content:"Dados",components:[row]});
  }

  // POKER
  if(cmd==="poker"){
    const apuesta=parseInt(args[0])||100;
    const win=Math.random()<0.4;
    await usersColl.updateOne({userId:user.userId},{$inc:{points:win?apuesta*2:-apuesta}});
    return msg.reply(win?"Ganaste":"Perdiste");
  }

  // BINGO
  if(cmd==="bingo"){
    const apuesta=parseInt(args[0])||100;
    const win=Math.random()<0.1;
    await usersColl.updateOne({userId:user.userId},{$inc:{points:win?apuesta*5:-apuesta}});
    return msg.reply(win?"BINGO":"Nada");
  }

  // BALATRO
  if(cmd==="balatro"){
    const apuesta=parseInt(args[0])||100;
    const multi=Math.floor(Math.random()*10)+1;
    await usersColl.updateOne({userId:user.userId},{$inc:{points:apuesta*multi}});
    return msg.reply(`x${multi}`);
  }

});

// --- BOTONES ---
client.on("interactionCreate", async int=>{
  if(!int.isButton()) return;

  const user=await getUser(int.user.id);

  if(int.customId==="bj_pedir"){
    const d=client.retos.get(`bj_${int.user.id}`);
    d.u.push(generarCarta());
    if(calcular(d.u)>21){
      await usersColl.updateOne({userId:int.user.id},{$inc:{points:-d.apuesta}});
      return int.update({content:"Perdiste",components:[]});
    }
    return int.update({content:"Seguís"});
  }

  if(int.customId==="bj_plantarse"){
    const d=client.retos.get(`bj_${int.user.id}`);
    const win=Math.random()<0.5;
    await usersColl.updateOne({userId:int.user.id},{$inc:{points:win?d.apuesta:-d.apuesta}});
    return int.update({content:win?"Ganaste":"Perdiste",components:[]});
  }

  if(int.customId.includes("slots")){
    const d=client.retos.get(`slots_${int.user.id}`);
    const win=Math.random()<0.3;
    await usersColl.updateOne({userId:int.user.id},{$inc:{points:win?d.apuesta*3:-d.apuesta}});
    return int.update({content:win?"Jackpot":"Nada",components:[]});
  }

  if(int.customId.includes("dados")){
    const d=client.retos.get(`dados_${int.user.id}`);
    const win=Math.random()<0.5;
    await usersColl.updateOne({userId:int.user.id},{$inc:{points:win?d.apuesta:-d.apuesta}});
    return int.update({content:win?"Ganaste":"Perdiste",components:[]});
  }

});

start();