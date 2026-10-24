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
        const orderData = req.body || {};
        console.log('Отримано замовлення:', orderData);

        const phone = orderData.phone || orderData.userPhone || 'Не вказано';
        const delivery = orderData.deliveryMethod || orderData.delivery || 'Не вказано';
        const comment = orderData.comment || orderData.details || '';
        const items = orderData.items || orderData.cart || [];
        const totalPrice = orderData.totalPrice || orderData.total || 0;

        let message = `🛍 <b>НОВЕ ЗАМОВЛЕННЯ</b>\n\n`;
        message += `👤 <b>Покупець:</b> ${phone}\n`;
        message += `🚚 <b>Спосіб:</b> ${delivery}\n`;
        if (comment) {
            message += `💬 <b>Коментар:</b> ${comment}\n`;
        }
        message += `\n📦 <b>Товари:</b>\n`;

        let totalCostPrice = 0;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || 'Товар';
                const qty = item.quantity || item.count || 1;
                const price = item.price || 0;
                message += `${index + 1}. ${title} — ${qty} шт. (${price} грн)\n`;

                if (item.costPrice) {
                    totalCostPrice += (Number(item.costPrice) * qty);
                }
            });
        }

        message += `\n💰 <b>Сума:</b> ${totalPrice} грн`;

        if (totalCostPrice > 0) {
            const profit = totalPrice - totalCostPrice;
            message += `\n📊 <b>Собівартість:</b> ${totalCostPrice} грн`;
            message += `\n💵 <b>Чистий прибуток:</b> ${profit} грн`;
        }

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML' });
        }

        return res.status(200).json({ success: true, message: 'Замовлення успішно створено' });
    } catch (error) {
        console.error('Помилка при обробці замовлення:', error);
        return res.status(500).json({ success: false, error: error.message || 'Помилка сервера' });
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
