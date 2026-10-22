const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// Разрешаем запросы из твоего мини-приложения
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Новый рабочий токен и твой ID админа
const BOT_TOKEN = "8523927755:AAHCJKto1g_xWFUCAwqJSMKOH5nu5Fkg7j4";
const ADMIN_CHAT_ID = '1005867951';

const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
    ctx.reply(
        "Вітаємо в 🐙 Kraken Lab!\n\n" +
        "🛍 Відгуки клієнтів: @KRAKENOTZYVVL\n" +
        "👩‍💻 Зв'язок з менеджером: @telleportt\n\n" +
        "👇 Натискайте на кнопку нижче — це наш магазин:",
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛍 Відкрити магазин", web_app: { url: "ССЫЛКА_НА_ТВОЙ_GITHUB_PAGES" } }]
                ]
            }
        }
    );
});

// Обработка заказа из Mini App (когда клиент жмет "оформити замовлення")
bot.on('web_app_data', async (ctx) => {
    const orderData = ctx.web_app_data.data;
    const user = ctx.from;

    // 1. Отправляем клиенту подтверждение с инфой по самовывозу
    try {
        await ctx.reply(
            "✅ **Дякуємо за замовлення!**\n\n" +
            "Менеджер вже обробляє ваші дані.\n" +
            "📍 **Якщо ви обрали Самовивіз:** обов'язково напишіть менеджеру @telleportt для узгодження часу!",
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error("Ошибка отправки клиенту:", e);
    }

    // 2. Отправляем детальный заказ тебе (админу)
    const adminText = 
        `🛍 **НОВЕ ЗАМОВЛЕННЯ Kraken Lab!**\n\n` +
        `👤 **Покупець:** ${user.first_name} (@${user.username || 'немає'})\n` +
        `🆔 **ID:** \`${user.id}\`\n\n` +
        `📦 **Деталі замовлення:**\n${orderData}`;

    try {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminText, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Не удалось отправить заказ админу:", e);
    }
});

// Запуск бота
bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot запущено на Node.js!");
});

// Простой express сервер (чтобы хостинг не ругался)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
