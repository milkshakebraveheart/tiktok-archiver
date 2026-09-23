import { spawn } from "child_process"
import path from "path"

const binary = path.resolve("./bin/gallery-dl.exe")
export const special = 'wżdy'

export function downloadGallery(url: string, fallback: boolean) {
  const args = [
    url,
    "--write-log", "stdout",
    "--cookies", "cookies.txt",
    "-D", '../assets/photos',
      "-o", `filename={id}${special}{user}${special}${fallback ? 'This is fallback title' : '{title}'}${special}{num}.{extension}`
  ]

  const proc = spawn(binary, args)

  // proc.stdout.on("data", d => console.log("OUT:", d.toString()))
  // proc.stderr.on("data", d => console.log("ERR:", d.toString()))

  proc.on("close", (code) => {
    console.log("gallery-dl finished with code", code)
  })

  return proc
}