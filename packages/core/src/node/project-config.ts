/**
 * project-config.ts — Lectura de config del proyecto para resolver imports:
 * tsconfig/jsconfig (alias + baseUrl), npm workspaces, go.mod.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { ResolverConfig, WorkspacePackage } from '../model.js';

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** JSON tolerante: saca comentarios `//` y de bloque, y comas colgantes. */
function parseJsonc<T = unknown>(text: string): T | null {
  const noComments = text
    .replace(/"(?:\\.|[^"\\])*"|\/\/.*$|\/\*[\s\S]*?\*\//gm, (m) => (m[0] === '"' ? m : ''))
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(noComments) as T;
  } catch {
    return null;
  }
}

async function readJsonc<T = unknown>(file: string): Promise<T | null> {
  try {
    return parseJsonc<T>(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

interface TsConfig {
  extends?: string;
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
}

/**
 * Junta `compilerOptions.baseUrl` y `.paths` de un tsconfig/jsconfig, siguiendo
 * la cadena de `extends` (hasta 4 niveles, para no colgarse con ciclos raros).
 */
async function readTsConfigChain(file: string, depth = 0): Promise<TsConfig['compilerOptions']> {
  if (depth > 4) return {};
  const cfg = await readJsonc<TsConfig>(file);
  if (!cfg) return {};

  let inherited: TsConfig['compilerOptions'] = {};
  if (cfg.extends) {
    const ext = cfg.extends.startsWith('.')
      ? join(dirname(file), cfg.extends)
      : null;
    if (ext) {
      inherited = await readTsConfigChain(ext.endsWith('.json') ? ext : ext + '.json', depth + 1);
    }
  }
  return { ...inherited, ...cfg.compilerOptions };
}

interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  workspaces?: string[] | { packages?: string[] };
}

function pickExport(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return pickExport(o['import'] ?? o['module'] ?? o['default'] ?? o['require'] ?? o['types']);
  }
  return undefined;
}

function entryOf(pkg: PackageJson): string | undefined {
  const exp = pkg.exports;
  if (exp && typeof exp === 'object') {
    const dot = (exp as Record<string, unknown>)['.'] ?? exp;
    const e = pickExport(dot);
    if (e) return e;
  }
  return pkg.module ?? pkg.main;
}

function subExportsOf(pkg: PackageJson): Record<string, string> | undefined {
  const exp = pkg.exports;
  if (!exp || typeof exp !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(exp as Record<string, unknown>)) {
    if (!key.startsWith('./') || key === '.') continue;
    const target = pickExport(val);
    if (target) out[key.slice(2)] = target.replace(/^\.\//, '');
  }
  return Object.keys(out).length ? out : undefined;
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Lee la config del proyecto que hace falta para resolver imports "sin punto":
 * los alias de tsconfig y los paquetes de un monorepo (npm workspaces).
 */
export async function readProjectConfig(rootDir: string): Promise<ResolverConfig> {
  const config: ResolverConfig = {};

  // ── tsconfig / jsconfig (alias + baseUrl) ──────────────────────────────
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const co = await readTsConfigChain(join(rootDir, name));
    if (co && (co.baseUrl || co.paths)) {
      if (co.baseUrl) config.baseUrl = toPosix(co.baseUrl).replace(/^\.\//, '').replace(/\/$/, '');
      if (co.paths) config.paths = co.paths;
      break;
    }
  }

  // ── npm workspaces (paquetes del monorepo) ─────────────────────────────
  const rootPkg = await readJsonc<PackageJson>(join(rootDir, 'package.json'));
  const wsField = rootPkg?.workspaces;
  const globs = Array.isArray(wsField) ? wsField : (wsField?.packages ?? []);
  if (globs.length) {
    const workspaces: Record<string, WorkspacePackage> = {};
    for (const glob of globs) {
      const dirs = glob.endsWith('/*')
        ? await subdirs(join(rootDir, glob.slice(0, -2)))
        : [join(rootDir, glob)];
      for (const abs of dirs) {
        const pkg = await readJsonc<PackageJson>(join(abs, 'package.json'));
        if (!pkg?.name) continue;
        const dir = toPosix(relative(rootDir, abs));
        const rawEntry = entryOf(pkg);
        const entry = rawEntry
          ? toPosix(join(dir, rawEntry.replace(/^\.\//, '')))
          : undefined;
        const exports = subExportsOf(pkg);
        workspaces[pkg.name] = {
          dir,
          ...(entry ? { entry } : {}),
          ...(exports ? { exports } : {}),
        };
      }
    }
    if (Object.keys(workspaces).length) config.workspaces = workspaces;
  }

  // ── go.mod (módulo de un proyecto Go) ─────────────────────────────────
  try {
    const goMod = await readFile(join(rootDir, 'go.mod'), 'utf8');
    const m = goMod.match(/^\s*module\s+(\S+)/m);
    if (m) config.goModule = m[1];
  } catch {
    /* no hay go.mod */
  }

  return config;
}