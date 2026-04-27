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

// CONFIGURACIÓN DE IDs
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const ID_OWNER = '986680845031059526'; // @Trickyxdxd

// SERVER PARA MANTENERLO VIVO
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
    } else sys="Sos un selector de frases. Tu única misión es elegir una frase de la lista que encaje. NO puedes inventar nada.";

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
    } catch { return "Se me recalentó el procesador, boludo."; }
}

// INICIO DE BASE DE DATOS Y BOT
async function start(){
    await mongo.connect();
    const db = mongo.db("patroclo_bot");
    usersColl = db.collection("users");
    dataColl = db.collection("bot_data");
    asociaColl = db.collection("asociaciones");
    
    const d = await dataColl.findOne({id:"main_config"});
    if(d) config = {...config,...d};
    
    await client.login(process.env.TOKEN);
    console.log(`🔥 PATROCLO ONLINE - ADN: ${config.phrases.length} frases.`);
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

    // Obtener usuario
    let user = await usersColl.findOne({userId:msg.author.id});
    if(!user) {
        user = {userId:msg.author.id, points:1000};
        await usersColl.insertOne(user);
    }

    const content = msg.content.toLowerCase();

    // GUARDAR EN EL ADN (Si es charla normal)
    if(!msg.content.startsWith("!") && msg.content.length > 5){
        if(!config.phrases.includes(msg.content)){ 
            config.phrases.push(msg.content); 
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true}); 
        }
    }

    // --- SECCIÓN COMANDOS ---
    if(msg.content.startsWith("!")){
        const args = msg.content.slice(1).split(" ");
        const cmd = args.shift().toLowerCase();

        // Seguridad: Solo el Owner Tricky
        if(["modo", "olvida", "asocia", "motor"].includes(cmd) && msg.author.id !== ID_OWNER){
            return msg.reply("¿Quién te conoce? No sos Tricky, no te doy bola.");
        }

        if(cmd==="modo"){
            config.modoActual = args[0];
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`✅ Modo cambiado a: **${args[0]}**`);
        }

        if(cmd==="asocia"){
            const partes = args.join(" ").split(">");
            if(partes.length < 2) return msg.reply("Uso: !asocia [palabra] > [respuesta]");
            await asociaColl.updateOne(
                {clave: partes[0].trim().toLowerCase()}, 
                {$set:{respuesta: partes[1].trim()}}, 
                {upsert:true}
            );
            return msg.reply("✅ Asociación grabada en el mate.");
        }

        if(cmd==="olvida"){
            const termino = args.join(" ");
            config.phrases = config.phrases.filter(p => !p.toLowerCase().includes(termino.toLowerCase()));
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`🗑️ ADN Limpiado: Chau frases con "${termino}"`);
        }

        if(cmd==="bal") return msg.reply(`💰 Tu saldo es: $${user.points}`);

        if(cmd==="bj"){
            const apuesta = parseInt(args[0])||100;
            if(user.points < apuesta) return msg.reply("Andá a laburar, no tenés ni un peso.");
            
            const manoU = [generarCarta(), generarCarta()];
            client.retos.set(`bj_${msg.author.id}`, {monto:apuesta, manoU, manoB:[generarCarta()]});
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
            );
            return msg.reply({
                content:`🃏 **BLACKJACK**\nTu mano: ${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`, 
                components:[row]
            });
        }
        return;
    }

    // --- RESPUESTA IA / ADN ---
    const insultos = ["pelotudo","boludo","hdp","forro","pajero","trolo","forro"];
    const usuarioInsulto = insultos.some(i => content.includes(i));
    const trigger = msg.mentions.has(client.user.id) || content.includes("patro") || msgCounter >= 4;

    if(!trigger){ msgCounter++; return; }
    msgCounter = 0;
    msg.channel.sendTyping();

    // MODO NORMAL (Filtro ADN)
    if(config.modoActual === "normal"){
        const asoc = await asociaColl.findOne({clave: content});
        if(asoc) return msg.reply(asoc.respuesta);

        const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,45);
        const r = await IA(`ADN frases: [${muestra.join(" | ")}]\n\nPregunta: "${msg.content}"\nElige una respuesta de la lista. SOLO LA FRASE.`, "normal");
        const limpia = r.replace(/^(aquí tienes|respuesta:|la frase elegida es:)/gi, "").trim();
        return msg.reply(limpia || rand(config.phrases));
    }

    // MODO IA / SERIO
    const contextoFinal = `Historial chat: ${memoria.chat.slice(-5).join(" | ")}\nUsuario: ${msg.content}`;
    const res = await IA(contextoFinal, config.modoActual, usuarioInsulto);
    return msg.reply(cortar(res));
});

// EVENTOS DE BOTONES
client.on("interactionCreate", async int => {
    if(!int.isButton()) return;
    const d = client.retos.get(`bj_${int.user.id}`);
    if(!d) return int.reply({content:"Esa partida ya fue.", ephemeral:true});

    if(int.customId === "bj_pedir"){
        d.manoU.push(generarCarta());
        const pts = calcularPuntos(d.manoU);
        if(pts > 21){ 
            await usersColl.updateOne({userId:int.user.id}, {$inc:{points:-d.monto}});
            client.retos.delete(`bj_${int.user.id}`);
            return int.update({content:`💀 Te pasaste (${pts}). Perdiste $${d.monto}`, components:[]});
        }
        return int.update({content:`🃏 **BLACKJACK**\nTu mano: ${d.manoU.map(c=>c.txt).join(" ")} (${pts})`});
    }

    if(int.customId === "bj_plantarse"){
        let pb = calcularPuntos(d.manoB);
        while(pb < 17){ d.manoB.push(generarCarta()); pb = calcularPuntos(d.manoB); }
        const pu = calcularPuntos(d.manoU);
        const win = pb > 21 || pu > pb;
        const empate = pu === pb;
        
        await usersColl.updateOne({userId:int.user.id}, {$inc:{points: empate ? 0 : (win ? d.monto : -d.monto)}});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({
            content: empate ? "⚖️ Empate, zafaste la guita." : (win ? `🏆 ¡Ganaste! Crupier tenía ${pb}. Sumás $${d.monto}` : `💀 Perdiste. Crupier tenía ${pb}. Restás $${d.monto}`),
            components:[]
        });
    }
});

// FUNCIONES DE JUEGO
function generarCarta(){
    const v = [{n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}];
    const i = rand(v); return { txt:`${i.n}${rand(['♠️','♥️','♦️','♣️'])}`, val:i.v };
}
function calcularPuntos(m){
    let p = m.reduce((a,c)=>a+c.val,0); let ases = m.filter(c=>c.txt.startsWith("A")).length;
    while(p>21 && ases>0){ p-=10; ases--; } return p;
}

start();