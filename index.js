import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor para Render/Railway
http.createServer((req, res) => {
    res.write("Patroclo-B B04.2 ONLINE - DNA Mirror Active");
    res.end();
}).listen(process.env.PORT || 8080);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel]
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl;

let cachedConfig = {
    phrases: [],
    phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo.", "Fuerza en el silencio."],
    mantenimiento: false,
    modoBot: "normal" // normal, serio, ia
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

// --- MOTORES IA Y ARTE ---
async function respuestaIA(contexto) {
    try {
        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
            { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 12000 }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch { return null; }
}

async function generarImagen(prompt, modelUrl) {
    try {
        const res = await axios.post(modelUrl, { inputs: prompt }, { 
            headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` }, 
            responseType: "arraybuffer", timeout: 35000 
        });
        return Buffer.from(res.data, "binary");
    } catch { return null; }
}

// --- CONEXIÓN DB ---
async function connectDb() {
    try {
        await mongoClient.connect();
        const database = mongoClient.db('patroclo_bot');
        usersColl = database.collection('users');
        dataColl = database.collection('bot_data');
        const dbData = await dataColl.findOne({ id: "main_config" });
        if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
        console.log(`✅ B04.2 Conectado. Memoria: ${cachedConfig.phrases.length} frases.`);
    } catch (e) { console.log("❌ Error DB:", e); }
}
connectDb();

let chatHistory = [];

client.on('messageCreate', async (msg) => {
    if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
    const content = msg.content ? msg.content.toLowerCase() : "";
    const user = await getUser(msg.author.id);

    if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

    // --- 1. APRENDIZAJE Y RESPUESTAS ---
    if (!msg.content.startsWith('!')) {
        // Aprender si no es comando y tiene longitud
        if (!msg.author.bot && msg.content.length > 2 && !msg.content.includes('http')) {
            if (cachedConfig.modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
                await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
                cachedConfig.phrases.push(msg.content);
            }
            
            const mencionado = content.includes("patroclo") || (msg.mentions && msg.mentions.has(client.user.id));
            if (mencionado || Math.random() < 0.20) {
                // --- MODO IA: El Cerebro ---
                if (cachedConfig.modoBot === "ia") {
                    msg.channel.sendTyping();
                    const muestraADN = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 35).join(" | ");
                    const prompt = `Sos Patroclo-B. Tu personalidad es un reflejo de este server. Respondé COHERENTE pero con la jerga y humor de este ADN: "${muestraADN}". Contexto: ${chatHistory.join(" | ")}. Usuario dice: "${msg.content}". Sé corto y natural.`;
                    const r = await respuestaIA(prompt);
                    if (r) return msg.reply(r);
                }
                // --- OTROS MODOS ---
                let banco = cachedConfig.modoBot === "serio" ? cachedConfig.phrasesSerias : cachedConfig.phrases;
                if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
            }
        }
        chatHistory.push(`${msg.author.username}: ${msg.content}`);
        if (chatHistory.length > 8) chatHistory.shift();
        return;
    }

    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // --- 2. COMANDOS SISTEMA ---
    if (cmd === 'modo' && msg.author.id === MI_ID_BOSS) {
        const nModo = args[0]?.toLowerCase();
        if (['normal', 'serio', 'ia'].includes(nModo)) {
            cachedConfig.modoBot = nModo;
            await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: nModo } }, { upsert: true });
            return msg.reply(`🤖 Modo **${nModo.toUpperCase()}** seteado.`);
        }
    }

    if (cmd === 'stats') {
        const totalU = await usersColl.countDocuments();
        return msg.reply(`📊 **ESTADO PATROCLO**\n- ADN: **${cachedConfig.phrases.length}** frases.\n- Usuarios: **${totalU}**\n- Modo: **${cachedConfig.modoBot.toUpperCase()}**`);
    }

    if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
        cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
        await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
        return msg.reply(cachedConfig.mantenimiento ? "🛠️ Mantenimiento Activado." : "🚀 Mantenimiento Desactivado.");
    }

    // --- 3. MÍSTICA & ARTE ---
    if (cmd === 'horoscopo') {
        const signos = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
        const prediccion = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)];
        return msg.reply(`🪐 **${signos[Math.floor(Math.random()*signos.length)]}:** "${prediccion}"`);
    }

    if (cmd === 'imagen' || cmd === 'foto') {
        msg.channel.sendTyping();
        const m = cmd === 'foto' ? "https://api-inference.huggingface.co/models/dreamlike-art/dreamlike-photoreal-2.0" : "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5";
        const img = await generarImagen(args.join(" "), m);
        return img ? msg.channel.send({ files: [{ attachment: img, name: "art.png" }] }) : msg.reply("Motores saturados.");
    }

    if (cmd === 'gif') {
        try {
            const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ') || 'galaxy'}&limit=1`);
            return msg.reply(res.data.data[0]?.url || "No encontré nada.");
        } catch { return msg.reply("Error Giphy."); }
    }

    // --- 4. ECONOMÍA & JUEGOS ---
    if (cmd === 'bal') return msg.reply(`💰 Tenés **${user.points}** PP.`);
    if (cmd === 'daily') {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("No seas mangueador, esperá a mañana.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
        return msg.reply("💵 +500 Patro-Pesos acreditados.");
    }
    if (cmd === 'pay') {
        const target = msg.mentions.users.first();
        const monto = parseInt(args[1]);
        if (!target || !monto || monto <= 0) return msg.reply("Uso: `!pay @user 100`.");
        if (user.points < monto) return msg.reply("No tenés esa guita.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
        await usersColl.updateOne({ userId: target.id }, { $inc: { points: monto } }, { upsert: true });
        return msg.reply(`💸 Transferiste **${monto}** a <@${target.id}>.`);
    }
    if (cmd === 'suerte') return msg.reply(`🪙 Tiraste la moneda: **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**`);

    // --- AYUDA ---
    if (cmd === 'ayudacmd') {
        const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B B04.2').setColor('#7D26CD')
            .addFields(
                { name: '🌌 MÍSTICA & IA', value: '`!horoscopo`, `!modo ia`, `!imagen`, `!foto`, `!gif`, `!suerte`' },
                { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`, `!ranking`' },
                { name: '⚙️ SISTEMA', value: '`!stats`, `!mantenimiento`, `!modo`' }
            ).setImage(IMG_PATROCLO_FUERTE);
        return msg.channel.send({ embeds: [e] });
    }
});

async function getUser(id) {
    if (!usersColl) return { points: 0 };
    let u = await usersColl.findOne({ userId: id });
    if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
    return u;
}

client.login(process.env.TOKEN);