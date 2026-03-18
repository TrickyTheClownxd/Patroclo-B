import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

// Servidor para mantener el bot vivo
http.createServer((req, res) => {
    res.write("Patroclo-B B04.0 ONLINE - Motor IA & Doble Arte");
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
    universeFacts: ["Nogoyá es el eje del bardo.", "El Patroclo original vigila desde las sombras."],
    phrasesSerias: [
        "La disciplina es el puente entre las metas y los logros.",
        "El respeto es la base de cualquier imperio.",
        "En el silencio se encuentra la verdadera fuerza."
    ],
    lastChannelId: null,
    mantenimiento: false,
    modoBot: "normal" // Modos: normal, serio, ia
};

if (!client.retos) client.retos = new Map();

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

const ITEMS_TIENDA = [
    { id: 1, nombre: "Rango Facha", precio: 5000, desc: "Aparece en tu perfil." },
    { id: 2, nombre: "Escudo Galactico", precio: 2500, desc: "Protección bardo." },
    { id: 3, nombre: "VIP Pass", precio: 10000, desc: "Mística premium." }
];

// --- MOTORES IA Y ARTE ---
async function respuestaIA(contexto) {
    try {
        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
            { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 10000 }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) { return null; }
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

// --- DB CONEXIÓN ---
async function connectDb() {
    try {
        await mongoClient.connect();
        const database = mongoClient.db('patroclo_bot');
        usersColl = database.collection('users');
        dataColl = database.collection('bot_data');
        const dbData = await dataColl.findOne({ id: "main_config" });
        if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
        console.log("✅ Sistema Total Conectado (B04.0)");
    } catch (e) { console.log("❌ Error DB:", e); }
}
connectDb();

client.on('messageCreate', async (msg) => {
    if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
    const content = msg.content ? msg.content.toLowerCase() : "";
    const user = await getUser(msg.author.id);

    if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

    // --- APRENDIZAJE Y RESPUESTA AUTOMÁTICA ---
    if (!msg.content.startsWith('!')) {
        if (!msg.author.bot && msg.content.length > 3 && !msg.content.includes('http')) {
            if (cachedConfig.modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
                await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
                cachedConfig.phrases.push(msg.content);
            }
            
            const mencionado = content.includes("patroclo") || (msg.mentions && msg.mentions.has(client.user.id));
            if (mencionado || Math.random() < 0.22) {
                // MODO IA (Usa las 20k palabras para construir personalidad)
                if (cachedConfig.modoBot === "ia") {
                    msg.channel.sendTyping();
                    const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 30).join(" | ");
                    const prompt = `Sos Patroclo-B de Nogoyá. Tu ADN es: "${muestra}". Responde corto y facha a: "${msg.content}"`;
                    const r = await respuestaIA(prompt);
                    if (r) return msg.reply(r);
                }
                // MODOS NORMAL / SERIO
                let banco = cachedConfig.modoBot === "serio" ? cachedConfig.phrasesSerias : cachedConfig.phrases;
                if (banco?.length > 0) return msg.channel.send(banco[Math.floor(Math.random() * banco.length)]);
            }
        }
        return;
    }

    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // --- COMANDOS SISTEMA ---
    if (cmd === 'modo' && msg.author.id === MI_ID_BOSS) {
        const nuevoModo = args[0]; // normal, serio, ia
        if (["normal", "serio", "ia"].includes(nuevoModo)) {
            cachedConfig.modoBot = nuevoModo;
            await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: nuevoModo } }, { upsert: true });
            return msg.reply(`⚙️ MODO **${nuevoModo.toUpperCase()}** ACTIVADO.`);
        }
    }

    if (cmd === 'mantenimiento' && msg.author.id === MI_ID_BOSS) {
        cachedConfig.mantenimiento = !cachedConfig.mantenimiento;
        await dataColl.updateOne({ id: "main_config" }, { $set: { mantenimiento: cachedConfig.mantenimiento } }, { upsert: true });
        return msg.reply(cachedConfig.mantenimiento ? "🛠️ MANTENIMIENTO ON." : "🚀 MANTENIMIENTO OFF.");
    }

    // --- COMANDOS ARTE (NUEVOS) ---
    if (cmd === 'imagen') {
        msg.channel.sendTyping();
        const img = await generarImagen(args.join(" "), "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5");
        return img ? msg.channel.send({ files: [{ attachment: img, name: "art1.png" }] }) : msg.reply("Saturado. Probá `!imagen2`.");
    }

    if (cmd === 'imagen2' || cmd === 'foto') {
        msg.channel.sendTyping();
        const img = await generarImagen(args.join(" "), "https://api-inference.huggingface.co/models/dreamlike-art/dreamlike-photoreal-2.0");
        return img ? msg.channel.send({ files: [{ attachment: img, name: "art2.png" }] }) : msg.reply("Motor 2 saturado.");
    }

    if (cmd === 'gif') {
        try {
            const res = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${args.join(' ') || 'galaxy'}&limit=1`);
            return msg.reply(res.data.data[0]?.url || "No hay gifs.");
        } catch { return msg.reply("Error Giphy."); }
    }

    // --- ECONOMÍA Y JUEGOS (BASE) ---
    if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** PP.`);
    if (cmd === 'daily') {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("En 24hs volvé.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
        return msg.reply("💵 +500 Patro-Pesos.");
    }
    if (cmd === 'pay' || cmd === 'transferencia') {
        const mencion = msg.mentions.users.first();
        const monto = parseInt(args[1]) || parseInt(args[0]);
        if (!mencion || !monto || monto <= 0) return msg.reply("Uso: !pay @user 100.");
        if (user.points < monto) return msg.reply("No tenés un peso.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: -monto } });
        await usersColl.updateOne({ userId: mencion.id }, { $inc: { points: monto } }, { upsert: true });
        return msg.reply(`💸 Enviaste **${monto}** a <@${mencion.id}>.`);
    }

    // --- MÍSTICA (RECUPERADOS) ---
    if (cmd === 'nekoask') return msg.reply(`🐱 Nekoask dice: ${args.join(' ') || '¿Qué?'}`);
    if (cmd === 'bola8') return msg.reply(`🎱 | ${["Sí.", "No.", "Probablemente.", "Ni lo sueñes."][Math.floor(Math.random()*4)]}`);
    if (cmd === 'bardo') return msg.reply(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)] || "Tranqui.");
    if (cmd === 'suerte') return msg.reply(`🪙 **${Math.random() < 0.5 ? "CARA" : "CRUZ"}**`);
    if (cmd === 'perfiladn') {
        msg.channel.sendTyping();
        const muestra = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 40).join(" | ");
        const r = await respuestaIA(`Analizá el ADN del server y definí la personalidad de Patroclo hoy: ${muestra}`);
        return msg.reply(r || "ADN confuso.");
    }

    // --- AYUDA ---
    if (cmd === 'ayudacmd') {
        const e = new EmbedBuilder().setTitle('📜 BIBLIA PATROCLO-B B04.0').setColor('#7D26CD')
            .addFields(
                { name: '🎨 ARTE/GIFS', value: '`!imagen`, `!imagen2`, `!gif`, `!foto`' },
                { name: '🎮 JUEGOS', value: '`!poker`, `!ruleta`, `!suerte`, `!aceptar`' },
                { name: '💰 ECONOMÍA', value: '`!bal`, `!daily`, `!pay`, `!tienda`' },
                { name: '🌌 MÍSTICA', value: '`!nekoask`, `!bola8`, `!bardo`, `!perfiladn`' },
                { name: '⚙️ SISTEMA', value: '`!modo ia/normal/serio`, `!stats`, `!mantenimiento`' }
            ).setImage(IMG_PATROCLO_FUERTE);
        return msg.channel.send({ embeds: [e] });
    }
});

async function getUser(id) {
    if (!usersColl) return { points: 0 };
    let u = await usersColl.findOne({ userId: id });
    if (!u) { u = { userId: id, points: 500, lastDaily: 0, inventario: [] }; await usersColl.insertOne(u); }
    return u;
}

client.login(process.env.TOKEN);