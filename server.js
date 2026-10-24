/**
 * SloanAI Server
 * Minimal, zero-dependency local Node.js server that hosts the SloanAI frontend
 * and securely proxies local inference to the open-source Ollama runtime.
 * 
 * Hacktoberfest 2026: Week 3 - Slow and Steady
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Helper: Query Ollama API
async function queryOllama(endpoint, options = {}) {
  const targetUrl = `${OLLAMA_HOST}${endpoint}`;
  const response = await fetch(targetUrl, options);
  return response;
}

// Request dispatcher
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers for local resilience
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API 1: /api/status - Check Ollama connection and list models
  if (pathname === '/api/status' && req.method === 'GET') {
    try {
      const response = await queryOllama('/api/tags', { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }
      const data = await response.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        ollamaUrl: OLLAMA_HOST,
        models: models,
        defaultModel: models.find(m => m.name.includes('qwen2.5'))?.name || (models[0]?.name || 'qwen2.5:1.5b')
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'offline',
        error: err.message,
        ollamaUrl: OLLAMA_HOST,
        models: [],
        defaultModel: 'qwen2.5:1.5b'
      }));
    }
    return;
  }

  // API 2: /api/generate - Stream AI generation
  if (pathname === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const model = payload.model || 'qwen2.5:1.5b';
        const prompt = payload.prompt || '';
        const system = payload.system || 'You are Sloan, an ultra-calm, energy-conserving AI sloth who loves doing the heavy lifting so the user can relax. Be concise, extremely helpful, and witty.';
        const stream = payload.stream !== false; // Default true

        const ollamaReqBody = {
          model,
          prompt,
          system,
          stream: true,
          options: {
            temperature: payload.temperature ?? 0.6,
            num_ctx: payload.num_ctx || 4096
          }
        };

        const ollamaRes = await queryOllama('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ollamaReqBody)
        });

        if (!ollamaRes.ok) {
          const errText = await ollamaRes.text();
          res.writeHead(ollamaRes.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Ollama error: ${errText}` }));
          return;
        }

        // Set up Server-Sent Events / Chunked streaming
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=UTF-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        });

        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          
          // Split by line since Ollama returns JSON lines
          const lines = chunkStr.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              res.write(`data: ${JSON.stringify({ token: parsed.response, done: parsed.done })}\n\n`);
            } catch (e) {
              // pass partial
            }
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        console.error('Generation error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
    });
    return;
  }

  // Static File Serving
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 fallback to index.html for SPA feel
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found - SloanAI');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`🦥 SloanAI server listening calmly on http://localhost:${PORT}`);
  console.log(`🔗 Connecting to local Ollama runtime at ${OLLAMA_HOST}`);
});
