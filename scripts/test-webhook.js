import { createHmac } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env manually (no deps needed)
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .forEach(l => {
      const [k, ...v] = l.split('=');
      process.env[k.trim()] = v.join('=').trim();
    });
}

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? 'test-secret';
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:8080/webhook/github';

const isClean = process.argv.includes('--clean');
const isHigh  = process.argv.includes('--high') || process.argv.includes('--score');

// ─── Fake PR payloads ──────────────────────────────────────────────────────────
const cleanPR = {
  action: 'opened',
  pull_request: {
    number: Math.floor(Math.random() * 9000) + 100,
    title: 'feat: add retry logic to the API client',
    body: `## Summary\nAdds exponential backoff retry logic to the API client.\n\n## Changes\n- Added \`retry\` option to \`fetchWithRetry()\`\n- Added tests for retry scenarios\n- Updated docs\n\nFixes #${Math.floor(Math.random() * 200) + 1}`,
    html_url: 'https://github.com/org/repo/pull/42',
    user: { login: 'alice-dev' },
    author_association: 'CONTRIBUTOR',
    head: { sha: 'abc1234def5678' },
    base: { ref: 'main' },
    additions: 87,
    deletions: 12,
    changed_files: 5,
    created_at: new Date().toISOString(),
  },
  repository: {
    full_name: 'org/myrepo',
    name: 'myrepo',
    owner: { login: 'org' },
  },
};

const spamPR = {
  action: 'opened',
  pull_request: {
    number: Math.floor(Math.random() * 9000) + 100,
    title: 'update',
    body: '',
    html_url: 'https://github.com/org/repo/pull/99',
    user: { login: 'spambot' + Math.floor(Math.random() * 999) },
    author_association: 'NONE',
    head: { sha: 'zzzzzzzzzz' },
    base: { ref: 'main' },
    additions: 0,
    deletions: 0,
    changed_files: 0,
    created_at: new Date().toISOString(),
  },
  repository: {
    full_name: 'org/myrepo',
    name: 'myrepo',
    owner: { login: 'org' },
  },
};

const highSpamPR = {
  action: 'opened',
  pull_request: {
    number: Math.floor(Math.random() * 9000) + 100,
    title: 'PLEASE MERGE my hacktoberfest contribution!!!',
    body: 'just for practice lol pls merge https://spam.link https://spam.link https://spam.link https://spam.link https://spam.link https://spam.link',
    html_url: 'https://github.com/org/repo/pull/77',
    user: { login: 'newuser' + Math.floor(Math.random() * 999) },
    author_association: 'FIRST_TIMER',
    head: { sha: 'aaaaabbbbbccccc' },
    base: { ref: 'main' },
    additions: 1,
    deletions: 0,
    changed_files: 1,
    created_at: new Date().toISOString(),
  },
  repository: {
    full_name: 'org/myrepo',
    name: 'myrepo',
    owner: { login: 'org' },
  },
};

const payload = isClean ? cleanPR : isHigh ? highSpamPR : spamPR;
const bodyStr = JSON.stringify(payload);

// Sign with HMAC-SHA256 (same as GitHub does)
const sig = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(bodyStr).digest('hex');

console.log(`\n📤 Sending ${isClean ? '✅ clean' : isHigh ? '🚨 high-spam' : '⚠️ spam'} PR webhook to ${GATEWAY_URL}`);
console.log(`   PR #${payload.pull_request.number} — "${payload.pull_request.title}"`);
console.log(`   Author: ${payload.pull_request.user.login} (${payload.pull_request.author_association})\n`);

const res = await fetch(GATEWAY_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'pull_request',
    'X-GitHub-Delivery': 'test-' + Date.now(),
    'X-Hub-Signature-256': sig,
  },
  body: bodyStr,
});

const text = await res.text();
console.log(`📨 Response: ${res.status} ${res.statusText}`);
try { console.log(JSON.parse(text)); } catch { console.log(text); }

if (res.ok) {
  console.log('\n✅ Webhook accepted! Watch your dashboard for the agent decision.\n');
} else {
  console.log('\n❌ Webhook rejected. Check GITHUB_WEBHOOK_SECRET matches in .env\n');
}
