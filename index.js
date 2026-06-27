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
let tiempoExpira = null
let dbConectada = false
let yaConectado = false
let reiniciando = false

const server = http.createServer((req, res) => {
  if (req.url === '/code' || req.url === '/codigo') {
    const ahora = Date.now()
    const segundosRestantes = tiempoExpira ? Math.max(0, Math.round((tiempoExpira - ahora) / 1000)) : null

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Zyon - Código</title>
  <meta http-equiv="refresh" content="3">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#111827;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .box{background:#1f2937;border-radius:20px;padding:36px 28px;text-align:center;max-width:440px;width:100%}
    h1{color:#25D366;margin-bottom:4px;font-size:24px}
    .sub{font-size:13px;color:#6b7280;margin-bottom:24px}
    .code{font-size:52px;font-weight:900;letter-spacing:12px;color:#25D366;background:#0d1117;padding:24px 20px;border-radius:16px;margin:16px 0;font-family:monospace;border:2px solid #25D366;word-break:break-all}
    .timer{font-size:13px;margin:8px 0 20px;padding:8px 16px;border-radius:20px;display:inline-block}
    .timer.ok{background:#14532d;color:#86efac}
    .timer.warn{background:#713f12;color:#fde68a}
    .timer.danger{background:#7f1d1d;color:#fca5a5}
    .steps{text-align:left;background:#111827;border-radius:12px;padding:20px;font-size:14px;line-height:2.2;margin-top:8px}
    .steps .step{display:flex;align-items:flex-start;gap:10px}
    .steps .num{background:#25D366;color:black;border-radius:50%;width:22px;height:22px;min-width:22px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;margin-top:3px}
    .conectado{color:#25D366;font-size:24px;margin:20px 0}
    .esperando{color:#9ca3af;margin:20px 0;font-size:15px}
    .refresh{margin-top:20px;font-size:11px;color:#374151}
  </style>
</head>
<body>
<div class="box">
  <h1>🤖 Bot Zyon</h1>
  <div class="sub">Estado: <b style="color:${estadoConexion === 'conectado' ? '#25D366' : '#f59e0b'}">${estadoConexion}</b></div>

  ${estadoConexion === 'conectado'
    ? `<div class="conectado">✅ ¡Bot conectado!</div>
       <p style="color:#6b7280;font-size:14px">El bot está activo y respondiendo.</p>`
    : codigoActual
      ? `<div class="code">${codigoActual}</div>
         ${segundosRestantes !== null
           ? `<div class="timer ${segundosRestantes > 30 ? 'ok' : segundosRestantes > 10 ? 'warn' : 'danger'}">
               ⏱️ Expira en <b>${segundosRestantes}</b> segundos
             </div>`
           : ''
         }
         <div class="steps">
           <div class="step"><div class="num">1</div><div>Abre <b>WhatsApp Business</b></div></div>
           <div class="step"><div class="num">2</div><div>Ve a <b>Ajustes → Dispositivos vinculados</b></div></div>
           <div class="step"><div class="num">3</div><div>Toca <b>"Vincular un dispositivo"</b></div></div>
           <div class="step"><div class="num">4</div><div>Toca <b>"Vincular con número de teléfono"</b> (abajo)</div></div>
           <div class="step"><div class="num">5</div><div>Ingresa el código de arriba: <b>${codigoActual}</b></div></div>
         </div>`
      : `<div class="esperando">⏳ Generando código...<br><small style="color:#4b5563">Espera unos segundos y recarga</small></div>`
  }
  <div class="refresh">🔄 Página se actualiza cada 3 segundos</div>
</div>
</body>
</html>`)
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅ | Código: /code')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo — Código en /code')
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
      await sock.sendMessage(OWNER, { text: `👋 Hola! Soy tu nuevo bot!\n\n¿Cómo quieres que me llame?` })
      esperandoNombre = true
      configurando = true
    }, 3000)
  } catch (e) {}
}

async function startBot() {
  if (reiniciando) return
  reiniciando = true

  estadoConexion = 'iniciando'
  codigoActual = null
  tiempoExpira = null
  yaConectado = false

  if (!dbConectada) {
    await connectDB()
    dbConectada = true
  }

  // Limpiar solo si no había sesión válida
  if (!fs.existsSync('./auth_info/creds.json')) {
    limpiarSesion()
  }

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

  // Pedir código si no está registrado
  if (!sock.authState.creds.registered) {
    estadoConexion = 'generando código'
    await new Promise(r => setTimeout(r, 2000))
    try {
      const rawCode = await sock.requestPairingCode(OWNER_RAW)
      const cleanCode = (rawCode || '').replace(/-/g, '')
      codigoActual = cleanCode.replace(/(.{4})(?=.)/g, '$1-')
      tiempoExpira = Date.now() + 55000 // 55 segundos
      estadoConexion = 'esperando código'

      console.log('\n==============================')
      console.log(`🔑 CÓDIGO: ${codigoActual}`)
      console.log(`🌐 Ver en: https://bot-zyon.onrender.com/code`)
      console.log('==============================\n')

      // Después de 55 segundos sin conectar, reiniciar
      setTimeout(() => {
        if (!yaConectado) {
          console.log('⏰ Código expirado, generando nuevo...')
          reiniciando = false
          limpiarSesion()
          startBot()
        }
      }, 57000)
    } catch (err) {
      console.error('❌ Error al generar código:', err.message)
      reiniciando = false
      setTimeout(startBot, 6000)
      return
    }
  }

  reiniciando = false

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      console.log('🔴 Desconectado, código:', statusCode)
      codigoActual = null
      tiempoExpira = null

      if (statusCode === DisconnectReason.loggedOut) {
        limpiarSesion()
        estadoConexion = 'sesión cerrada'
        setTimeout(() => { reiniciando = false; startBot() }, 3000)
      } else if (yaConectado) {
        estadoConexion = 'reconectando'
        setTimeout(() => { reiniciando = false; startBot() }, 4000)
      }
      // Si nunca se conectó (código no ingresado a tiempo), el timer de 57s maneja el reinicio
    }

    if (connection === 'open') {
      yaConectado = true
      codigoActual = null
      tiempoExpira = null
      estadoConexion = 'conectado'
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
        await sock.sendMessage(OWNER, { text: `✅ Me llamaré *${nombre}*\n\n¿Qué género prefieres?\n1️⃣ Masculino\n2️⃣ Femenino` })
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
        await sock.sendMessage(OWNER, { text: `🎉 Todo listo!\n\n🤖 Nombre: *${config.botNombre}*\n👤 Género: *${genero}*\n\n¡Agrégame al grupo! 🚀` })
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
