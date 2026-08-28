#!/usr/bin/env node
/**
 * @codegraph/cli — punto de entrada del comando `codegraph`.
 *
 *   codegraph analyze [carpeta]   analiza y escribe .codegraph/
 *   codegraph serve   [carpeta]   analiza y levanta la web local
 *
 * Toda la lógica real vive en ./commands/*. Este archivo solo define la interfaz.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { runAnalyze } from './commands/analyze.js';
import { runServe } from './commands/serve.js';

const program = new Command();

program
  .name('codegraph')
  .description('Convierte un proyecto en un grafo de conocimiento multicapa.')
  .version('3.0.0');

program
  .command('analyze')
  .description('Analiza una carpeta y escribe el grafo, el CODEMAP y el JSON para IA.')
  .argument('[carpeta]', 'carpeta a analizar', '.')
  .option('-o, --out <dir>', 'carpeta de salida (default: <carpeta>/.codegraph)')
  .option('--no-json', 'no escribir analysis.json / graph.json')
  .option('--no-codemap', 'no escribir CODEMAP.md')
  .option('--detail <nivel>', 'nivel del CODEMAP: compact | normal | full', 'normal')
  .option('--max-tokens <n>', 'recortar el CODEMAP para entrar en ~n tokens')
  .option('--graph-full', 'graph.json completo (con símbolos y llamadas), no el slim')
  .option('--stdout', 'imprimir el JSON completo por stdout en vez de escribir archivos')
  .option('--fail-on-cycles', 'salir con error si hay dependencias circulares')
  .option('--fail-on-error', 'salir con error si hay issues de severidad "error"')
  .option('--max-complexity <n>', 'salir con error si la complejidad promedio supera n')
  .action((carpeta: string, opts) => runAnalyze(carpeta, opts).catch(fail));

program
  .command('serve')
  .description('Analiza una carpeta y levanta la interfaz web local.')
  .argument('[carpeta]', 'carpeta a analizar', '.')
  .option('-p, --port <n>', 'puerto', '4173')
  .action((carpeta: string, opts) => runServe(carpeta, opts).catch(fail));

program.parseAsync();

function fail(err: unknown): never {
  console.error(pc.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
}
