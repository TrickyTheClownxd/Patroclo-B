import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { MongoClient } from 'mongodb';
import http from 'http';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Servidor Keep-Alive
http.createServer((req, res) => { res.write("Patroclo-B B07.0 HYDRA ONLINE"); res.end(); }).listen(process.env.PORT || 8080);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel]
});

client.retos = new Map();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let usersColl, dataColl, userMemoryColl;

let cachedConfig = {
    phrases: [],
    universeFacts: [],
    phrasesSerias: ["La disciplina es libertad.", "Respeto ante todo."],
    mantenimiento: false,
    modoBot: "ia",
    lastChannelId: null
};

const MI_ID_BOSS = '986680845031059526';
const ID_PATROCLO_ORIGINAL = '974297735559806986';

// --- MOTORES ---
async function respuestaIA(contexto) {
    try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API}`,
            { contents: [{ parts: [{ text: contexto }] }] }, { timeout: 10000 });
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch { return null; }
}

// --- DB CONNECTION ---
async function connectDb() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db('patroclo_bot');
        usersColl = db.collection('users');
        dataColl = db.collection('bot_data');
        userMemoryColl = db.collection('user_memory');
        const dbData = await dataColl.findOne({ id: "main_config" });
        if (dbData) cachedConfig = { ...cachedConfig, ...dbData };
        console.log("✅ B07.0 HYDRA - Sistemas Listos");
    } catch (e) { console.log("❌ Error DB"); }
}
connectDb();

// --- LÓGICA DE JUEGOS AUXILIAR ---
const generarCarta = () => {
    const p = ['♠️', '♥️', '♦️', '♣️'];
    const v = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return `${v[Math.floor(Math.random()*v.length)]}${p[Math.floor(Math.random()*p.length)]}`;
};

client.on('messageCreate', async (msg) => {
    if (!msg.author || (msg.author.bot && msg.author.id !== ID_PATROCLO_ORIGINAL)) return;
    const user = await getUser(msg.author.id);
    const content = msg.content.toLowerCase();

    // Aprendizaje y canal
    if (!msg.author.bot) {
        if (msg.content.length > 3 && !msg.content.startsWith('!')) {
            if (!cachedConfig.phrases.includes(msg.content)) {
                cachedConfig.phrases.push(msg.content);
                await dataColl.updateOne({ id: "main_config" }, { $push: { phrases: msg.content } }, { upsert: true });
            }
        }
        if (msg.channel.id !== cachedConfig.lastChannelId) {
            cachedConfig.lastChannelId = msg.channel.id;
            await dataColl.updateOne({ id: "main_config" }, { $set: { lastChannelId: msg.channel.id } }, { upsert: true });
        }
    }

    if (!msg.content.startsWith('!')) {
        const mencionado = content.includes("patroclo") || msg.mentions?.has(client.user.id);
        if (mencionado || Math.random() < 0.15) {
            if (cachedConfig.modoBot === "ia") {
                msg.channel.sendTyping();
                const adn = cachedConfig.phrases.slice(-40).join(" | ");
                const r = await respuestaIA(`Actúa como Patroclo-B, bot de Discord argentino y facha. ADN: ${adn}. Responde a ${msg.author.username}: ${msg.content}`);
                if (r) return msg.reply(r);
            }
            return msg.channel.send(cachedConfig.phrases[Math.floor(Math.random()*cachedConfig.phrases.length)]);
        }
        return;
    }

    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // --- JUEGO: PÓKER REALISTA ---
    if (cmd === 'poker') {
        const menc = msg.mentions.users.first();
        const monto = parseInt(args[1]) || 500;
        if (!menc || menc.id === msg.author.id) return msg.reply("¿Contra quién vas a jugar, bobi?");
        if (user.points < monto) return msg.reply("No tenés ni para la entrada.");

        client.retos.set(menc.id, {
            tipo: 'poker', retador: msg.author.id, monto,
            manos: { [msg.author.id]: [generarCarta(), generarCarta()], [menc.id]: [generarCarta(), generarCarta()] },
            mesa: [generarCarta(), generarCarta(), generarCarta()]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('poker_ver').setLabel('Ver Cartas 🎴').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('poker_aceptar').setLabel('Aceptar Apuesta ✅').setStyle(ButtonStyle.Success)
        );

        return msg.channel.send({
            content: `🃏 **DUELO DE PÓKER**\n<@${msg.author.id}> vs <@${menc.id}>\nPozo: **${monto * 2} PP**`,
            components: [row]
        });
    }

    // --- JUEGO: PENAL REALISTA ---
    if (cmd === 'penal') {
        const menc = msg.mentions.users.first();
        const monto = parseInt(args[1]) || 500;
        if (!menc) return msg.reply("Mencioná a alguien para patear.");
        
        client.retos.set(menc.id, { tipo: 'penal', retador: msg.author.id, monto, stage: 'pateando' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('penal_izq').setLabel('Izquierda 🥅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('penal_cen').setLabel('Centro ⚽').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('penal_der').setLabel('Derecha 🥅').setStyle(ButtonStyle.Secondary)
        );

        return msg.channel.send({
            content: `⚽ **PENALES**\n<@${msg.author.id}> se acomoda para patear contra <@${menc.id}> por **${monto} PP**.`,
            components: [row]
        });
    }

    // --- STATS (SEGÚN CAPTURA) ---
    if (cmd === 'stats') {
        const tU = await usersColl.countDocuments();
        const tP = cachedConfig.phrases.length;
        const e = new EmbedBuilder()
            .setTitle("📊 PATRO-SISTEMA B07.0")
            .setColor("#00ffcc")
            .addFields(
                { name: '🧠 Memoria ADN', value: `${tP} frases.`, inline: true },
                { name: '🤖 Modo', value: cachedConfig.modoBot.toUpperCase(), inline: true },
                { name: '👥 Usuarios', value: `${tU}`, inline: true },
                { name: '📝 Último aprendizaje', value: `*"${cachedConfig.phrases[tP-1] || 'Nada'}"*` }
            ).setFooter({ text: 'Patroclo-B HYDRA Active' });
        return msg.channel.send({ embeds: [e] });
    }

    if (cmd === 'bal') return msg.reply(`💰 Saldo: **${user.points}** PP.`);
    if (cmd === 'daily') {
        if (Date.now() - (user.lastDaily || 0) < 86400000) return msg.reply("Mañana.");
        await usersColl.updateOne({ userId: msg.author.id }, { $inc: { points: 500 }, $set: { lastDaily: Date.now() } });
        return msg.reply("💵 +500 PP.");
    }
});

// --- MANEJO DE INTERACCIONES (BOTONES) ---
client.on('interactionCreate', async (int) => {
    if (!int.isButton()) return;
    const reto = client.retos.get(int.user.id) || Array.from(client.retos.values()).find(r => r.retador === int.user.id);
    if (!reto) return int.reply({ content: "El bardo ya expiró.", ephemeral: true });

    // Lógica Póker
    if (int.customId === 'poker_ver') {
        const mano = reto.manos[int.user.id];
        if (!mano) return int.reply({ content: "No jugás vos.", ephemeral: true });
        return int.reply({ content: `🃏 Tus cartas: **${mano.join(" | ")}**`, ephemeral: true });
    }

    if (int.customId === 'poker_aceptar' && int.user.id === Array.from(client.retos.keys())[0]) {
        const ganaRetador = Math.random() > 0.5;
        const win = ganaRetador ? reto.retador : int.user.id;
        const lose = ganaRetador ? int.user.id : reto.retador;
        await usersColl.updateOne({ userId: win }, { $inc: { points: reto.monto } });
        await usersColl.updateOne({ userId: lose }, { $inc: { points: -reto.monto } });
        
        const res = new EmbedBuilder().setTitle("🎰 RESULTADO CASINO")
            .addFields(
                { name: 'Mesa', value: reto.mesa.join(" ") },
                { name: 'Ganador', value: `<@${win}> se lleva los **${reto.monto*2} PP**.` }
            ).setColor("#FFD700");
        client.retos.delete(int.user.id);
        return int.update({ embeds: [res], components: [], content: "Duelo finalizado." });
    }

    // Lógica Penal
    if (int.customId.startsWith('penal_')) {
        if (reto.stage === 'pateando' && int.user.id === reto.retador) {
            reto.dirPateo = int.customId;
            reto.stage = 'atajando';
            return int.update({ content: `🥅 <@${reto.retador}> ya pateó. ¡Le toca atajar a <@${int.message.mentions.users.first().id}>!` });
        }
        if (reto.stage === 'atajando' && int.user.id !== reto.retador) {
            const atajo = int.customId === reto.dirPateo;
            const win = atajo ? int.user.id : reto.retador;
            const lose = atajo ? reto.retador : int.user.id;
            await usersColl.updateOne({ userId: win }, { $inc: { points: reto.monto } });
            await usersColl.updateOne({ userId: lose }, { $inc: { points: -reto.monto } });
            client.retos.delete(int.user.id);
            return int.update({ content: atajo ? `🧤 ¡ATAJÓ EL ARQUERO! <@${win}> gana.` : `⚽ ¡GOOOL! <@${win}> la mandó a guardar.`, components: [] });
        }
    }
});

async function getUser(id) {
    if (!usersColl) return { points: 0 };
    let u = await usersColl.findOne({ userId: id });
    if (!u) { u = { userId: id, points: 500, lastDaily: 0 }; await usersColl.insertOne(u); }
    return u;
}

client.login(process.env.TOKEN);