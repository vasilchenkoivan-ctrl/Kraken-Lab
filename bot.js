const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// Разрешаем CORS запросы от фронтенда Vercel
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Берем токен и Admin ID из переменных окружения Render
const BOT_TOKEN = process.env.BOT_TOKEN; '8523927755:AAEyK603j5vEaoSzGgHREpVVAJa4a_uEx-o';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);

// 1. Обработка команды /start
bot.start((ctx) => {
    ctx.reply(
        "Вітаємо в 🐙 Kraken Lab!\n\n" +
        "🛍 Відгуки клієнтів: @KRAKENOTZYVVL\n" +
        "👩‍💻 Зв'язок з менеджером: @telleportt\n\n" +
        "👇 Натискайте на кнопку нижче — це наш магазин:",
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛍 Відкрити магазин", web_app: { url: "https://krakenlab.vercel.app" } }]
                ]
            }
        }
    );
});

// 2. Прием заказов с сайта (Vercel) по HTTPS
app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, deliveryType, address, phone } = req.body;

        const customerMessage = 
            `✅ **Дякуємо за замовлення!**\n\n` +
            `Ваше замовлення успішно прийнято в обробку.\n` +
            `📍 **Зв'язок з менеджером:** @telleportt\n` +
            `*(Напишіть менеджеру для узгодження часу та деталей)*`;

        // Отправляем уведомление клиенту
        if (user && user.id) {
            await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' });
        }

        const adminMessage = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ Kraken Lab!**\n\n` +
            `👤 **Покупець:** ${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})\n` +
            `🆔 **ID:** \`${user?.id || 'невідомо'}\`\n` +
            `📞 **Телефон:** ${phone || 'не вказано'}\n` +
            `🚚 **Спосіб доставки:** ${deliveryType || 'не вказано'}\n` +
            `📍 **Адреса/Деталі:** ${address || 'не вказано'}\n\n` +
            `📦 **Товари:**\n${items}\n\n` +
            `💰 **Сума:** ${totalPrice} грн`;

        // Отправляем уведомление тебе (администратору)
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Ошибка при отправке заказа:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Запуск Telegram бота
bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot успешно запущен!");
}).catch(err => {
    console.error("Ошибка запуска бота:", err);
});

// Запуск веб-сервера
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
