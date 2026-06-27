const axios = require('axios')

const COBALT = 'https://api.cobalt.tools/'
const HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json'
}

async function descargarConCobalt(url) {
  const resp = await axios.post(COBALT, { url, videoQuality: 'max' }, { headers: HEADERS })
  return resp.data
}

async function descargarYoutube(sock, from, msg, query, tipo) {
  try {
    await sock.sendMessage(from, { text: `⏳ Buscando: *${query}*...`, quoted: msg })

    // Buscar video en YouTube
    const busqueda = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: query, type: 'video', maxResults: 1, key: process.env.YOUTUBE_API_KEY }
    })

    if (!busqueda.data.items?.length) {
      return sock.sendMessage(from, { text: '❌ No encontré ese video', quoted: msg })
    }

    const video = busqueda.data.items[0]
    const titulo = video.snippet.title
    const videoId = video.id.videoId
    const url = `https://www.youtube.com/watch?v=${videoId}`

    await sock.sendMessage(from, { text: `✅ *${titulo}*\n⬇️ Descargando...`, quoted: msg })

    const result = await descargarConCobalt(url)
    if (!result.url) throw new Error('Sin URL de descarga')

    const data = await axios.get(result.url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(data.data)

    if (tipo === 'audio') {
      await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4', fileName: `${titulo}.mp3`, quoted: msg })
    } else {
      await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', caption: titulo, quoted: msg })
    }
  } catch (error) {
    console.error('Error YouTube:', error.message)
    await sock.sendMessage(from, { text: '❌ Error al descargar. Intenta con otro video.', quoted: msg })
  }
}

async function descargarTikTok(sock, from, msg, url, tipo) {
  try {
    await sock.sendMessage(from, { text: '⏳ Descargando TikTok...', quoted: msg })
    const result = await descargarConCobalt(url)
    if (!result.url) throw new Error('Sin URL')

    const data = await axios.get(result.url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(data.data)

    if (tipo === 'video') {
      await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', quoted: msg })
    } else {
      await sock.sendMessage(from, { document: buffer, mimetype: 'video/mp4', fileName: 'tiktok.mp4', quoted: msg })
    }
  } catch (error) {
    await sock.sendMessage(from, { text: '❌ Error al descargar TikTok. Verifica el link.', quoted: msg })
  }
}

async function descargarInstagram(sock, from, msg, url) {
  try {
    await sock.sendMessage(from, { text: '⏳ Descargando Instagram...', quoted: msg })
    const result = await descargarConCobalt(url)

    if (result.status === 'picker') {
      // Múltiples archivos (carrusel)
      const primero = result.picker[0]
      const data = await axios.get(primero.url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(data.data)
      const esVideo = primero.type === 'video'
      if (esVideo) {
        await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', quoted: msg })
      } else {
        await sock.sendMessage(from, { image: buffer, quoted: msg })
      }
      if (result.picker.length > 1) {
        await sock.sendMessage(from, { text: `ℹ️ La publicación tiene ${result.picker.length} archivos. Solo envié el primero.`, quoted: msg })
      }
    } else if (result.url) {
      const data = await axios.get(result.url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(data.data)
      await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', quoted: msg })
    } else {
      throw new Error('Sin contenido')
    }
  } catch (error) {
    console.error('Error Instagram:', error.message)
    await sock.sendMessage(from, { text: '❌ Error al descargar Instagram. Verifica que el link sea público.', quoted: msg })
  }
}

async function descargarFacebook(sock, from, msg, url) {
  try {
    await sock.sendMessage(from, { text: '⏳ Descargando Facebook...', quoted: msg })
    const result = await descargarConCobalt(url)
    if (!result.url) throw new Error('Sin URL')

    const data = await axios.get(result.url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(data.data)
    await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', quoted: msg })
  } catch (error) {
    console.error('Error Facebook:', error.message)
    await sock.sendMessage(from, { text: '❌ Error al descargar Facebook. El video debe ser público.', quoted: msg })
  }
}

module.exports = { descargarYoutube, descargarTikTok, descargarInstagram, descargarFacebook }
