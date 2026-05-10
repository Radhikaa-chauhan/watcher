#!/usr/bin/env node
import { createHmac, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
const examplePath = resolve(process.cwd(), '.env.example');

console.log('\n🔧 PR Agent Setup\n');

let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf8');
  console.log('📄 Found existing .env');
} else if (existsSync(examplePath)) {
  envContent = readFileSync(examplePath, 'utf8');
  console.log('📄 Created .env from .env.example');
}

const lines = envContent.split('\n');
const env = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

let changed = false;
const issues = [];

function isEmpty(val) {
  return !val || val.includes('your_') || val.includes('_here') || val.length < 4;
}

const groqOk    = !isEmpty(env['GROQ_API_KEY']);
const githubOk  = !isEmpty(env['GITHUB_TOKEN']);
const webhookOk = !isEmpty(env['GITHUB_WEBHOOK_SECRET']);

// Auto-fix JWT_SECRET
const jwtEmpty = isEmpty(env['JWT_SECRET']) || (env['JWT_SECRET'] ?? '').length < 16;
if (jwtEmpty) {
  env['JWT_SECRET'] = randomBytes(32).toString('hex');
  changed = true;
  console.log('✅ JWT_SECRET — auto-generated');
} else {
  console.log('✅ JWT_SECRET — ok');
}

// Auto-fix AGENT_MODEL if still set to claude
if (!env['AGENT_MODEL'] || env['AGENT_MODEL'].includes('claude')) {
  env['AGENT_MODEL'] = 'llama-3.3-70b-versatile';
  changed = true;
}

// Auto-fix REDIS_URL if missing
if (!env['REDIS_URL']) {
  env['REDIS_URL'] = 'redis://redis:6379';
  changed = true;
}

console.log(groqOk    ? '✅ GROQ_API_KEY — ok'            : '❌ GROQ_API_KEY — NOT SET');
console.log(githubOk  ? '✅ GITHUB_TOKEN — ok'             : '❌ GITHUB_TOKEN — NOT SET');
console.log(webhookOk ? '✅ GITHUB_WEBHOOK_SECRET — ok'    : '❌ GITHUB_WEBHOOK_SECRET — NOT SET');

// Write back updated .env
if (changed) {
  const newLines = [];
  const written = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) { newLines.push(line); continue; }
    const idx = line.indexOf('=');
    if (idx === -1) { newLines.push(line); continue; }
    const key = line.slice(0, idx).trim();
    if (env[key] !== undefined) {
      newLines.push(`${key}=${env[key]}`);
      written.add(key);
    } else {
      newLines.push(line);
    }
  }
  for (const [key, val] of Object.entries(env)) {
    if (!written.has(key)) newLines.push(`${key}=${val}`);
  }
  writeFileSync(envPath, newLines.join('\n'));
  console.log('\n💾 .env updated\n');
}

// Generate 7-day dashboard token
function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signJWT(payload, exp = 86400 * 7) {
  const h = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+exp }));
  const s = createHmac('sha256', env['JWT_SECRET']).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}

const token = signJWT({ role: 'dashboard', sub: 'maintainer' });
const expires = new Date(Date.now() + 86400 * 7 * 1000).toLocaleDateString();

const missing = [
  !groqOk    && 'GROQ_API_KEY    → free key at https://console.groq.com',
  !githubOk  && 'GITHUB_TOKEN    → github.com/settings/tokens (repo scope)',
  !webhookOk && 'GITHUB_WEBHOOK_SECRET → any string you choose',
].filter(Boolean);

if (missing.length) {
  console.log('⚠️  Fill these in your .env then run:');
  console.log('   docker compose down && docker compose up --build\n');
  missing.forEach(m => console.log('   ' + m));
} else {
  console.log('✅ All keys set! Run:\n');
  console.log('   docker compose down');
  console.log('   docker compose up --build\n');
}

console.log('─'.repeat(60));
console.log(`\n🎫 Dashboard token (7 days, expires ${expires}):\n`);
console.log(token);
console.log('\n🌐 Open this in your browser:\n');
console.log(`   http://localhost:8080/dashboard?token=${token}\n`);
console.log('─'.repeat(60) + '\n');