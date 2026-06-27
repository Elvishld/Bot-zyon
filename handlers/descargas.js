const axios = require('axios')

async function descargarYoutube(
  sock, from, msg, query, tipo) {
  try {
    await sock.sendMessage(from, {
      text: `⏳ Buscando: ${query}...`,
      quoted: msg
    })

    const busqueda = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`,
      { params: {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 1,
        key: process.env.YOUTUBE_API_KEY
      }}
    )

    if (!busqueda.data.items?.length) {
      await sock.sendMessage(from, {
        text: '❌ No encontre ese video',
        quoted: msg
      })
      return
    }

    const video = busqueda.data.items[0]
    const titulo = video.snippet.title
    const videoId = video.id.videoId

    await sock.sendMessage(from, {
      text: `✅ Encontrado: ${titulo}
⬇️ Descargando...`,
      quoted: msg
    })

    const resp = await axios.get(
      `https://api.vevioz.com/api/button/mp3/${videoId}`,
      { responseType: 'arraybuffer' }
    )

    if (tipo === 'audio') {
      await sock.sendMessage(from, {
        audio: Buffer.from(resp.data),
        mimetype: 'audio/mp4',
        fileName: `${titulo}.mp3`,
        quoted: msg
      })
    } else {
      await sock.sendMessage(from, {
        document: Buffer.from(resp.data),
        mimetype: 'audio/mpeg',
        fileName: `${titulo}.mp3`,
        quoted: msg
      })
    }
  } catch (error) {
    console.error('Error descarga:', error)
    await sock.sendMessage(from, {
      text: '❌ Error al descargar',
      quoted: msg
    })
  }
}

async function descargarTikTok(
  sock, from, msg, url, tipo) {
  try {
    await sock.sendMessage(from, {
      text: '⏳ Descargando TikTok...',
      quoted: msg
    })

    const resp = await axios.get(
      `https://api.tikmate.app/api/lookup`,
      { params: { url } }
    )

    const videoUrl = resp.data.video_url
    const video = await axios.get(
      videoUrl, 
      { responseType: 'arraybuffer' }
    )

    if (tipo === 'video') {
      await sock.sendMessage(from, {
        video: Buffer.from(video.data),
        mimetype: 'video/mp4',
        quoted: msg
      })
    } else {
      await sock.sendMessage(from, {
        document: Buffer.from(video.data),
        mimetype: 'video/mp4',
        fileName: 'tiktok.mp4',
        quoted: msg
      })
    }
  } catch (error) {
    await sock.sendMessage(from, {
      text: '❌ Error al descargar TikTok',
      quoted: msg
    })
  }
}

module.exports = { 
  descargarYoutube,
  descargarTikTok
}
