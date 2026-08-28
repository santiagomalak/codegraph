/**
 * serve.ts — Implementa `codegraph serve [carpeta]`.
 *
 * Analiza el proyecto y levanta un servidor local que sirve:
 *   - la interfaz web (packages/web/dist)
 *   - GET /api/analysis         → el JSON del análisis (?fresh=1 fuerza re-análisis)
 *   - GET /api/events (SSE)     → avisa "updated" cuando cambia un archivo (--watch)
 */

import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { analyzeProject } from '@codegraph/core';
import { discoverFiles, readGitHistory, readProjectConfig } from '@codegraph/core/node';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
};

const IGNORED_WATCH = /node_modules|\.git|\.codegraph|dist|__pycache__/;

function findWebDist(): string | null {
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'packages', 'web', 'dist');
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, '..');
  }
  return null;
}

export async function runServe(
  target: string,
  flags: { port?: string; watch?: boolean },
): Promise<void> {
  const rootDir = resolve(process.cwd(), target || '.');
  const port = Number(flags.port ?? 4173);

  let cachedJson = '';
  async function analyze(): Promise<string> {
    const started = Date.now();
    const { files } = await discoverFiles(rootDir);
    const { stats: git, timeline, coupling } = await readGitHistory(rootDir, files.map((f) => f.path));
    const analysis = await analyzeProject(files, {
      projectName: rootDir.split(/[/\\]/).pop(),
      git: Object.keys(git).length > 0 ? git : undefined,
      timeline: timeline ?? undefined,
      coupling,
      resolve: await readProjectConfig(rootDir),
    });
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
  const clients = new Set<ServerResponse>();

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

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('event: open\ndata: {}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (!webDist) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Code Graph Unified</title>
         <body style="font-family:system-ui;background:#0d0f16;color:#e5e7eb;padding:3rem;max-width:40rem;margin:auto">
         <h1>API lista ✓</h1><p>Compilá la web con <code>npm run build</code>. El análisis está en
         <a style="color:#818cf8" href="/api/analysis">/api/analysis</a>.</p></body>`,
      );
      return;
    }

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

  // ── --watch: re-analizar al cambiar archivos ──────────────────────────
  if (flags.watch) {
    let timer: NodeJS.Timeout | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await analyze();
        for (const res of clients) res.write('event: updated\ndata: {}\n\n');
      }, 350);
    };
    try {
      watch(rootDir, { recursive: true }, (_evt, file) => {
        if (file && !IGNORED_WATCH.test(String(file))) trigger();
      });
    } catch {
      console.log(pc.yellow('  (no se pudo activar --watch en esta plataforma)'));
    }
  }

  server.listen(port, () => {
    console.log('');
    console.log(pc.bold('  Code Graph Unified'));
    console.log(`  ${pc.cyan(`http://localhost:${port}`)}`);
    if (flags.watch) console.log(pc.dim('  watch activo — se re-analiza al guardar'));
    if (!webDist) console.log(pc.dim('  (solo API — compilá con npm run build)'));
    console.log(pc.dim('  Ctrl+C para salir'));
    console.log('');
  });
}
