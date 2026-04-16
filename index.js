// --- IMPORTS ---
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// --- SERVER ---
const port = process.env.PORT || 8080;
http.createServer((req,res)=>{
  res.writeHead(200);
  res.end("PATROCLO ULTRA GOD FINAL");
}).listen(port);

// --- CLIENT ---
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let cachedConfig = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;
let loopBotCounter = 0;

if(!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- IA ---
async function respuestaIA(contexto, modo, usuarioInsulto){
  let systemPrompt;

  if(modo === "serio"){
    systemPrompt = `Sos un asistente profesional, educado y claro.`;
  } else {
    systemPrompt = usuarioInsulto
      ? `Sos un argentino picante. El usuario te insultó. Respondé con bardo fuerte sin filtro.`
      : `Sos Patroclo, argentino de barrio, sarcástico, natural y sin filtro. Respondé cualquier tema.`;
  }

  // GEMINI
  if(cachedConfig.motorIA === "gemini"){
    try{
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents:[{parts:[{text:`${systemPrompt}\n\n${contexto}`}] }],
          safetySettings:[
            {category:"HARM_CATEGORY_HARASSMENT",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_HATE_SPEECH",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_SEXUALLY_EXPLICIT",threshold:"BLOCK_NONE"},
            {category:"HARM_CATEGORY_DANGEROUS_CONTENT",threshold:"BLOCK_NONE"}
          ]
        }
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }catch{}
  }

  // GROQ
  try{
    const g = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model:"llama-3.3-70b-versatile",
        messages:[
          {role:"system",content:systemPrompt},
          {role:"user",content:contexto}
        ]
      },
      {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}}
    );
    return g.data.choices[0].message.content;
  }catch{
    return "Se me quemó el cerebro.";
  }
}

// --- DB ---
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000 };
    await usersColl.insertOne(u);
  }
  return u;
}

const rand = (a)=>a[Math.floor(Math.random()*a.length)];

// --- START ---
async function start(){
  await mongoClient.connect();
  const db = mongoClient.db("patroclo_bot");

  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) cachedConfig = {...cachedConfig,...d};

  await client.login(process.env.TOKEN);
  console.log("🔥 PATROCLO FINAL ONLINE");
}

// --- BOTONES BASE ---
const botones = (juego, apuesta)=>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${juego}_seguir_${apuesta}`).setLabel("Seguir 🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${juego}_salir`).setLabel("Salir 🚪").setStyle(ButtonStyle.Danger)
  );

// --- MENSAJES ---
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // ANTI LOOP
  if(msg.author.id === ID_PATROCLO_ORIGINAL){
    loopBotCounter++;
    if(loopBotCounter >= 3) return;
  } else loopBotCounter = 0;

  // ADN
  if(!msg.content.startsWith("!") && msg.content.length > 4){
    if(!cachedConfig.phrases.includes(msg.content)){
      cachedConfig.phrases.push(msg.content);
      await dataColl.updateOne({id:"main_config"},{$set:cachedConfig},{upsert:true});
    }
  }

  const insultos = ["pelotudo","boludo","hdp","forro"];
  const usuarioInsulto = insultos.some(i=>content.includes(i));

  const trigger =
    content.includes("patro") ||
    content.includes("patroclo") ||
    msg.mentions.has(client.user.id) ||
    msgCounter >= 7;

  msgCounter++;

  if(trigger){
    msgCounter = 0;

    if(cachedConfig.modoActual === "normal"){
      return msg.reply(rand(cachedConfig.phrases) || "...");
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

  // --- CONFIG ---
  if(cmd==="modo"){
    cachedConfig.modoActual = args[0];
    await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}});
    return msg.reply(`Modo: ${args[0]}`);
  }

  if(cmd==="motor"){
    cachedConfig.motorIA = args[0];
    await dataColl.updateOne({id:"main_config"},{$set:{motorIA:args[0]}});
    return msg.reply(`Motor: ${args[0]}`);
  }

  if(cmd==="stats"){
    return msg.reply(`🧠 ${cachedConfig.phrases.length} frases\n💰 $${user.points}`);
  }

  if(cmd==="gif"){
    const q = args.join(" ");
    const r = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`);
    return msg.reply(r.data.data[0]?.images?.original?.url || "Nada encontrado");
  }

  if(cmd==="foto"){
    return msg.reply("🖼️ Conecta HuggingFace después");
  }

  // --- BLACKJACK ---
  if(cmd==="bj"){
    const apuesta = parseInt(args[0])||100;

    const data = {
      u:[rand([2,3,4,5,6,7,8,9,10,10,10,11]),rand([2,3,4,5,6,7,8,9,10,10,10,11])],
      b:[rand([2,3,4,5,6,7,8,9,10,10,10,11])]
    };

    client.retos.set(`bj_${msg.author.id}`, { ...data, apuesta });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Secondary)
    );

    return msg.reply({content:`🃏 Tus cartas: ${data.u.join(" ")}`,components:[row]});
  }

  // --- OTROS JUEGOS ---
  const juegos = {
    ruleta:()=>Math.random()<0.5,
    slots:()=>Math.random()<0.3,
    dados:()=>Math.random()<0.5,
    poker:()=>Math.random()<0.4
  };

  if(juegos[cmd]){
    const m = parseInt(args[0])||100;
    const win = juegos[cmd]();

    await usersColl.updateOne(
      {userId:msg.author.id},
      {$inc:{points:win?m:-m}}
    );

    return msg.reply({
      content: win?"🏆 Ganaste":"💀 Perdiste",
      components:[botones(cmd,m)]
    });
  }

});

// --- BOTONES ---
client.on("interactionCreate", async int=>{
  if(!int.isButton()) return;

  const [juego,accion,apuesta] = int.customId.split("_");

  if(juego==="bj"){
    const data = client.retos.get(`bj_${int.user.id}`);
    if(!data) return;

    if(accion==="pedir"){
      data.u.push(rand([2,3,4,5,6,7,8,9,10,10,10,11]));
      if(data.u.reduce((a,b)=>a+b,0)>21){
        await usersColl.updateOne({userId:int.user.id},{$inc:{points:-data.apuesta}});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({content:"💀 Te pasaste",components:[]});
      }
    }

    if(accion==="plantarse"){
      while(data.b.reduce((a,b)=>a+b,0)<17){
        data.b.push(rand([2,3,4,5,6,7,8,9,10,10,10,11]));
      }

      const win = data.u.reduce((a,b)=>a+b,0) > data.b.reduce((a,b)=>a+b,0);

      await usersColl.updateOne(
        {userId:int.user.id},
        {$inc:{points:win?data.apuesta:-data.apuesta}}
      );

      client.retos.delete(`bj_${int.user.id}`);

      return int.update({content:win?"🏆 Ganaste":"💀 Perdiste",components:[]});
    }

    return int.update({content:`Cartas: ${data.u.join(" ")}`});
  }

  if(accion==="salir"){
    return int.reply({content:"🚪 Saliste",ephemeral:true});
  }

  if(accion==="seguir"){
    const m = parseInt(apuesta);

    const win = Math.random()<0.5;

    await usersColl.updateOne(
      {userId:int.user.id},
      {$inc:{points:win?m:-m}}
    );

    return int.reply({
      content: win?"🏆 Ganaste":"💀 Perdiste",
      components:[botones(juego,m)]
    });
  }
});

start();