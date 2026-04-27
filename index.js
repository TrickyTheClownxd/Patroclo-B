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

// --- SERVER (Para que no se muera el bot) ---
const port = process.env.PORT || 8080;
http.createServer((req,res)=>res.end("PATROCLO GOD ONLINE")).listen(port);

// --- MEMORIA LOCAL (Fallback) ---
function safeJSON(path, def){
    try {
        if(!fs.existsSync(path)) { fs.writeFileSync(path, JSON.stringify(def,null,2)); return def; }
        return JSON.parse(fs.readFileSync(path,"utf-8"));
    } catch { return def; }
}
let memoria = safeJSON("./memoria.json", { chat: [], users: {} });
function saveMem(){ fs.writeFileSync("./memoria.json", JSON.stringify(memoria,null,2)); }

// --- CLIENT CONFIG ---
const client = new Client({
    intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials:[Partials.Channel]
});

const mongo = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, asociaColl;

let config = { phrases: [], modoActual: "ia", motorIA: "gemini" };
let msgCounter = 0;
if(!client.retos) client.retos = new Map();

// --- UTILS ---
const rand = a => a[Math.floor(Math.random()*a.length)];
const cortar = t => t ? t.slice(0,1900) : "";

// --- MOTOR DE IA ---
async function IA(contexto, modo, usuarioInsulto = false){
    let sys;
    if(modo==="serio") sys="Sos un asistente profesional y educado.";
    else if(modo==="ia") {
        sys = usuarioInsulto 
            ? "Sos Patroclo, argentino de barrio MUY sacado. Humillá al usuario con sarcasmo porteño y bardo." 
            : "Sos Patroclo, argentino, sarcástico y de barrio. Respondé corto y natural.";
    } else sys="Sos un selector de frases. Solo devolvé una frase de la lista provista que encaje. PROHIBIDO hablar vos o inventar.";

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
        } catch(e) { console.log("Error Gemini"); }
    }
    
    // Fallback a GROQ
    try {
        const g = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model:"llama-3.3-70b-versatile",
            messages:[{role:"system",content:sys},{role:"user",content:contexto}]
        }, {headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`}});
        return g.data.choices[0].message.content;
    } catch { return "Se me quemó el cerebro, boludo."; }
}

// --- DB HELPERS ---
async function getUser(id){
    let u = await usersColl.findOne({userId:id});
    if(!u){ u = { userId:id, points:1000, lastDaily:0 }; await usersColl.insertOne(u); }
    return u;
}
async function updateConfig(){ await dataColl.updateOne({id:"main_config"}, {$set:config}, {upsert:true}); }

// --- LÓGICA DE CARTAS ---
const generarCarta = () => {
    const palos = ['♠️','♥️','♦️','♣️'];
    const v = [{n:'A',v:11},{n:'2',v:2},{n:'3',v:3},{n:'4',v:4},{n:'5',v:5},{n:'6',v:6},{n:'7',v:7},{n:'8',v:8},{n:'9',v:9},{n:'10',v:10},{n:'J',v:10},{n:'Q',v:10},{n:'K',v:10}];
    const i = rand(v); return { txt:`${i.n}${rand(palos)}`, val:i.v };
};
const calcularPuntos = (m) => {
    let p = m.reduce((a,c)=>a+c.val,0); let ases = m.filter(c=>c.txt.startsWith("A")).length;
    while(p>21 && ases>0){ p-=10; ases--; } return p;
};

// --- STARTUP ---
async function start(){
    await mongo.connect();
    const db = mongo.db("patroclo_bot");
    usersColl = db.collection("users");
    dataColl = db.collection("bot_data");
    asociaColl = db.collection("asociaciones");
    const d = await dataColl.findOne({id:"main_config"});
    if(d) config = {...config,...d};
    await client.login(process.env.TOKEN);
    console.log("🔥 PATROCLO ONLINE Y CONECTADO A MONGO");
}

// --- MANEJO DE MENSAJES ---
client.on("messageCreate", async msg => {
    if(!msg.author || msg.author.bot) return;
    const user = await getUser(msg.author.id);
    const content = msg.content.toLowerCase();

    // Guardar en ADN (Mongo)
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
            config.modoActual = args[0]; await updateConfig();
            return msg.reply("✅ Modo cambiado a: " + args[0]);
        }
        if(cmd==="asocia"){
            const p = args.join(" ").split(">");
            if(p.length < 2) return msg.reply("Uso: !asocia clave > respuesta");
            await asociaColl.updateOne({clave: p[0].trim().toLowerCase()}, {$set:{respuesta: p[1].trim()}}, {upsert:true});
            return msg.reply("✅ Asociación guardada en el cerebro.");
        }
        if(cmd==="olvida"){
            const t = args.join(" ");
            config.phrases = config.phrases.filter(p => !p.toLowerCase().includes(t.toLowerCase()));
            await updateConfig(); return msg.reply("🗑️ ADN Limpiado de ese término.");
        }
        if(cmd==="bal") return msg.reply(`💰 Tenés: $${user.points}`);
        if(cmd==="stats") return msg.reply(`🧠 Frases: ${config.phrases.length}\n⚙️ Modo: ${config.modoActual}\n💰 Saldo: $${user.points}`);
        
        if(cmd==="gif"){
            const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(" ")}&limit=1`);
            return msg.reply(res.data.data[0]?.images?.original?.url || "No encontré nada.");
        }

        if(cmd==="foto"){
            try {
                const res = await axios.post("https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5", {inputs: args.join(" ")}, {headers:{Authorization:`Bearer ${process.env.HF_API_KEY}`}, responseType:'arraybuffer'});
                return msg.reply({files:[new AttachmentBuilder(Buffer.from(res.data), {name:'foto.png'})]});
            } catch { return msg.reply("Se me rompió el pincel."); }
        }

        if(cmd==="bj"){
            const m = parseInt(args[0])||100; if(user.points < m) return msg.reply("No tenés un peso, croto.");
            const manoU = [generarCarta(), generarCarta()]; const manoB = [generarCarta()];
            client.retos.set(`bj_${msg.author.id}`, {monto:m, manoU, manoB});
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("bj_pedir").setLabel("Pedir").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("bj_plantarse").setLabel("Plantarse").setStyle(ButtonStyle.Danger)
            );
            return msg.reply({content:`🃏 **BLACKJACK**\nTus cartas: ${manoU.map(c=>c.txt).join(" ")} (${calcularPuntos(manoU)})`, components:[row]});
        }
        return;
    }

    // --- LÓGICA DE RESPUESTAS (IA/ADN) ---
    const insultos = ["pelotudo","boludo","hdp","forro","pajero","trolo","conchudo"];
    const usuarioInsulto = insultos.some(i => content.includes(i));
    const trigger = msg.mentions.has(client.user.id) || content.includes("patro") || msgCounter >= 4;

    if(!trigger){ msgCounter++; return; }
    msgCounter = 0; msg.channel.sendTyping();

    // MODO NORMAL (Curador de ADN)
    if(config.modoActual === "normal"){
        const asoc = await asociaColl.findOne({clave: content});
        if(asoc) return msg.reply(asoc.respuesta);
        
        const muestra = config.phrases.sort(()=>0.5-Math.random()).slice(0,40);
        const prompt = `Lista de frases ADN: [${muestra.join(" | ")}]\n\nUsuario dice: "${msg.content}"\nResponde SOLO con la frase elegida de la lista, sin explicar nada.`;
        const r = await IA(prompt, "normal");
        const limpia = r.replace(/^(aquí tienes|la frase es:|respuesta:)/gi, "").trim();
        return msg.reply(limpia || rand(config.phrases));
    }

    // MODO IA / SERIO
    const res = await IA(`Usuario: ${msg.content}`, config.modoActual, usuarioInsulto);
    return msg.reply(cortar(res));
});

// --- INTERACCIONES DE BOTONES (Blackjack) ---
client.on("interactionCreate", async int => {
    if(!int.isButton()) return;
    const d = client.retos.get(`bj_${int.user.id}`);
    if(!d) return int.reply({content:"Sesión expirada.", ephemeral:true});

    if(int.customId === "bj_pedir"){
        d.manoU.push(generarCarta()); const p = calcularPuntos(d.manoU);
        if(p > 21){ 
            await usersColl.updateOne({userId:int.user.id}, {$inc:{points:-d.monto}});
            client.retos.delete(`bj_${int.user.id}`);
            return int.update({content:`💀 Te pasaste con ${p}. Perdiste $${d.monto}`, components:[]});
        }
        return int.update({content:`🃏 **BLACKJACK**\nTus cartas: ${d.manoU.map(c=>c.txt).join(" ")} (${p})`});
    }

    if(int.customId === "bj_plantarse"){
        let pb = calcularPuntos(d.manoB); while(pb < 17){ d.manoB.push(generarCarta()); pb = calcularPuntos(d.manoB); }
        const pu = calcularPuntos(d.manoU); const win = pb > 21 || pu > pb; const empate = pu === pb;
        await usersColl.updateOne({userId:int.user.id}, {$inc:{points: empate?0:(win?d.monto:-d.monto)}});
        client.retos.delete(`bj_${int.user.id}`);
        return int.update({content: empate?"⚖️ Empate.": (win?`🏆 Ganaste! El crupier tiene ${pb}. Sumás $${d.monto}` : `💀 Perdiste. El crupier tiene ${pb}. Restás $${d.monto}`), components:[]});
    }
});

start();