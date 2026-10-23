const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');

// 1. Инициализация Express
const app = express();

// Настройки безопасности CORS и работы JSON
app.use(cors());
app.use(express.json());

// 2. Инициализация Telegram Бота
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// Конфигурация (ID и WebApp URL)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951'; 
const WEB_APP_URL = 'https://krakenlab.vercel.app';

// Проверка работы сервера
app.get('/', (req, res) => {
    res.send('Бэкенд Kraken Lab работает!');
});

// Прием заказа из Telegram Mini App
app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log('Новый заказ:', orderData);

        let message = `🛍 <b>НОВЫЙ ЗАКАЗ!</b>\n\n`;
        message += `👤 <b>Клиент:</b> ${orderData.phone || 'Не указан'}\n`;
        message += `🚚 <b>Доставка:</b> ${orderData.deliveryMethod || 'Не указан'}\n`;
        if (orderData.comment) {
            message += `💬 <b>Комментарий:</b> ${orderData.comment}\n`;
        }
        message += `\n📦 <b>Товары:</b>\n`;

        let totalCostPrice = 0;

        if (orderData.items && orderData.items.length > 0) {
            orderData.items.forEach((item, index) => {
                message += `${index + 1}. ${item.title || item.name} — ${item.quantity || 1} шт. (${item.price} грн)\n`;
                if (item.costPrice) {
                    totalCostPrice += (Number(item.costPrice) * (item.quantity || 1));
                }
            });
        }

        message += `\n💰 <b>Сумма к оплате:</b> ${orderData.totalPrice || 0} грн`;

        if (totalCostPrice > 0) {
            const profit = (orderData.totalPrice || 0) - totalCostPrice;
            message += `\n📊 <b>Себестоимость:</b> ${totalCostPrice} грн`;
            message += `\n💵 <b>Чистая прибыль:</b> ${profit} грн`;
        }

        // Отправляем уведомление в Telegram админу
        const chatIdToSend = ADMIN_CHAT_ID;
        if (chatIdToSend) {
            await bot.telegram.sendMessage(chatIdToSend, message, { parse_mode: 'HTML' });
        }

        return res.status(200).json({ success: true, message: 'Заказ успешно создан' });
    } catch (error) {
        console.error('Ошибка при обработке заказа:', error);
        return res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// Команда /start
bot.start((ctx) => {
    ctx.reply('Приветствуем в Kraken LAB! Нажмите кнопку ниже, чтобы открыть каталог товаров:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Открыть магазин', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

// Запуск сервера
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

bot.launch()
    .then(() => console.log('Telegram бот запущен'))
    .catch((err) => console.error('Ошибка запуска бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
