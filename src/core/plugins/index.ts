/**
 * Plugin Types - Tipos centrales para el sistema de plugins
 * Define la interfaz que deben implementar todos los plugins
 */

export type PluginType = 'parser' | 'rule' | 'exporter' | 'transformer';

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  entryPoint: string;
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}

export interface PluginContext {
  // API para parsers
  registerParser: (parser: ParserPlugin) => void;
  getParser: (extension: string) => ParserPlugin | undefined;
  getAllParsers: () => ParserPlugin[];

  // API para reglas
  registerRule: (rule: RulePlugin) => void;
  getRules: (language?: string) => RulePlugin[];
  getAllRules: () => RulePlugin[];

  // API para exportadores
  registerExporter: (exporter: ExporterPlugin) => void;
  getExporter: (name: string) => ExporterPlugin | undefined;
  getAllExporters: () => ExporterPlugin[];

  // Hooks lifecycle
  on: (hook: HookName, callback: HookCallback) => void;
  off: (hook: HookName, callback: HookCallback) => void;
  emit: (hook: HookName, data: unknown) => Promise<void>;

  // Utilities
  logger: PluginLogger;
  config: Record<string, unknown>;
}

export type HookName =
  | 'onFileAnalyzed'
  | 'onGraphBuilt'
  | 'onExport'
  | 'onAnalysisStart'
  | 'onAnalysisComplete'
  | 'onError';

export type HookCallback = (data: unknown, context: PluginContext) => Promise<void> | void;

export interface PluginLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ParserPlugin {
  name: string;
  extensions: string[];
  language: string;
  parse: (content: string, filePath: string) => ParseResult;
}

export interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  metrics: MetricsInfo;
  errors: ErrorInfo[];
}

export interface ImportInfo {
  module: string;
  type: 'internal' | 'external';
  line?: number;
}

export interface ExportInfo {
  name: string;
  type: 'named' | 'default' | 'type';
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
  type: string;
  message: string;
  line: number;
  column?: number;
  snippet: string;
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
}

export interface MetricsInfo {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  linesOfComment: number;
  docCoverage: number;
  maintainabilityIndex: number;
}

export interface RulePlugin {
  name: string;
  id: string;
  languages: string[];
  severity: 'error' | 'warning' | 'info';
  description: string;
  check: (line: string, context: RuleContext) => RuleViolation | null;
}

export interface RuleContext {
  filePath: string;
  language: string;
  lineNumber: number;
  fullContent: string;
  lines: string[];
}

export interface RuleViolation {
  message: string;
  line?: number;
  column?: number;
  severity?: 'error' | 'warning' | 'info';
  fix?: (content: string) => string;
}

export interface ExporterPlugin {
  name: string;
  description: string;
  extension: string;
  mimeType: string;
  export: (data: ExportData, options?: ExportOptions) => string | Blob | Promise<string | Blob>;
}

export interface ExportData {
  files: FileAnalysis[];
  graph: DependencyGraph;
  summary: ProjectSummary;
  projectName: string;
  analyzedAt: string;
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
  docCoverage: number;
  complexity: number;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circular: string[];
}

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
}

export interface GraphEdge {
  source: string;
  target: string;
  circular: boolean;
  type: 'import' | 'require' | 'dynamic' | 'css';
}

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
  byErrorType: Record<string, number>;
  entryPoints: string[];
  stack: string[];
}

export interface ExportOptions {
  pretty?: boolean;
  includeContent?: boolean;
  minify?: boolean;
  format?: string;
  groupByDirectory?: boolean;
  includeExternal?: boolean;
}

export interface PluginManifest {
  metadata: PluginMetadata;
  init: (context: PluginContext) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

export interface PluginConfig {
  enabled: boolean;
  options?: Record<string, unknown>;
}

export type PluginRegistry = Map<string, PluginManifest>;
