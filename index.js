// ==========================================
// PATROCLO ULTRA FINAL GOD - index.js
// ==========================================
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

// CONFIGURACIÓN DE SEGURIDAD
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const ID_OWNER = '986680845031059526'; // @Trickyxdxd

// SERVER (Mantenimiento)
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO B17.5 ONLINE")).listen(port);

// MEMORIA LOCAL
function safeJSON(path, def){
    try {
        if(!fs.existsSync(path)) { fs.writeFileSync(path, JSON.stringify(def,null,2)); return def; }
        return JSON.parse(fs.readFileSync(path,"utf-8"));
    } catch { return def; }
}
let memoria = safeJSON("./memoria.json", { chat: [], users: {} });
function saveMem(){ fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2)); }

// CLIENTE DISCORD
const client = new Client({
    intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, asociaColl;

let config = { phrases: [], modoActual: "ia", motorIA: "gemini" };
let msgCounter = 0;
let loopBotCounter = 0; 
if(!client.retos) client.retos = new Map();

// UTILS
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// MOTOR DE INTELIGENCIA ARTIFICIAL
async function IA(contexto, modo, usuarioInsulto = false){
    let sys;
    if(modo==="serio") sys="Sos un asistente profesional, educado y servicial.";
    else if(modo==="ia") {
        sys = usuarioInsulto 
            ? "Sos Patroclo, argentino de barrio MUY sacado. Respondé con bardo, sarcasmo y jerga porteña humillante." 
            : "Sos Patroclo, un pibe argentino de barrio, sarcástico, gracioso y algo cínico.";
    } else sys="Sos un selector de frases. Tu única misión es elegir una frase de la lista que encaje. PROHIBIDO hablar vos o inventar texto nuevo.";

    if(config.motorIA==="gemini"){
        try {
            const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                contents:[{parts:[{text:sys+"\n\n"+contexto}]}],
                safetySettings: [
                    {category:"HARM_CATEGORY_HARASSMENT", threshold:"BLOCK_NONE"},
                    {category:"HARM_CATEGORY_HATE_SPEECH", threshold:"BLOCK_NONE"}
                ]
            });
            return r.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch(e) { console.log("Error en Gemini"); }
    }
    
    try {
        const g = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model:"llama-3.3-70b-versatile",
            messages:[{role:"system",content:sys},{role:"user",content:contexto}]
        }, {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}});
        return g.data.choices[0].message.content;
    } catch { return "Se me recalentó el procesador."; }
}

// INICIO
async function start(){
    await mongo.connect();
    const db = mongo.db("patroclo_bot");
    usersColl = db.collection("users");
    dataColl = db.collection("bot_data");
    asociaColl = db.collection("asociaciones");
    
    const d = await dataColl.findOne({id:"main_config"});
    if(d) config = {...config,...d};
    
    await client.login(process.env.TOKEN);
    console.log(`🔥 PATROCLO B17.5 ONLINE`);
}

// MANEJO DE MENSAJES
client.on("messageCreate", async msg => {
    if(!msg.author) return;

    // ANTI-LOOP PATROCLO ORIGINAL
    if(msg.author.id === ID_PATROCLO_ORIGINAL){
        loopBotCounter++;
        if(loopBotCounter >= 3) return; 
    } else if(!msg.author.bot) {
        loopBotCounter = 0; 
    }

    if(msg.author.bot) return;

    // Usuario y Billetera
    let user = await usersColl.findOne({userId:msg.author.id}) || {userId:msg.author.id, points:1000};
    const content = msg.content.toLowerCase();

    // GUARDAR EN ADN
    if(!msg.content.startsWith("!") && msg.content.length > 5){
        if(!config.phrases.includes(msg.content)){ 
            config.phrases.push(msg.content); 
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true}); 
        }
    }

    // --- COMANDOS ---
    if(msg.content.startsWith("!")){
        const args = msg.content.slice(1).split(" ");
        const cmd = args.shift().toLowerCase();

        // Seguridad Owner (@Trickyxdxd)
        if(["modo", "olvida", "asocia"].includes(cmd) && msg.author.id !== ID_OWNER){
            return msg.reply("No sos Tricky, no te doy bola.");
        }

        if(cmd==="modo"){
            config.modoActual = args[0];
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`✅ Modo: ${args[0]}`);
        }

        if(cmd==="asocia"){
            const partes = args.join(" ").split(">");
            if(partes.length < 2) return msg.reply("Uso: !asocia [clave] > [respuesta]");
            await asociaColl.updateOne({clave: partes[0].trim().toLowerCase()}, {$set:{respuesta: partes[1].trim()}}, {upsert:true});
            return msg.reply("✅ Anotado.");
        }

        if(cmd==="olvida"){
            const t = args.join(" ");
            config.phrases = config.phrases.filter(p => !p.toLowerCase().includes(t.toLowerCase()));
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`🗑️ ADN Limpiado.`);
        }

        if(cmd==="bal") return msg.reply(`💰 Puntos: ${user.points}`);

        if(cmd==="bj"){
            const m = parseInt(args[0])||100;
            if(user.points < m) return msg.reply("No tenés un peso.");
            const manoU = [generarCarta(), generarCarta()];
            client.retos.set(`bj_${msg.author.id}`, {monto:m, manoU, manoB:[generarCarta()]});
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
            );
            return msg.reply({content:`🃏 BJ: ${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`, components:[row]});
        }
        return;
    }

    // --- RESPUESTA LÓGICA ---
    const insultos = ["pelotudo","boludo","hdp","forro","pajero","trolo"];
    const usuarioInsulto = insultos.some(i => content.includes(i));
    const trigger = msg.mentions.has(client.user.id) || content.includes("patro") || msgCounter >= 4;

    if(!trigger){ msgCounter++; return; }
    msgCounter = 0;
    msg.channel.sendTyping();

    // MODO NORMAL (Filtro Anti-Asistente)
    if(config.modoActual === "normal"){
        const asoc = await asociaColl.findOne({clave: content});
        if(asoc) return msg.reply(asoc.respuesta);

        const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,45);
        const promptN = `ADN: [${muestra.join(" | ")}]\n\nPregunta: "${msg.content}"\nResponde SOLO con la frase elegida. Si ninguna encaja bien, responde exactamente: FALLBACK.`;
        
        const r = await IA(promptN, "normal");
        let limpia = r.replace(/^(aquí tienes|la frase es:|respuesta:|")/gi, "").replace(/"$/g, "").trim();
        
        const excusas = ["fallback", "no encontr", "no hay", "asociad", "lo siento", "lo lament"];
        if (excusas.some(e => limpia.toLowerCase().includes(e)) || !limpia) {
            limpia = rand(config.phrases);
        }
        return msg.reply(limpia);
    }

    // IA / SERIO
    const res = await IA(`Msg: ${msg.content}`, config.modoActual, usuarioInsulto);
    return msg.reply(cortar(res));
});

// INTERACCIONES BUTTONS
client.on("interactionCreate", async int => {
    if(!int.isButton()) return;
    const d = client.retos.get(`bj_${int.user.id}`);
    if(!d) return int.reply({content:"Expiró.", ephemeral:true});

    if(int.customId === "bj_pedir"){
        d.manoU.push(generarCarta()); const p = calcularPuntos(d.manoU);
        if(p > 21){ 
            await usersColl.updateOne({userId:int.user.id}, {$inc:{points:-d.monto}}, {upsert:true});
            client.retos.delete(`bj_${int.user.id}`);
            return int.update({content:`💀 Perdiste $${d.monto} (Total: ${p})`, components:[]});
        }
        return int.update({content:`🃏 BJ: ${d.manoU.map(c=>c.txt).join(" ")} (${p})`});
    }

    if(int.customId === "bj_plantarse"){
        let pb = calcularPuntos(d.manoB); while(pb < 17){ d.manoB.push(generarCarta()); pb = calcularPuntos(d.manoB); }
        const pu = calcularPuntos(d.manoU); const win = pb > 21 || pu > pb; const empate = pu === pb;
        await usersColl.updateOne({userId:int.user.id}, {$inc:{points: empate?0:(win?d.monto:-d.monto)}}, {upsert:true});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({content: empate?"⚖️ Empate":(win?`🏆 Ganaste! Crupier: ${pb}`:`💀 Perdiste. Crupier: ${pb}`), components:[]});
    }
});

// FUNCIONES JUEGO
function generarCarta(){
    const v = [{n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}];
    const i = rand(v); return { txt:`${i.n}${rand(['♠️','♥️','♦️','♣️'])}`, val:i.v };
}
function calcularPuntos(m){
    let p = m.reduce((a,c)=>a+c.val,0); let ases = m.filter(c=>c.txt.startsWith("A")).length;
    while(p>21 && ases>0){ p-=10; ases--; } return p;
}

start();