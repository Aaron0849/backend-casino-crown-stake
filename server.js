const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// Usa las variables que configuraremos en Render o colócalas directamente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8665762438:AAFbEge-A9RioFs2hDEz1zgqVBFWYH43ksA';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '6664386870';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const pendingTransactions = {};
const userBalances = {};

app.post('/api/report-payment', (req, res) => {
  const { username, amount, reference, method } = req.body;
  const transactionId = 'TX-' + Date.now();

  pendingTransactions[transactionId] = {
    username,
    amount: parseFloat(amount),
    reference,
    method,
    status: 'PENDING'
  };

  const message = `🚨 *NUEVO DEPÓSITO REPORTADO*\n\n` +
                  `👤 *Usuario:* ${username}\n` +
                  `💰 *Monto:* $${amount}\n` +
                  `📌 *Referencia:* \`${reference}\`\n` +
                  `🏦 *Método:* ${method}\n\n` +
                  `¿Deseas verificar y acreditar este pago?`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Aprobar', callback_data: `approve_${transactionId}` },
          { text: '❌ Rechazar', callback_data: `reject_${transactionId}` }
        ]
      ]
    }
  };

  bot.sendMessage(ADMIN_CHAT_ID, message, options);
  res.json({ success: true, message: 'Pago en proceso de verificación.' });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const [action, txId] = query.data.split('_');

  const tx = pendingTransactions[txId];

  if (!tx || tx.status !== 'PENDING') {
    bot.answerCallbackQuery(query.id, { text: 'Esta solicitud ya fue procesada.' });
    return;
  }

  if (action === 'approve') {
    tx.status = 'APPROVED';
    userBalances[tx.username] = (userBalances[tx.username] || 0) + tx.amount;

    bot.editMessageText(
      `${query.message.text}\n\n✅ *ESTADO: APROBADO ($${tx.amount} a ${tx.username})*`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: '¡Saldo acreditado!' });

  } else if (action === 'reject') {
    tx.status = 'REJECTED';

    bot.editMessageText(
      `${query.message.text}\n\n❌ *ESTADO: RECHAZADO*`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    );
    bot.answerCallbackQuery(query.id, { text: 'Solicitud rechazada.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});