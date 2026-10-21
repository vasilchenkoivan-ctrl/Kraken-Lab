const express = require('express');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');
const app = express();
app.use(express.json({ limit: '100kb' }));
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const MINI_APP_URL = 'https://krakenlab.vercel.app/';
if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('ERROR: BOT_TOKEN або ADMIN_CHAT_ID не задані в Render.');
    process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);
// Проверка подлинности Telegram Mini App
function verifyTelegramData(initData) {
    if (!initData || typeof initData !== 'string') {
        return null;
    }
    try {
        const params = new URLSearchParams(initData);
        const receivedHash = params.get('hash');
        if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
            return null;
        }
        const authDate = Number(params.get('auth_date'));
        if (
            !Number.isFinite(authDate) ||
            authDate > Math.floor(Date.now() / 1000) + 30 ||
            Math.floor(Date.now() / 1000) - authDate > 86400
        ) {
            return null;
        }
        const dataCheckString = [...params.entries()]
            .filter(([key]) => key !== 'hash')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest();
        const expectedHash = Buffer.from(receivedHash, 'hex');
        if (
            calculatedHash.length !== expectedHash.length ||
            !crypto.timingSafeEqual(calculatedHash, expectedHash)
        ) {
            return null;
        }
        const userJson = params.get('user');
        if (!userJson) return null;
        const user = JSON.parse(userJson);
        if (!user.id || !Number.isSafeInteger(user.id)) {
            return null;
        }
        return user;
    } catch (error) {
        console.error('Помилка перевірки Telegram:', error.message);
        return null;
    }
}
// Команда /start
bot.start(async (ctx) => {
    try {
        await ctx.reply(
            'Вітаємо в 🐙 Kraken Lab!\n\n' +
            '🛍 Відгуки клієнтів: @KRAKENOTZYVY\n' +
            '👨‍💻 Зв’язок з менеджером: @telleportt\n\n' +
            'Натискайте кнопку нижче, щоб відкрити наш магазин.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: '🛍 Відкрити магазин',
                            web_app: { url: MINI_APP_URL }
                        }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Помилка /start:', error);
    }
});
// Получение заказа из Mini App
app.post('/api/orders', async (req, res) => {
    try {
        const user = verifyTelegramData(req.body.initData);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Не вдалося перевірити Telegram.'
            });
        }
        const {
            name,
            phone,
            deliveryType,
            city,
            department,
            items
        } = req.body;
        if (
            typeof name !== 'string' ||
            !name.trim() ||
            name.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Вкажіть ім'я."
            });
        }
        if (
            typeof phone !== 'string' ||
            !/^\+?[0-9 ()-]{9,20}$/.test(phone)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Перевірте номер телефону.'
            });
        }
        if (!['NovaPoshta', 'Pickup'].includes(deliveryType)) {
            return res.status(400).json({
                success: false,
                message: 'Невідомий спосіб доставки.'
            });
        }
        if (
            deliveryType === 'NovaPoshta' &&
            (
                typeof city !== 'string' ||
                !city.trim() ||
                typeof department !== 'string' ||
                !department.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: 'Вкажіть місто та відділення.'
            });
        }
        if (
            !Array.isArray(items) ||
            items.length === 0 ||
            items.length > 50
        ) {
            return res.status(400).json({
                success: false,
                message: 'Кошик порожній або містить забагато позицій.'
            });
        }
        let total = 0;
        const itemLines = [];
        for (const item of items) {
            const price = Number(item.price);
            const count = Number(item.count);
            if (
                typeof item.title !== 'string' ||
                item.title.length > 200 ||
                !Number.isFinite(price) ||
                price < 0 ||
                !Number.isInteger(count) ||
                count < 1 ||
                count > 100
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилка в даних товару.'
                });
            }
            const lineTotal = price * count;
            if (!Number.isSafeInteger(lineTotal) ||
                !Number.isSafeInteger(total + lineTotal)) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилка підрахунку суми.'
                });
            }
            total += lineTotal;
            const flavor = typeof item.flavor === 'string'
                ? item.flavor.slice(0, 100)
                : '';
            itemLines.push(
                `${itemLines.length + 1}. ${item.title}` +
                (flavor ? ` (${flavor})` : '') +
                ` — ${count} шт. × ${price} грн = ${lineTotal} грн`
            );
        }
        const orderId = crypto.randomUUID();
        const deliveryText = deliveryType === 'Pickup'
            ? 'Самовивіз (Київ)'
            : `Нова Пошта\nМісто: ${city.trim()}\nВідділення: ${department.trim()}`;
        const username = user.username
            ? `@${user.username}`
            : 'немає';
        const adminMessage =
            `📥 НОВЕ ЗАМОВЛЕННЯ KRAKEN LAB\n\n` +
            `🆔 Замовлення: ${orderId}\n` +
            `👤 Ім'я: ${name.trim()}\n` +
            `📞 Телефон: ${phone.trim()}\n` +
            `👤 Telegram: ${username}\n` +
            `🆔 Telegram ID: ${user.id}\n\n` +
            `🚚 Доставка: ${deliveryText}\n\n` +
            `📋 Товари:\n${itemLines.join('\n')}\n\n` +
            `💰 Разом: ${total} грн`;
        // Сначала отправляем уведомление администратору
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID,
            adminMessage
        );
        // Затем подтверждаем заказ клиенту
        await bot.telegram.sendMessage(
            String(user.id),
            `✅ Дякуємо, ${name.trim()}!\n\n` +
            `Ваше замовлення прийнято магазином Kraken Lab 🐙\n` +
            `🆔 Номер замовлення: ${orderId}\n` +
            `💰 Сума: ${total} грн\n\n` +
            `Менеджер зв'яжеться з вами для підтвердження замовлення.`
        );
        console.log(`Заказ ${orderId} отправлен администратору и клиенту.`);
        return res.json({
            success: true,
            orderId
        });
    } catch (error) {
        console.error('Ошибка обработки заказа:', error.message);
        return res.status(500).json({
            success: false,
            message:
                'Не вдалося завершити оформлення. Спробуйте ще раз.'
        });
    }
});
app.get('/', (req, res) => {
    res.send('Kraken Lab Bot is running!');
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
bot.launch()
  .then(() => console.log('Telegram bot started'))
  .catch((error) => console.error('Bot launch error:', error));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
    }
}
startServer();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));