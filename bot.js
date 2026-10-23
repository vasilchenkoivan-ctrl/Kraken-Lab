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
    const startPayload = ctx.message.text.split(' ')[1];
    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.replace('ref_', '');
        if (referrerId !== String(ctx.from.id)) {
            userReferrals[referrerId] = (userReferrals[referrerId] || 0) + 1;
        }
    }

    ctx.reply(
        "🐙 Вітаємо в Kraken Lab!\n\n" +
        "👥 Відгуки: @KRAKENOTZYVVL\n" +
        "💬 Менеджер: @telleportt\n\n" +
        "🛒 Переходьте до магазину за кнопкою нижче — обирайте товар, додавайте у кошик та оформлюйте замовлення в декілька кліків 👇",
        Markup.inlineKeyboard([
            [Markup.button.webApp("🛍 Відкрити магазин", "https://krakenlab.vercel.app")]
        ])
    );
});

app.get('/api/ref/discount/:id', (req, res) => {
    const userId = req.params.id;
    const count = userReferrals[userId] || 0;
    const discount = Math.min(count * 10, 200);
    res.json({ discount, count });
});

app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, costPrice, deliveryType, address, phone } = req.body;
        const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        const isPickup = deliveryType === 'Самовивіз' || (address && address.includes('Самовивіз'));

        let customerMessage = `✅ **Дякуємо за замовлення в KrakenLab!**\n\n` +
            `📦 Ваше замовлення успішно оформлено та передано менеджеру.\n` +
            `🛒 **Товари:**\n${items}\n\n`;

        if (isPickup) {
            customerMessage += `🕐 Очікуйте на підтвердження — менеджер зв’яжеться з вами найближчим часом для уточнення деталей.\n` +
                `⏱️ Оскільки це **самовивіз**, будь ласка, напишіть менеджеру @telleportt для узгодження часу!\n\n`;
        } else {
            customerMessage += `🕐 Очікуйте на підтвердження — менеджер зв’яжеться з вами найближчим часом для уточнення деталей.\n\n`;
        }
        customerMessage += `💚 **Дякуємо, що обираєте KrakenLab!**`;

        if (user && user.id) {
            await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' }).catch(() => {});
        }

        const adminMessage = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}**\n\n` +
            `👤 **Покупець:** ${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})\n` +
            `🆔 **ID:** \`${user?.id || 'невідомо'}\`\n` +
            `📞 **Телефон:** ${phone || 'не вказано'}\n` +
            `🚚 **Спосіб:** ${deliveryType || 'не вказано'}\n` +
            `📍 **Деталі:** ${address || 'не вказано'}\n\n` +
            `📦 **Товари:**\n${items}\n\n` +
            `💰 **Сума:** ${totalPrice} грн\n\n` +
            `📌 **Поточний статус:** В обробці`;

        orderStatuses[orderId] = 'В обробці';

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('⏳ В обробці', `status_${orderId}_processing`),
                Markup.button.callback('✅ Виконано', `status_${orderId}_done`),
                Markup.button.callback('❌ Скасовано', `status_${orderId}_cancel`)
            ]
        ]);

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { 
            parse_mode: 'Markdown',
            ...keyboard 
        });

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

app.get('/api/order/status/:id', (req, res) => {
    const orderId = req.params.id;
    const status = orderStatuses[orderId] || 'В обробці';
    res.json({ orderId, status });
});

bot.action(/status_(.+?)_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const action = ctx.match[2];

    let statusText = 'В обробці';
    if (action === 'done') statusText = 'Виконано';
    if (action === 'cancel') statusText = 'Скасовано';

    orderStatuses[orderId] = statusText;

    await ctx.answerCbQuery(`Статус ${orderId}: ${statusText}`);

    const oldText = ctx.callbackQuery.message.text;
    const baseText = oldText.substring(0, oldText.lastIndexOf('📌'));
    const updatedText = baseText + `📌 **Поточний статус:** ${statusText}`;

    try {
        await ctx.editMessageText(updatedText, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(action === 'processing' ? '⏳ [В обробці]' : '⏳ В обробці', `status_${orderId}_processing`),
                    Markup.button.callback(action === 'done' ? '✅ [Виконано]' : '✅ Виконано', `status_${orderId}_done`),
                    Markup.button.callback(action === 'cancel' ? '❌ [Скасовано]' : '❌ Скасовано', `status_${orderId}_cancel`)
                ]
            ])
        });
    } catch(e) {}
});

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
