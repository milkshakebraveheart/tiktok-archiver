import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { appendToJsonFile, downloadImage, findTikTokItem, getItemDataFromFileName, getTiktokMetadata, updateTikTokItem } from './services.js'
import { readFile, writeFile } from 'fs/promises'
import { cors } from 'hono/cors'
import { streamSSE } from "hono/streaming"
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { downloadVideo } from '../scripts/video-downloader.js'
import { downloadGallery } from '../scripts/gallery-downloader.js'

const downloads = new Map<string, ChildProcessWithoutNullStreams>()

const app = new Hono()
app.use('*', cors())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/last-like', async (c) => {
  const date = await readFile('./last-like-downloaded.txt', {encoding: 'utf8'})
  return c.text(date)
})

app.post('/last-like', async (c) => {
  try {
    // Pobieramy surowy tekst (datę) z body żądania
    const newDate = await c.req.text()

    if (!newDate || isNaN(Date.parse(newDate))) {
      return c.json({ success: false, message: 'Invalid date format' }, 400)
    }

    // Zapisujemy nową datę do pliku
    await writeFile('./last-like-downloaded.txt', newDate.trim(), {
      encoding: 'utf8'
    })

    return c.json({
      success: true,
      message: 'Last like date updated',
      updatedTo: newDate
    })
  } catch (err) {
    return c.json({ success: false, message: 'File system error' }, 500)
  }
})


// https://www.tiktok.com/@/video/7614873029172202775/ - working
// https://www.tiktok.com/@/video/7323585792624954657/ - restricted
// https://www.tiktok.com/@/video/1 - not found
// https://www.tiktok.com/@jim___lahey/photo/7548784615436094722 - photo

app.post('/metadata', async (c) => {
  const {url, date} = await c.req.json()
  const data = await getTiktokMetadata(url, date)
  if (data) {
    await appendToJsonFile(data)
  }
  return c.json(data)
});

app.post('/download', async (c) => {
  const { id, fullUrl, type } = await c.req.json()
  const process = type === 'video' ? downloadVideo(fullUrl, id) : downloadGallery(fullUrl)
  process.on("close", async () => {
    if (type === "video") {
      const item = await findTikTokItem(id)
      if (item!.cover) {
        await downloadImage(item!.cover, `../assets/videos/${id}.jpg`)
      }
      await updateTikTokItem(id, {
        ...item!,
        cover: `/assets/videos/${id}.jpg`
      })
    } else {
      const item = await findTikTokItem(id)
      const updatedData = await getItemDataFromFileName(id)
      await updateTikTokItem(id, {
        ...item!,
        ...updatedData
      })
    }
  })
  downloads.set(id, process)
  return c.json({})
})

app.get("/progress/:id", (c) => {
  const id = c.req.param("id")
  const download = downloads.get(id)

  // 1. Obsługa przypadku, gdy download już się zakończył lub nie istnieje
  if (!download) {
    return c.json({ error: "Download not found or already finished" }, 404)
  }

  return streamSSE(c, async (stream) => {
    const sendLog = async (data) => {
      // Buffer -> String
      const message = data.toString() 
      await stream.writeSSE({ data: JSON.stringify(message) })
    }

    // 2. Podpinamy się pod strumienie
    download.stdout.on("data", sendLog)
    download.stderr.on("data", sendLog)

    download.on("close", async () => {
      // 3. Informujemy o końcu i usuwamy z mapy
      await stream.writeSSE({ 
        data: JSON.stringify({ type: "complete" }) 
      })
      downloads.delete(id)
      // stream.close() zostanie wywołane automatycznie po zakończeniu pętli streamu lub ręcznie
    })

    // Opcjonalnie: obsługa rozłączenia klienta
    stream.onAbort(() => {
      console.log(`Klient rozłączył się od streamu: ${id}`)
    })

    while (true) {
      if (!stream.closed) {
        await stream.sleep(1000)
      }
    }
  })
})

app.post('/cookies', async (c) => {
  const content = await c.req.text()

  await writeFile('./cookies.txt', content, {
    encoding: 'utf8'
  })

  return c.json({
    success: true,
    message: 'cookies.txt updated'
  })
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
