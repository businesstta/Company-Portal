import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'

const directory = fileURLToPath(new URL('./migrations/', import.meta.url))
for (const file of (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()) {
  await db.query(await readFile(`${directory}/${file}`, 'utf8'))
  console.log(`Applied ${file}`)
}
console.log('Database migration complete')
await db.end()
