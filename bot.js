const express = require('express');
const { Telegraf } = require('telegraf');

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

app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, deliveryType, address, phone } = req.body;

        const customerMessage = 
            `✅ **Дякуємо за замовлення!**\n\n` +
            `Ваше замовлення успішно прийнято в обробку.\n` +
            `📍 **Зв'язок з менеджером:** @telleportt\n` +
            `*(Напишіть менеджеру для узгодження часу та деталей)*`;

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
            `📦 **Товари:**\n${items || 'Не вказано'}\n\n` +
            `💰 **Сума:** ${totalPrice || '0'} грн`;

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Ошибка при отправке заказа:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot успешно запущен!");
}).catch(err => {
    console.error("Ошибка запуска бота:", err);
});

const PORT = process.env.PORT || 10000
