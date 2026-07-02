/**
 * Ejemplo: Parser personalizado para archivos .vue (Vue.js SFC)
 * Demuestra cómo crear un parser para un nuevo lenguaje/formato
 */

import type { ParserPlugin, ParseResult, FunctionInfo, ImportInfo } from '../index.ts';

const vueParser: ParserPlugin = {
  name: 'vue-parser',
  extensions: ['vue'],
  language: 'Vue',
  parse: content => {
    const result: ParseResult = {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      metrics: {
        cyclomaticComplexity: 1,
        cognitiveComplexity: 0,
        linesOfCode: 0,
        linesOfComment: 0,
        docCoverage: 0,
        maintainabilityIndex: 100,
      },
      errors: [],
    };

    // Extraer <script> block
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];

      // Imports
      const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
      for (const match of scriptContent.matchAll(importRegex)) {
        result.imports.push({
          module: match[1],
          type: match[1].startsWith('.') ? 'internal' : 'external',
        } as ImportInfo);
      }

      // Funciones
      const fnRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/g;
      for (const match of scriptContent.matchAll(fnRegex)) {
        const name = match[1] || match[2];
        if (name && !['if', 'for', 'while', 'switch'].includes(name)) {
          result.functions.push({
            name,
            line: 0,
            isAsync: false,
            isArrow: true,
            params: [],
            complexity: 1,
            hasJSDoc: false,
          } as FunctionInfo);
        }
      }

      // Complejidad básica
      const complexity =
        (scriptContent.match(/\b(if|else|for|while|switch|catch|\?\.)\b/g) || []).length + 1;
      result.metrics.cyclomaticComplexity = complexity;
    }

    // Extraer <template> block
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (templateMatch) {
      const templateContent = templateMatch[1];
      result.metrics.linesOfCode += templateContent.split('\n').length;
    }

    // Extraer <style> block
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      const styleContent = styleMatch[1];
      result.metrics.linesOfCode += styleContent.split('\n').length;
    }

    result.metrics.linesOfCode = content.split('\n').length;

    return result;
  },
};

export default vueParser;
