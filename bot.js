const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAFrRQKOkmipfgFs6lx6F7WHiNeZAyRd-T4';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);

// Твоя рабочая публичная ссылка на Vercel
const MINI_APP_URL = "https://krakenlab.vercel.app/";

// Обработка команды /start
bot.start((ctx) => {
    ctx.reply(
        "Вітаємо в 🐙KrakenLab🧪\n" +
        "🛍️ Відгуки клієнтів: @KRAKENOTZYVY\n" +
        "👨‍💻 Зв’язок з менеджером: @telleportt\n\n" +
        "👇🏻 Натискайте на кнопку нижче — це наш офіційний магазин у Telegram.\n" +
        "Тут ви можете швидко та зручно оформити замовлення та обрати улюблені смаки",
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛍 Відкрити магазин", web_app: { url: MINI_APP_URL } }]
                ]
            }
        }
    );
});

// Обработка заказа из Mini App (без ошибки .text())
bot.on('web_app_data', async (ctx) => {
    try {
        const orderData = ctx.webAppData.data;
        const clientName = ctx.from.first_name || 'Клієнт';

        // Ответ клиенту в чат
        await ctx.reply(
            `✅ **Дякуємо, ${clientName}! Ваше замовлення успішно прийнято.**\n\n` +
            `Менеджер Kraken Lab 🐙 зв'яжеться з вами найближчим часом для підтвердження.`,
            { parse_mode: 'Markdown' }
        );

        // Уведомление тебе (админу)
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            `📥 **НОВЕ ЗАМОВЛЕННЯ ІЗ САЙТУ!**\n\n` +
            `👤 **Користувач:** @${ctx.from.username || 'без_юзернейма'} (ID: ${ctx.from.id})\n\n` +
            `${orderData}`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Помилка обробки замовлення:', e);
    }
});

app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.launch();
        console.log('Bot successfully started!');
    } catch (err) {
        console.error('Помилка запуску бота:', err);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
