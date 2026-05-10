const SERVICES = [
  { name: 'API Gateway',          url: 'http://localhost:8080/health' },
  { name: 'Detection Service',    url: 'http://localhost:3001/health' },
  { name: 'WS Broadcaster',       url: 'http://localhost:3003/health' },
];

console.log('\n🔍 Checking service health...\n');

const results = await Promise.allSettled(
  SERVICES.map(async ({ name, url }) => {
    const start = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const ms = Date.now() - start;
    const body = await res.json().catch(() => ({}));
    return { name, url, status: res.status, ms, body };
  })
);

let allOk = true;
for (const result of results) {
  if (result.status === 'fulfilled') {
    const { name, status, ms, body } = result.value;
    const ok = status === 200;
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(25)} ${String(status).padEnd(5)} ${ms}ms  ${JSON.stringify(body)}`);
  } else {
    allOk = false;
    const svc = SERVICES[results.indexOf(result)];
    console.log(`  ❌ ${svc.name.padEnd(25)} unreachable — ${result.reason.message}`);
  }
}

// Redis check via gateway (indirect)
console.log('');
if (allOk) {
  console.log('✅ All services healthy\n');
} else {
  console.log('⚠️  Some services are down. Run: docker compose up --build\n');
  process.exit(1);
}
