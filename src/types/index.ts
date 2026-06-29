/**
 * Tipos compartidos para Code Graph Unified
 * Definición centralizada de todas las interfaces del proyecto
 */

// ============================================================
// ARCHIVOS Y ANÁLISIS
// ============================================================

export interface FileInfo {
  name: string;
  path: string;
  ext: string;
  lang: string;
  color: string;
  size: number;
  lines: number;
  content: string;
}

export interface ImportInfo {
  module: string;
  type: 'internal' | 'external';
  line?: number;
}

export interface ExportInfo {
  name: string;
  type: 'named' | 'default';
  line?: number;
}

export interface FunctionInfo {
  name: string;
  line: number;
  isAsync: boolean;
  isArrow: boolean;
  params: string[];
  complexity: number;
  hasJSDoc: boolean;
}

export interface ClassInfo {
  name: string;
  line: number;
  extends?: string;
  implements: string[];
  methods: FunctionInfo[];
  hasJSDoc: boolean;
}

export interface ErrorInfo {
  type: ErrorType;
  message: string;
  line: number;
  column?: number;
  snippet: string;
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
}

export type ErrorType =
  | 'debug'
  | 'todo'
  | 'fixme'
  | 'hack'
  | 'security'
  | 'style'
  | 'performance'
  | 'accessibility'
  | 'type-safety'
  | 'dead-code'
  | 'complexity'
  | 'dependency';

export interface MetricsInfo {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  linesOfComment: number;
  docCoverage: number;
  maintainabilityIndex: number;
  halsteadVolume?: number;
  halsteadDifficulty?: number;
  halsteadEffort?: number;
}

export interface FileAnalysis {
  name: string;
  path: string;
  ext: string;
  lang: string;
  color: string;
  size: number;
  lines: number;
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  errors: ErrorInfo[];
  metrics: MetricsInfo;
}

// ============================================================
// GRAFO DE DEPENDENCIAS
// ============================================================

export interface GraphNode {
  id: string;
  name: string;
  path: string;
  lang: string;
  color: string;
  errors: number;
  complexity: number;
  lines: number;
  index: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  circular: boolean;
  type: 'import' | 'require' | 'dynamic' | 'css';
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circular: string[]; // Array de "source→target" que forman ciclos
}

export interface CircularDependency {
  cycle: string[];
  severity: 'critical' | 'warning';
}

// ============================================================
// RESUMEN DEL PROYECTO
// ============================================================

export interface ProjectSummary {
  projectName: string;
  totalFiles: number;
  totalLines: number;
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  totalFunctions: number;
  totalClasses: number;
  avgComplexity: number;
  maxComplexity: number;
  totalEdges: number;
  circularDeps: number;
  byLanguage: Record<string, number>;
  byErrorType: Record<ErrorType, number>;
  entryPoints: string[];
  stack: string[];
}

// ============================================================
// RESULTADO COMPLETO DEL ANÁLISIS
// ============================================================

export interface AnalysisResult {
  files: FileAnalysis[];
  graph: DependencyGraph;
  summary: ProjectSummary;
  projectName: string;
  analyzedAt: string;
  duration: number;
}

// ============================================================
// OPCIONES DE CONFIGURACIÓN
// ============================================================

export interface AnalyzerOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number; // bytes
  enableMetrics?: boolean;
  enableErrors?: boolean;
  enableGraph?: boolean;
  customRules?: ErrorRule[];
  tsconfigPath?: string;
}

export interface ErrorRule {
  id: string;
  name: string;
  type: ErrorType;
  severity: 'error' | 'warning' | 'info';
  pattern: RegExp | ((line: string, context: ParseContext) => boolean);
  message: string;
  languages: string[];
}

export interface ParseContext {
  filePath: string;
  language: string;
  lineNumber: number;
  fullContent: string;
  lines: string[];
}

// ============================================================
// EVENTOS DE LA APLICACIÓN
// ============================================================

export interface AppEvents {
  'analysis:start': { fileCount: number };
  'analysis:progress': { current: number; total: number; currentFile: string };
  'analysis:complete': { result: AnalysisResult };
  'analysis:error': { error: Error };
  'node:selected': { node: GraphNode; file: FileAnalysis };
  'node:deselected': void;
  'node:hover': { node: GraphNode };
  'filter:change': { filter: FilterOptions };
  'export:codemap': void;
  'export:json': void;
  'export:copy': void;
}

export interface FilterOptions {
  showErrors: boolean;
  showCircular: boolean;
  minComplexity?: number;
  maxComplexity?: number;
  languages?: string[];
  errorTypes?: ErrorType[];
}

// ============================================================
// EXPORTACIÓN
// ============================================================

export interface CodemapOptions {
  includeMetrics?: boolean;
  includeErrors?: boolean;
  includeGraph?: boolean;
  includeFunctions?: boolean;
  includeClasses?: boolean;
  maxItemsPerSection?: number;
}

export interface JsonExportOptions {
  pretty?: boolean;
  includeContent?: boolean;
  minify?: boolean;
}

// ============================================================
// WORKER
// ============================================================

export interface WorkerMessage<T = unknown> {
  type: 'analyze' | 'cancel' | 'progress';
  payload: T;
}

export interface AnalyzeWorkerPayload {
  files: Array<{
    name: string;
    path: string;
    ext: string;
    content: string;
  }>;
  options: AnalyzerOptions;
}

export interface ProgressWorkerPayload {
  current: number;
  total: number;
  currentFile: string;
}

// ============================================================
// UTILIDADES
// ============================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type NonEmptyArray<T> = [T, ...T[]];

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}
