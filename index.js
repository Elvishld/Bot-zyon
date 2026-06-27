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
let codigoActual = null
let estadoConexion = 'iniciando'
let dbConectada = false

const server = http.createServer((req, res) => {
  if (req.url === '/code' || req.url === '/codigo') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Zyon - Código</title>
  <meta http-equiv="refresh" content="5">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#1a1a2e;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{background:#16213e;border-radius:16px;padding:40px 30px;text-align:center;max-width:440px;width:95%}
    h1{color:#25D366;margin-bottom:6px;font-size:26px}
    .estado{font-size:13px;color:#aaa;margin-bottom:24px}
    .code{font-size:48px;font-weight:bold;letter-spacing:10px;color:#25D366;background:#0a1628;padding:22px 28px;border-radius:14px;margin:20px 0;font-family:monospace;border:2px solid #25D366}
    .instruccion{font-size:14px;color:#ccc;line-height:2;margin-top:16px}
    .instruccion b{color:white}
    .conectado{color:#25D366;font-size:26px;margin:20px 0}
    .esperando{color:#aaa;font-size:15px;margin:20px 0;padding:20px}
    .refresh{margin-top:20px;font-size:11px;color:#444}
    .numero{font-size:12px;color:#555;margin-top:8px}
  </style>
</head>
<body>
<div class="box">
  <h1>🤖 Bot Zyon</h1>
  <div class="estado">Estado: <b style="color:${estadoConexion === 'conectado' ? '#25D366' : '#f0a500'}">${estadoConexion}</b></div>
  ${estadoConexion === 'conectado'
    ? '<div class="conectado">✅ ¡Bot conectado a WhatsApp!</div><p style="color:#aaa;font-size:14px">El bot está activo y funcionando.</p>'
    : codigoActual
      ? `<div class="code">${codigoActual}</div>
         <div class="instruccion">
           📱 Abre <b>WhatsApp Business</b><br>
           → <b>Ajustes</b> (⚙️)<br>
           → <b>Dispositivos vinculados</b><br>
           → <b>Vincular un dispositivo</b><br>
           → <b>Vincular con número de teléfono</b><br>
           → Ingresa el código de arriba<br><br>
           ⏱️ <b>El código expira en ~60 segundos</b><br>
           (la página genera uno nuevo automáticamente)
         </div>
         <div class="numero">Número: +${OWNER_RAW}</div>`
      : '<div class="esperando">⏳ Generando código de vinculación...<br><small>Espera unos segundos</small></div>'
  }
  <div class="refresh">Esta página se actualiza cada 5 segundos</div>
</div>
</body>
</html>`)
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅ | Código de vinculación: /code')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo')
  console.log(`🌐 Código en: https://bot-zyon.onrender.com/code`)
})

function limpiarSesion() {
  try {
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true })
      console.log('🗑️ Sesión eliminada')
    }
  } catch (e) {}
}

async function configurarBot() {
  try {
    const grupo = await Grupo.findOne({ id: 'config' })
    if (grupo?.configurado) return
    setTimeout(async () => {
      await sock.sendMessage(OWNER, {
        text: `👋 Hola! Soy tu nuevo bot!\n\n¿Cómo quieres que me llame?`
      })
      esperandoNombre = true
      configurando = true
    }, 3000)
  } catch (e) {}
}

async function startBot() {
  estadoConexion = 'iniciando'
  codigoActual = null

  if (!dbConectada) {
    await connectDB()
    dbConectada = true
  }

  // Limpiar sesión anterior para garantizar código fresco
  limpiarSesion()

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

  // Pedir código de vinculación inmediatamente
  estadoConexion = 'generando código'
  await new Promise(r => setTimeout(r, 4000))

  try {
    const code = await sock.requestPairingCode(OWNER_RAW)
    codigoActual = code?.replace(/(.{4})(?=.)/g, '$1-') || code
    estadoConexion = 'esperando código'
    console.log('\n================================')
    console.log(`🔑 CÓDIGO: ${codigoActual}`)
    console.log('================================')
    console.log(`🌐 También en: https://bot-zyon.onrender.com/code\n`)
  } catch (err) {
    console.error('❌ Error al generar código:', err.message)
    codigoActual = null
    estadoConexion = 'error - reiniciando'
    setTimeout(startBot, 5000)
    return
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      console.log('🔴 Desconectado, código:', statusCode)
      codigoActual = null

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('🚪 Sesión cerrada. Reiniciando...')
      }

      estadoConexion = 'reconectando'
      setTimeout(startBot, 4000)
    }

    if (connection === 'open') {
      estadoConexion = 'conectado'
      codigoActual = null
      console.log('✅ ¡Zyon conectado a WhatsApp Business!')
      await configurarBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    if (msg.key.fromMe && msg.key.remoteJid !== OWNER) return

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
