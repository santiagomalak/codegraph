import { BaseParser } from './BaseParser.js';

export class JavaScriptParser extends BaseParser {
  constructor() {
    super('JavaScript', ['js', 'jsx', 'ts', 'tsx']);
  }

  detectImports(content) {
    const imports = [];

    // ES6: import X from 'y'
    const esm = content.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
    for (const m of esm)
      imports.push({ module: m[1], type: m[1].startsWith('.') ? 'internal' : 'external' });

    // ES6 side-effect: import 'y'
    const sideEffect = content.matchAll(/import\s+['"](.+?)['"]/g);
    for (const m of sideEffect)
      imports.push({ module: m[1], type: m[1].startsWith('.') ? 'internal' : 'external' });

    // CommonJS: require('y')
    const cjs = content.matchAll(/require\s*\(\s*['"](.+?)['"]\s*\)/g);
    for (const m of cjs)
      imports.push({ module: m[1], type: m[1].startsWith('.') ? 'internal' : 'external' });

    // Dynamic: import('y')
    const dyn = content.matchAll(/import\s*\(\s*['"](.+?)['"]\s*\)/g);
    for (const m of dyn)
      imports.push({ module: m[1], type: m[1].startsWith('.') ? 'internal' : 'external' });

    // Deduplicar
    return [...new Map(imports.map(i => [i.module, i])).values()];
  }

  detectExports(content) {
    const exports = [];

    const named = content.matchAll(
      /export\s+(?:const|let|var|function|class|async function)\s+(\w+)/g
    );
    const defaultE = content.match(/export\s+default\s+(?:class|function)?\s*(\w+)?/);

    for (const m of named) exports.push({ name: m[1], type: 'named' });
    if (defaultE) exports.push({ name: defaultE[1] || 'default', type: 'default' });

    return exports;
  }

  detectFunctions(content) {
    const fns = [];
    const patterns = [
      /function\s+(\w+)\s*\(/g,
      /const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/g,
      /(\w+)\s*\([^)]*\)\s*\{/g,
    ];
    for (const re of patterns)
      for (const m of content.matchAll(re))
        if (!['if', 'while', 'for', 'switch', 'catch'].includes(m[1])) fns.push(m[1]);
    return [...new Set(fns)];
  }

  detectClasses(content) {
    const classes = [];
    for (const m of content.matchAll(/class\s+(\w+)/g)) classes.push(m[1]);
    return classes;
  }

  detectErrors(content, context) {
    const errors = [];
    const lines = content.split('\n');
    const lang = context.language?.toLowerCase() || '';
    const isCode = ['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(lang);
    if (!isCode) return errors;

    const rules = [
      {
        pattern: /\bconsole\.(log|warn|error|debug)\b/,
        type: 'debug',
        msg: 'console.* en producción',
      },
      { pattern: /\bdebugger\b/, type: 'debug', msg: 'Sentencia debugger activa' },
      { pattern: /\/\/\s*TODO/i, type: 'todo', msg: 'TODO pendiente' },
      { pattern: /\/\/\s*FIXME/i, type: 'fixme', msg: 'FIXME pendiente' },
      { pattern: /\/\/\s*HACK/i, type: 'hack', msg: 'HACK identificado' },
      { pattern: /\.innerHTML\s*=/, type: 'security', msg: 'Posible XSS con innerHTML' },
      { pattern: /eval\s*\(/, type: 'security', msg: 'Uso de eval() — evitar' },
      { pattern: /var\s+\w+/, type: 'style', msg: 'Usar const/let en lugar de var' },
      { pattern: /==(?!=)/, type: 'style', msg: 'Usar === en lugar de ==' },
      {
        pattern: /catch\s*\(\w+\)\s*\{\s*\}/,
        type: 'error',
        msg: 'Catch vacío — error silenciado',
      },
      { pattern: /\.catch\s*\(\s*\)/, type: 'error', msg: '.catch() vacío' },
    ];

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') && !trimmed.includes('TODO') && !trimmed.includes('FIXME'))
        return;
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
}
