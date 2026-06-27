const { default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  initAuthCreds
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const http = require('http')
const fs = require('fs')
const qrcode = require('qrcode-terminal')
const { connectDB, Grupo, Session } = require('./database')
const { handleMessage } = require('./handlers/mensajes')
const { handleBienvenida } = require('./handlers/bienvenida')

const OWNER_RAW = (process.env.OWNER_NUMBER || '').replace('@s.whatsapp.net', '').replace(/\D/g, '').trim()
const OWNER = OWNER_RAW + '@s.whatsapp.net'

let configurando = false
let esperandoNombre = false
let esperandoGenero = false
let sock
let qrActual = null
let estadoConexion = 'iniciando'

// ── Sesión en MongoDB ──────────────────────────────
function serializarBuffer(data) {
  return JSON.stringify(data, (_, value) => {
    if (Buffer.isBuffer(value)) return { _buf: true, data: value.toString('base64') }
    return value
  })
}

function deserializarBuffer(str) {
  return JSON.parse(str, (_, value) => {
    if (value && value._buf) return Buffer.from(value.data, 'base64')
    return value
  })
}

async function escribirSesion(id, data) {
  await Session.findOneAndUpdate(
    { id },
    { value: serializarBuffer(data) },
    { upsert: true }
  )
}

async function leerSesion(id) {
  try {
    const doc = await Session.findOne({ id })
    if (!doc?.value) return null
    return deserializarBuffer(doc.value)
  } catch { return null }
}

async function borrarSesion(id) {
  await Session.deleteOne({ id })
}

async function useMongoAuthState() {
  const creds = (await leerSesion('creds')) || initAuthCreds()
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {}
          await Promise.all(ids.map(async (id) => {
            result[id] = await leerSesion(`${type}--${id}`)
          }))
          return result
        },
        set: async (data) => {
          const tareas = []
          for (const tipo in data) {
            for (const id in data[tipo]) {
              const valor = data[tipo][id]
              tareas.push(valor
                ? escribirSesion(`${tipo}--${id}`, valor)
                : borrarSesion(`${tipo}--${id}`)
              )
            }
          }
          await Promise.all(tareas)
        }
      }
    },
    saveCreds: () => escribirSesion('creds', creds)
  }
}
// ──────────────────────────────────────────────────

// Servidor HTTP
const server = http.createServer((req, res) => {
  if (req.url === '/qr' || req.url === '/code') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Zyon - QR</title>
  <meta http-equiv="refresh" content="8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { background: #16213e; border-radius: 16px; padding: 40px 30px; text-align: center; max-width: 420px; width: 95%; }
    h1 { color: #25D366; margin-bottom: 6px; }
    .estado { font-size: 13px; color: #aaa; margin-bottom: 20px; }
    #qrbox { background: white; border-radius: 12px; padding: 16px; display: inline-block; margin: 16px auto; }
    .instruccion { font-size: 13px; color: #ccc; line-height: 1.8; margin-top: 16px; }
    .conectado { color: #25D366; font-size: 24px; margin: 20px 0; }
    .esperando { color: #aaa; font-size: 15px; margin: 20px 0; }
    .refresh { margin-top: 16px; font-size: 11px; color: #555; }
  </style>
</head>
<body>
<div class="box">
  <h1>🤖 Bot Zyon</h1>
  <div class="estado">Estado: <b>${estadoConexion}</b></div>
  ${estadoConexion === 'conectado'
    ? '<div class="conectado">✅ ¡Bot conectado!</div><p style="color:#aaa">Sesión guardada en MongoDB 🔒</p>'
    : qrActual
      ? `<div id="qrbox"></div>
         <div class="instruccion">
           📱 Abre <b>WhatsApp Business</b><br>
           → Ajustes → Dispositivos vinculados<br>
           → Vincular un dispositivo<br>
           → Escanea este código QR
         </div>
         <script>
           new QRCode(document.getElementById("qrbox"), {
             text: ${JSON.stringify(qrActual)},
             width: 220, height: 220
           });
         </script>`
      : '<div class="esperando">⏳ Generando QR, espera unos segundos...</div>'
  }
  <div class="refresh">Página se actualiza cada 8 segundos</div>
</div>
</body>
</html>`)
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo')
})

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
  qrActual = null
  await connectDB()

  const { state, saveCreds } = await useMongoAuthState()
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome')
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrActual = qr
      estadoConexion = 'esperando escaneo QR'
      console.log('\n📱 ESCANEA EL QR EN: https://bot-zyon.onrender.com/qr')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      estadoConexion = 'reconectando'
      qrActual = null
      console.log('🔴 Desconectado, código:', statusCode)
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('🚪 Sesión cerrada. Limpiando sesión en MongoDB...')
        await Session.deleteMany({})
      }
      setTimeout(startBot, 3000)
    }
    if (connection === 'open') {
      estadoConexion = 'conectado'
      qrActual = null
      console.log('✅ ¡Zyon conectado! Sesión guardada en MongoDB 🔒')
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
