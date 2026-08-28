/**
 * resolve-imports.ts — Convierte un `import` en el path del archivo al que apunta.
 *
 * Un import puede decir "./utils", "os.path", "react", "@/components/Button" o
 * "@miapp/core". Acá tratamos de encontrar a qué archivo REAL del proyecto
 * corresponde (si es que hay uno). Si no se puede resolver → dependencia externa.
 *
 * Orden en que se intenta resolver un import de JS/TS:
 *   1. ruta relativa ("./x", "../y")                → contra la carpeta del archivo
 *   2. alias de tsconfig ("@/x" → "src/x")          → config.paths
 *   3. paquete del monorepo ("@miapp/core")         → config.workspaces
 *   4. baseUrl ("components/Button")                → config.baseUrl
 *   (si nada matchea, es un paquete de terceros)
 *
 * Sin dependencias de Node: trabajamos solo con strings de path estilo POSIX.
 * La `ResolverConfig` la arma `readProjectConfig` (en `@codegraph/core/node`).
 */

import type { ImportRef, ResolverConfig } from '../model.js';

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

/**
 * Una regla de alias ya "compilada". `@/*` → `src/*` se guarda como
 * `{ from: '@/', to: ['src/'], wildcard: true }`. Un alias exacto (`@lib`)
 * se guarda con `wildcard: false` y matchea solo el string completo.
 */
interface AliasRule {
  from: string;
  to: string[];
  wildcard: boolean;
}

function compileAliases(config: ResolverConfig): AliasRule[] {
  const base = config.baseUrl ? config.baseUrl.replace(/\/$/, '') + '/' : '';
  const rules: AliasRule[] = [];
  for (const [key, targets] of Object.entries(config.paths ?? {})) {
    const wildcard = key.endsWith('/*') || key.endsWith('*');
    const from = wildcard ? key.replace(/\*$/, '') : key;
    const to = targets.map((t) => normalize(base + t.replace(/\*$/, '')));
    rules.push({ from, to, wildcard });
  }
  // Prefijos más largos primero (más específicos ganan).
  rules.sort((a, b) => b.from.length - a.from.length);
  return rules;
}

/**
 * Un `exports` apunta al build (`dist/x.js`); nosotros analizamos la fuente.
 * Devuelve candidatos: tal cual, y con `dist`→`src` y la extensión sacada.
 */
function sourceCandidates(distPath: string): string[] {
  const noExt = distPath.replace(/\.(js|mjs|cjs|d\.ts)$/, '');
  return [
    distPath,
    noExt,
    noExt.replace(/(^|\/)dist(\/)/, '$1src$2'),
    noExt.replace(/(^|\/)dist(\/)/, '$1lib$2'),
    noExt.replace(/(^|\/)build(\/)/, '$1src$2'),
  ].map((p) => normalize(p));
}

export class ImportResolver {
  private files: Set<string>;
  /** Índice para Python: "paquete.modulo" → "paquete/modulo.py". */
  private pythonModules = new Map<string, string>();
  private config: ResolverConfig;
  private aliases: AliasRule[];

  constructor(allPaths: Iterable<string>, config: ResolverConfig = {}) {
    this.files = new Set(allPaths);
    this.config = config;
    this.aliases = compileAliases(config);
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
    if (specifier.startsWith('.')) {
      // Ruta relativa: contra la carpeta del archivo que importa.
      const base = normalize(`${dirname(importerPath)}/${specifier}`);
      // NodeNext escribe imports con ".js" aunque el archivo real sea ".ts".
      const bases = [base];
      const jsLike = base.match(/\.(js|jsx|mjs|cjs)$/);
      if (jsLike) bases.push(base.slice(0, -jsLike[0].length));
      for (const b of bases) {
        const hit = this.tryFile(b);
        if (hit) return hit;
      }
      return undefined;
    }
    // No relativo: alias → workspace → baseUrl.
    return this.resolveAlias(specifier) ?? this.resolveWorkspace(specifier) ?? this.resolveBaseUrl(specifier);
  }

  /**
   * Prueba un path "base" contra los archivos reales: exacto, con cada
   * extensión, o como carpeta con index. Devuelve el match o undefined.
   */
  private tryFile(base: string): string | undefined {
    if (!base) return undefined;
    if (this.files.has(base)) return base;
    for (const ext of JS_EXTENSIONS) {
      if (this.files.has(base + ext)) return base + ext;
    }
    for (const idx of JS_INDEX) {
      if (this.files.has(base + idx)) return base + idx;
    }
    return undefined;
  }

  private resolveAlias(specifier: string): string | undefined {
    for (const rule of this.aliases) {
      if (rule.wildcard) {
        if (!specifier.startsWith(rule.from)) continue;
        const rest = specifier.slice(rule.from.length);
        for (const target of rule.to) {
          const hit = this.tryFile(normalize(`${target}/${rest}`));
          if (hit) return hit;
        }
      } else if (specifier === rule.from) {
        for (const target of rule.to) {
          const hit = this.tryFile(target);
          if (hit) return hit;
        }
      }
    }
    return undefined;
  }

  private resolveWorkspace(specifier: string): string | undefined {
    const workspaces = this.config.workspaces;
    if (!workspaces) return undefined;

    for (const [name, pkg] of Object.entries(workspaces)) {
      if (specifier === name) {
        // "import x from '@miapp/core'": el archivo de entrada del paquete.
        if (pkg.entry && this.files.has(pkg.entry)) return pkg.entry;
        return (
          this.tryFile(`${pkg.dir}/index`) ??
          this.tryFile(`${pkg.dir}/src/index`)
        );
      }
      if (specifier.startsWith(name + '/')) {
        // "import x from '@miapp/core/utils'": subpath dentro del paquete.
        const sub = specifier.slice(name.length + 1);
        // 1. Subpath declarado en `exports` (ej "dist/node-fs.js" → probamos la fuente).
        const declared = pkg.exports?.[sub];
        if (declared) {
          for (const cand of sourceCandidates(`${pkg.dir}/${declared}`)) {
            const hit = this.tryFile(cand);
            if (hit) return hit;
          }
        }
        // 2. Convención: el subpath es la ruta tal cual (o bajo src/).
        return this.tryFile(`${pkg.dir}/${sub}`) ?? this.tryFile(`${pkg.dir}/src/${sub}`);
      }
    }
    return undefined;
  }

  private resolveBaseUrl(specifier: string): string | undefined {
    if (this.config.baseUrl === undefined) return undefined;
    const base = normalize(`${this.config.baseUrl}/${specifier}`);
    return this.tryFile(base);
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
