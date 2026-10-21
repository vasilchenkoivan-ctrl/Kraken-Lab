const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAFrRQKOkmipfgFs6lx6F7WHiNeZAyRd-T4';
const bot = new Telegraf(BOT_TOKEN);

// Простой веб-сервер, который мгновенно открывает порт для Render
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

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
                    [{ text: "🛍 Відкрити магазин", web_app: { url: "https://krakenlab.vercel.app/" } }]
                ]
            }
        }
    );
});

// Запуск бота
bot.launch().then(() => {
    console.log('Bot successfully started!');
}).catch((err) => {
    console.error('Помилка запуску бота:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
