const { User } = require('../database')

const LINKS = [
  /chat\.whatsapp\.com/i,
  /wa\.me/i,
  /facebook\.com/i,
  /fb\.com/i,
  /instagram\.com/i,
  /tiktok\.com/i,
  /youtube\.com/i,
  /youtu\.be/i,
  /t\.me/i,
  /twitter\.com/i,
  /x\.com/i,
  /bit\.ly/i,
  /https?:\/\//i
]

function tieneLink(texto) {
  return LINKS.some(r => r.test(texto))
}

async function handleAntilinks(
  sock, msg, from, numero, isAdmin) {
  try {
    if (isAdmin) return

    const texto = msg.message?.conversation
      || msg.message?.extendedTextMessage
        ?.text || ''

    if (!tieneLink(texto)) return

    await sock.sendMessage(from, {
      delete: msg.key
    })

    let user = await User.findOne({ numero })
    if (!user) {
      user = new User({ numero })
    }

    user.advertencias += 1
    await user.save()

    const adv = user.advertencias

    if (adv >= 3) {
      await sock.groupParticipantsUpdate(
        from, [numero], 'remove')
      
      await sock.sendMessage(from, {
        text: `🚨 @${numero.split('@')[0]} 
fue EXPULSADO del grupo por enviar 
enlaces repetidamente!

⚠️ AVISO PARA TODOS ⚠️
Esto les pasara a ustedes si 
se comportan igual.
No se permiten enlaces en este grupo! 🔒`,
        mentions: [numero]
      })

      user.advertencias = 0
      await user.save()
    } else {
      await sock.sendMessage(from, {
        text: `⚠️ @${numero.split('@')[0]} 
No se permiten enlaces aqui!
Advertencia ${adv}/3 
${adv === 2 ? 
  '⚠️ ULTIMA OPORTUNIDAD!' : ''}`,
        mentions: [numero]
      })
    }
  } catch (error) {
    console.error('Error antilinks:', error)
  }
}

module.exports = { handleAntilinks }
