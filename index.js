const { default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const http = require('http')
const fs = require('fs')
const { connectDB, Grupo } = require('./database')
const { handleMessage } = require('./handlers/mensajes')
const { handleBienvenida } = require('./handlers/bienvenida')

const OWNER_RAW = (process.env.OWNER_NUMBER || '').replace('@s.whatsapp.net', '').replace(/\D/g, '').trim()
const OWNER = OWNER_RAW + '@s.whatsapp.net'

let configurando = false
let esperandoNombre = false
let esperandoGenero = false
let sock
let pairingCodeSolicitado = false
let codigoActual = null
let estadoConexion = 'iniciando'

// Servidor HTTP con página para ver el código
const server = http.createServer((req, res) => {
  if (req.url === '/code' || req.url === '/codigo') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Zyon - Código</title>
  <meta http-equiv="refresh" content="10">
  <style>
    body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { background: #16213e; border-radius: 16px; padding: 40px; text-align: center; max-width: 400px; width: 90%; }
    h1 { color: #25D366; margin-bottom: 8px; }
    .estado { font-size: 14px; color: #aaa; margin-bottom: 24px; }
    .code { font-size: 42px; font-weight: bold; letter-spacing: 8px; color: #25D366; background: #0f3460; padding: 20px 30px; border-radius: 12px; margin: 20px 0; font-family: monospace; }
    .instruccion { font-size: 14px; color: #ccc; line-height: 1.6; }
    .reload { margin-top: 20px; font-size: 12px; color: #666; }
    .conectado { color: #25D366; font-size: 24px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🤖 Bot Zyon</h1>
    <div class="estado">Estado: <b>${estadoConexion}</b></div>
    ${estadoConexion === 'conectado' 
      ? '<div class="conectado">✅ ¡Bot conectado a WhatsApp!</div>'
      : codigoActual 
        ? `<div class="code">${codigoActual}</div>
           <div class="instruccion">
             📱 Abre WhatsApp<br>
             → Ajustes → Dispositivos vinculados<br>
             → Vincular con número de teléfono<br>
             → Ingresa el código de arriba<br><br>
             ⏱️ El código expira en ~60 segundos
           </div>`
        : '<div class="instruccion">⏳ Generando código, espera unos segundos...</div>'
    }
    <div class="reload">Esta página se actualiza automáticamente cada 10s</div>
  </div>
</body>
</html>`
    res.end(html)
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅ — Ve a /code para ver el código de vinculación')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo')
  console.log('🌐 Visita /code en tu URL de Render para ver el código de vinculación')
})

function limpiarSesion() {
  try {
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true })
      console.log('🗑️ Sesión eliminada')
    }
  } catch (e) {
    console.error('Error eliminando sesión:', e.message)
  }
}

async function configurarBot() {
  const grupo = await Grupo.findOne({ id: 'config' })
  if (grupo?.configurado) return
  setTimeout(async () => {
    await sock.sendMessage(OWNER, {
      text: `👋 Hola! Soy tu nuevo bot!\n\n¿Cómo quieres que me llame?`
    })
    esperandoNombre = true
    configurando = true
  }, 3000)
}

async function startBot() {
  estadoConexion = 'iniciando'
  codigoActual = null

  await connectDB()
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome')
  })

  sock.ev.on('creds.update', saveCreds)

  if (!sock.authState.creds.registered && !pairingCodeSolicitado) {
    pairingCodeSolicitado = true
    estadoConexion = 'esperando código'
    await new Promise(r => setTimeout(r, 3000))
    console.log('📞 Número:', OWNER_RAW)
    try {
      const code = await sock.requestPairingCode(OWNER_RAW)
      codigoActual = code?.replace(/(.{4})(?=.)/g, '$1-') || code
      estadoConexion = 'esperando vinculación'
      console.log('\n============================')
      console.log(`🔑 CODIGO: ${codigoActual}`)
      console.log('============================')
      console.log(`🌐 También visible en: https://bot-zyon.onrender.com/code\n`)
    } catch (err) {
      console.error('❌ Error al pedir código:', err.message)
      pairingCodeSolicitado = false
      codigoActual = null
      limpiarSesion()
      setTimeout(startBot, 5000)
      return
    }
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      estadoConexion = 'desconectado'
      codigoActual = null
      console.log('🔴 Desconectado, código:', statusCode)
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
        limpiarSesion()
      }
      pairingCodeSolicitado = false
      setTimeout(startBot, 3000)
    }
    if (connection === 'open') {
      estadoConexion = 'conectado'
      codigoActual = null
      pairingCodeSolicitado = false
      console.log('✅ ¡Zyon conectado a WhatsApp!')
      await configurarBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    if (msg.key.fromMe) return
    const from = msg.key.remoteJid
    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

    if (configurando && from === OWNER) {
      if (esperandoNombre) {
        const nombre = texto.trim()
        esperandoNombre = false
        esperandoGenero = true
        await sock.sendMessage(OWNER, {
          text: `✅ Me llamaré *${nombre}*\n\n¿Qué género prefieres?\n1️⃣ Masculino\n2️⃣ Femenino`
        })
        let config = await Grupo.findOne({ id: 'config' })
        if (!config) config = new Grupo({ id: 'config' })
        config.botNombre = nombre
        await config.save()
        return
      }
      if (esperandoGenero) {
        const config = await Grupo.findOne({ id: 'config' })
        let genero = 'masculino'
        if (texto === '2' || texto.toLowerCase().includes('femen')) genero = 'femenino'
        config.botGenero = genero
        config.configurado = true
        await config.save()
        esperandoGenero = false
        configurando = false
        process.env.BOT_NAME = config.botNombre
        process.env.BOT_GENDER = genero
        await sock.sendMessage(OWNER, {
          text: `🎉 Todo listo!\n\n🤖 Nombre: *${config.botNombre}*\n👤 Género: *${genero}*\n\n¡Agrégame al grupo! 🚀`
        })
        return
      }
    }
    await handleMessage(sock, msg)
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    await handleBienvenida(sock, id, participants, action)
  })
}

startBot()
