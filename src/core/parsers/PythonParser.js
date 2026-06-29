import { BaseParser } from './BaseParser.js';

export class PythonParser extends BaseParser {
  constructor() {
    super('python', ['py']);
  }

  detectImports(content) {
    const imports = [];
    const imp = content.matchAll(/^(?:from|import)\s+([\w.]+)/gm);
    for (const m of imp) imports.push({ module: m[1], type: 'external' });
    return [...new Map(imports.map(i => [i.module, i])).values()];
  }

  detectExports(_content) {
    return [];
  }

  detectFunctions(content) {
    const fns = [];
    for (const m of content.matchAll(/def\s+(\w+)\s*\(/g)) fns.push(m[1]);
    return fns;
  }

  detectClasses(content) {
    const classes = [];
    for (const m of content.matchAll(/class\s+(\w+)/g)) classes.push(m[1]);
    return classes;
  }

  detectErrors(_content, _context) {
    const errors = [];
    const lines = _content.split('\n');
    const rules = [
      { pattern: /\bprint\s*\(/, type: 'debug', msg: 'print() en producción' },
      { pattern: /eval\s*\(/, type: 'security', msg: 'Uso de eval() — evitar' },
      { pattern: /exec\s*\(/, type: 'security', msg: 'Uso de exec() — evitar' },
      { pattern: /except\s*:/g, type: 'error', msg: 'Except vacío — error silenciado' },
    ];

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return;
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          errors.push({
            type: rule.type,
            msg: rule.msg,
            line: i + 1,
            snippet: trimmed.slice(0, 80),
          });
        }
      }
    });

    return errors;
  }

  _calcDocCoverage(content, functions) {
    if (functions.length === 0) return 100;
    const pyDoc = (content.match(/"""/g) || []).length / 2;
    const documented = Math.min(pyDoc, functions.length);
    return Math.round((documented / functions.length) * 100);
  }
}
