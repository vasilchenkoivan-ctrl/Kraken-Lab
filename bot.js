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

// Временная база заказов в памяти сервера
const ordersDatabase = new Map();

app.get('/', (req, res) => {
    res.send('Бэкенд Kraken Lab работает!');
});

// Рут для получения истории заказов клиентом на фронтенде
app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;
    const userOrders = [];
    ordersDatabase.forEach((order) => {
        if (String(order.userId) === String(userId)) {
            userOrders.push(order);
        }
    });
    return res.status(200).json({ success: true, orders: userOrders });
});

// Кнопки управления статусом для админа
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

        const orderId = orderData.orderId || `#ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const name = orderData.userName || orderData.customerName || orderData.fullName || orderData.name || orderData.first_name || (orderData.user && orderData.user.first_name) || 'Покупець';
        const username = orderData.username || (orderData.user && orderData.user.username) ? `(@${orderData.username || orderData.user.username})` : '';
        const userId = orderData.userId || orderData.telegramId || orderData.chatId || (orderData.user && orderData.user.id) || null;
        const phone = orderData.phone || orderData.userPhone || 'Не вказано';
        
        const delivery = orderData.deliveryMethod || orderData.delivery || 'Самовивіз';
        const isPickup = delivery.toLowerCase().includes('самовивіз') || delivery.toLowerCase().includes('самовывоз');
        const deliveryDetails = orderData.deliveryDetails || orderData.comment || (isPickup ? 'Самовивіз (Київ, вул. Остафія Дашкевича)' : 'Не вказано');
        
        // Исправлено: поддержка всех вариантов ключей для товаров
        const items = orderData.items || orderData.cart || orderData.cartItems || orderData.products || orderData.orderItems || [];
        const totalPrice = orderData.totalPrice || orderData.total || orderData.amount || 0;

        // Сохраняем заказ в локальную структуру
        ordersDatabase.set(orderId, {
            orderId,
            userId,
            name,
            phone,
            delivery,
            deliveryDetails,
            items,
            totalPrice,
            status: 'В обробці',
            createdAt: new Date()
        });

        // Формирование списка товаров для текста
        let itemsFormattedText = '';
        let totalCostPrice = 0;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item, index) => {
                const title = item.title || item.name || item.productName || 'Товар';
                const qty = item.quantity || item.count || item.qty || 1;
                const price = item.price || 0;
                itemsFormattedText += `${index + 1}. ${title} — ${qty} шт. х ${price} ₴\n`;

                if (item.costPrice) {
                    totalCostPrice += (Number(item.costPrice) * qty);
                }
            });
        } else {
            itemsFormattedText = 'Товари не вказані або кошик порожній\n';
        }

        // Сообщение для администратора
        let adminMessage = `🛍 <b>НОВЕ ЗАМОВЛЕННЯ</b> <code>${orderId}</code>\n\n`;
        adminMessage += `👤 <b>Покупець:</b> ${name} ${username}\n`;
        adminMessage += `🆔 <b>ID:</b> ${userId || 'Не вказано'}\n`;
        adminMessage += `📞 <b>Телефон:</b> ${phone}\n`;
        adminMessage += `🚚 <b>Спосіб:</b> ${delivery}\n`;
        adminMessage += `📍 <b>Деталі:</b> ${deliveryDetails}\n\n`;
        adminMessage += `📦 <b>Товари:</b>\n${itemsFormattedText}`;

        adminMessage += `\n💰 <b>Сума:</b> ${totalPrice} грн`;

        if (totalCostPrice > 0) {
            const profit = totalPrice - totalCostPrice;
            adminMessage += `\n📊 <b>Собівартість:</b> ${totalCostPrice} грн`;
            adminMessage += `\n💵 <b>Чистий прибуток:</b> ${profit} грн`;
        }

        adminMessage += `\n\n📌 <b>Поточний статус:</b> В обробці`;

        if (ADMIN_CHAT_ID) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, {
                parse_mode: 'HTML',
                ...getStatusKeyboard(orderId)
            });
        }

        // Сообщение клиенту
        if (userId) {
            try {
                let clientMessage = `✅ <b>Дякуємо за замовлення в KrakenLab!</b>\n\n`;
                clientMessage += `📦 <b>Ваше замовлення успішно оформлено та передано менеджеру.</b>\n`;
                clientMessage += `🛒 <b>Товари:</b>\n${itemsFormattedText}`;
                clientMessage += `\n⏱ <b>Очікуйте на підтвердження</b> — менеджер зв'яжеться з вами найближчим часом для уточнення деталей.\n`;
                
                if (isPickup) {
                    clientMessage += `⏱ <b>Оскільки це самовивіз, будь ласка, напишіть менеджеру @telleportt для узгодження часу!</b>\n\n`;
                }

                clientMessage += `💚 <b>Дякуємо, що обираєте KrakenLab!</b>`;

                await bot.telegram.sendMessage(userId, clientMessage, { parse_mode: 'HTML' });
            } catch (clientErr) {
                console.error('Не вдалося надіслати повідомлення клієнту:', clientErr);
            }
        }

        return res.status(200).json({ success: true, message: 'Замовлення успішно створено', orderId });
    } catch (error) {
        console.error('Помилка при обробці замовлення:', error);
        return res.status(500).json({ success: false, error: error.message || 'Помилка сервера' });
    }
});

// Обработка клика по кнопкам статуса
bot.action(/status_(proc|done|canc)_(.+)/, async (ctx) => {
    try {
        const type = ctx.match[1];
        const orderId = ctx.match[2];
        
        let statusText = 'В обробці';
        let clientStatusText = '⏳ <b>Ваше замовлення переведено в статус: В обробці</b>';
        
        if (type === 'done') {
            statusText = 'Виконано ✅';
            clientStatusText = `✅ <b>Ваше замовлення ${orderId} успішно виконано! Дякуємо, що обираєте KrakenLab!</b>`;
        } else if (type === 'canc') {
            statusText = 'Скасовано ❌';
            clientStatusText = `❌ <b>Ваше замовлення ${orderId} було скасовано. Напишіть менеджеру @telleportt для деталей.</b>`;
        }

        // Обновляем статус в нашей базе
        const savedOrder = ordersDatabase.get(orderId);
        if (savedOrder) {
            savedOrder.status = statusText;
            ordersDatabase.set(orderId, savedOrder);
        }

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

        // Отправляем уведомоение клиенту в Telegram при смене статуса
        if (savedOrder && savedOrder.userId) {
            try {
                await bot.telegram.sendMessage(savedOrder.userId, clientStatusText, { parse_mode: 'HTML' });
            } catch (notifyErr) {
                console.error('Помилка при надсиланні сповіщення про статус клієнту:', notifyErr);
            }
        }
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
