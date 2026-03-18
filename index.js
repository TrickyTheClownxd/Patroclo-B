import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor para Keep-Alive
http.createServer((req, res) => { res.write("Patroclo-B B05.7 ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel]
});

client.retos = new Map();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, sugerenciasColl, memoryColl;

let cachedConfig = {
    phrases: [],
    universeFacts: [],
    phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "Fuerza en el silencio."],
    mantenimiento: false,
    modoBot: "ia",
    personalidadExtra: "Sarcástico, facha y un poco bardo."
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTOR IA (GEMINI) ---
async function respuestaIA(contexto) {
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
            { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 12000 });
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch { return null; }
}

// --- MOTOR IMAGEN (HUGGING FACE) ---
async function generarImagen(prompt, modelUrl) {
    try {
        const res = await axios.post(modelUrl, { inputs: prompt }, { 
            headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, 
            responseType: "arraybuffer", timeout: 45000 
        });
        return Buffer.from(res.data, "binary");
    } catch { return null; }
}

async function connectDb() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db('patroclo_bot');
        usersColl = db.collection('users');
        dataColl = db.collection('bot_data');
        sugerenciasColl = db.collection('sugerencias');
        memoryColl = db.collection('ia_memory');
        const dbData = await dataColl.findOne({ id: "main_config" });
        if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
        console.log("✅ B05.7 - Sistema Total Sincronizado");
    } catch (e) { console.log("❌ Error DB"); }
}
connectDb();

let chatHistory = [];

client.on('messageCreate', async (msg) => {
    if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
    const user = await getUser(msg.author.id);
    const content = msg.content.toLowerCase();

    if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

    // --- LÓGICA IA + APRENDIZAJE ---
    if (!msg.content.startsWith('!')) {
        if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
            if (cachedConfig.modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
                await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
                cachedConfig.phrases.push(msg.content);
            }

            const mencionado = content.includes("patroclo") || msg.mentions?.has(client.user.id);
            if (mencionado || Math.random() < 0.18) {
                if (cachedConfig.modoBot === "ia") {
                    msg.channel.sendTyping();
                    const recuerdos = await memoryColl.find().sort({ _id: -1 }).limit(10).toArray();
                    const mem = recuerdos.map(r => r.dato).join(" | ");
                    const adn = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 45).join(" | ");
                    
                    const prompt = `Actúa como Patroclo-B. Sos una IA coherente. ADN: "${adn}". Recuerdos: "${mem}". Personalidad: ${cachedConfig.personalidadExtra}. Contexto: ${chatHistory.join(" | ")}. Responde a ${msg.author.username}: "${msg.content}"`;
                    
                    const r = await respuestaIA(prompt);
                    if (r) {
                        if (msg.content.length > 30 && Math.random() < 0.3) await memoryColl.insertOne({ dato: `${msg.author.username}: ${msg.content}`, fecha: new Date() });
                        return msg.reply(r);
                    }
                }
                let banco = cachedConfig.modoBot === "serio" ? cachedConfig.phrasesSerias : cachedConfig.phrases;
                return msg.channel.send(banco[Math.floor(Math.random()*banco.length)]);
            }
        }
        chatHistory.push(`${msg.author.username}: ${msg.content}`);
        if (chatHistory.length > 10) chatHistory.shift();
        return;
    }

    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // --- COMANDOS BOSS ---
    if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
        cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
        await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
        return msg.reply(cachedConfig.mantenimiento ? "🔴 MANTENIMIENTO ON" : "🟢 MANTENIMIENTO OFF");
    }
    if (cmd === 'personalidad' && msg.author.id === MI_ID_BOSS) {
        cachedConfig.personalidadExtra = args.join(" ");
        await dataColl.updateOne({ id: "main_config" }, { $set: { personalidadExtra: args.join(" ") } }, { upsert: true });
        return msg.reply("🎭 Personalidad IA actualizada.");
    }
    if (cmd === 'modo' && msg.author.id === MI_ID_BOSS) {
        cachedConfig.modoBot = args[0];
        await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: args[0] } }, { upsert: true });
        return msg.reply(`🤖 Modo ${args[0].toUpperCase()}`);
    }

    // --- MOTOR IMAGEN REFORMADO (B04.7) ---
    if (cmd === 'imagen' || cmd === 'foto') {
        const promptImg = args.join(" ");
        if (!promptImg) return msg.reply("¿Qué querés que dibuje, bobi?");
        msg.channel.sendTyping();
        const modelUrl = cmd === 'foto' ? "https://api-inference.huggingface.co/models/dreamlike-art/dreamlike-photoreal-2.0" : "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5";
        const img = await generarImagen(promptImg, modelUrl);
        return img ? msg.channel.send({ files: [{ attachment: img, name: "patroclo_art.png" }] }) : msg.reply("❌ Los motores están calientes, probá en un rato.");
    }

    // --- JUEGOS Y ECONOMÍA ---
    if (cmd === 'poker' || cmd === 'penal') {
        const mencion = msg.mentions.users.first();
        const monto = parseInt(args[1]) || parseInt(args[0]) || 100;
        if (user.points < monto) return msg.reply("💀 No tenés guita.");

        if (mencion) {
            if (mencion.id === client.user.id) {
                if (Math.random() < 0.3) return msg.reply("Ahora no tengo ganas de jugar con vos.");
                const winIA = Math.random() > 0.55;
                await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: winIA ? -monto : monto } });
                return msg.channel.send(winIA ? `🏆 **Gané.** Me quedo tus ${monto} PP.` : `💀 Me ganaste... Tomá tus ${monto} PP.`);
            }
            client.retos.set(mencion.id, { tipo: cmd, retador: msg.author.id, monto: monto });
            return msg.channel.send(`⚔️ <@${mencion.id}>, \`!aceptar\` por **${monto} PP**.`);
        }
        const gano = Math.random() > 0.55;
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: gano ? monto : -monto } });
        return msg.reply(gano ? `✅ Ganaste **${monto}**!` : `💀 Perdiste **${monto}**.`);
    }

    if (cmd === 'aceptar') {
        const reto = client.retos.get(msg.author.id);
        if (!reto) return msg.reply("Sin retos.");
        const win = Math.random() > 0.5;
        const g = win ? reto.retador : msg.author.id;
        const p = win ? msg.author.id : reto.retador;
        await usersColl.updateOne({ userId: g }, { $inc: { points: reto.monto } });
        await usersColl.updateOne({ userId: p }, { $inc: { points: -reto.monto } });
        client.retos.delete(msg.author.id);
        return msg.channel.send(`🏆 <@${g}> ganó los **${reto.monto} PP**.`);
    }

    if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** PP.`);
    if (cmd === 'daily') {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
        return msg.reply("💵 +500 PP.");
    }
    if (cmd === 'stats') {
        const totalU = await usersColl.countDocuments();
        return msg.reply(`📊 ADN: ${cachedConfig.phrases.length} | Modo: ${cachedConfig.modoBot.toUpperCase()} | Users: ${totalU}`);
    }
    if (cmd === 'ranking') {
        const top = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
        const e = new EmbedBuilder().setTitle("🏆 RANKING").setColor("#FFD700").setDescription(top.map((u, i) => `${i+1}. <@${u.userId}> - ${u.points} PP`).join("\n"));
        return msg.channel.send({ embeds: [e] });
    }
    if (cmd === 'sugerencia') {
        await sugerenciasColl.insertOne({ user: msg.author.username, texto: args.join(" "), fecha: new Date() });
        return msg.reply("✅ Sugerencia guardada.");
    }
});

async function getUser(id) {
    if (!usersColl) return { points: 0 };
    let u = await usersColl.findOne({ userId: id });
    if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
    return u;
}

client.login(process.env.TOKEN);