const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const BOT_TOKEN = '8523927755:AAEyK603j5vEaoSzGgHREpVVAJa4a_uEx-o';
const ADMIN_CHAT_ID = '1005867951';

const bot = new Telegraf(BOT_TOKEN);

const orderStatuses = {};
const userReferrals = {};

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
        const { user, items, totalPrice, deliveryType, address, phone } = req.body;
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

        return res.status(200).json({ ok: true, orderId: orderId });
    } catch (error) {
        console.error("Помилка:", error);
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

bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot успешно запущен!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
