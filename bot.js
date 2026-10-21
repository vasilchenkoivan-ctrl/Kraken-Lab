const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// 1. Токен твого бота
const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAFrRQKOkmipfgFs6lx6F7WHiNeZAyRd-T4';

// 2. ID куди слати замовлення (якщо це група, має бути з мінусом, наприклад '-100xxxxxx')
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);

// Обробка даних, які приходять з Mini App при натисканні "Оформити замовлення"
bot.on('web_app_data', async (ctx) => {
    try {
        const orderData = ctx.webAppData.data.text(); // Текст замовлення з Mini App
        const clientName = ctx.from.first_name || 'Клієнт';

        // 📩 1. ВІДПРАВЛЯЄМО КЛІЄНТУ у чат з ботом
        await ctx.reply(
            `✅ **Дякуємо, ${clientName}! Ваше замовлення успішно прийнято.**\n\n` +
            `Менеджер Kraken Lab 🐙 зв'яжеться з вами найближчим часом для підтвердження.`,
            { parse_mode: 'Markdown' }
        );

        // 📩 2. ВІДПРАВЛЯЄМО ТОБІ (АДМІНУ)
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            `📥 **НОВЕ ЗАМОВЛЕННЯ ІЗ САЙТУ!**\n\n` +
            `👤 **Користувач Telegram:** @${ctx.from.username || 'без_юзернейма'} (ID: ${ctx.from.id})\n\n` +
            `${orderData}`,
            { parse_mode: 'Markdown' }
        );

    } catch (e) {
        console.error('Помилка при обробці замовлення:', e);
    }
});

// Ендпоінт для перевірки сервера та UptimeRobot (щоб не спав)
app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    bot.launch();
});
