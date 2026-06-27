const { preguntarIA } = require('../ai')

async function handleBienvenida(
  sock, groupId, participants, action) {
  try {
    const groupMeta = await sock
      .groupMetadata(groupId)
    const groupName = groupMeta.subject
    const botNombre = process.env.BOT_NAME 
      || 'Zyon'

    for (const participant of participants) {
      const numero = participant
        .split('@')[0]

      if (action === 'add') {
        const prompt = `
Genera un mensaje de bienvenida UNICO 
y MUY ADORNADO con emojis y simbolos para 
@${numero} que acaba de unirse al grupo 
"${groupName}". 
Se creativo, usa simbolos decorativos, 
hazlo especial y diferente cada vez.
Menciona el nombre del grupo.
`
        const bienvenida = await preguntarIA(
          prompt, [], 'feliz', 
          botNombre, 
          process.env.BOT_GENDER || 
          'masculino')

        await sock.sendMessage(groupId, {
          text: bienvenida,
          mentions: [participant]
        })
      }

      if (action === 'remove') {
        const prompt = `
Genera un mensaje de DESPEDIDA UNICO 
y adornado con emojis para @${numero} 
que acaba de salir del grupo "${groupName}".
Se creativo y diferente cada vez.
`
        const despedida = await preguntarIA(
          prompt, [], 'triste',
          botNombre,
          process.env.BOT_GENDER || 
          'masculino')

        await sock.sendMessage(groupId, {
          text: despedida,
          mentions: [participant]
        })
      }
    }
  } catch (error) {
    console.error('Error bienvenida:', error)
  }
}

module.exports = { handleBienvenida }
