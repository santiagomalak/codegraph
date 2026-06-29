import { JavaScriptParser } from './JavaScriptParser.js';

export class TypeScriptParser extends JavaScriptParser {
  constructor() {
    super();
    this.language = 'typescript';
    this.extensions = ['ts', 'tsx'];
  }

  detectImports(content) {
    const imports = super.detectImports(content);

    const typeImports = content.matchAll(/import\s+type\s+.*?from\s+['"](.+?)['"]/g);
    for (const m of typeImports)
      imports.push({
        module: m[1],
        type: m[1].startsWith('.') ? 'internal' : 'external',
        isType: true,
      });

    return imports;
  }

  detectExports(content) {
    const exports = super.detectExports(content);

    const typeExports = content.matchAll(/export\s+type\s+(\w+)/g);
    for (const m of typeExports) exports.push({ name: m[1], type: 'type' });

    return exports;
  }

  detectErrors(content, context) {
    const errors = super.detectErrors(content, context);

    const anyType = content.matchAll(/:\s*any\b/g);
    for (const m of anyType) {
      errors.push({
        type: 'style',
        msg: 'Uso de tipo any — evitar',
        line: content.slice(0, m.index).split('\n').length,
        snippet: '',
      });
    }

    return errors;
  }
}
