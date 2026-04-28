// ==========================================
// PATROCLO ULTRA FINAL GOD - index.js (FULL INTEGRATED)
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

// MEMORIA LOCAL (Fallback)
function safeJSON(path, def){
    try {
        if(!fs.existsSync(path)) { fs.writeFileSync(path, JSON.stringify(def,null,2)); return def; }
        return JSON.parse(fs.readFileSync(path,"utf-8"));
    } catch { return def; }
}
let memoria = safeJSON("./memoria.json", { chat: [], users: {} });

// CLIENTE DISCORD
const client = new Client({
    intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, asociaColl;

let config = { phrases: [], modoActual: "ia", motorIA: "gemini" };
let loopBotCounter = 0; 
if(!client.retos) client.retos = new Map();

// UTILS
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// --- MOTOR DE IA CON SALVAVIDAS ---
async function IA(contexto, modo, usuarioInsulto = false){
    let sys;
    if(modo==="serio") sys="Sos un asistente profesional porteño.";
    else if(modo==="ia") {
        sys = usuarioInsulto 
            ? "Sos Patroclo, argentino sacado. Respondé con bardo, sarcasmo y jerga de barrio porteño." 
            : "Sos Patroclo, pibe argentino, sarcástico y gracioso.";
    } else sys="Sos un selector de frases. Tu misión es elegir UNA frase de la lista. PROHIBIDO inventar texto.";

    try {
        if(config.motorIA==="gemini"){
            const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                contents:[{parts:[{text:sys+"\n\n"+contexto}]}],
                safetySettings: [
                    {category:"HARM_CATEGORY_HARASSMENT", threshold:"BLOCK_NONE"},
                    {category:"HARM_CATEGORY_HATE_SPEECH", threshold:"BLOCK_NONE"},
                    {category:"HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold:"BLOCK_NONE"},
                    {category:"HARM_CATEGORY_DANGEROUS_CONTENT", threshold:"BLOCK_NONE"}
                ]
            });
            return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        }
        const g = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model:"llama-3.3-70b-versatile",
            messages:[{role:"system",content:sys},{role:"user",content:contexto}]
        }, {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}});
        return g.data.choices[0].message.content || null;
    } catch (e) {
        console.log("Falla en IA: Usando ADN local.");
        return null; 
    }
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
    console.log(`🔥 PATROCLO B17.5 ONLINE - TRIGGER 100%`);
}

// MENSAJES
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

    let user = await usersColl.findOne({userId:msg.author.id}) || {userId:msg.author.id, points:1000};
    const content = msg.content.toLowerCase();

    // GUARDAR ADN
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

        if(["modo", "olvida", "asocia"].includes(cmd) && msg.author.id !== ID_OWNER) return;

        if(cmd==="modo"){
            config.modoActual = args[0];
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`✅ Modo: ${args[0]}`);
        }

        if(cmd==="asocia"){
            const p = args.join(" ").split(">");
            if(p.length < 2) return msg.reply("Uso: !asocia clave > respuesta");
            await asociaColl.updateOne({clave: p[0].trim().toLowerCase()}, {$set:{respuesta: p[1].trim()}}, {upsert:true});
            return msg.reply("✅ Guardado.");
        }

        if(cmd==="olvida"){
            const t = args.join(" ");
            config.phrases = config.phrases.filter(p => !p.toLowerCase().includes(t.toLowerCase()));
            await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true});
            return msg.reply(`🗑️ ADN Limpiado.`);
        }

        if(cmd==="bal") return msg.reply(`💰 Saldo: $${user.points}`);

        if(cmd==="gif"){
            try {
                const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
                return msg.reply(res.data.data[0]?.url || "No encontré ni un gif de eso.");
            } catch { return msg.reply("Se cayó Giphy, manejalo."); }
        }

        if(cmd==="foto"){
            try {
                msg.channel.sendTyping();
                const res = await axios.post("https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5", 
                    { inputs: args.join(" ") }, 
                    { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, responseType: 'arraybuffer' }
                );
                return msg.reply({ files: [new AttachmentBuilder(Buffer.from(res.data), { name: 'foto.png' })] });
            } catch { return msg.reply("Se me terminó el tóner, intentá después."); }
        }

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

    // --- TRIGGER 100% (Mención, Reply o Nombre) ---
    const esInvocado = msg.mentions.has(client.user.id) || content.includes("patroclo") || content.includes("patro");
    
    if(!esInvocado) return; // Si no lo llaman, Patroclo no se mete.

    msg.channel.sendTyping();
    const insultos = ["pelotudo","boludo","hdp","forro","pajero"];
    const usuarioInsulto = insultos.some(i => content.includes(i));

    // MODO NORMAL (Anti-Excusas)
    if(config.modoActual === "normal"){
        const asoc = await asociaColl.findOne({clave: content});
        if(asoc) return msg.reply(asoc.respuesta);

        const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,40);
        const resIA = await IA(`ADN: [${muestra.join(" | ")}]\n\nPregunta: "${msg.content}"\nRespondé SOLO con la frase elegida.`, "normal");
        
        let limpia = resIA ? resIA.replace(/^(aquí tienes|la frase es:|respuesta:|")/gi, "").replace(/"$/g, "").trim() : "";
        const excusas = ["fallback", "no encontr", "no hay", "asociad", "lo siento", "recalentó", "asistente"];
        
        if (!limpia || excusas.some(e => limpia.toLowerCase().includes(e))) {
            limpia = rand(config.phrases);
        }
        return msg.reply(limpia);
    }

    // MODO IA / SERIO
    const finalRes = await IA(`Msg: ${msg.content}`, config.modoActual, usuarioInsulto);
    return msg.reply(finalRes ? cortar(finalRes) : rand(config.phrases));
});

// INTERACCIONES BLACKJACK
client.on("interactionCreate", async int => {
    if(!int.isButton()) return;
    const d = client.retos.get(`bj_${int.user.id}`);
    if(!d) return;

    if(int.customId === "bj_pedir"){
        d.manoU.push(generarCarta()); const p = calcularPuntos(d.manoU);
        if(p > 21){ 
            await usersColl.updateOne({userId:int.user.id}, {$inc:{points:-d.monto}}, {upsert:true});
            client.retos.delete(`bj_${int.user.id}`);
            return int.update({content:`💀 Te pasaste (${p}). Perdiste $${d.monto}`, components:[]});
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

function generarCarta(){
    const v = [{n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}];
    const i = rand(v); return { txt:`${i.n}${rand(['♠️','♥️','♦️','♣️'])}`, val:i.v };
}
function calcularPuntos(m){
    let p = m.reduce((a,c)=>a+c.val,0); let ases = m.filter(c=>c.txt.startsWith("A")).length;
    while(p>21 && ases>0){ p-=10; ases--; } return p;
}

start();