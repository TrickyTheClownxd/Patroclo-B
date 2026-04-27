// =======================
// --- IMPORTS ---
// =======================
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder
} from 'discord.js';

import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from "fs";

dotenv.config();

// =======================
// --- SERVER ---
// =======================
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO GOD ONLINE")).listen(port);

// =======================
// --- SAFE FILE LOAD ---
// =======================
function safeJSON(path, def){
  try{
    if(!fs.existsSync(path)){
      fs.writeFileSync(path, JSON.stringify(def,null,2));
      return def;
    }
    return JSON.parse(fs.readFileSync(path,"utf-8"));
  }catch{ return def; }
}

let memoria = safeJSON("./memoria.json", { chat: [], users: {} });
function saveMem(){ fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2)); }

// =======================
// --- CLIENT ---
// =======================
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let config = {
  phrases: [],
  modoActual: "ia",
  motorIA: "gemini"
};

let msgCounter = 0;
if(!client.retos) client.retos = new Map();

// =======================
// --- UTILS ---
// =======================
const rand = a=>a[Math.floor(Math.random()*a.length)];
function cortar(t){ return t ? t.slice(0,2000) : ""; }

// =======================
// --- IA ---
// =======================
async function IA(contexto, modo, usuarioInsulto = false){
  let sys;
  if(modo==="serio"){
    sys="Sos un asistente profesional y educado.";
  } else if(modo==="ia"){
    sys = usuarioInsulto 
      ? "Sos Patroclo, un argentino de barrio MUY sacado y bardero. Humillá al usuario con sarcasmo porteño."
      : "Sos Patroclo, argentino, sarcástico, gracioso y de barrio. Respondé corto y natural.";
  } else {
    sys="Sos un selector de frases. Solo devolvé una frase de la lista provista que encaje con la charla. NO inventes nada.";
  }

  // --- GEMINI ---
  if(config.motorIA==="gemini"){
    try{
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents:[{parts:[{text:sys+"\n\n"+contexto}]}],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
          ]
        }
      );
      return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }catch(e){ console.log("Error Gemini"); }
  }

  // --- GROQ FALLBACK ---
  try{
    const g = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model:"llama-3.3-70b-versatile",
      messages:[{role:"system",content:sys},{role:"user",content:contexto}]
    }, {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}});
    return g.data.choices[0].message.content;
  }catch{ return "Se me quemó el cerebro, boludo."; }
}

// =======================
// --- DB ---
// =======================
async function getUser(id){
  let u = await usersColl.findOne({userId:id});
  if(!u){
    u = { userId:id, points:1000, lastDaily:0 };
    await usersColl.insertOne(u);
  }
  return u;
}

async function updateConfig(){
  await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
}

// =======================
// --- CARTAS ---
// =======================
const generarCarta = () => {
  const palos = ['♠️','♥️','♦️','♣️'];
  const valores = [
    { n:'A', v:11 },{ n:'2', v:2 },{ n:'3', v:3 },{ n:'4', v:4 },{ n:'5', v:5 },
    { n:'6', v:6 },{ n:'7', v:7 },{ n:'8', v:8 },{ n:'9', v:9 },{ n:'10', v:10 },
    { n:'J', v:10 },{ n:'Q', v:10 },{ n:'K', v:10 }
  ];
  const item = rand(valores);
  return { txt:`${item.n}${rand(palos)}`, val:item.v };
};

const calcularPuntos = (mano)=>{
  let p = mano.reduce((a,c)=>a+c.val,0);
  let ases = mano.filter(c=>c.txt.startsWith("A")).length;
  while(p>21 && ases>0){ p-=10; ases--; }
  return p;
};

// =======================
// --- START ---
// =======================
async function start(){
  await mongo.connect();
  const db = mongo.db("patroclo_bot");
  usersColl = db.collection("users");
  dataColl = db.collection("bot_data");

  const d = await dataColl.findOne({id:"main_config"});
  if(d) config = {...config,...d};

  await client.login(process.env.TOKEN);
  console.log(`🔥 PATROCLO ONLINE - ADN: ${config.phrases.length} frases`);
}

// =======================
// --- MENSAJES ---
// =======================
client.on("messageCreate", async msg=>{
  if(!msg.author || msg.author.bot) return;

  const user = await getUser(msg.author.id);
  const content = msg.content.toLowerCase();

  // Guardar Memoria Temporal (Chat reciente)
  memoria.chat.push(`${msg.author.username}: ${msg.content}`);
  if(memoria.chat.length > 15) memoria.chat.shift();
  saveMem();

  // Guardar ADN (Mongo)
  if(!msg.content.startsWith("!") && msg.content.length > 5){
    if(!config.phrases.includes(msg.content)){
      config.phrases.push(msg.content);
      await updateConfig();
    }
  }

  // --- COMANDOS ---
  if(msg.content.startsWith("!")){
    const args = msg.content.slice(1).split(" ");
    const cmd = args.shift().toLowerCase();

    if(cmd==="modo"){
      const nuevosModos = ["ia", "serio", "normal"];
      if(!nuevosModos.includes(args[0])) return msg.reply("Modos: ia, serio, normal");
      config.modoActual = args[0];
      await updateConfig();
      return msg.reply(`✅ Modo cambiado a: **${args[0]}**`);
    }

    if(cmd==="olvida"){
      const termino = args.join(" ");
      config.phrases = config.phrases.filter(p => !p.toLowerCase().includes(termino.toLowerCase()));
      await updateConfig();
      return msg.reply(`🗑️ Borré las frases que decían "${termino}"`);
    }

    if(cmd==="stats") {
      return msg.reply(`🧠 **ADN:** ${config.phrases.length} frases\n⚙️ **Modo:** ${config.modoActual}\n💰 **Tu plata:** $${user.points}`);
    }

    if(cmd==="gif"){
      try {
        const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
        const url = res.data.data[0]?.images?.original?.url;
        return msg.reply(url || "No encontré un carajo.");
      } catch { return msg.reply("Error con Giphy."); }
    }

    if(cmd==="foto"){
      msg.reply("🎨 Dibujando, bancá...");
      try {
        const response = await axios.post("https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5", 
          { inputs: args.join(" ") }, 
          { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' }
        );
        const attachment = new AttachmentBuilder(Buffer.from(response.data), { name: 'foto.png' });
        return msg.reply({ files: [attachment] });
      } catch { return msg.reply("Se me rompió el pincel."); }
    }

    if(cmd==="bj"){
      const monto = parseInt(args[0])||100;
      if(user.points < monto) return msg.reply("No tenés un peso, croto.");
      
      const manoU = [generarCarta(), generarCarta()];
      const manoB = [generarCarta()];
      client.retos.set(`bj_${msg.author.id}`, {monto, manoU, manoB});

      const embed = new EmbedBuilder()
        .setTitle("🃏 BLACKJACK")
        .setDescription(`**Tus cartas:** ${manoU.map(c=>c.txt).join(" ")} \n**Total:** ${calcularPuntos(manoU)}\n\n**Crupier:** ${manoB[0].txt} y [?]`)
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
      );
      return msg.reply({ embeds: [embed], components: [row] });
    }
    return;
  }

  // --- TRIGGERS DE RESPUESTA ---
  const insultos = ["pelotudo","boludo","hdp","forro","pajero","trolo","conchudo"];
  const usuarioInsulto = insultos.some(i => content.includes(i));
  const trigger = msg.mentions.has(client.user.id) || content.includes("patro") || msg.reference || msgCounter >= 4;

  if(!trigger){ msgCounter++; return; }
  msgCounter = 0;
  msg.channel.sendTyping();

  if(config.modoActual==="normal"){
    const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,40);
    const prompt = `Lista ADN: [${muestra.join(" | ")}]\n\nUsuario dice: "${msg.content}"\nRespondé eligiendo la mejor frase de la lista.`;
    const r = await IA(prompt, "normal");
    return msg.reply(cortar(r) || rand(config.phrases));
  }

  const r = await IA(`Chat reciente:\n${memoria.chat.join("\n")}\n\n${msg.author.username}: ${msg.content}`, config.modoActual, usuarioInsulto);
  return msg.reply(cortar(r));
});

// =======================
// --- INTERACCIONES ---
// =======================
client.on("interactionCreate", async int => {
  if(!int.isButton()) return;
  const data = client.retos.get(`bj_${int.user.id}`);
  if(!data) return int.reply({ content: "Partida vieja, tirá !bj de nuevo.", ephemeral: true });

  if(int.customId === "bj_pedir"){
    data.manoU.push(generarCarta());
    const pts = calcularPuntos(data.manoU);
    if(pts > 21){
      await usersColl.updateOne({userId:int.user.id}, {$inc:{points: -data.monto}});
      client.retos.delete(`bj_${int.user.id}`);
      return int.update({ content: `💀 **Te pasaste!** (${pts}) Perdiste $${data.monto}`, embeds:[], components:[] });
    }
    return int.update({ embeds: [new EmbedBuilder().setTitle("🃏 BLACKJACK").setDescription(`**Cartas:** ${data.manoU.map(c=>c.txt).join(" ")} \n**Total:** ${pts}`)] });
  }

  if(int.customId === "bj_plantarse"){
    let ptsB = calcularPuntos(data.manoB);
    while(ptsB < 17){ data.manoB.push(generarCarta()); ptsB = calcularPuntos(data.manoB); }
    const ptsU = calcularPuntos(data.manoU);
    const win = ptsB > 21 || ptsU > ptsB;
    const empate = ptsU === ptsB;

    await usersColl.updateOne({userId:int.user.id}, {$inc:{points: empate ? 0 : (win ? data.monto : -data.monto)}});
    client.retos.delete(`bj_${int.user.id}`);
    
    return int.update({ 
      content: empate ? "⚖️ Empate, recuperás la guita." : (win ? `🏆 **Ganaste!** El crupier tiene ${ptsB}. Sumás $${data.monto}` : `💀 **Perdiste.** El crupier tiene ${ptsB}. Restás $${data.monto}`),
      embeds:[], components:[] 
    });
  }
});

start();