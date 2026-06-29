/**
 * Interfaces y tipos para parsers AST
 */

import type {
  FileInfo,
  ImportInfo,
  ExportInfo,
  FunctionInfo,
  ClassInfo,
  ErrorInfo,
  MetricsInfo,
  ParseContext,
} from '@types';

export interface Parser {
  readonly language: string;
  readonly extensions: string[];
  parse(file: FileInfo): ParseResult;
  detectErrors(content: string, context: ParseContext): ErrorInfo[];
  calculateMetrics(content: string, functions: FunctionInfo[]): MetricsInfo;
}

export interface ParseResult {
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  metrics: MetricsInfo;
  errors: ErrorInfo[];
}

export interface ParserFactory {
  getParser(extension: string): Parser | null;
  getParserByLanguage(language: string): Parser | null;
  registerParser(parser: Parser): void;
}
