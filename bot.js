const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Ссылка на твой Mini App на Vercel
const WEB_APP_URL = 'https://krakenlab.vercel.app'; 

bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name || 'друг'}! 👋\n\nДобро пожаловать в Kraken LAB! Нажми кнопку ниже, чтобы открыть магазин.`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('🛒 Открыть Магазин', WEB_APP_URL)]
    ])
  );
});

bot.launch().then(() => {
  console.log('Kraken LAB Bot успешно запущен!');
}).catch((err) => {
  console.error('Ошибка запуска бота:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
