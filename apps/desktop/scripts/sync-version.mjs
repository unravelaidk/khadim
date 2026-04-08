import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')

const versionFile = path.join(desktopRoot, 'VERSION')
const packageJsonFile = path.join(desktopRoot, 'package.json')
const tauriConfigFile = path.join(desktopRoot, 'src-tauri', 'tauri.conf.json')
const cargoTomlFile = path.join(desktopRoot, 'src-tauri', 'Cargo.toml')

const inputVersion = process.argv[2]?.trim()

if (inputVersion) {
  fs.writeFileSync(versionFile, `${inputVersion}\n`)
}

const version = fs.readFileSync(versionFile, 'utf8').trim()

if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid desktop version: ${version}`)
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
packageJson.version = version
fs.writeFileSync(packageJsonFile, `${JSON.stringify(packageJson, null, 2)}\n`)

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigFile, 'utf8'))
tauriConfig.version = version
fs.writeFileSync(tauriConfigFile, `${JSON.stringify(tauriConfig, null, 2)}\n`)

const cargoToml = fs.readFileSync(cargoTomlFile, 'utf8')
const cargoLines = cargoToml.split('\n')
let inPackageSection = false
let cargoVersionUpdated = false

for (let index = 0; index < cargoLines.length; index += 1) {
  const line = cargoLines[index]

  if (line.trim() === '[package]') {
    inPackageSection = true
    continue
  }

  if (inPackageSection && line.startsWith('[')) {
    break
  }

  if (inPackageSection && /^version\s*=\s*"[^"]+"\s*$/.test(line)) {
    cargoLines[index] = `version = "${version}"`
    cargoVersionUpdated = true
    break
  }
}

if (!cargoVersionUpdated) {
  console.error('Failed to update Cargo.toml version')
  process.exit(1)
}

fs.writeFileSync(cargoTomlFile, `${cargoLines.join('\n')}`)

console.log(`Desktop version synced to ${version}`)
