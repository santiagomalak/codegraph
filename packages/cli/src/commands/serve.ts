/**
 * serve.ts — Implementa `codegraph serve [carpeta]`.
 *
 * Analiza el proyecto y levanta un servidor local que sirve:
 *   - la interfaz web (packages/web/dist) si está compilada
 *   - GET /api/analysis  → el JSON del análisis
 *
 * En la Fase 1 la UI todavía no está migrada, así que si no encuentra el build
 * te lo dice y deja igual el endpoint /api/analysis funcionando.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { analyzeProject } from '@codegraph/core';
import { discoverFiles } from '../discover.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
};

/** Busca packages/web/dist subiendo desde este archivo. */
function findWebDist(): string | null {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'packages', 'web', 'dist');
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, '..');
  }
  return null;
}

export async function runServe(target: string, flags: { port?: string }): Promise<void> {
  const rootDir = resolve(process.cwd(), target || '.');
  const port = Number(flags.port ?? 4173);

  // Analiza la carpeta y cachea el JSON. Con ?fresh=1 se vuelve a analizar.
  let cachedJson = '';
  async function analyze(): Promise<string> {
    const started = Date.now();
    const { files } = await discoverFiles(rootDir);
    const analysis = await analyzeProject(files, { projectName: rootDir.split(/[/\\]/).pop() });
    cachedJson = JSON.stringify(analysis);
    console.log(
      pc.green(
        `  ✓ ${analysis.summary.totalFiles} archivos · salud ${analysis.summary.health.score}/100 · ${Date.now() - started}ms`,
      ),
    );
    return cachedJson;
  }

  console.log(pc.dim(`Analizando ${rootDir} …`));
  await analyze();

  const webDist = findWebDist();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/api/analysis') {
      try {
        const json = url.searchParams.has('fresh') ? await analyze() : cachedJson;
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(json);
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    if (!webDist) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Code Graph Unified</title>
         <body style="font-family:system-ui;background:#0d0f16;color:#e5e7eb;padding:3rem;max-width:40rem;margin:auto">
         <h1>API lista ✓</h1>
         <p>La interfaz web todavía no está compilada (Fase 1 en curso).</p>
         <p>Mientras tanto, el análisis está en
            <a style="color:#818cf8" href="/api/analysis">/api/analysis</a>.</p>
         </body>`,
      );
      return;
    }

    // Servir la SPA
    let filePath = join(webDist, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!existsSync(filePath)) filePath = join(webDist, 'index.html');
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log('');
    console.log(pc.bold(`  Code Graph Unified`));
    console.log(`  ${pc.cyan(`http://localhost:${port}`)}`);
    if (!webDist) console.log(pc.dim(`  (solo API por ahora — /api/analysis)`));
    console.log(pc.dim('  Ctrl+C para salir'));
    console.log('');
  });
}
