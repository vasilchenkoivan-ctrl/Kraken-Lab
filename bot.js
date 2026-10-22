const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || "8523927755:AAHCJKto1g_xWFUCAwqJSMKOH5nu5Fkg7j4";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

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

bot.on('web_app_data', async (ctx) => {
    try {
        const orderData = ctx.web_app_data.data;
        const user = ctx.from;

        await ctx.reply(
            "✅ **Дякуємо за замовлення!**\n\n" +
            "Менеджер вже обробляє ваші дані.\n" +
            "📍 **Якщо ви обрали Самовивіз:** обов'язково напишіть менеджеру @telleportt для узгодження часу!",
            { parse_mode: 'Markdown' }
        );

        const adminText = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ Kraken Lab!**\n\n` +
            `👤 **Покупець:** ${user.first_name} (@${user.username || 'немає'})\n` +
            `🆔 **ID:** \`${user.id}\`\n\n` +
            `📦 **Деталі замовлення:**\n${orderData}`;

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminText, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Ошибка при обработке заказа:", e);
    }
});

bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot запущено!");
}).catch((err) => {
    console.error(" Ошибка запуска бота:", err);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
