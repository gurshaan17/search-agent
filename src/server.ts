import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Keep Phase 0 bootable without depending on unverified framework APIs.
if (existsSync('.env')) {
  const { config } = await import('dotenv');
  config({ quiet: true });
}

const provider = process.env.SEARCH_PROVIDER?.trim() || 'exa';
if (!['exa', 'mock'].includes(provider)) {
  throw new Error('SEARCH_PROVIDER must be exa or mock.');
}
const required = provider === 'mock'
  ? ['ANTHROPIC_API_KEY']
  : ['ANTHROPIC_API_KEY', 'EXA_API_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const page = await readFile(new URL('../public/index.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', phase: 0 }));
  } else if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page);
  } else {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.listen(port, () => console.log(`Scaffold running at http://localhost:${port}`));
