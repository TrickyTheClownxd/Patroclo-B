// --- IMPORTS ---
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// --- SERVER ---
const port = process.env.PORT || 8080;
const startTime = Date.now();

http.createServer((req,res)=>{
  res.writeHead(200);
  res.end("PATROCLO ULTRA FINAL GOD");
}).listen(port);

// --- CLIENT ---
const client = new Client({
  intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],
  partials:[Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);

let usersColl, dataColl;

let cachedConfig = {
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;
let loopBotCounter = 0;

if(!client.retos) client.retos = new Map();

const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- UTILS ---
const rand = (a)=>a[Math.floor(Math.random()*a.length)];

// --- CARTAS ---
const cartas = [
  "A♠️","2♠️","3♠️","4♠️","5♠️","6♠️","7♠️","8♠️","9♠️","10♠️","J♠️","Q♠️","K♠️",
  "A♥️","2♥️","3♥️","4♥️","5♥️","6♥️","7♥️","8♥️","9♥️","10♥️","J♥️","Q♥️","K♥️"
];

const valorCarta = (c)=>{
  if(c.startsWith("A")) return 11;
  if(["K","Q","J"].some(x=>c.startsWith(x))) return 10;
  return parseInt(c);
};

const puntos = (mano)=>{
  let total = mano.reduce((a,c)=>a+valorCarta(c),0);
  let ases = mano.filter(c=>c.startsWith("A")).length;

  while(total>21 && ases>0){
    total-=10;
    ases--;
  }
  return total;
};

// --- IA BASE ---
async function respuestaIA(contexto, modo, usuarioInsulto){

  let systemPrompt;

  if(modo === "serio"){
    systemPrompt = `Sos un asistente profesional, claro y respetuoso.`;
  } else {
    systemPrompt = usuarioInsulto
      ? `Sos un argentino picante, agresivo y sarcástico.`
      : `Sos Patroclo, argentino de barrio, gracioso y natural.`;
  }

  try{
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents:[{parts:[{text:`${systemPrompt}\n\n${contexto}`}] }]
      }
    );
    return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  }catch{}

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

// --- IA MODO NORMAL (ADN + PALABRAS) ---
async function respuestaNormalIA(input){

  const dataP = await dataColl.findOne({id:"phrases"});
  const dataW = await dataColl.findOne({id:"words"});

  const frases = dataP?.list?.slice(-80) || [];

  const palabras = Object.entries(dataW?.list || {})
    .sort((a,b)=>b[1]-a[1])
    .slice(0,30)
    .map(x=>x[0]);

  const prompt = `
Respondé usando SOLO memoria del grupo.

Mensaje:
"${input}"

Palabras:
${palabras.join(", ")}

Frases:
${frases.join("\n")}

Respuesta corta, estilo argentino:
`;

  try{
    const r = await respuestaIA(prompt, "ia", false);
    return r?.slice(0,1900);
  }catch{
    return frases[Math.floor(Math.random()*frases.length)];
  }
}

// --- DB USER ---
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
  console.log("🔥 PATROCLO ONLINE");
}

// --- BOTONES ---
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

  // --- ANTI LOOP ---
  if(msg.author.id === ID_PATROCLO_ORIGINAL){
    loopBotCounter++;
    if(loopBotCounter >= 3) return;
  } else loopBotCounter = 0;

  // --- GUARDAR ADN + PALABRAS ---
  if(!msg.content.startsWith("!") && msg.content.length > 4){

    await dataColl.updateOne(
      {id:"phrases"},
      {$addToSet:{list: msg.content}},
      {upsert:true}
    );

    const palabras = msg.content
      .toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/gi,"")
      .split(/\s+/);

    for(const p of palabras){
      if(p.length < 3) continue;

      await dataColl.updateOne(
        {id:"words"},
        {$inc:{[`list.${p}`]:1}},
        {upsert:true}
      );
    }
  }

  // --- COMANDOS ---
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      cachedConfig.modoActual = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{modoActual:args[0]}},{upsert:true});
      return msg.reply(`Modo: ${args[0]}`);
    }

    if(cmd==="motor"){
      cachedConfig.motorIA = args[0];
      await dataColl.updateOne({id:"main_config"},{$set:{motorIA:args[0]}},{upsert:true});
      return msg.reply(`Motor IA: ${args[0]}`);
    }

    if(cmd==="bal") return msg.reply(`💰 $${user.points}`);

    if(cmd==="daily"){
      if(Date.now()-user.lastDaily < 86400000)
        return msg.reply("Ya cobraste hoy");

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:1500},$set:{lastDaily:Date.now()}}
      );

      return msg.reply("💵 +1500");
    }

    if(cmd==="stats"){
      const frases = await dataColl.findOne({id:"phrases"});
      const palabras = await dataColl.findOne({id:"words"});

      return msg.reply(
`🧠 Frases: ${frases?.list?.length || 0}
📚 Palabras: ${Object.keys(palabras?.list || {}).length}
⚙️ Modo: ${cachedConfig.modoActual}
💰 $${user.points}`
      );
    }

    if(cmd==="top"){
      const top = await usersColl.find().sort({points:-1}).limit(5).toArray();

      const embed = new EmbedBuilder()
        .setTitle("🏆 TOP PATROCLO")
        .setDescription(top.map((u,i)=>`${i+1}. <@${u.userId}> - $${u.points}`).join("\n"));

      return msg.reply({embeds:[embed]});
    }

    if(cmd==="gif"){
      const q = args.join(" ");
      const r = await axios.get(
        `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${q}&limit=1`
      );
      return msg.reply(r.data.data[0]?.images?.original?.url || "Nada encontrado");
    }

    // --- BLACKJACK ---
    if(cmd==="bj"){
      const apuesta = parseInt(args[0])||100;

      const data = {
        u:[rand(cartas),rand(cartas)],
        b:[rand(cartas)],
        apuesta
      };

      client.retos.set(`bj_${msg.author.id}`, data);

      const embed = new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setDescription(`Tus cartas: ${data.u.join(" ")} (${puntos(data.u)})`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Secondary)
      );

      return msg.reply({embeds:[embed],components:[row]});
    }

    // --- CASINO ---
    const juegos = {
      ruleta:["🔴","⚫","🟢"],
      slots:["🍒","🍋","💎","⭐"],
      dados:["🎲","🎲"],
      poker:["♠️","♥️","♦️","♣️"]
    };

    if(juegos[cmd]){
      const apuesta = parseInt(args[0])||100;

      const m = await msg.reply("🎰 Girando...");
      await new Promise(r=>setTimeout(r,1000));

      const resultado = rand(juegos[cmd])+" "+rand(juegos[cmd])+" "+rand(juegos[cmd]);
      const win = Math.random()<0.45;

      await usersColl.updateOne(
        {userId:msg.author.id},
        {$inc:{points:win?apuesta:-apuesta}}
      );

      const embed = new EmbedBuilder()
        .setTitle(`🎰 ${cmd}`)
        .setDescription(`${resultado}\n\n${win?"🏆 Ganaste":"💀 Perdiste"} ($${apuesta})`);

      return m.edit({content:null,embeds:[embed],components:[botones(cmd,apuesta)]});
    }

    return;
  }

  // --- TRIGGERS ---
  const nombreTrigger = ["patro","patroclo","patroclin"];
  const insultos = ["pelotudo","boludo","hdp","forro"];
  const usuarioInsulto = insultos.some(i=>content.includes(i));

  const trigger =
    nombreTrigger.some(n=>content.includes(n)) ||
    msg.mentions.has(client.user.id) ||
    msg.reference ||
    msgCounter >= 7;

  msgCounter++;

  if(trigger){
    msgCounter = 0;

    if(cachedConfig.modoActual === "normal"){
      const r = await respuestaNormalIA(msg.content);
      return msg.reply((r || "...").slice(0,1900));
    }

    const data = await dataColl.findOne({id:"phrases"});
    const adn = data?.list?.slice(-20).join(" | ") || "";

    const r = await respuestaIA(
      `ADN: ${adn}\n${msg.author.username}: ${msg.content}`,
      cachedConfig.modoActual,
      usuarioInsulto
    );

    return msg.reply(r?.slice(0,1900));
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
      data.u.push(rand(cartas));

      if(puntos(data.u)>21){
        await usersColl.updateOne({userId:int.user.id},{$inc:{points:-data.apuesta}});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({content:"💀 Te pasaste",components:[]});
      }
    }

    if(accion==="plantarse"){
      while(puntos(data.b)<17){
        data.b.push(rand(cartas));
      }

      const win = puntos(data.u)>puntos(data.b);

      await usersColl.updateOne(
        {userId:int.user.id},
        {$inc:{points:win?data.apuesta:-data.apuesta}}
      );

      client.retos.delete(`bj_${int.user.id}`);

      return int.update({content:win?"🏆 Ganaste":"💀 Perdiste",components:[]});
    }

    return int.update({
      content:`🃏 ${data.u.join(" ")} (${puntos(data.u)})`
    });
  }

  if(accion==="salir"){
    return int.reply({content:"🚪 Saliste",ephemeral:true});
  }

  if(accion==="seguir"){
    const m = parseInt(apuesta);
    const win = Math.random()<0.45;

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