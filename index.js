const { default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const { connectDB, Grupo } = require('./database')
const { handleMessage } = require('./handlers/mensajes')
const { handleBienvenida } = require('./handlers/bienvenida')

const OWNER = process.env.OWNER_NUMBER 
  + '@s.whatsapp.net'

let configurando = false
let esperandoNombre = false
let esperandoGenero = false
let sock

async function configurarBot() {
  const grupo = await Grupo.findOne({ 
    id: 'config' 
  })
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
  await connectDB()
  
  const { state, saveCreds } = 
    await useMultiFileAuthState('./auth_info')
  const { version } = 
    await fetchLatestBaileysVersion()
  
  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
    browser: ['Zyon', 'Chrome', '1.0.0']
  })
  
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', 
    async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error
        ?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) {
        startBot()
      }
    }
    if (connection === 'open') {
      console.log('✅ Zyon conectado!')
      await configurarBot()
    }
  })
  
  sock.ev.on('messages.upsert', 
    async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    if (msg.key.fromMe) return

    const from = msg.key.remoteJid
    const texto = msg.message?.conversation 
      || msg.message?.extendedTextMessage
        ?.text || ''

    if (configurando && from === OWNER) {
      if (esperandoNombre) {
        const nombre = texto.trim()
        esperandoNombre = false
        esperandoGenero = true

        await sock.sendMessage(OWNER, {
          text: `✅ Perfecto! Me llamaré *${nombre}*\n\n¿Qué género prefieres?\n1️⃣ Masculino\n2️⃣ Femenino`
        })

        let config = await Grupo.findOne({ 
          id: 'config' 
        })
        if (!config) {
          config = new Grupo({ id: 'config' })
        }
        config.botNombre = nombre
        await config.save()
        return
      }

      if (esperandoGenero) {
        const config = await Grupo.findOne({ 
          id: 'config' 
        })
        
        let genero = 'masculino'
        if (texto === '2' || 
          texto.toLowerCase().includes('femen')) {
          genero = 'femenino'
        }

        config.botGenero = genero
        config.configurado = true
        await config.save()

        esperandoGenero = false
        configurando = false

        await sock.sendMessage(OWNER, {
          text: `🎉 Todo listo!\n\n🤖 Nombre: *${config.botNombre}*\n👤 Género: *${genero}*\n\n¡Agrégame al grupo cuando quieras! 🚀`
        })
        return
      }
    }

    await handleMessage(sock, msg)
  })
  
  sock.ev.on('group-participants.update', 
    async ({ id, participants, action }) => {
    await handleBienvenida(
      sock, id, participants, action)
  })
}

startBot()
