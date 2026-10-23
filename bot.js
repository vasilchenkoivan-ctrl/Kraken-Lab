const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const https = require('https');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAEyK603j5vEaoSzGgHREpVVAJa4a_uEx-o';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);
const orderStatuses = {};
const userReferrals = {};

function sendToGoogleSheet(orderData) {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) return;

    try {
        const postData = JSON.stringify(orderData);
        const req = https.request(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                https.get(res.headers.location, () => {});
            }
        });
        req.on('error', () => {});
        req.write(postData);
        req.end();
    } catch (err) {}
}

bot.start((ctx) => {
    ctx.reply(
        "🐙 Вітаємо в Kraken Lab!\n\n" +
        "👥 Відгуки: @KRAKENOTZYVVL\n" +
        "💬 Менеджер: @telleportt\n\n" +
        "🛒 Переходьте до магазину за кнопкою нижче 👇",
        Markup.inlineKeyboard([
            [Markup.button.webApp("🛍 Відкрити магазин", "https://krakenlab.vercel.app")]
        ])
    );
});

app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, costPrice, deliveryType, address, phone } = req.body;
        const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        let customerMessage = `✅ **Дякуємо за замовлення в KrakenLab!**\n\n📦 Замовлення #${orderId} прийнято в обробку.`;
        if (user && user.id) {
            await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' }).catch(() => {});
        }

        const adminMessage = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}**\n\n` +
            `👤 **Покупець:** ${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})\n` +
            `📞 **Телефон:** ${phone || 'не вказано'}\n` +
            `📦 **Товари:**\n${items}\n\n` +
            `💰 **Сума:** ${totalPrice} грн`;

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });

        sendToGoogleSheet({
            order_id: orderId,
            customer_name: `${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})`,
            phone: phone || 'не вказано',
            items: items,
            total_price: totalPrice,
            cost_price: costPrice || 0
        });

        return res.status(200).json({ ok: true, orderId: orderId });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Обязательный эндпоинт, чтобы Render видел, что сервер живой
app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    bot.launch().then(() => {
        console.log("Bot started successfully!");
    });
});
