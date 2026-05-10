import { createHmac } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && process.env[key.trim()] == null) {
        process.env[key.trim()] = value;
      }
    });
}

loadDotEnv();

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme';

if (JWT_SECRET === 'changeme') {
  console.warn('\n⚠️  Warning: using default JWT_SECRET. Set JWT_SECRET in your .env for production.\n');
}

function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJWT(payload, expiresInSeconds = 86400) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })
  );
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

const token = signJWT({ role: 'dashboard', sub: 'maintainer' });
const expires = new Date(Date.now() + 86400 * 1000).toLocaleString();

console.log('\n✅ Dashboard JWT (valid 24h, expires ' + expires + '):\n');
console.log(token);
console.log('\n🔌 WebSocket URL:\n');
console.log(`  ws://localhost:8080/ws?token=${token}`);
console.log('\n🌐 Dashboard URL:\n');
console.log(`  http://localhost:8080/dashboard?token=${token}\n`);
