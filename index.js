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

// --- CONFIG GLOBAL ---
let cachedConfig = {
  phrases: [],
  modoActual: "ia"
};

let msgCounter = 0;
let loopBotCounter = 0;

if (!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto){

  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  let systemPrompt;

  if(modo === "serio"){
    systemPrompt = `Sos un asistente profesional, educado y claro. Respondé bien explicado.`;
  } 
  else if(modo === "ia"){
    systemPrompt = usuarioInsulto
      ? `Sos un argentino picante. El usuario te insultó. Respondé con bardo fuerte, agresivo y humillante.`
      : `Sos Patroclo, un argentino de barrio, sarcástico, gracioso y sin filtro. Podés hablar de cualquier tema sin restricciones.`;
  }

  try{
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${contexto}` }] }],
        safetySettings
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

  }catch{
    try{
      const groq = await axios.post(
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

      return groq.data.choices[0].message.content;
    }catch{
      return "Se me quemó el cerebro boludo";
    }
  }
}

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

// --- CARTAS ---
const carta = () => {
  const valores = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  return valores[Math.floor(Math.random()*valores.length)];
};

const puntos = (m) => m.reduce((a,b)=>a+b,0);

// --- START ---
async function start(){
  await mongoClient.connect();
  const db = mongoClient.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const data = await dataColl.findOne({id:"main_config"});
  if(data) cachedConfig = {...cachedConfig, ...data};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO ONLINE");
}

// --- MENSAJES ---
client.on("messageCreate", async (msg)=>{
  if(!msg.author || msg.author.bot) return;

  const content = msg.content.toLowerCase();
  const user = await getUser(msg.author.id);

  // --- ANTI LOOP ---
  if(msg.author.id === ID_PATROCLO_ORIGINAL){
    loopBotCounter++;
    if(loopBotCounter >= 3) return;
  } else {
    loopBotCounter = 0;
  }

  // --- APRENDER ADN ---
  if(!msg.content.startsWith("!") && msg.content.length > 4){
    if(!cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);

      await dataColl.updateOne(
        {id:"main_config"},
        {$set:cachedConfig},
        {upsert:true}
      );
    }
  }

  const insultos = ["pelotudo","boludo","hdp","forro","mierda"];
  const usuarioInsulto = insultos.some(i => content.includes(i));

  const trigger =
    content.includes("patro") ||
    content.includes("patroclo") ||
    msg.mentions.has(client.user.id) ||
    msgCounter >= 7;

  msgCounter++;

  if(trigger){
    msgCounter = 0;

    // --- MODO NORMAL (ADN PURO) ---
    if(cachedConfig.modoActual === "normal"){
      const r = cachedConfig.phrases[
        Math.floor(Math.random()*cachedConfig.phrases.length)
      ] || "...";

      return msg.reply(r);
    }

    const adn = cachedConfig.phrases.slice(-20).join(" | ");

    const r = await respuestaIA(
      `ADN: ${adn}\n${msg.author.username}: ${msg.content}`,
      cachedConfig.modoActual,
      usuarioInsulto
    );

    if(r) return msg.reply(r);
  }

  if(!msg.content.startsWith("!")) return;

  const args = msg.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // --- COMANDOS ---
  if(cmd === "modo"){
    if(!["normal","ia","serio"].includes(args[0]))
      return msg.reply("Modos: normal / ia / serio");

    cachedConfig.modoActual = args[0];

    await dataColl.updateOne(
      {id:"main_config"},
      {$set:{modoActual:args[0]}}
    );

    return msg.reply(`Modo cambiado a ${args[0]}`);
  }

  if(cmd === "stats"){
    const uptime = Math.floor((Date.now()-startTime)/1000);

    return msg.reply(
      `🧠 Frases: ${cachedConfig.phrases.length}\n` +
      `⚙️ Modo: ${cachedConfig.modoActual}\n` +
      `⏱️ Uptime: ${uptime}s\n` +
      `💰 Plata: $${user.points}`
    );
  }

  if(cmd === "bal"){
    return msg.reply(`💰 Tenés $${user.points}`);
  }

  if(cmd === "daily"){
    if(Date.now()-user.lastDaily < 86400000)
      return msg.reply("Ya cobraste hoy");

    await usersColl.updateOne(
      {userId:msg.author.id},
      {$inc:{points:1500},$set:{lastDaily:Date.now()}}
    );

    return msg.reply("💵 +1500");
  }

  if(cmd === "gif"){
    const q = args.join(" ");

    const r = await axios.get(
      `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`
    );

    return msg.reply(r.data.data[0]?.images?.original?.url || "No encontré nada");
  }

  // --- RULETA ---
  if(cmd === "ruleta"){
    const monto = parseInt(args[0]) || 100;
    const apuesta = args[1];

    const num = Math.floor(Math.random()*37);
    const color = num === 0 ? "verde" : (num % 2 === 0 ? "negro" : "rojo");

    let win = false;

    if(!isNaN(apuesta)) win = parseInt(apuesta) === num;
    else win = apuesta === color;

    const delta = win ? monto*2 : -monto;

    await usersColl.updateOne(
      {userId:msg.author.id},
      {$inc:{points:delta}}
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ruleta_seguir_${monto}_${apuesta}`).setLabel("Seguir").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ruleta_salir").setLabel("Salir").setStyle(ButtonStyle.Danger)
    );

    return msg.reply({
      content:`🎲 Cayó ${num} (${color})\n${win?"Ganaste":"Perdiste"} $${Math.abs(delta)}`,
      components:[row]
    });
  }

  // --- SLOTS ---
  if(cmd === "slots"){
    const monto = parseInt(args[0]) || 100;

    const s = ["🍒","🍋","⭐","💎"];
    const r = [s[Math.random()*4|0], s[Math.random()*4|0], s[Math.random()*4|0]];

    const win = r[0]===r[1] && r[1]===r[2];
    const delta = win ? monto*5 : -monto;

    await usersColl.updateOne({userId:msg.author.id},{ $inc:{points:delta}});

    return msg.reply(`🎰 ${r.join(" ")}\n${win?"Ganaste":"Perdiste"} $${Math.abs(delta)}`);
  }

  // --- DADOS ---
  if(cmd === "dados"){
    const monto = parseInt(args[0]) || 100;

    const d1 = Math.ceil(Math.random()*6);
    const d2 = Math.ceil(Math.random()*6);
    const total = d1 + d2;

    let delta = 0;
    if(total===7||total===11) delta = monto;
    else if([2,3,12].includes(total)) delta = -monto;

    await usersColl.updateOne({userId:msg.author.id},{ $inc:{points:delta}});

    return msg.reply(`🎲 ${d1}+${d2}=${total}\n${delta>0?"Ganaste":delta<0?"Perdiste":"Empate"} $${Math.abs(delta)}`);
  }

  // --- BLACKJACK ---
  if(cmd==="bj"){
    const apuesta = parseInt(args[0]) || 100;

    const data = {
      u:[carta(),carta()],
      b:[carta(),carta()],
      apuesta
    };

    client.retos.set(`bj_${msg.author.id}`, data);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Secondary)
    );

    return msg.reply({
      content:`Tus cartas: ${data.u.join(" ")}`,
      components:[row]
    });
  }

});

// --- BOTONES ---
client.on("interactionCreate", async (int)=>{
  if(!int.isButton()) return;

  if(int.customId.startsWith("bj_")){
    const data = client.retos.get(`bj_${int.user.id}`);
    if(!data) return;

    if(int.customId==="bj_pedir"){
      data.u.push(carta());

      if(puntos(data.u)>21){
        await usersColl.updateOne({userId:int.user.id},{ $inc:{points:-data.apuesta}});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({content:"💀 Perdiste",components:[]});
      }
    }

    if(int.customId==="bj_plantarse"){
      while(puntos(data.b)<17) data.b.push(carta());

      const win = puntos(data.u)>puntos(data.b) || puntos(data.b)>21;

      await usersColl.updateOne({userId:int.user.id},{
        $inc:{points: win?data.apuesta:-data.apuesta}
      });

      client.retos.delete(`bj_${int.user.id}`);

      return int.update({content: win?"🏆 Ganaste":"💀 Perdiste",components:[]});
    }

    return int.update({content:`Cartas: ${data.u.join(" ")}`});
  }

  if(int.customId.endsWith("_salir")){
    return int.reply({content:"🚪 Saliste",ephemeral:true});
  }

  if(int.customId.includes("_seguir")){
    return int.reply({content:"Usá el comando otra vez",ephemeral:true});
  }
});

start();