#!/usr/bin/env node
/**
 * @codegraph/mcp — Servidor MCP de Code Graph Unified.
 *
 * Deja que Claude (u otro cliente MCP) consulte el grafo del proyecto con
 * preguntas chicas, en vez de tener que cargar todo el análisis en el contexto.
 *
 * Apunta a UNA carpeta, en este orden de prioridad:
 *   1. --project <ruta>
 *   2. variable de entorno CODEGRAPH_PROJECT
 *   3. el directorio actual
 *
 * Uso en Claude Code (.mcp.json del proyecto):
 *   {
 *     "mcpServers": {
 *       "codegraph": {
 *         "command": "npx",
 *         "args": ["-y", "@codegraph/mcp", "--project", "."]
 *       }
 *     }
 *   }
 */

import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  toCodemapMarkdown,
  dependenciesOf,
  dependentsOf,
  impactOf,
  findSymbol,
  fileDetail,
  domainDetail,
} from '@codegraph/core';
// (hotspots viven en analysis.summary; no hace falta importar helpers)
import { Project } from './project.js';

function resolveProjectDir(): string {
  const argi = process.argv.indexOf('--project');
  if (argi !== -1 && process.argv[argi + 1]) return resolve(process.argv[argi + 1]!);
  if (process.env.CODEGRAPH_PROJECT) return resolve(process.env.CODEGRAPH_PROJECT);
  return process.cwd();
}

const project = new Project(resolveProjectDir());
const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const server = new McpServer({ name: 'codegraph', version: '3.0.0' });

// ── overview ────────────────────────────────────────────────────────────────
server.registerTool(
  'overview',
  {
    title: 'Resumen del proyecto',
    description:
      'Panorama general del proyecto en Markdown: stack, dominios, dependencias circulares, ' +
      'puntos de entrada, archivos más grandes. Empezá siempre por acá.',
    inputSchema: {
      detail: z.enum(['compact', 'normal', 'full']).optional().describe('nivel de detalle (default: normal)'),
    },
  },
  async ({ detail }) => text(toCodemapMarkdown(await project.get(), { detail: detail ?? 'normal' })),
);

// ── list_files ──────────────────────────────────────────────────────────────
server.registerTool(
  'list_files',
  {
    title: 'Listar archivos',
    description: 'Todos los archivos analizados, con su lenguaje, dominio, líneas e issues.',
    inputSchema: {
      domain: z.string().optional().describe('filtrar por nombre de dominio'),
    },
  },
  async ({ domain }) => {
    const a = await project.get();
    const domainOf = new Map<string, string>();
    for (const d of a.graph.domains) for (const f of d.files) domainOf.set(f, d.label);
    const rows = a.files
      .filter((f) => !domain || domainOf.get(f.path) === domain)
      .map((f) => ({
        path: f.path,
        lang: f.language,
        domain: domainOf.get(f.path),
        loc: f.metrics.loc,
        complexity: f.metrics.complexity,
        issues: f.issues.length,
      }));
    return text(rows);
  },
);

// ── list_domains ────────────────────────────────────────────────────────────
server.registerTool(
  'list_domains',
  {
    title: 'Listar dominios',
    description:
      'Las áreas del proyecto detectadas automáticamente, con cuántos archivos tiene cada una ' +
      'y de qué otros dominios depende.',
    inputSchema: {},
  },
  async () => {
    const a = await project.get();
    return text(
      a.graph.domains
        .map((d) => domainDetail(a, d.label))
        .filter(Boolean),
    );
  },
);

// ── describe_file ───────────────────────────────────────────────────────────
server.registerTool(
  'describe_file',
  {
    title: 'Describir un archivo',
    description:
      'Todo sobre un archivo: lenguaje, métricas, dominio, imports (con la ruta resuelta), ' +
      'exports, símbolos (funciones/clases), issues y quién lo importa.',
    inputSchema: { path: z.string().describe('ruta relativa del archivo, ej: src/app.ts') },
  },
  async ({ path }) => {
    const detail = fileDetail(await project.get(), path);
    return text(detail ?? `No se encontró el archivo "${path}".`);
  },
);

// ── dependencies_of / dependents_of ─────────────────────────────────────────
server.registerTool(
  'dependencies_of',
  {
    title: 'Dependencias de un archivo',
    description: 'Archivos internos que este archivo importa (directos).',
    inputSchema: { path: z.string() },
  },
  async ({ path }) => text(dependenciesOf(await project.get(), path)),
);

server.registerTool(
  'dependents_of',
  {
    title: 'Dependientes de un archivo',
    description: 'Archivos internos que importan a este archivo (directos).',
    inputSchema: { path: z.string() },
  },
  async ({ path }) => text(dependentsOf(await project.get(), path)),
);

// ── impact_of ───────────────────────────────────────────────────────────────
server.registerTool(
  'impact_of',
  {
    title: 'Impacto de un cambio',
    description:
      'Todos los archivos afectados si tocás este archivo (dependientes directos e indirectos). ' +
      'Útil antes de refactorizar.',
    inputSchema: { path: z.string() },
  },
  async ({ path }) => {
    const affected = impactOf(await project.get(), path);
    return text({ file: path, affects: affected.length, files: affected });
  },
);

// ── find_symbol ─────────────────────────────────────────────────────────────
server.registerTool(
  'find_symbol',
  {
    title: 'Buscar un símbolo',
    description:
      'Dónde está definida una función o clase (por nombre) y qué archivos la llaman.',
    inputSchema: { name: z.string().describe('nombre de la función o clase') },
  },
  async ({ name }) => {
    const hits = findSymbol(await project.get(), name);
    return text(hits.length ? hits : `No se encontró ningún símbolo llamado "${name}".`);
  },
);

// ── hotspots ────────────────────────────────────────────────────────────────
server.registerTool(
  'hotspots',
  {
    title: 'Hotspots del proyecto',
    description:
      'Archivos que son complejos Y cambian mucho (según git). Suelen ser donde ' +
      'están los bugs y donde más rinde refactorizar. Vacío si no hay historial de git.',
    inputSchema: {},
  },
  async () => {
    const a = await project.get();
    return text(
      a.summary.hotspots.length
        ? a.summary.hotspots
        : 'Sin datos de hotspots (¿la carpeta no es un repo git?).',
    );
  },
);

// ── temporal_coupling ───────────────────────────────────────────────────────
server.registerTool(
  'temporal_coupling',
  {
    title: 'Acoplamiento oculto',
    description:
      'Pares de archivos que en git se modifican juntos una y otra vez pero NO se ' +
      'importan entre sí. Señal de una dependencia que el código no muestra. ' +
      'Vacío si no hay historial de git.',
    inputSchema: {},
  },
  async () => {
    const a = await project.get();
    return text(
      a.summary.temporalCoupling.length
        ? a.summary.temporalCoupling
        : 'Sin acoplamiento oculto detectado (o la carpeta no es un repo git).',
    );
  },
);

// ── circular_dependencies ───────────────────────────────────────────────────
server.registerTool(
  'circular_dependencies',
  {
    title: 'Dependencias circulares',
    description: 'Los ciclos de imports del proyecto (cada uno como lista de archivos).',
    inputSchema: {},
  },
  async () => {
    const a = await project.get();
    return text(a.graph.cycles.length ? a.graph.cycles : 'No hay dependencias circulares. 🎉');
  },
);

// ── search ──────────────────────────────────────────────────────────────────
server.registerTool(
  'search',
  {
    title: 'Buscar archivos',
    description: 'Archivos cuya ruta contiene el texto buscado.',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    const a = await project.get();
    const q = query.toLowerCase();
    return text(a.files.filter((f) => f.path.toLowerCase().includes(q)).map((f) => f.path));
  },
);

// ── refresh ─────────────────────────────────────────────────────────────────
server.registerTool(
  'refresh',
  {
    title: 'Re-analizar',
    description: 'Vuelve a leer y analizar la carpeta del proyecto (usalo después de cambiar código).',
    inputSchema: {},
  },
  async () => {
    const a = await project.refresh();
    return text(`Re-analizado: ${a.summary.totalFiles} archivos, salud ${a.summary.health.score}/100.`);
  },
);

// ── arranque ────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[codegraph-mcp] escuchando · proyecto: ${project.rootDir}`);
