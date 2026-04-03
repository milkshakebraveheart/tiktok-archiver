import { spawn } from "child_process"
import path from "path"

const binary = path.resolve("./bin/yt-dlp.exe")

export function downloadVideo(url: string, id: string) {
  const args = [
    url,
    '--newline',
    "-o",
    `../assets/videos/${id}.mp4`,
    "--cookies",
    "cookies.txt"
  ]

  const proc = spawn(binary, args)

  proc.stdout.on("data", d => console.log("OUT:", d.toString()))
  proc.stderr.on("data", d => console.log("ERR:", d.toString()))
  proc.on("close", (code) => {
      console.log("yt-dlp finished with code", code)
  })

  return proc
}