/**
 * Ejemplo: Plugin completo - "CodeGraph Essentials"
 * Bundle de parser, reglas y exportador en un solo plugin
 * Demuestra la estructura completa de un plugin real
 */

import type { PluginManifest, PluginContext, FileAnalysis, DependencyGraph } from '../index.ts';
import vueParser from './vue-parser.ts';
import noConsoleLogRule from './no-console-log-rule.ts';
import mermaidExporter from './mermaid-exporter.ts';

const essentialsPlugin: PluginManifest = {
  metadata: {
    name: 'codegraph-essentials',
    version: '1.0.0',
    description: 'Bundle esencial: Vue parser, reglas de calidad, exportador Mermaid',
    author: 'CodeGraph Team',
    type: 'parser',
    entryPoint: 'essentials-plugin.ts',
    dependencies: [],
    configSchema: {
      enableVueParser: { type: 'boolean', default: true },
      enableNoConsoleLog: { type: 'boolean', default: true },
      enableMermaidExporter: { type: 'boolean', default: true },
    },
  },

  async init(context: PluginContext) {
    const config = context.config as Record<string, unknown>;

    // Registrar parser Vue
    if (config.enableVueParser !== false) {
      context.registerParser(vueParser);
      context.logger.info('Vue parser registrado');
    }

    // Registrar regla no-console-log
    if (config.enableNoConsoleLog !== false) {
      context.registerRule(noConsoleLogRule);
      context.logger.info('Regla no-console-log registrada');
    }

    // Registrar exportador Mermaid
    if (config.enableMermaidExporter !== false) {
      context.registerExporter(mermaidExporter);
      context.logger.info('Exportador Mermaid registrado');
    }

    // Hook: log al analizar archivo
    context.on('onFileAnalyzed', async (data: unknown) => {
      const file = data as FileAnalysis;
      if (file.errors && file.errors.length > 0) {
        context.logger.warn(`Archivo con errores: ${file.path} (${file.errors.length} errores)`);
      }
    });

    // Hook: log al construir grafo
    context.on('onGraphBuilt', async (data: unknown) => {
      const graph = data as DependencyGraph;
      context.logger.info(
        `Grafo construido: ${graph.nodes.length} nodos, ${graph.edges.length} edges`
      );
    });

    context.logger.info('Plugin "codegraph-essentials" inicializado completamente');
  },

  async destroy() {
    // Cleanup si es necesario
  },
};

export default essentialsPlugin;
