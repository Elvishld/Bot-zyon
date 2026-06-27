const { default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const { connectDB } = require('./database')
const { handleMessage } = require('./handlers/mensajes')
const { handleBienvenida } = require('./handlers/bienvenida')

async function startBot() {
  await connectDB()
  
  const { state, saveCreds } = 
    await useMultiFileAuthState('./auth_info')
  const { version } = 
    await fetchLatestBaileysVersion()
  
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
    browser: ['Zyon', 'Chrome', '1.0.0']
  })
  
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', 
    ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error
        ?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) {
        startBot()
      }
    }
    if (connection === 'open') {
      console.log('✅ Zyon conectado!')
    }
  })
  
  sock.ev.on('messages.upsert', 
    async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    await handleMessage(sock, msg)
  })
  
  sock.ev.on('group-participants.update', 
    async ({ id, participants, action }) => {
    await handleBienvenida(
      sock, id, participants, action)
  })
}

startBot()
