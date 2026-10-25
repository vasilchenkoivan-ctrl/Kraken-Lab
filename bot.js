const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const path = require('path');

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://krakenlab.vercel.app';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

if (!BOT_TOKEN) {
    throw new Error('Не задан BOT_TOKEN в настройках Render');
}

const bot = new Telegraf(BOT_TOKEN);

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Kraken Lab API</title>
        </head>
        <body style="background:#080808;color:#39ff14;font-family:Arial;text-align:center;padding:50px 15px">
            <h1>🐙 Kraken Lab</h1>
            <p>Сервер працює.</p>
            <p>Магазин: <a style="color:white" href="${WEB_APP_URL}">${WEB_APP_URL}</a></p>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Kraken Lab',
        status: 'online'
    });
});

async function saveToGoogleSheets(data) {
    if (!GOOGLE_SCRIPT_URL) {
        console.warn('GOOGLE_SCRIPT_URL не заданий');
        return {
            success: false,
            error: 'Google Sheets не підключено'
        };
    }

    try {
        const response = await axios.post(
            GOOGLE_SCRIPT_URL,
            data,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        const result = response.data;

        if (typeof result === 'string') {
            const normalized = result.toLowerCase();

            if (
                normalized.includes('success') ||
                normalized.includes('успішно')
            ) {
                return { success: true };
            }

            throw new Error(result);
        }

        if (
            result &&
            (
                result.success === true ||
                result.status === 'success'
            )
        ) {
            return { success: true };
        }

        throw new Error(
            JSON.stringify(result || 'Неизвестный ответ Google Sheets')
        );

    } catch (error) {
        console.error(
            'Google Sheets error:',
            error.response?.data || error.message
        );

        return {
            success: false,
            error: error.message
        };
    }
}

function formatOrder(order) {
    const items = order.items
        .map(item => {
            return (
                `• ${item.title}` +
                (item.flavor ? ` (${item.flavor})` : '') +
                ` × ${item.quantity} — ${item.price * item.quantity} грн`
            );
        })
        .join('\n');

    return (
        `🐙 НОВЕ ЗАМОВЛЕННЯ KRAKEN LAB\n\n` +
        `🧾 Номер: ${order.id}\n` +
        `👤 Ім'я: ${order.name}\n` +
        `📞 Телефон: ${order.phone}\n` +
        `🆔 Telegram ID: ${order.userId || 'Не вказано'}\n\n` +
        `🛒 Товари:\n${items}\n\n` +
        `🚚 Доставка: ${order.delivery}\n` +
        `📍 Адреса / відділення: ${order.address || 'Не вказано'}\n` +
        `💰 Сума: ${order.total} грн\n` +
        `📝 Коментар: ${order.comment || 'Немає'}\n\n` +
        `📦 Статус: Прийнято`
    );
}

app.post('/api/order', async (req, res) => {
    try {
        const body = req.body || {};

        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').trim();
        const delivery = String(body.delivery || body.deliveryType || '').trim();
        const address = String(body.address || '').trim();
        const comment = String(body.comment || '').trim();
        const userId = body.userId ? String(body.userId) : '';

        if (!name || !phone || !delivery) {
            return res.status(400).json({
                success: false,
                error: 'Заповніть ім’я, телефон і спосіб доставки.'
            });
        }

        if (!Array.isArray(body.items) || body.items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Кошик порожній.'
            });
        }

        const items = body.items.map(item => ({
            title: String(item.title || 'Товар'),
            flavor: String(item.flavor || ''),
            quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
            price: Math.max(0, Number(item.price) || 0)
        }));

        const total = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        if (total <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Не вдалося визначити суму замовлення.'
            });
        }

        const order = {
            id: 'KL' + Date.now().toString().slice(-9),
            name,
            phone,
            delivery,
            address,
            comment,
            userId,
            items,
            total,
            status: 'Прийнято',
            createdAt: new Date().toISOString()
        };

        const sheetResult = await saveToGoogleSheets({
            action: 'new_order',
            orderId: order.id,
            name: order.name,
            phone: order.phone,
            userId: order.userId,
            delivery: order.delivery,
            address: order.address,
            comment: order.comment,
            items: JSON.stringify(order.items),
            total: order.total,
            status: order.status,
            createdAt: order.createdAt
        });

        if (!sheetResult.success) {
            return res.status(502).json({
                success: false,
                error: 'Не вдалося зберегти замовлення. Спробуйте пізніше.'
            });
        }

        try {
            await bot.telegram.sendMessage(
                ADMIN_CHAT_ID,
                formatOrder(order),
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '✅ Підтвердити',
                            `order_confirm_${order.id}`
                        )
                    ],
                    [
                        Markup.button.callback(
                            '📦 Відправлено',
                            `order_sent_${order.id}`
                        )
                    ],
                    [
                        Markup.button.callback(
                            '❌ Скасувати',
                            `order_cancel_${order.id}`
                        )
                    ]
                ])
            );
        } catch (telegramError) {
            console.error(
                'Не удалось отправить уведомление админу:',
                telegramError.message
            );
        }

        if (userId) {
            try {
                await bot.telegram.sendMessage(
                    userId,
                    `🐙 Ваше замовлення оформлено!\n\n` +
                    `🧾 Номер: ${order.id}\n` +
                    `💰 Сума: ${order.total} грн\n\n` +
                    `Дякуємо за замовлення в Kraken Lab!`
                );
            } catch (telegramError) {
                console.log('Не удалось написать покупателю:', telegramError.message);
            }
        }

        return res.json({
            success: true,
            orderId: order.id,
            total: order.total
        });

    } catch (error) {
        console.error('Order error:', error);

        return res.status(500).json({
            success: false,
            error: 'Внутрішня помилка сервера.'
        });
    }
});

const orderStatus = {
    confirmed: 'Підтверджено',
    sent: 'Відправлено',
    cancel: 'Скасовано'
};

for (const [action, status] of Object.entries(orderStatus)) {
    bot.action(new RegExp(`^order_${action}_(.+)$`), async ctx => {
        if (String(ctx.chat?.id) !== String(ADMIN_CHAT_ID)) {
            return ctx.answerCbQuery('Немає доступу');
        }

        const orderId = ctx.match[1];

        await ctx.answerCbQuery('Статус оновлено');

        try {
            await ctx.editMessageText(
                ctx.callbackQuery.message.text +
                `\n\n🔄 Новий статус: ${status}`
            );
        } catch (error) {
            console.log('Не удалось обновить сообщение:', error.message);
        }

        const result = await saveToGoogleSheets({
            action: 'update_status',
            orderId,
            status
        });

        if (!result.success) {
            console.error('Статус не записан в таблицу:', orderId);
        }
    });
}

bot.start(async ctx => {
    await ctx.reply(
        '🐙 Вітаємо в Kraken Lab!\n\n' +
        '👥 Відгуки: @KRAKENOTZYVVL\n' +
        '💬 Менеджер: @telleportt\n\n' +
        '🛒 Переходьте до магазину за кнопкою нижче — обирайте товар, додавайте у кошик та оформлюйте замовлення в декілька кліків 👇',
        Markup.inlineKeyboard([
            [
                Markup.button.webApp(
                    '🛒 Відкрити магазин',
                    WEB_APP_URL
                )
            ]
        ])
    );
});

bot.catch(error => {
    console.error('Telegram bot error:', error);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kraken Lab server running on port ${PORT}`);
});

bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('Kraken Lab bot started'))
    .catch(error => console.error('Bot launch error:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));