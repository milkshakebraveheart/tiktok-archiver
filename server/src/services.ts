import * as cheerio from 'cheerio';
import { readdir, readFile, writeFile } from 'fs/promises';
import fs from "fs"
import https from "https"
import http from "http"
import { URL } from "url"
import { special } from '../scripts/gallery-downloader.js';

interface TikTokContent {
  id: string | number;
  date: string;
  username: string;
  fullUrl: string;
  description: string;
  cover: string;
  type: string;
}

interface TikTokPhotoContent extends TikTokContent {
  content: string[]
}

interface TikTokVideoContent extends TikTokContent {
  content: string;
}

type TikTokItem = TikTokPhotoContent | TikTokVideoContent

const dbFile = "./data.json"

export async function getTiktokMetadata(url: string, date: string): Promise<TikTokItem | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const scriptTag = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').text();
  if (!scriptTag) {
    return null
  }

  const universalData = JSON.parse(scriptTag);
  const defaultScope = universalData?.['__DEFAULT_SCOPE__']
  let fullUrl = defaultScope['seo.abtest']?.canonical

  if (fullUrl.includes('photo')) {
    const splittedUrl = fullUrl.split('/')
    const id = splittedUrl[splittedUrl.length - 2]
    return {
      id,
      date,
      fullUrl,
      cover: '',
      username: '',
      description: '',
      type: 'photo',
      content: []
    }
  }

  const videoDetails = defaultScope['webapp.video-detail']
    
  if (videoDetails.statusCode === 10204 || !videoDetails.itemInfo) {
    return null
  }

  const itemStruct = videoDetails.itemInfo.itemStruct
  const id = itemStruct.id

  if (itemStruct.isContentClassified) {
    return {
      id,
      date,
      fullUrl,
      cover: '',
      username: '',
      description: '',
      type: 'video',
      content: ''
    }
  }

  const username = itemStruct.author.uniqueId
  fullUrl = fullUrl.replace('/@', '/@' + username)
  const description = itemStruct.desc
  const cover = itemStruct.video.cover
  
  return {
    id,
    date,
    username,
    fullUrl,
    description,
    cover,
    type: 'video',
    content: `/assets/videos/${id}.mp4`
  };
}

async function readDbFile() {
  try {
    const content = await readFile(dbFile, "utf-8")
    const arr: (TikTokItem)[] = JSON.parse(content)
    return arr
  } catch (e) {
    return []
  }
}

export async function appendToJsonFile(newItem: TikTokItem) {
  const items = await readDbFile()
  items.push(newItem)
  await writeFile(dbFile, JSON.stringify(items, null, 2))
}

export async function findTikTokItem(id: string) {
  const items = await readDbFile()
  return items.find(item => item.id === id)
}

export async function updateTikTokItem(id: string, item: TikTokItem) {
  const items = await readDbFile()
  const itemIndex = items.findIndex(item => item.id === id)
  items[itemIndex] = item
  await writeFile(dbFile, JSON.stringify(items, null, 2))
}

export function downloadImage(imageUrl: string, outputPath: string) {
  return new Promise((resolve, reject) => {
    const url = new URL(imageUrl)
    const client = url.protocol === "https:" ? https : http

    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImage(res.headers.location, outputPath))
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to get image: ${res.statusCode}`))
      }

      const fileStream = fs.createWriteStream(outputPath)

      res.pipe(fileStream)

      fileStream.on("finish", () => {
        fileStream.close()
        resolve(outputPath)
      })

      fileStream.on("error", (err) => {
        fs.unlink(outputPath, () => reject(err)) // cleanup partial file
      })
    })

    req.on("error", reject)
  })
}

export async function getItemDataFromFileName(id: string) {
  const files = await readdir('../assets/photos');
  const itemFiles = files.filter(file => file.startsWith(id))
  const audio = itemFiles.find(file => file.endsWith('.mp3'))
  const photos = itemFiles
    .filter(file => !file.endsWith('.mp3'))
    .sort((a, b) => {
      const first = a.split(special)
      const second = b.split(special)
      return Number(first[first.length - 1]) - Number(second[second.length - 1])
    })

  const [, username, description] = audio?.split(special) || []
  const content = [audio, ...photos] as string[]

  return {username, description, content: content, cover: `/assets/photos/${photos[0]}`};
}