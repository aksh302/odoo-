// Creates server/.env and client/.env from their .env.example files on first setup.
// Existing .env files are never touched.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

for (const dir of ['server', 'client']) {
  const target = `${dir}/.env`
  if (existsSync(target)) {
    console.log(`${target} already exists, leaving it as is`)
    continue
  }
  copyFileSync(`${dir}/.env.example`, target)
  if (dir === 'server') {
    // A real random secret instead of the placeholder
    const env = readFileSync(target, 'utf8').replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(32).toString('hex')}`)
    writeFileSync(target, env)
  }
  console.log(`created ${target}`)
}
