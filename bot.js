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

// Хранилище статусов заказов в памяти сервера
const orderStatuses = {};

// Обработка /start с поддержкой рефералок
bot.start((ctx) => {
    const startPayload = ctx.message.text.split(' ')[1];
    let welcomeExtra = '';

    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.replace('ref_', '');
        welcomeExtra = `\n\n🎉 Ви перейшли за реферальним посиланням!`;
    }

    ctx.reply(
        "Вітаємо в 🐙 Kraken Lab!\n\n" +
        "🛍 Відгуки клієнтів: @KRAKENOTZYVVL\n" +
        "👩‍💻 Зв'язок з менеджером: @telleportt" + welcomeExtra + "\n\n" +
        "👇 Натискайте на кнопку нижче — це наш магазин:",
        Markup.inlineKeyboard([
            [Markup.button.webApp("🛍 Відкрити магазин", "https://krakenlab.vercel.app")]
        ])
    );
});

// Эндпоинт приема заказов
app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, deliveryType, address, phone } = req.body;
        const orderId = 'ORD-' + Date.now().toString().slice(-6);

        const isPickup = deliveryType === 'Самовивіз' || (address && address.includes('Самовивіз'));

        // Сообщение покупателю
        let customerMessage = `✅ **Дякуємо за замовлення #${orderId}!**\n\n`;
        if (isPickup) {
            customerMessage += `⏱️ **Оскільки це самовивіз**, напишіть менеджеру @telleportt для узгодження часу!\n`;
        } else {
            customerMessage += `🚚 Менеджер Kraken Lab 🐙 зв'яжеться з вами найближчим часом для підтвердження доставки.\n`;
        }
        customerMessage += `\n📍 **Менеджер:** @telleportt`;

        if (user && user.id) {
            await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' });
        }

        // Сообщение администратору с кнопками статусов
        const adminMessage = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}!**\n\n` +
            `👤 **Покупець:** ${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})\n` +
            `🆔 **ID:** \`${user?.id || 'невідомо'}\`\n` +
            `📞 **Телефон:** ${phone || 'не вказано'}\n` +
            `🚚 **Спосіб:** ${deliveryType || 'не вказано'}\n` +
            `📍 **Деталі:** ${address || 'не вказано'}\n\n` +
            `📦 **Товари:**\n${items || 'Не вказано'}\n\n` +
            `💰 **Сума:** ${totalPrice} грн`;

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
        console.error("Ошибка при отправке заказа:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Получение статуса заказа для сайта
app.get('/api/order/status/:id', (req, res) => {
    const orderId = req.params.id;
    const status = orderStatuses[orderId] || 'В обробці';
    res.json({ orderId, status });
});

// Обработчик нажатия кнопок админом в Telegram
bot.action(/status_(.+?)_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const action = ctx.match[2];

    let statusText = 'В обробці';
    if (action === 'done') statusText = 'Виконано';
    if (action === 'cancel') statusText = 'Скасовано';

    orderStatuses[orderId] = statusText;

    await ctx.answerCbQuery(`Статус заказа ${orderId} изменен на: ${statusText}`);
    await ctx.editMessageText(
        ctx.callbackQuery.message.text + `\n\n📌 **Поточний статус:** ${statusText}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(action === 'processing' ? '⏳ [В обробці]' : '⏳ В обробці', `status_${orderId}_processing`),
                    Markup.button.callback(action === 'done' ? '✅ [Виконано]' : '✅ Виконано', `status_${orderId}_done`),
                    Markup.button.callback(action === 'cancel' ? '❌ [Скасовано]' : '❌ Скасовано', `status_${orderId}_cancel`)
                ]
            ])
        }
    );
});

bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot успешно запущен!");
}).catch(err => {
    console.error("Ошибка запуска бота:", err);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
