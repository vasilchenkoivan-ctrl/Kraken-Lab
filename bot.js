const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());
// Разрешаем запросы из твоего мини-приложения (CORS)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAFrRQKOkmipfgFs6lx6F7WHiNeZAyRd-T4';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
    ctx.reply(
        "Вітаємо в 🐙KrakenLab🧪\n" +
        "🛍️ Відгуки клієнтів: @KRAKENOTZYVY\n" +
        "👨‍💻 Зв’язок з менеджером: @telleportt\n\n" +
        "👇🏻 Натискайте на кнопку нижче — це наш офіційний магазин у Telegram.",
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛍 Відкрити магазин", web_app: { url: "https://krakenlab.vercel.app/" } }]
                ]
            }
        }
    );
});

// API-эндпоинт, куда сайт отправляет заказ
app.post('/api/order', async (req, res) => {
    try {
        const { name, phone, deliveryType, city, department, cart, total, userId } = req.body;

        let itemsList = '';
        cart.forEach((item, idx) => {
            itemsList += `${idx + 1}. ${item.title}${item.flavor ? ` (${item.flavor})` : ''} — ${item.count} шт. х ${item.price} ₴\n`;
        });

        // Текст для тебя (админа)
        let adminText = `🛒 **НОВЕ ЗАМОВЛЕННЯ ІЗ САЙТУ**\n\n` +
            `👤 **Клієнт:** ${name}\n` +
            `📞 **Телефон:** ${phone}\n` +
            `🚚 **Доставка:** ${deliveryType === 'Pickup' ? 'Самовивіз (Київ)' : 'Нова Пошта'}\n`;
        
        if (deliveryType === 'NovaPoshta') {
            adminText += `📍 **Місто:** ${city}\n` + `📦 **Відділення:** ${department}\n`;
        }
        adminText += `\n📋 **Товари:**\n${itemsList}\n` + `💰 **Загальна сума:** ${total} ₴`;

        // Отправляем тебе
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminText, { parse_mode: 'Markdown' });

        // Если у нас есть ID клиента, отправляем подтверждение ему в личку боту
        if (userId) {
            const clientText = `✅ **Дякуємо, ${name}! Ваше замовлення успішно прийнято.**\n\n` +
                `Менеджер Kraken Lab 🐙 зв'яжеться з вами найближчим часом для підтвердження.`;
            await bot.telegram.sendMessage(userId, clientText, { parse_mode: 'Markdown' }).catch(() => {});
        }

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Помилка сервера при заказе:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        await bot.launch();
        console.log('Bot successfully started!');
    } catch (err) {
        console.error('Помилка запуску бота:', err);
    }
});
