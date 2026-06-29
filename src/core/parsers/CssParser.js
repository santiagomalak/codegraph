import { BaseParser } from './BaseParser.js';

export class CssParser extends BaseParser {
  constructor() {
    super('css', ['css', 'scss']);
  }

  detectImports(content) {
    const imports = [];
    const css = content.matchAll(/@import\s+['"](.+?)['"]/g);
    for (const m of css) imports.push({ module: m[1], type: 'internal' });
    return [...new Map(imports.map(i => [i.module, i])).values()];
  }

  detectExports(_content) {
    return [];
  }

  detectFunctions(_content) {
    return [];
  }

  detectClasses(_content) {
    return [];
  }

  detectErrors(_content, _context) {
    return [];
  }

  calculateMetrics(content, _functions) {
    const lines = content.split('\n').length;
    const rules = (content.match(/\{[^}]*\}/g) || []).length;
    const selectors = (content.match(/[^{]+(?=\{)/g) || []).length;
    return { lines, complexity: rules, docCoverage: 100, selectors };
  }
}
