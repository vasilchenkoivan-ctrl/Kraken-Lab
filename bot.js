const express = require('express');
const { Telegraf, Markup } = require('telegraf');

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

const getStatusKeyboard = (orderId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('⏳ В обробці', `status_proc_${orderId}`),
            Markup.button.callback('✅ Виконано', `status_done_${orderId}`),
            Markup.button.callback('❌ Скасовано', `status_canc_${orderId}`)
        ]
    ]);
};

app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body || {};
        console.log('Отримано замовлення:', JSON.stringify(orderData, null, 2));

        const orderId = orderData.orderId || (orderData.order && orderData.order.orderId) || `#ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const name = orderData.name || orderData.userName || (orderData.order && orderData.order.name) || 'Vanyok';
        const username = orderData.username || (orderData.order && orderData.order.username) ? `(@${orderData.username || orderData.order.username})` : '(@Telleportt)';
        const userId = orderData.userId || orderData.telegramId || (orderData.order && orderData.order.userId) || '1005867951';
        const phone = orderData.phone || orderData.userPhone || (orderData.order && orderData.order.phone) || '+380687552003';
        const delivery = orderData.deliveryMethod || orderData.delivery || (orderData.order && orderData.order.deliveryMethod) || 'Самовивіз';
        const deliveryDetails = orderData.deliveryDetails || orderData.comment || (orderData.order && orderData.order.comment) || 'Самовивіз (Київ, вул. Остафія Дашкевича)';
        
        // Всевозможные варианты путей к массиву товаров
        let rawItems = orderData.items || orderData.cart || orderData.cartItems || orderData.products || orderData.orderItems || (orderData.order && orderData.order.items) || (orderData.order && orderData.order.cart) || [];
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }
        const items = Array.isArray(rawItems) ? rawItems : [];

        const totalPrice = orderData.totalPrice || orderData.total || (orderData.order && orderData.order.totalPrice) || 0;

        // Сообщение для администратора
        let adminMessage = `🛍 <b>НОВЕ ЗАМОВЛЕННЯ</b> <code>${orderId}</code>\n\n`;
        adminMessage += `👤 <b>Покупець:</b> ${name} ${username}\n`;
        adminMessage += `🆔 <b>ID:</b> ${userId}\n`;
        adminMessage += `📞 <b>Телефон:</b> ${phone}\n`;
        adminMessage += `🚚 <b>Спосіб:</b> ${delivery}\n`;
        adminMessage += `📍 <b>Деталі:</b> ${deliveryDetails}\n\n`;
        adminMessage += `📦 <b>Товари:</b>\n`;

        if (items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || item.productName || item.label || item.text || 'Товар';
                const qty = item.quantity || item.count || item.qty || 1;
                const price = item.price || 0;
                adminMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
            });
        } else {
            adminMessage += `1. Товар — 1 шт. х ${totalPrice} ₴\n`;
        }

        adminMessage += `\n💰 <b>Сума:</b> ${totalPrice} грн\n\n`;
        adminMessage += `📌 <b>Поточний статус:</b> В обробці`;

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, {
                parse_mode: 'HTML',
                ...getStatusKeyboard(orderId)
            });
        }

        // Сообщение для клиента
        if (userId) {
            try {
                let clientMessage = `✅ <b>Дякуємо за замовлення в KrakenLab!</b>\n\n`;
                clientMessage += `📦 <b>Ваше замовлення успішно оформлено та передано менеджеру.</b>\n`;
                clientMessage += `🛒 <b>Товари:</b>\n`;

                if (items.length > 0) {
                    items.forEach((item, index) => {
                        const title = item.title || item.name || item.productName || item.label || item.text || 'Товар';
                        const qty = item.quantity || item.count || item.qty || 1;
                        const price = item.price || 0;
                        clientMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
                    });
                } else {
                    clientMessage += `1. Товар — 1 шт. х ${totalPrice} ₴\n`;
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

bot.action(/status_(proc|done|canc)_(.+)/, async (ctx) => {
    try {
        const type = ctx.match[1];
        const orderId = ctx.match[2];

        let statusText = 'В обробці';
        if (type === 'done') statusText = 'Виконано ✅';
        if (type === 'canc') statusText = 'Скасовано ❌';

        let currentText = ctx.callbackQuery.message.text || '';

        if (currentText.includes('📌 Поточний статус:')) {
            currentText = currentText.replace(/📌 Поточний статус:.*/, `📌 Поточний статус: ${statusText}`);
        } else {
            currentText += `\n\n📌 Поточний статус: ${statusText}`;
        }

        await ctx.editMessageText(currentText, {
            parse_mode: 'HTML',
            ...getStatusKeyboard(orderId)
        });

        await ctx.answerCbQuery(`Статус змінено на: ${statusText}`);
    } catch (err) {
        console.error('Помилка при зміні статусу:', err);
        await ctx.answerCbQuery('Помилка при зміні статусу');
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
