const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://google.com';

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const adminState = {};

// Главные кнопки для клиентов
const userKeyboard = Markup.keyboard([
    [Markup.button.webApp('🛍 Открыть магазин', WEBAPP_URL)],
    ['🚀 Статус заказа', '👨‍💻 Менеджер']
]).resize();

// Главные кнопки для Админа
const adminKeyboard = Markup.keyboard([
    ['➕ Добавить товар', '📦 Список товаров'],
    ['📊 Заказы', '⬅️ Выйти из админки']
]).resize();

// --- КОМАНДЫ ---

bot.start((ctx) => {
    ctx.reply(
        `Добро пожаловать в **Kraken LAB**! 🧪\n\nИспользуйте кнопки ниже для перехода в магазин или проверки заказа.`,
        userKeyboard
    );
});

bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('❌ У вас нет прав администратора.');
    }
    ctx.reply('👑 **Панель администратора Kraken LAB**', adminKeyboard);
});

// --- КНОПКИ АДМИНКИ ---

bot.hears('➕ Добавить товар', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'TITLE' };
    ctx.reply('Введите название товара:');
});

bot.hears('📦 Список товаров', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const { data: products, error } = await supabase.from('products').select('*').order('id', { ascending: false });
    
    if (error || !products.length) {
        return ctx.reply('В базе пока нет товаров.');
    }

    let text = '📦 **Список товаров:**\n\n';
    products.forEach((p) => {
        text += `🔹 **ID ${p.id}**: ${p.title} — ${p.price} грн\n`;
    });
    ctx.reply(text);
});

bot.hears('📊 Заказы', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const { data: orders, error } = await supabase.from('orders').select('*').order('id', { ascending: false }).limit(10);

    if (error || !orders.length) {
        return ctx.reply('Заказов пока нет.');
    }

    for (const order of orders) {
        const buttons = Markup.inlineKeyboard([
            [
                Markup.button.callback('⏳ В обработке', `status_${order.id}_В обработке`),
                Markup.button.callback('📦 Готовится', `status_${order.id}_Готовится к выдаче`)
            ],
            [
                Markup.button.callback('🚚 Отправлен', `status_${order.id}_Отправлен`),
                Markup.button.callback('✅ Выполнен', `status_${order.id}_Выполнен`)
            ]
        ]);

        await ctx.reply(
            `🛒 **Заказ #${order.id}**\n` +
            `Клиент: @${order.user_name || 'id' + order.user_id}\n` +
            `Сумма: ${order.total_price} грн\n` +
            `Статус: **${order.status}**`,
            buttons
        );
    }
});

bot.hears('🚀 Статус заказа', async (ctx) => {
    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', ctx.from.id)
        .order('id', { ascending: false })
        .limit(3);

    if (!orders || !orders.length) {
        return ctx.reply('У вас пока нет активных заказов.');
    }

    let msg = '📋 **Ваши заказы:**\n\n';
    orders.forEach((o) => {
        msg += `📦 **Заказ #${o.id}** на сумму ${o.total_price} грн\nСтатус: **${o.status}**\n\n`;
    });
    ctx.reply(msg);
});

bot.hears('👨‍💻 Менеджер', (ctx) => {
    ctx.reply('По всем вопросам: @nnxray044');
});

bot.hears('⬅️ Выйти из админки', (ctx) => {
    ctx.reply('Вышли из админки.', userKeyboard);
});

// --- ПОШАГОВЫЙ ВВОД ТОВАРА ---

bot.on('text', async (ctx, next) => {
    const state = adminState[ctx.from.id];
    if (!state) return next();

    if (state.step === 'TITLE') {
        state.title = ctx.message.text;
        state.step = 'DESCRIPTION';
        return ctx.reply('Введите описание товара:');
    }

    if (state.step === 'DESCRIPTION') {
        state.description = ctx.message.text;
        state.step = 'PRICE';
        return ctx.reply('Введите цену товара (только число):');
    }

    if (state.step === 'PRICE') {
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) return ctx.reply('Введите число для цены.');
        state.price = price;
        state.step = 'PHOTO';
        return ctx.reply('📷 Отправьте ФОТО товара прямо в чат (картинкой из галереи или ссылкой):');
    }

    if (state.step === 'PHOTO') {
        state.image_url = ctx.message.text;
        await saveProduct(ctx);
    }
});

bot.on('photo', async (ctx) => {
    const state = adminState[ctx.from.id];
    if (state && state.step === 'PHOTO') {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        state.image_url = fileLink.href;
        await saveProduct(ctx);
    }
});

async function saveProduct(ctx) {
    const state = adminState[ctx.from.id];
    ctx.reply('⌛ Сохраняю товар...');

    const { error } = await supabase.from('products').insert([
        {
            title: state.title,
            description: state.description,
            price: state.price,
            image_url: state.image_url
        }
    ]);

    delete adminState[ctx.from.id];

    if (error) {
        return ctx.reply(`❌ Ошибка: ${error.message}`);
    }

    ctx.reply('✅ Товар успешно сохранён!', adminKeyboard);
}

// --- ОБРАБОТКА ИЗМЕНЕНИЯ СТАТУСА ---

bot.action(/^status_(\d+)_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const orderId = ctx.match[1];
    const newStatus = ctx.match[2];

    const { data: order, error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .select()
        .single();

    if (error) return ctx.answerCbQuery('Ошибка обновления!');

    ctx.answerCbQuery(`Статус изменен на "${newStatus}"`);
    ctx.editMessageText(
        `🛒 **Заказ #${order.id}**\n` +
        `Клиент: @${order.user_name || 'id' + order.user_id}\n` +
        `Сумма: ${order.total_price} грн\n` +
        `Статус: **${order.status}**`
    );

    try {
        await bot.telegram.sendMessage(
            order.user_id,
            `🔔 **Статус заказа #${order.id} изменён на:**\n👉 ${newStatus}`
        );
    } catch (e) {}
});

const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Kraken LAB Server Active'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
    bot.launch().then(() => {
        console.log('Kraken LAB Bot успешно запущен!');
    });
});
