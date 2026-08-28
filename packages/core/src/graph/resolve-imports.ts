/**
 * resolve-imports.ts — Convierte un `import` en el path del archivo al que apunta.
 *
 * Un import puede decir "./utils" o "os.path" o "react". Acá tratamos de
 * encontrar a qué archivo REAL del proyecto corresponde (si es que hay uno).
 * Si no se puede resolver, se considera dependencia externa.
 *
 * Sin dependencias de Node: trabajamos solo con strings de path estilo POSIX.
 */

import type { ImportRef } from '../model.js';

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss'];
const JS_INDEX = JS_EXTENSIONS.map((e) => `/index${e}`);

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Normaliza "a/b/../c/./d" → "a/c/d". */
function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export class ImportResolver {
  private files: Set<string>;
  /** Índice para Python: "paquete.modulo" → "paquete/modulo.py". */
  private pythonModules = new Map<string, string>();

  constructor(allPaths: Iterable<string>) {
    this.files = new Set(allPaths);
    this.buildPythonIndex();
  }

  private buildPythonIndex(): void {
    for (const path of this.files) {
      if (!path.endsWith('.py')) continue;
      const noExt = path.slice(0, -3); // sin ".py"
      const asModule = noExt.replace(/\/__init__$/, '').replace(/\//g, '.');
      this.pythonModules.set(asModule, path);
      // También sin el primer segmento (layouts tipo "src/pkg/...").
      const firstDot = asModule.indexOf('.');
      if (firstDot > 0) this.pythonModules.set(asModule.slice(firstDot + 1), path);
    }
  }

  /** Devuelve el path del archivo destino, o undefined si es externo/no resoluble. */
  resolve(importerPath: string, ref: ImportRef): string | undefined {
    if (importerPath.endsWith('.py')) return this.resolvePython(importerPath, ref.specifier);
    return this.resolveJs(importerPath, ref.specifier);
  }

  // ── JavaScript / TypeScript ──────────────────────────────────────────────
  private resolveJs(importerPath: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) return undefined; // paquete npm
    const baseTarget = normalize(`${dirname(importerPath)}/${specifier}`);

    if (this.files.has(baseTarget)) return baseTarget;
    for (const ext of JS_EXTENSIONS) {
      if (this.files.has(baseTarget + ext)) return baseTarget + ext;
    }
    for (const idx of JS_INDEX) {
      if (this.files.has(baseTarget + idx)) return baseTarget + idx;
    }
    return undefined;
  }

  // ── Python ───────────────────────────────────────────────────────────────
  private resolvePython(importerPath: string, specifier: string): string | undefined {
    // Import relativo: cuenta los puntos iniciales.
    if (specifier.startsWith('.')) {
      const dots = specifier.match(/^\.+/)![0].length;
      const rest = specifier.slice(dots); // "foo.bar" o ""
      let dir = dirname(importerPath);
      for (let i = 1; i < dots; i++) dir = dirname(dir); // cada punto extra sube un nivel
      const subPath = rest.replace(/\./g, '/');
      const base = normalize(dir + (subPath ? '/' + subPath : ''));
      return this.files.has(base + '.py')
        ? base + '.py'
        : this.files.has(base + '/__init__.py')
          ? base + '/__init__.py'
          : undefined;
    }
    // Import absoluto: "paquete.modulo" → índice.
    return this.pythonModules.get(specifier) ?? this.pythonModules.get(specifier.split('.')[0]!);
  }
}
