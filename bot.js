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
        const body = req.body || {};
        console.log('Отримано замовлення:', JSON.stringify(body, null, 2));

        const orderData = body.order || body;

        const orderId = orderData.orderId || body.orderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        
        // --- ПОКУПАТЕЛЬ ---
        const userObj = orderData.user || body.user || orderData.userInfo || body.userInfo || {};
        const name = orderData.name || body.name || orderData.userName || body.userName || userObj.first_name || userObj.name || 'Vanyok';
        
        let rawUsername = orderData.username || body.username || userObj.username || '';
        if (rawUsername && !rawUsername.startsWith('@')) {
            rawUsername = `@${rawUsername}`;
        }
        const usernameStr = rawUsername || '@Telleportt';

        const userId = orderData.userId || body.userId || orderData.telegramId || body.telegramId || userObj.id || '1005867951';
        const phone = orderData.phone || body.phone || orderData.userPhone || body.userPhone || '+380687552003';

        // --- СПОСОБ ДОСТАВКИ И ДЕТАЛИ ---
        const rawDelivery = orderData.deliveryMethod || orderData.deliveryType || orderData.delivery || body.deliveryMethod || body.deliveryType || body.delivery || 'Самовивіз';
        const deliveryLower = String(rawDelivery).toLowerCase();
        const isPickup = deliveryLower.includes('самов') || deliveryLower.includes('pickup');

        let delivery = isPickup ? 'Самовивіз' : 'Нова Пошта';
        let deliveryDetails = '';

        if (isPickup) {
            deliveryDetails = 'Самовивіз (Клієнт напише для узгодження часу)';
        } else {
            let rawDetails = orderData.deliveryDetails || orderData.details || orderData.comment || orderData.address || body.deliveryDetails || body.details || body.comment || body.address || '';
            
            if (!rawDetails && (orderData.city || body.city || orderData.warehouse || body.warehouse)) {
                const city = orderData.city || body.city || '';
                const warehouse = orderData.warehouse || body.warehouse || orderData.novaPoshta || body.novaPoshta || '';
                rawDetails = `${city}, відд. ${warehouse}`;
            }

            rawDetails = rawDetails.replace(/Нова Пошта\s*/gi, '').replace(/[()]/g, '').trim();

            if (rawDetails) {
                deliveryDetails = `(${rawDetails})`;
            } else {
                deliveryDetails = '(деталі не вказано)';
            }
        }

        // --- ТОВАРИ ---
        let rawItems = orderData.items || orderData.cart || orderData.cartItems || orderData.products || orderData.orderItems || body.items || body.cart || body.cartItems || body.products || body.orderItems || [];
        
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }
        
        const items = Array.isArray(rawItems) ? rawItems : [];
        const totalPrice = orderData.totalPrice || orderData.total || body.totalPrice || body.total || 0;

        let itemsFormattedText = '';
        if (items.length > 0) {
            items.forEach((item, index) => {
                const title = item.productName || item.title || item.name || item.product || item.label || item.text || item.item || (typeof item === 'string' ? item : 'Товар');
                const qty = item.quantity || item.count || item.qty || item.amount || 1;
                const price = item.price || item.cost || 0;
                
                itemsFormattedText += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;
            });
        } else {
            itemsFormattedText = `1. Товар — 1 шт. х ${totalPrice} ₴\n`;
        }

        // --- СООБЩЕНИЕ ДЛЯ МЕНЕДЖЕРА ---
        let adminMessage = `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}**\n\n`;
        adminMessage += `👤 **Покупець:** ${name} (${usernameStr})\n`;
        adminMessage += `🆔 **ID:** ${userId}\n`;
        adminMessage += `📞 **Телефон:** ${phone}\n`;
        adminMessage += `🚚 **Спосіб:** ${delivery}\n`;
        adminMessage += `📍 **Деталі:** ${deliveryDetails}\n\n`;
        adminMessage += `📦 **Товари:**\n${itemsFormattedText}`;
        adminMessage += `\n💰 **Сума:** ${totalPrice} грн\n\n`;
        adminMessage += `📌 **Поточний статус:** В обробці`;

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, {
                parse_mode: 'Markdown',
                ...getStatusKeyboard(orderId)
            });
        }

        // --- СООБЩЕНИЕ ДЛЯ КЛИЕНТА ---
        if (userId) {
            try {
                let clientMessage = `✅ **Дякуємо за замовлення в KrakenLab!**\n\n`;
                clientMessage += `📦 **Ваше замовлення успішно оформлено та передано менеджеру.**\n`;
                clientMessage += `🛒 **Товари:**\n${itemsFormattedText}\n`;
                clientMessage += `🕖 **Очікуйте на підтвердження** — менеджер зв'яжеться з вами найближчим часом для уточнення деталей.\n\n`;
                
                if (isPickup) {
                    clientMessage += `⏱ **Оскільки це самовивіз, будь ласка, напишіть менеджеру @telleportt для узгодження часу!**\n\n`;
                }

                clientMessage += `💚 **Дякуємо, що обираєте KrakenLab!**`;

                await bot.telegram.sendMessage(userId, clientMessage, { parse_mode: 'Markdown' });
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

bot.action(/status_(.+?)_(.+)/, async (ctx) => {
    try {
        const action = ctx.match[1];
        const orderId = ctx.match[2];

        let newStatus = 'В обробці';
        if (action === 'done') newStatus = 'Виконано ✅';
        if (action === 'canc') newStatus = 'Скасовано ❌';

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
