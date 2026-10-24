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

const orderStatuses = {};
const userReferrals = {};

bot.start((ctx) => {
    const startPayload = ctx.message.text ? ctx.message.text.split(' ')[1] : null;
    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.replace('ref_', '');
        if (referrerId !== String(ctx.from.id)) {
            userReferrals[referrerId] = (userReferrals[referrerId] || 0) + 1;
        }
    }

    ctx.reply('🐙 Вітаємо в Kraken Lab!\n\n👥 Відгуки: @KRAKENOTZYVVL\n💬 Менеджер: @telleportt\n\n🛒 Переходьте до магазину за кнопкою нижче — обирайте товар, додавайте у кошик та оформлюйте замовлення в декілька кліків 👇', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛒 Відкрити магазин', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

app.get('/api/ref/discount/:id', (req, res) => {
    const userId = req.params.id;
    const count = userReferrals[userId] || 0;
    return res.json({ count });
});

app.get('/', (req, res) => {
    res.send('Бэкенд Kraken Lab работает!');
});

app.post('/api/order', async (req, res) => {
    try {
        const body = req.body || {};
        console.log('📦 ПРИЙШОВ JSON ВІД ФРОНТУ:', JSON.stringify(body, null, 2));

        // Безопасное извлечение ID заказа
        const orderId = body.orderId || (body.order && body.order.orderId) || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        
        // Пользователь
        const user = body.user || body.userInfo || (body.order && body.order.user) || { id: body.userId, first_name: body.name || body.userName, username: body.username };
        
        // Перебор всех возможных вариантов массива товаров
        const items = body.items || body.cart || body.cartItems || body.products || body.orderItems || (body.order && body.order.items) || (body.order && body.order.cart) || [];
        
        const totalPrice = body.totalPrice || body.total || body.amount || (body.order && body.order.totalPrice) || 0;
        const deliveryType = body.deliveryType || body.deliveryMethod || body.delivery || (body.order && body.order.deliveryMethod) || 'Самовивіз';
        const details = body.details || body.deliveryDetails || body.comment || (body.order && body.order.comment) || 'нет';
        const phone = body.phone || body.userPhone || (body.order && body.order.phone) || 'не указан';

        const isPickup = String(deliveryType).toLowerCase().includes('самов') || String(deliveryType).toLowerCase().includes('pickup');

        // Сообщение клиенту
        let customerMessage = `✅ **Дякуємо за замовлення в KrakenLab!**\n\n`;
        customerMessage += `📦 **Ваше замовлення успішно оформлено та передано менеджеру.**\n🛒 **Товари:**\n`;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || item.productName || 'Товар';
                const qty = item.quantity || item.count || item.qty || 1;
                const price = item.price || 0;
                customerMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
            });
        } else {
            customerMessage += `1. Товар з кошика — 1 шт.\n`;
        }

        customerMessage += `\n⏱ **Очікуйте на підтвердження** — менеджер зв'яжеться з вами найближчим часом для уточнення деталей.\n`;
        if (isPickup) {
            customerMessage += `⏱ **Оскільки це самовивіз, будь ласка, напишіть менеджеру @telleportt для узгодження часу!**\n\n`;
        } else {
            customerMessage += `\n`;
        }
        customerMessage += `💚 **Дякуємо, що обираєте KrakenLab!**`;

        if (user && user.id) {
            try {
                await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' });
            } catch (errClient) {
                console.error("Не удалось отправить клиенту:", errClient);
            }
        }

        // Сообщение администратору
        let adminMessage = `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}**\n\n`;
        adminMessage += `👤 **Покупець:** ${user?.first_name || 'Клиент'} (@${user?.username || 'нет'})\n`;
        adminMessage += `🆔 **ID:** ${user?.id || 'нет'}\n`;
        adminMessage += `📞 **Телефон:** ${phone}\n`;
        adminMessage += `🚚 **Спосіб:** ${deliveryType}\n`;
        adminMessage += `📍 **Деталі:** ${details}\n\n📦 **Товари:**\n`;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || item.productName || 'Товар';
                const qty = item.quantity || item.count || item.qty || 1;
                const price = item.price || 0;
                adminMessage += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
            });
        } else {
            adminMessage += `1. Товар з кошика — 1 шт.\n`;
        }

        adminMessage += `\n💰 **Сума:** ${totalPrice} грн\n\n📌 **Поточний статус:** В обробці`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('⏳ В обробці', `status_proc_${orderId}`),
                Markup.button.callback('✅ Виконано', `status_done_${orderId}`),
                Markup.button.callback('❌ Скасовано', `status_canc_${orderId}`)
            ]
        ]);

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("Помилка:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

bot.action(/status_(.+?)_(.+)/, async (ctx) => {
    try {
        const action = ctx.match[1];
        const orderId = ctx.match[2];

        let newStatus = 'В обробці';
        if (action === 'done') newStatus = 'Виконано ✅';
        if (action === 'canc') newStatus = 'Скасовано ❌';

        orderStatuses[orderId] = newStatus;

        const oldText = ctx.callbackQuery.message.text || '';
        const baseText = oldText.substring(0, oldText.lastIndexOf('📌 Поточний статус:'));
        const updatedText = baseText + `📌 **Поточний статус:** ${newStatus}`;

        await ctx.editMessageText(updatedText, {
            parse_mode: 'Markdown',
            reply_markup: ctx.callbackQuery.message.reply_markup
        });

        await ctx.answerCbQuery(`Статус змінено на: ${newStatus}`);
    } catch (err) {
        console.error('Помилка статусу:', err);
        await ctx.answerCbQuery('Помилка при зміні статусу');
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

bot.launch().then(() => {
    console.log("🐙 Kraken Lab Bot успешно запущен!");
}).catch(err => {
    console.error("Ошибка запуска бота:", err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
