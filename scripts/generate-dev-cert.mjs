import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const certDir = resolve(root, '.cert')
const keyPath = resolve(certDir, 'localhost-key.pem')
const certPath = resolve(certDir, 'localhost.pem')

if (existsSync(keyPath) && existsSync(certPath))
  process.exit(0)

mkdirSync(certDir, { recursive: true })

const result = spawnSync('openssl', [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-sha256',
  '-days',
  '825',
  '-keyout',
  keyPath,
  '-out',
  certPath,
  '-subj',
  '/CN=localhost',
  '-addext',
  'subjectAltName=DNS:localhost,IP:127.0.0.1',
], { stdio: 'inherit' })

if (result.status !== 0) {
  console.error('Failed to generate local HTTPS certificate. Please install OpenSSL and retry npm run dev.')
  process.exit(result.status ?? 1)
}
