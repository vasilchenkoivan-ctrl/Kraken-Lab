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

        const orderId = orderData.orderId || `#ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const name = orderData.name || 'Покупець';
        const username = orderData.username ? `(@${orderData.username})` : '';
        const userId = orderData.userId || orderData.telegramId || 'Не вказано';
        const phone = orderData.phone || orderData.userPhone || 'Не вказано';
        const delivery = orderData.deliveryMethod || orderData.delivery || 'Не вказано';
        const deliveryDetails = orderData.deliveryDetails || orderData.comment || 'Не вказано';
        const items = orderData.items || orderData.cart || [];
        const totalPrice = orderData.totalPrice || orderData.total || 0;

        let adminMessage = `🛍 <b>НОВЕ ЗАМОВЛЕННЯ</b> <code>${orderId}</code>\n\n`;
        adminMessage += `👤 <b>Покупець:</b> ${name} ${username}\n`;
        adminMessage += `🆔 <b>ID:</b> ${userId}\n`;
        adminMessage += `📞 <b>Телефон:</b> ${phone}\n`;
        adminMessage += `🚚 <b>Спосіб:</b> ${delivery}\n`;
        adminMessage += `📍 <b>Деталі:</b> ${deliveryDetails}\n\n`;
        adminMessage += `📦 <b>Товари:</b>\n`;

        let totalCostPrice = 0;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || 'Товар';
                const qty = item.quantity || item.count || 1;
                const price = item.price || 0;
                adminMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;

                if (item.costPrice) {
                    totalCostPrice += (Number(item.costPrice) * qty);
                }
            });
        }

        adminMessage += `\n💰 <b>Сума:</b> ${totalPrice} грн`;

        if (totalCostPrice > 0) {
            const profit = totalPrice - totalCostPrice;
            adminMessage += `\n📊 <b>Собівартість:</b> ${totalCostPrice} грн`;
            adminMessage += `\n💵 <b>Чистий прибуток:</b> ${profit} грн`;
        }

        adminMessage += `\n\n📌 <b>Поточний статус:</b> В обробці`;

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'HTML' });
        }

        if (userId && userId !== 'Не вказано') {
            try {
                let clientMessage = `✅ <b>Дякуємо за замовлення в KrakenLab!</b>\n\n`;
                clientMessage += `📦 <b>Ваше замовлення успішно оформлено та передано менеджеру.</b>\n`;
                clientMessage += `🛒 <b>Товари:</b>\n`;
                
                if (Array.isArray(items) && items.length > 0) {
                    items.forEach((item, index) => {
                        const title = item.title || item.name || 'Товар';
                        const qty = item.quantity || item.count || 1;
                        const price = item.price || 0;
                        clientMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
                    });
                }

                clientMessage += `\n⏱ <b>Очікуйте на підтвердження</b> — менеджер зв'яжеться з вами найближчим часом для уточнення деталей.\n`;
                clientMessage += `⏱ <b>Оскільки це самовивіз, будь ласка, напишіть менеджеру @telleportt для узгодження часу!</b>\n\n`;
                clientMessage += `💚 <b>Дякуємо, що обираєте KrakenLab!</b>`;

                await bot.telegram.sendMessage(userId, clientMessage, { parse_mode: 'HTML' });
            } catch (clientErr) {
                console.error('Не вдалося надіслати повідомлення клієнту:', clientErr);
            }
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

bot.launch().then(() => {
    console.log('Telegram бот успішно запущено');
}).catch((err) => {
    console.error('Помилка запуску бота:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
