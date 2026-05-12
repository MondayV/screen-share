const fs = require('fs')
const path = require('path')

const releaseDir = path.join(__dirname, '..', 'release', 'win-unpacked')
const electronDist = path.join(__dirname, '..', 'node_modules', 'electron', 'dist')
const appDir = path.join(releaseDir, 'resources', 'app')

console.log('Preparing app package...')

// Clean and create directories
fs.rmSync(releaseDir, { recursive: true, force: true })
fs.mkdirSync(releaseDir, { recursive: true })
fs.mkdirSync(appDir, { recursive: true })

// Copy electron
console.log('Copying electron...')
fs.cpSync(electronDist, releaseDir, { recursive: true })

// Rename electron.exe to PCConnect.exe for shortcut compatibility
const electronExe = path.join(releaseDir, 'electron.exe')
const pcConnectExe = path.join(releaseDir, 'PCConnect.exe')
if (fs.existsSync(electronExe)) {
  fs.renameSync(electronExe, pcConnectExe)
  console.log('Renamed electron.exe -> PCConnect.exe')
}

// Copy built output
console.log('Copying out/...')
fs.cpSync(path.join(__dirname, '..', 'out'), path.join(appDir, 'out'), { recursive: true })

// Copy package.json
fs.copyFileSync(path.join(__dirname, '..', 'package.json'), path.join(appDir, 'package.json'))

// Copy node_modules (all, for complete dependency tree)
console.log('Copying node_modules...')
fs.cpSync(
  path.join(__dirname, '..', 'node_modules'),
  path.join(appDir, 'node_modules'),
  { recursive: true }
)

console.log('Prepackage complete. Ready for electron-builder.')
