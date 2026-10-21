const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;8523927755:AAFrRQKOkmipfgFs6lx6F7WHiNeZAyRd-T4
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

if (!BOT_TOKEN) {
    throw new Error('Не задан BOT_TOKEN в переменных окружения!');
}

const bot = new Telegraf(BOT_TOKEN);

// Ссылка на Mini App — дизайн магазина не меняем
const MINI_APP_URL = 'https://krakenlab-git-main-kraken-lab3.vercel.app/';

// Команда /start
bot.start(async (ctx) => {
    try {
        await ctx.reply(
            'Вітаємо в 🐙KrakenLab🧪\n' +
            '🛍️ Відгуки клієнтів: @KRAKENOTZYVY\n' +
            '👨‍💻 Зв’язок з менеджером: @telleportt\n\n' +
            '👇🏻 Натискайте на кнопку нижче — це наш офіційний магазин у Telegram.\n' +
            'Тут ви можете швидко та зручно оформити замовлення та обрати улюблені смаки.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '🛍 Відкрити магазин',
                                web_app: {
                                    url: MINI_APP_URL
                                }
                            }
                        ]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Помилка команди /start:', error);
    }
});

// Получение заказа из Telegram Mini App
bot.on('message', async (ctx, next) => {
    const webAppData = ctx.message.web_app_data;

    // Если сообщение не содержит данные Mini App,
    // передаём его следующим обработчикам
    if (!webAppData) {
        return next();
    }

    try {
        const orderData = webAppData.data;
        const clientName = ctx.from.first_name || 'Клієнт';
        const username = ctx.from.username
            ? `@${ctx.from.username}`
            : 'немає';

        if (!orderData || !orderData.trim()) {
            await ctx.reply(
                '❌ Не вдалося отримати дані замовлення. Спробуйте оформити його ще раз.'
            );
            return;
        }

        // Уведомление администратору
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            '📥 НОВЕ ЗАМОВЛЕННЯ!\n\n' +
            `👤 Клієнт: ${clientName}\n` +
            `📨 Username: ${username}\n` +
            `🆔 Telegram ID: ${ctx.from.id}\n\n` +
            '📦 Дані замовлення:\n' +
            orderData
        );

        // Подтверждение клиенту
        await ctx.reply(
            `✅ Дякуємо, ${clientName}!\n\n` +
            'Ваше замовлення отримано та передано менеджеру Kraken Lab 🐙.\n\n' +
            '📌 Статус: Очікує підтвердження.\n\n' +
            "Менеджер зв'яжеться з вами найближчим часом."
        );

        console.log(
            `Замовлення отримано від користувача ${ctx.from.id}`
        );

    } catch (error) {
        console.error('Помилка обробки замовлення:', error);

        try {
            await ctx.reply(
                '❌ Сталася помилка під час обробки замовлення. Будь ласка, напишіть менеджеру @telleportt.'
            );
        } catch (replyError) {
            console.error('Не вдалося повідомити клієнта:', replyError);
        }
    }
});

// Проверка работы сервера
app.get('/', (req, res) => {
    res.status(200).send('Kraken Lab Bot is running!');
});

// Запуск сервера и бота
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);

    try {
        await bot.launch();
        console.log('Bot successfully started!');
    } catch (error) {
        console.error('Помилка запуску бота:', error);
    }
});

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));