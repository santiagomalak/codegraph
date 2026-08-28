/**
 * model.ts — El "contrato" de datos de todo Code Graph Unified.
 *
 * Todos los paquetes (core, cli, web, mcp) hablan con estas mismas estructuras.
 * Si cambiás algo acá, cambiás la forma de los datos en toda la app.
 *
 * Flujo de los tipos:
 *   SourceFile[]  --(parsing)-->  ParsedFile[]  --(graph)-->  KnowledgeGraph
 *                                       \--(summary)--> ProjectSummary
 *   Todo junto = ProjectAnalysis
 */

/** Lenguajes que el motor sabe entender. `unknown` = archivo listado pero no parseado. */
export type LanguageId =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'go'
  | 'rust'
  | 'java'
  | 'css'
  | 'json'
  | 'markdown'
  | 'unknown';

// ────────────────────────────────────────────────────────────────────────────
// ENTRADA
// ────────────────────────────────────────────────────────────────────────────

/** Un archivo crudo del proyecto. Es lo único que el core necesita como input. */
export interface SourceFile {
  /** Ruta relativa a la raíz del proyecto, SIEMPRE con "/" como separador. */
  path: string;
  /** Contenido completo del archivo en texto. */
  content: string;
}

// ────────────────────────────────────────────────────────────────────────────
// RESULTADO DEL PARSING (una entrada por archivo)
// ────────────────────────────────────────────────────────────────────────────

/** Un `import` / `require` / `from ... import` encontrado en un archivo. */
export interface ImportRef {
  /** El especificador tal cual aparece en el código: "./utils", "react", "os.path". */
  specifier: string;
  /** `internal` = apunta a otro archivo del proyecto. `external` = paquete de terceros. */
  kind: 'internal' | 'external';
  /** Si se pudo resolver a un archivo real del proyecto, su `path`. */
  resolved?: string;
  line: number;
}

/**
 * Configuración para resolver imports que no son rutas relativas: alias de
 * `tsconfig`, `baseUrl` y paquetes de un monorepo. La arma `readProjectConfig`
 * (en `@codegraph/core/node`) leyendo `tsconfig.json` / `package.json`.
 *
 * Sin esto, un import como `@/components/Button` o `@miapp/core` se considera
 * "externo" aunque en realidad apunte a un archivo del proyecto.
 */
export interface ResolverConfig {
  /**
   * Carpeta base para imports "sin punto" (de `compilerOptions.baseUrl`).
   * Relativa a la raíz del proyecto, con "/" como separador.
   */
  baseUrl?: string;
  /**
   * Alias de `compilerOptions.paths`. Clave y valores usan `*` como comodín:
   * `{ "@/*": ["src/*"], "@lib": ["src/lib/index.ts"] }`.
   * Los valores son relativos a `baseUrl` (o a la raíz si no hay `baseUrl`).
   */
  paths?: Record<string, string[]>;
  /**
   * Paquetes de un monorepo (npm workspaces): nombre del paquete → dónde vive.
   * Un import de `<nombre>` o `<nombre>/sub` se resuelve dentro de esa carpeta.
   */
  workspaces?: Record<string, WorkspacePackage>;
  /**
   * Ruta de módulo de `go.mod` (ej: `github.com/me/proj`). Un import Go que
   * empiece con este prefijo se resuelve a una carpeta del proyecto.
   */
  goModule?: string;
}

export interface WorkspacePackage {
  /** Carpeta del paquete, relativa a la raíz del proyecto, POSIX. */
  dir: string;
  /** Archivo de entrada (de `main` / `module` / `exports`), si se pudo determinar. */
  entry?: string;
  /**
   * Subpaths declarados en `exports` del package.json: `"node"` → `"dist/node-fs.js"`
   * (relativo a `dir`). El resolver los mapea de vuelta a la fuente (`dist`→`src`,
   * `.js`→`.ts`) para conectar imports como `@miapp/core/node`.
   */
  exports?: Record<string, string>;
}

/** Una función, clase o método declarado en un archivo. */
export interface SymbolDef {
  /** Id estable y único: `${filePath}#${name}` (o `#${name}@${line}` si hay choque). */
  id: string;
  name: string;
  kind: 'function' | 'class' | 'method';
  line: number;
  endLine: number;
  /** `true` si el símbolo se exporta (JS/TS) o es "público" (Python: no empieza con "_"). */
  exported: boolean;
  async: boolean;
  /** Nombres invocados dentro del cuerpo, SIN resolver todavía (ej: ["fetch", "parse"]). */
  calls: string[];
  /** `true` si tiene JSDoc (`/** ... *​/`) o docstring de Python. */
  documented: boolean;
}

/** Un problema detectado por las reglas heurísticas (no es un error de compilación). */
export interface Issue {
  /** Id de la regla que lo disparó, ej: "no-console", "no-eval". */
  rule: string;
  category: 'debug' | 'security' | 'style' | 'smell' | 'todo';
  severity: 'info' | 'warning' | 'error';
  message: string;
  line: number;
  /** El texto de la línea (recortado) para dar contexto. */
  snippet: string;
}

/** Métricas numéricas de un archivo. */
export interface FileMetrics {
  /** Líneas totales, incluyendo blancos y comentarios. */
  loc: number;
  /** Líneas de código "reales" (sin blancos ni comentarios). */
  sloc: number;
  /** Líneas de comentario. */
  comments: number;
  /**
   * Complejidad ciclomática aproximada del archivo:
   * 1 + cantidad de puntos de decisión (if, for, while, case, and/or, ?, catch...).
   */
  complexity: number;
  /** % de símbolos con documentación (0..100). 100 si no hay símbolos. */
  docCoverage: number;
}

/**
 * Datos que salen del historial de git para un archivo.
 * Solo aparece si el análisis se corrió con historial disponible.
 */
export interface GitStats {
  /** Cantidad de commits que tocaron este archivo. */
  commits: number;
  /** Autores distintos que lo tocaron. */
  authors: number;
  /** Líneas agregadas + borradas a lo largo de toda su historia. */
  linesChanged: number;
  /** Fecha ISO del primer commit que lo incluyó. */
  firstCommit: string;
  /** Fecha ISO del último commit que lo tocó. */
  lastCommit: string;
}

/**
 * Datos para el "timeline": la historia del proyecto dividida en `buckets`
 * tramos iguales entre el primer y el último commit.
 */
export interface GitTimeline {
  /** Fecha ISO del primer commit del rango analizado. */
  from: string;
  /** Fecha ISO del último commit. */
  to: string;
  /** En cuántos tramos se dividió la historia (fijo). */
  buckets: number;
  /** Cantidad de commits en cada tramo. length === buckets. */
  commitsPerBucket: number[];
  /** path → índice de tramo en el que el archivo apareció por primera vez. */
  fileFirstBucket: Record<string, number>;
  /** path → cuántos commits lo tocaron en cada tramo. length === buckets. */
  fileActivity: Record<string, number[]>;
}

/**
 * El proyecto medido en un punto de su historia (un commit). Lo produce
 * `buildSnapshots` re-analizando el repo en ~20 commits repartidos, con
 * `git worktree`. A diferencia del `GitTimeline` (que usa las métricas de hoy),
 * acá cada punto tiene las métricas **reales de esa época**.
 */
export interface SnapshotPoint {
  /** SHA del commit (10 chars). */
  sha: string;
  /** Fecha ISO del commit. */
  date: string;
  /** Primera línea del mensaje del commit. */
  subject: string;
  files: number;
  loc: number;
  symbols: number;
  avgComplexity: number;
  /** Health score 0..100 de esa época. */
  health: number;
  grade: HealthScore['grade'];
  issues: number;
  circularDeps: number;
  /** Dominios de esa época (label → nº de archivos), top 8. */
  domains: Array<{ label: string; files: number }>;
}

/** La historia del proyecto re-analizada en varios puntos. */
export interface SnapshotSeries {
  /** SHA de HEAD cuando se generó (para detectar si quedó viejo). */
  headSha: string;
  generatedAt: string;
  points: SnapshotPoint[];
}

/**
 * Dos archivos que se modifican juntos en git una y otra vez ("acoplamiento
 * temporal"). Si además NO se importan entre sí, es acoplamiento *oculto*:
 * dependen uno del otro pero el código no lo dice.
 */
export interface CouplingPair {
  /** Los dos paths, ordenados alfabéticamente (a < b). */
  a: string;
  b: string;
  /** En cuántos commits aparecieron los dos juntos. */
  shared: number;
  /** shared / min(commits(a), commits(b)) — 0..1. Alto = van siempre de la mano. */
  coupling: number;
}

/** El resultado de parsear UN archivo. */
export interface ParsedFile {
  path: string;
  language: LanguageId;
  metrics: FileMetrics;
  imports: ImportRef[];
  /** Nombres exportados del archivo (JS/TS). Vacío en Python. */
  exports: string[];
  symbols: SymbolDef[];
  issues: Issue[];
  /** Datos de git, si había historial. */
  git?: GitStats;
  /** Mensaje de error si el parser falló con este archivo (el resto queda vacío). */
  parseError?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// EL GRAFO DE CONOCIMIENTO
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de nodo del grafo. El grafo mezcla varios "planos" en una sola estructura;
 * la UI decide cuáles mostrar.
 *  - file:     un archivo del proyecto
 *  - symbol:   una función / clase / método
 *  - domain:   un grupo de archivos que forman un "área" del proyecto (auth, ui, ...)
 *  - external: un paquete de terceros (react, os, ...)
 */
export type NodeType = 'file' | 'symbol' | 'domain' | 'external';

/**
 * Tipos de arista:
 *  - contains:  file → symbol   (el archivo declara ese símbolo)
 *  - imports:   file → file     (o file → external)
 *  - calls:     symbol → symbol (una función llama a otra)
 *  - member-of: file → domain   (el archivo pertenece a ese dominio)
 *  - co-change: file → file     (se modifican juntos en git; ver CouplingPair)
 */
export type EdgeType = 'contains' | 'imports' | 'calls' | 'member-of' | 'co-change';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;

  // Presentes cuando type === 'file'
  path?: string;
  language?: LanguageId;
  loc?: number;
  complexity?: number;
  issues?: number;
  /** Id del nodo `domain` al que pertenece este archivo. */
  domain?: string;
  /** Métrica de "riesgo" 0..1 (complejidad + issues). */
  risk?: number;
  /** Commits que tocaron el archivo (solo si hubo historial de git). */
  churn?: number;
  /**
   * "Hotspot" 0..1: complejidad × churn. Alto = archivo complejo que además
   * cambia mucho → donde suelen vivir los bugs y donde más rinde refactorizar.
   */
  hotspot?: number;

  // Presentes cuando type === 'symbol'
  kind?: SymbolDef['kind'];
  /** Path del archivo que declara el símbolo. */
  file?: string;
  exported?: boolean;

  // Presentes cuando type === 'domain'
  fileCount?: number;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  /** `true` si esta arista `imports` forma parte de un ciclo de dependencias. */
  circular?: boolean;
  /** Fuerza 0..1 de la arista. Hoy solo lo usan las `co-change` (acoplamiento). */
  weight?: number;
  /**
   * Solo en aristas `co-change`: `true` si los dos archivos NO se importan entre
   * sí → acoplamiento oculto (el caso interesante).
   */
  hidden?: boolean;
}

/** Un "área" del proyecto detectada automáticamente por clustering. */
export interface DomainInfo {
  id: string;
  label: string;
  /** Paths de los archivos que la componen. */
  files: string[];
  color: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Cada ciclo es una lista ordenada de paths de archivo: a → b → c → a. */
  cycles: string[][];
  domains: DomainInfo[];
}

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN DEL PROYECTO
// ────────────────────────────────────────────────────────────────────────────

/** Puntaje de salud del proyecto (0..100) con el desglose de por qué. */
export interface HealthScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Cada factor resta puntos; `impact` es negativo. */
  factors: Array<{ label: string; impact: number; detail: string }>;
}

export interface ProjectSummary {
  projectName: string;
  totalFiles: number;
  totalLoc: number;
  totalSymbols: number;
  totalIssues: number;
  issuesBySeverity: Record<'info' | 'warning' | 'error', number>;
  /** ej: { "TypeScript": 42, "Python": 10 } */
  filesByLanguage: Record<string, number>;
  avgComplexity: number;
  circularDeps: number;
  /** Archivos que parecen ser el punto de entrada (index, main, app, server...). */
  entryPoints: string[];
  /** Tecnologías detectadas: ["React", "Vite", "Tailwind CSS", "FastAPI"...]. */
  stack: string[];
  health: HealthScore;
  /**
   * Los archivos más "hotspot" (complejo + cambia mucho), ordenados.
   * Vacío si no hubo historial de git.
   */
  hotspots: Array<{
    path: string;
    score: number;
    complexity: number;
    commits: number;
  }>;
  /**
   * Pares de archivos que se modifican juntos en git pero NO se importan
   * (acoplamiento oculto), ordenados por fuerza. Vacío si no hubo historial.
   */
  temporalCoupling: Array<{ a: string; b: string; shared: number; coupling: number }>;
}

// ────────────────────────────────────────────────────────────────────────────
// RESULTADO COMPLETO
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectAnalysis {
  projectName: string;
  /** ISO timestamp de cuándo se corrió el análisis. */
  analyzedAt: string;
  durationMs: number;
  files: ParsedFile[];
  graph: KnowledgeGraph;
  summary: ProjectSummary;
  /** Datos para el slider temporal. Solo si la carpeta es un repo git. */
  timeline?: GitTimeline;
}

export interface AnalyzeOptions {
  /** Nombre del proyecto. Si se omite, se infiere del primer path. */
  projectName?: string;
  /**
   * Carpeta donde están los `.wasm` de las gramáticas tree-sitter.
   * En Node se detecta solo; en el navegador hay que pasarla (ej: "/wasm").
   */
  wasmDir?: string;
  /** Callback de progreso, se llama una vez por archivo parseado. */
  onProgress?: (done: number, total: number, path: string) => void;
  /**
   * Estadísticas de git por archivo (path relativo → GitStats). Si se pasa,
   * el análisis agrega `churn`/`hotspot` a los archivos y `summary.hotspots`.
   * La lee `readGitHistory` de `@codegraph/core/node`.
   */
  git?: Record<string, GitStats>;
  /** Datos del timeline (los devuelve `readGitHistory` junto con `git`). */
  timeline?: GitTimeline;
  /**
   * Pares de archivos acoplados en el tiempo (los devuelve `readGitHistory`).
   * El análisis marca cuáles ya se importan y agrega aristas `co-change`.
   */
  coupling?: CouplingPair[];
  /**
   * Cómo resolver imports que no son rutas relativas (alias de tsconfig,
   * paquetes de un monorepo, módulo de go.mod). La arma `readProjectConfig`
   * de `@codegraph/core/node`.
   */
  resolve?: ResolverConfig;
}
