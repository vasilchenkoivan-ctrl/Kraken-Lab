const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://krakenlab.vercel.app';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

if (!BOT_TOKEN) {
    throw new Error('Добавь BOT_TOKEN в Environment на Render');
}

const bot = new Telegraf(BOT_TOKEN);
const waitingForCost = new Map();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function sendToGoogleSheet(data) {
    if (!GOOGLE_SCRIPT_URL) {
        throw new Error('Не задан GOOGLE_SCRIPT_URL на Render');
    }

    const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    const result = await response.text();

    if (!response.ok || !result.includes('Success')) {
        throw new Error('Ошибка Google Apps Script: ' + result);
    }

    return result;
}

function formatItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return 'Товары не переданы';
    }

    return items.map((item, index) => {
        if (typeof item === 'string') {
            return `${index + 1}. ${item}`;
        }

        const title = item.title || item.name || 'Товар';
        const flavor = item.flavor ? ` (${item.flavor})` : '';
        const quantity = Number(item.quantity || item.count || 1);
        const price = Number(item.price || 0);

        return `${index + 1}. ${title}${flavor} — ${quantity} шт. × ${price} ₴`;
    }).join('\n');
}

function orderButtons(orderId) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('⏳ В обработке', `status_proc_${orderId}`),
            Markup.button.callback('✅ Выполнено', `status_done_${orderId}`)
        ],
        [
            Markup.button.callback('❌ Отменено', `status_canc_${orderId}`),
            Markup.button.callback('💰 Себестоимость', `cost_${orderId}`)
        ]
    ]);
}

// Если index.html находится рядом с bot.js, Render тоже сможет отдавать магазин.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (error) => {
        if (error && !res.headersSent) {
            res.status(404).send(
                'Файл index.html не найден. Открой магазин через Vercel.'
            );
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Kraken Lab работает' });
});

app.post('/api/order', async (req, res) => {
    try {
        const order = req.body.order || req.body;
        const user = order.user || {};

        const orderId = String(order.orderId || `ORD-${Date.now()}`);
        const name = order.name || order.customer_name ||
            user.first_name || 'Покупатель';
        const userId = String(order.userId || user.id || '');
        const username = order.username || user.username || '';
        const phone = order.phone || 'Не указан';
        const items = Array.isArray(order.items) ? order.items : [];
        const itemsText = formatItems(items);
        const totalPrice = Number(order.totalPrice || order.total || 0);
        const delivery = order.deliveryType || order.deliveryMethod || 'Самовывоз';
        const address = order.deliveryDetails || order.address || 'Не указано';

        await sendToGoogleSheet({
            action: 'new_order',
            order_id: orderId,
            customer_name: name,
            user_id: userId,
            username,
            phone,
            delivery_method: delivery,
            delivery_details: address,
            items,
            items_formatted: itemsText,
            total_price: totalPrice
        });

        const message =
            `🛍 <b>НОВЫЙ ЗАКАЗ #${escapeHtml(orderId)}</b>\n\n` +
            `👤 Покупатель: ${escapeHtml(name)}\n` +
            `🆔 Telegram ID: ${escapeHtml(userId || 'Не указан')}\n` +
            `👤 Username: ${escapeHtml(username || 'Не указан')}\n` +
            `📞 Телефон: ${escapeHtml(phone)}\n` +
            `🚚 Доставка: ${escapeHtml(delivery)}\n` +
            `📍 Адрес: ${escapeHtml(address)}\n\n` +
            `📦 Товары:\n${escapeHtml(itemsText)}\n\n` +
            `💰 Сумма: ${totalPrice} грн\n\n` +
            `📌 Статус: В обработке`;

        await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, {
            parse_mode: 'HTML',
            ...orderButtons(orderId)
        });

        if (userId) {
            try {
                await bot.telegram.sendMessage(
                    userId,
                    `✅ Заказ #${escapeHtml(orderId)} принят!\n\n` +
                    `📦 Товары:\n${escapeHtml(itemsText)}\n\n` +
                    `💰 Сумма: ${totalPrice} грн`
                );
            } catch (error) {
                console.error('Не удалось уведомить покупателя:', error.message);
            }
        }

        res.json({ success: true, orderId });
    } catch (error) {
        console.error('Ошибка заказа:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

bot.action(/^status_(proc|done|canc)_(.+)$/, async (ctx) => {
    try {
        if (String(ctx.chat.id) !== String(ADMIN_CHAT_ID)) {
            return ctx.answerCbQuery('Доступно только администратору', {
                show_alert: true
            });
        }

        const action = ctx.match[1];
        const orderId = ctx.match[2];
        const status = action === 'done'
            ? 'Выполнено'
            : action === 'canc'
                ? 'Отменено'
                : 'В обработке';

        await sendToGoogleSheet({
            action: 'update_status',
            order_id: orderId,
            status
        });

        const oldText = ctx.callbackQuery.message.text || '';
        const newText = oldText.replace(/\n📌 Статус:.*$/, '');

        await ctx.editMessageText(newText + '\n📌 Статус: ' + status, {
            parse_mode: 'HTML',
            ...orderButtons(orderId)
        });

        await ctx.answerCbQuery('Статус: ' + status);
    } catch (error) {
        console.error('Ошибка статуса:', error);

        try {
            await ctx.answerCbQuery('Не удалось изменить статус', {
                show_alert: true
            });
        } catch (_) {}
    }
});

bot.action(/^cost_(.+)$/, async (ctx) => {
    if (String(ctx.chat.id) !== String(ADMIN_CHAT_ID)) {
        return ctx.answerCbQuery('Доступно только администратору', {
            show_alert: true
        });
    }

    waitingForCost.set(String(ctx.chat.id), ctx.match[1]);
    await ctx.answerCbQuery();

    await ctx.reply(
        `Введи общую себестоимость заказа #${ctx.match[1]} числом в гривнах.\n` +
        'Например: 350\nДля отмены напиши /cancelcost'
    );
});

bot.on('text', async (ctx, next) => {
    const chatId = String(ctx.chat.id);
    const orderId = waitingForCost.get(chatId);

    if (!orderId || chatId !== String(ADMIN_CHAT_ID)) {
        return next();
    }

    if (ctx.message.text === '/cancelcost') {
        waitingForCost.delete(chatId);
        return ctx.reply('Ввод себестоимости отменён.');
    }

    const cost = Number(ctx.message.text.replace(',', '.').trim());

    if (!Number.isFinite(cost) || cost < 0) {
        return ctx.reply(
            'Введи число, например 350. Для отмены напиши /cancelcost'
        );
    }

    try {
        await sendToGoogleSheet({
            action: 'update_cost',
            order_id: orderId,
            cost_price: cost
        });

        waitingForCost.delete(chatId);
        await ctx.reply(`✅ Себестоимость заказа #${orderId}: ${cost} грн`);
    } catch (error) {
        console.error('Ошибка себестоимости:', error);
        await ctx.reply('Не удалось сохранить себестоимость. Проверь Google Apps Script.');
    }
});

bot.start(async (ctx) => {
    await ctx.reply(
        '🐙 Вітаємо в Kraken Lab!\n\n' +
        '👥 Відгуки: @KRAKENOTZYVVL\n' +
        '💬 Менеджер: @telleportt\n\n' +
        '🛒 Переходьте до магазину за кнопкою нижче — обирайте товар, ' +
        'додавайте у кошик та оформлюйте замовлення в декілька кліків 👇',
        Markup.inlineKeyboard([
            [
                Markup.button.webApp('🛒 Відкрити магазин', WEB_APP_URL)
            ]
        ])
    );
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kraken Lab сервер запущен на порту ${PORT}`);
});

bot.launch()
    .then(() => console.log('Kraken Lab бот запущен'))
    .catch(error => console.error('Ошибка запуска бота:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));