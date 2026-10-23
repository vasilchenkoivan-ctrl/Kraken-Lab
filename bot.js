const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

const BOT_TOKEN = '8523927755:AAEyK603j5vEaoSzGgHREpVVAJa4a_uEx-o'; 
const ADMIN_CHAT_ID = '1005867951'; 
const WEB_APP_URL = 'https://krakenlab.vercel.app';

const bot = new Telegraf(BOT_TOKEN);

app.get('/', (req, res) => {
    res.send('Бэкенд Kraken Lab работает!');
});

app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log('Новый заказ:', orderData);

        let message = `🛍 <b>НОВЕ ЗАМОВЛЕННЯ</b>\n\n`;
        message += `👤 <b>Покупець:</b> ${orderData.name || orderData.phone || 'Не вказано'}\n`;
        if (orderData.phone) {
            message += `📞 <b>Телефон:</b> ${orderData.phone}\n`;
        }
        message += `🚚 <b>Спосіб:</b> ${orderData.deliveryMethod || 'Не вказано'}\n`;
        if (orderData.comment) {
            message += `💬 <b>Коментар:</b> ${orderData.comment}\n`;
        }
        message += `\n📦 <b>Товари:</b>\n`;

        let totalCostPrice = 0;

        if (orderData.items && orderData.items.length > 0) {
            orderData.items.forEach((item, index) => {
                message += `${index + 1}. ${item.title || item.name} — ${item.quantity || 1} шт. (${item.price} грн)\n`;
                if (item.costPrice) {
                    totalCostPrice += (Number(item.costPrice) * (item.quantity || 1));
                }
            });
        }

        message += `\n💰 <b>Сума:</b> ${orderData.totalPrice || 0} грн`;

        if (totalCostPrice > 0) {
            const profit = (orderData.totalPrice || 0) - totalCostPrice;
            message += `\n📊 <b>Собівартість:</b> ${totalCostPrice} грн`;
            message += `\n💵 <b>Чистий прибуток:</b> ${profit} грн`;
        }

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML' });
        }

        return res.status(200).json({ success: true, message: 'Замовлення успішно створено' });
    } catch (error) {
        console.error('Помилка при обробці замовлення:', error);
        return res.status(500).json({ success: false, error: 'Помилка сервера' });
    }
});

bot.start((ctx) => {
    ctx.reply('🐙 Вітаємо в Kraken Lab!\n\n👥 Відгуки: @KRAKENOTZYVVL\n💬 Менеджер: @telleportt\n\n🛒 Переходьте до магазину за кнопкою нижче — обирайте товар, додавайте у кошик та оформлюйте замовлення в декілька кліків 👇', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Відкрити магазин', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

bot.launch()
    .then(() => console.log('Telegram бот запущено'))
    .catch((err) => console.error('Помилка запуску бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
