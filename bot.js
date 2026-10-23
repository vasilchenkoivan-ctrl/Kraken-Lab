const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилище сессий для ожидания ввода себестоимости
const userSessions = {};

// 1. ФУНКЦИЯ ОТПРАВКИ УВЕДОМЛЕНИЯ О ЗАКАЗЕ В АДМИН-ЧАТ
async function sendAdminOrderNotification(adminChatId, orderData) {
  const messageText = 
    `🛍️ **НОВЕ ЗАМОВЛЕННЯ #${orderData.order_id}**\n\n` +
    `👤 **Покупець:** ${orderData.customer_name}\n` +
    `📞 **Телефон:** ${orderData.phone || '-'}\n` +
    `🚚 **Спосіб:** ${orderData.delivery_method || '-'}\n\n` +
    `📦 **Товари:**\n${orderData.items}\n\n` +
    `💰 **Сума:** ${orderData.total_price} грн\n` +
    `📌 **Поточний статус:** В обробці`;

  // Клавиатура с 4 кнопками (статусы + изменить себестоимость)
  const adminKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⏳ В обробці', `status_processing_${orderData.order_id}`),
      Markup.button.callback('✅ Виконано', `status_completed_${orderData.order_id}`),
      Markup.button.callback('❌ Скасовано', `status_cancelled_${orderData.order_id}`)
    ],
    [
      Markup.button.callback('✏️ Собівартість', `edit_cost_${orderData.order_id}`)
    ]
  ]);

  await bot.telegram.sendMessage(adminChatId, messageText, { 
    parse_mode: 'Markdown', 
    ...adminKeyboard 
  });
}

// 2. ОБРАБОТКА НАЖАТИЯ НА КНОПКУ "✏️ Собівартість"
bot.action(/edit_cost_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  
  // Запоминаем, что админ сейчас будет вводить себестоимость для этого заказа
  userSessions[ctx.from.id] = { 
    action: 'awaiting_cost', 
    orderId: orderId 
  };

  await ctx.reply(`Введіть нову собівартість (грн) для замовлення #${orderId}:`);
  await ctx.answerCbQuery();
});

// 3. ПЕРЕХВАТ ТЕКСТОВОГО СООБЩЕНИЯ С СУММОЙ
bot.on('text', async (ctx, next) => {
  const session = userSessions[ctx.from.id];
  
  if (session && session.action === 'awaiting_cost') {
    const cost = parseFloat(ctx.message.text.replace(',', '.'));

    if (isNaN(cost)) {
      return ctx.reply('❌ Будь ласка, введіть коректне число (наприклад, 210 или 180.50).');
    }

    // Сбрасываем сессию ожидания
    delete userSessions[ctx.from.id];

    try {
      // Отправляем обновленную себестоимость в Google Таблицу
      await axios.post(process.env.GOOGLE_SCRIPT_URL, {
        action: 'update_cost',
        order_id: session.orderId,
        cost_price: cost
      });

      await ctx.reply(`✅ Собівартість для замовлення #${session.orderId} оновлена: ${cost} грн!\nТаблиця успішно перерахована.`);
    } catch (err) {
      await ctx.reply(`❌ Помилка оновлення в таблиці: ${err.message}`);
    }
    return;
  }

  return next();
});

// Экспорт или запуск бота
module.exports = { bot, sendAdminOrderNotification };
