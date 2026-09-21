const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// Token de tu bot y tu Chat ID de Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8665762438:AAFbEge-A9RioFs2hDEz1zgqVBFWYH43ksA';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '6664386870';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Almacén de saldos en memoria (se relaciona por nombre de usuario)
const userBalances = {
  'google_user_252': 0
};

// 1. ENDPOINT: Recibir reporte de pago desde la Web
app.post('/api/report-payment', (req, res) => {
  const { username, amount, reference, method } = req.body;

  if (!username || !amount || !reference) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
  }

  // Crear botones de aprobación con los datos empaquetados
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { 
            text: '✅ Aprobar', 
            callback_data: `approve:${username}:${amount}` 
          },
          { 
            text: '❌ Rechazar', 
            callback_data: `reject:${username}:${amount}` 
          }
        ]
      ]
    }
  };

  const message = `🚨 *NUEVO DEPÓSITO REPORTADO*\n\n` +
                  `👤 *Usuario:* \`${username}\`\n` +
                  `💰 *Monto:* $${amount}\n` +
                  `📌 *Referencia:* \`${reference}\`\n` +
                  `🏦 *Método:* ${method || 'Pago Móvil'}\n\n` +
                  `¿Deseas verificar y acreditar este pago?`;

  bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown', ...opts });

  res.json({ success: true, message: 'Reporte recibido y enviado a revisión' });
});


// 2. ESCUCHADOR DE TELEGRAM: Se ejecuta al presionar "Aprobar" o "Rechazar"
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data; // Formato: "approve:google_user_252:1000"

  const [action, username, amountStr] = data.split(':');
  const amount = parseFloat(amountStr);

  if (action === 'approve') {
    // Inicializar el saldo del usuario si es la primera vez
    if (!userBalances[username]) {
      userBalances[username] = 0;
    }

    // ⭐ AQUÍ SE ACREDIITA EL SALDO EN MEMORIA ⭐
    userBalances[username] += amount;

    const newBalance = userBalances[username];

    // Actualizar mensaje en Telegram
    bot.editMessageText(
      `✅ *ESTADO: APROBADO*\n\nSe acreditaron *$${amount}* al usuario \`${username}\`.\nNuevo saldo total: *$${newBalance}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    );

    bot.answerCallbackQuery(query.id, { text: `Pago de $${amount} aprobado para ${username}` });

  } else if (action === 'reject') {
    // Editar mensaje en Telegram para rechazar
    bot.editMessageText(
      `❌ *ESTADO: RECHAZADO*\n\nEl pago del usuario \`${username}\` por *$${amount}* fue rechazado.`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    );

    bot.answerCallbackQuery(query.id, { text: 'Pago rechazado' });
  }
});


// 3. ENDPOINT: Consultar el saldo del usuario desde la Web
app.get('/api/balance/:username', (req, res) => {
  const { username } = req.params;
  const balance = userBalances[username] || 0;
  res.json({ username, balance });
});


// Servidor en marcha
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
