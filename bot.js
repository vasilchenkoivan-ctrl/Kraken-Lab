const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const https = require('https');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || '8523927755:AAEyK603j5vEaoSzGgHREpVVAJa4a_uEx-o';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';

const bot = new Telegraf(BOT_TOKEN);
const orderStatuses = {};
const pendingCostInput = {}; // Временное хранилище для ввода себестоимости админом
const activeOrders = {};    // Хранение данных заказов для обновления

function sendToGoogleSheet(orderData) {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) return;

    try {
        const postData = JSON.stringify(orderData);
        const req = https.request(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                https.get(res.headers.location, () => {});
            }
        });
        req.on('error', () => {});
        req.write(postData);
        req.end();
    } catch (err) {}
}

bot.start((ctx) => {
    ctx.reply(
        "🐙 Вітаємо в Kraken Lab!\n\n" +
        "👥 Відгуки: @KRAKENOTZYVVL\n" +
        "💬 Менеджер: @telleportt\n\n" +
        "🛒 Переходьте до магазину за кнопкою нижче 👇",
        Markup.inlineKeyboard([
            [Markup.button.webApp("🛍 Відкрити магазин", "https://krakenlab.vercel.app")]
        ])
    );
});

app.post('/api/order', async (req, res) => {
    try {
        const { user, items, totalPrice, costPrice, deliveryType, address, phone } = req.body;
        const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        let customerMessage = `✅ **Дякуємо за замовлення в KrakenLab!**\n\n` +
            `📦 Ваше замовлення успішно оформлено та передано менеджеру.\n` +
            `🛒 **Товари:**\n${items}\n\n` +
            `🕐 Очікуйте на підтвердження — менеджер зв’яжеться з вами найближчим часом.\n\n` +
            `💚 **Дякуємо, що обираєте KrakenLab!**`;

        if (user && user.id) {
            await bot.telegram.sendMessage(user.id, customerMessage, { parse_mode: 'Markdown' }).catch(() => {});
        }

        const initialCost = costPrice || 0;

        const adminMessage = 
            `🛍 **НОВЕ ЗАМОВЛЕННЯ #${orderId}**\n\n` +
            `👤 **Покупець:** ${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})\n` +
            `🆔 **ID:** \`${user?.id || 'невідомо'}\`\n` +
            `📞 **Телефон:** ${phone || 'не вказано'}\n` +
            `🚚 **Спосіб:** ${deliveryType || 'не вказано'}\n` +
            `📍 **Деталі:** ${address || 'не вказано'}\n\n` +
            `📦 **Товари:**\n${items}\n\n` +
            `💰 **Сума:** ${totalPrice} грн\n` +
            `📦 **Собівартість:** ${initialCost} грн\n\n` +
            `📌 **Поточний статус:** В обробці`;

        orderStatuses[orderId] = 'В обробці';
        activeOrders[orderId] = {
            orderId,
            user,
            phone,
            items,
            totalPrice,
            costPrice: initialCost,
            status: 'В обробці'
        };

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Ввести собівартість', `cost_${orderId}`)],
            [
                Markup.button.callback('⏳ В обробці', `status_${orderId}_processing`),
                Markup.button.callback('✅ Виконано', `status_${orderId}_done`),
                Markup.button.callback('❌ Скасовано', `status_${orderId}_cancel`)
            ]
        ]);

        const sentMsg = await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { 
            parse_mode: 'Markdown',
            ...keyboard 
        });

        activeOrders[orderId].messageId = sentMsg.message_id;

        sendToGoogleSheet({
            order_id: orderId,
            customer_name: `${user?.first_name || 'Клієнт'} (@${user?.username || 'немає'})`,
            phone: phone || 'не вказано',
            items: items,
            total_price: totalPrice,
            cost_price: initialCost
        });

        return res.status(200).json({ ok: true, orderId: orderId });
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Обработка текстовых сообщений (ввод себестоимости админом)
bot.on('text', async (ctx) => {
    if (ctx.chat.id.toString() !== ADMIN_CHAT_ID.toString()) return;

    const adminId = ctx.from.id;
    if (pendingCostInput[adminId]) {
        const orderId = pendingCostInput[adminId];
        const newCost = parseFloat(ctx.message.text);

        if (isNaN(newCost)) {
            return ctx.reply("❌ Будь ласка, введи коректне число для собівартості (наприклад: 150)");
        }

        delete pendingCostInput[adminId];

        if (activeOrders[orderId]) {
            activeOrders[orderId].costPrice = newCost;
            const ord = activeOrders[orderId];

            const updatedMessage = 
                `🛍 **НОВЕ ЗАМОВЛЕННЯ #${ord.orderId}**\n\n` +
                `👤 **Покупець:** ${ord.user?.first_name || 'Клієнт'} (@${ord.user?.username || 'немає'})\n` +
                `🆔 **ID:** \`${ord.user?.id || 'невідомо'}\`\n` +
                `📞 **Телефон:** ${ord.phone || 'не вказано'}\n\n` +
                `📦 **Товари:**\n${ord.items}\n\n` +
                `💰 **Сума:** ${ord.totalPrice} грн\n` +
                `📦 **Собівартість:** ${newCost} грн ( оновлено ✅ )\n\n` +
                `📌 **Поточний статус:** ${ord.status}`;

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Змінити собівартість', `cost_${orderId}`)],
                [
                    Markup.button.callback(ord.status === 'В обробці' ? '⏳ [В обробці]' : '⏳ В обробці', `status_${orderId}_processing`),
                    Markup.button.callback(ord.status === 'Виконано' ? '✅ [Виконано]' : '✅ Виконано', `status_${orderId}_done`),
                    Markup.button.callback(ord.status === 'Скасовано' ? '❌ [Скасовано]' : '❌ Скасовано', `status_${orderId}_cancel`)
                ]
            ]);

            try {
                await bot.telegram.editMessageText(
                    ADMIN_CHAT_ID,
                    ord.messageId,
                    null,
                    updatedMessage,
                    { parse_mode: 'Markdown', ...keyboard }
                );
            } catch (e) {}

            // Отправляем обновленные данные в Google Таблицу
            sendToGoogleSheet({
                order_id: ord.orderId,
                customer_name: `${ord.user?.first_name || 'Клієнт'} (@${ord.user?.username || 'немає'})`,
                phone: ord.phone || 'не вказано',
                items: ord.items,
                total_price: ord.totalPrice,
                cost_price: newCost
            });

            await ctx.reply(`✅ Собівартість для #${orderId} оновлена (${newCost} грн) та відправлена в таблицю!`);
        }
    }
});

// Кнопка ввода себестоимости
bot.action(/cost_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    pendingCostInput[ctx.from.id] = orderId;
    await ctx.answerCbQuery();
    await ctx.reply(`✍️ Введи цифру (собівартість закупівлі) для замовлення #${orderId}:`);
});

bot.action(/status_(.+?)_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const action = ctx.match[2];

    let statusText = 'В обробці';
    if (action === 'done') statusText = 'Виконано';
    if (action === 'cancel') statusText = 'Скасовано';

    orderStatuses[orderId] = statusText;
    if (activeOrders[orderId]) activeOrders[orderId].status = statusText;

    await ctx.answerCbQuery(`Статус ${orderId}: ${statusText}`);

    const ord = activeOrders[orderId];
    if (!ord) return;

    const updatedMessage = 
        `🛍 **НОВЕ ЗАМОВЛЕННЯ #${ord.orderId}**\n\n` +
        `👤 **Покупець:** ${ord.user?.first_name || 'Клієнт'} (@${ord.user?.username || 'немає'})\n` +
        `🆔 **ID:** \`${ord.user?.id || 'невідомо'}\`\n` +
        `📞 **Телефон:** ${ord.phone || 'не вказано'}\n\n` +
        `📦 **Товари:**\n${ord.items}\n\n` +
        `💰 **Сума:** ${ord.totalPrice} грн\n` +
        `📦 **Собівартість:** ${ord.costPrice} грн\n\n` +
        `📌 **Поточний статус:** ${statusText}`;

    try {
        await ctx.editMessageText(updatedMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Змінити собівартість', `cost_${orderId}`)],
                [
                    Markup.button.callback(statusText === 'В обробці' ? '⏳ [В обробці]' : '⏳ В обробці', `status_${orderId}_processing`),
                    Markup.button.callback(statusText === 'Виконано' ? '✅ [Виконано]' : '✅ Виконано', `status_${orderId}_done`),
                    Markup.button.callback(statusText === 'Скасовано' ? '❌ [Скасовано]' : '❌ Скасовано', `status_${orderId}_cancel`)
                ]
            ])
        });
    } catch(e) {}
});

app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    bot.launch().then(() => {
        console.log("Bot started successfully!");
    });
});
