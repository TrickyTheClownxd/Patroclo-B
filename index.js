import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor para Keep-Alive
http.createServer((req, res) => {
    res.write("Patroclo-B B04.7 ONLINE - AI Brain Active");
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
    modoBot: "ia" // Arranca en IA por defecto para probar el cerebro
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';
const IMG_PATROCLO_FUERTE = 'https://i.ibb.co/XfXkXzV/patroclo-fuerte.jpg';

let chatHistory = [];

// --- MOTOR IA (GEMINI) ---
async function respuestaIA(contexto) {
    try {
        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
            { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 12000 }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        console.log("❌ Error Gemini:", e.response?.data?.error?.message || e.message);
        return null;
    }
}

// --- MOTOR IMAGEN ---
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
        const database = mongoClient.db('patroclo_bot');
        usersColl = database.collection('users');
        dataColl = database.collection('bot_data');
        const dbData = await dataColl.findOne({ id: "main_config" });
        if (dbData) { cachedConfig = { ...cachedConfig, ...dbData }; }
        console.log(`✅ B04.7 Ready. ADN: ${cachedConfig.phrases.length} entradas.`);
    } catch (e) { console.log("❌ Error DB"); }
}
connectDb();

client.on('messageCreate', async (msg) => {
    if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
    const content = msg.content ? msg.content.toLowerCase() : "";
    const user = await getUser(msg.author.id);

    if (cachedConfig.mantenimiento && msg.author.id !== MI_ID_BOSS) return;

    // --- 1. APRENDIZAJE Y RESPUESTA AUTOMÁTICA ---
    if (!msg.content.startsWith('!')) {
        if (!msg.author.bot && msg.content.length > 2 && !msg.content.includes('http')) {
            if (cachedConfig.modoBot !== "serio" && !cachedConfig.phrases.includes(msg.content)) {
                await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
                cachedConfig.phrases.push(msg.content);
            }
            
            const mencionado = content.includes("patroclo") || (msg.mentions && msg.mentions.has(client.user.id));
            if (mencionado || Math.random() < 0.18) {
                if (cachedConfig.modoBot === "ia") {
                    msg.channel.sendTyping();
                    const muestraADN = cachedConfig.phrases.sort(() => 0.5 - Math.random()).slice(0, 40).join(" | ");
                    
                    const promptIA = `
                    Sos Patroclo-B. Tu cerebro es avanzado y coherente como GPT, pero tu personalidad, humor y forma de reírte salen de este ADN: "${muestraADN}".
                    REGLA: Respondé con SENTIDO a lo que te dicen, pero usando la jerga, los insultos y los chistes del ADN.
                    Contexto de charla: ${chatHistory.join(" | ")}
                    Usuario dice: "${msg.content}"
                    `;
                    
                    const r = await respuestaIA(promptIA);
                    if (r) return msg.reply(r);
                }
                
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

    // --- 2. COMANDOS DE SISTEMA ---
    if (cmd === 'modo' && msg.author.id === MI_ID_BOSS) {
        if (['normal', 'serio', 'ia'].includes(args[0])) {
            cachedConfig.modoBot = args[0];
            await dataColl.updateOne({ id: "main_config" }, { $set: { modoBot: args[0] } }, { upsert: true });
            return msg.reply(`🤖 Modo **${args[0].toUpperCase()}** activado.`);
        }
    }

    if (cmd === 'stats') {
        const totalU = await usersColl.countDocuments();
        let promedioPalabras = 0;
        if (cachedConfig.phrases.length > 0) {
            const totalPalabras = cachedConfig.phrases.reduce((acc, f) => acc + f.split(/\s+/).length, 0);
            promedioPalabras = (totalPalabras / cachedConfig.phrases.length).toFixed(2);
        }

        const eStats = new EmbedBuilder()
            .setTitle("📊 PATRO-SISTEMA B04.7")
            .setColor("#00ffcc")
            .addFields(
                { name: '🧠 Memoria ADN', value: `${cachedConfig.phrases.length} frases.`, inline: true },
                { name: '📈 Promedio Palabras', value: `${promedioPalabras}`, inline: true },
                { name: '🤖 Modo', value: cachedConfig.modoBot.toUpperCase(), inline: true },
                { name: '👥 Usuarios', value: `${totalU}`, inline: true },
                { name: '📝 Último aprendizaje', value: `*"${cachedConfig.phrases[cachedConfig.phrases.length-1] || 'Nada'}"*` }
            );
        return msg.channel.send({ embeds: [eStats] });
    }

    if (cmd === 'ranking' || cmd === 'top') {
        const top = await usersColl.find().sort({ points: -1 }).limit(10).toArray();
        const e = new EmbedBuilder().setTitle("🏆 TOP MILLONARIOS").setColor("#FFD700")
            .setDescription(top.map((u, i) => `**${i+1}.** <@${u.userId}> — ${u.points} PP`).join("\n"));
        return msg.channel.send({ embeds: [e] });
    }

    // --- 3. MÍSTICA & ECONOMÍA ---
    if (cmd === 'horoscopo') {
        const signos = ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
        const pred = cachedConfig.phrases[Math.floor(Math.random() * cachedConfig.phrases.length)] || "Ni idea.";
        return msg.reply(`🪐 **${signos[Math.floor(Math.random()*signos.length)]}:** "${pred}"`);
    }

    if (cmd === 'imagen' || cmd === 'foto') {
        msg.channel.sendTyping();
        const m = cmd === 'foto' ? "https://api-inference.huggingface.co/models/dreamlike-art/dreamlike-photoreal-2.0" : "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5";
        const img = await generarImagen(args.join(" "), m);
        return img ? msg.channel.send({ files: [{ attachment: img, name: "art.png" }] }) : msg.reply("Motores saturados.");
    }

    if (cmd === 'bal') return msg.reply(`💰 Tenés **${user.points}** PP.`);
    if (cmd === 'daily') {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
        return msg.reply("💵 +500 PP.");
    }
});

async function getUser(id) {
    if (!usersColl) return { points: 0 };
    let u = await usersColl.findOne({ userId: id });
    if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
    return u;
}

client.login(process.env.TOKEN);