export class BaseParser {
  constructor(language, extensions) {
    this.language = language;
    this.extensions = extensions;
  }

  parse(fileInfo) {
    const content = fileInfo.content;
    return {
      imports: this.detectImports(content),
      exports: this.detectExports(content),
      functions: this.detectFunctions(content),
      classes: this.detectClasses(content),
      metrics: this.calculateMetrics(content, this.detectFunctions(content)),
      errors: this.detectErrors(content, { language: this.language }),
    };
  }

  detectImports(_content) {
    return [];
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

  calculateMetrics(content, functions) {
    const lines = content.split('\n').length;
    const complexity = this._calcCyclomaticComplexity(content);
    const docCoverage = this._calcDocCoverage(content, functions);
    return { lines, complexity, docCoverage };
  }

  _calcCyclomaticComplexity(content) {
    const keywords = ['if', 'else if', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?'];
    let complexity = 1;
    for (const kw of keywords) {
      const re = new RegExp(`\\b${kw.replace(/[|?]/g, '\\$&')}\\b`, 'g');
      complexity += (content.match(re) || []).length;
    }
    return complexity;
  }

  _calcDocCoverage(content, functions) {
    if (functions.length === 0) return 100;
    const jsDoc = (content.match(/\/\*\*/g) || []).length;
    const documented = Math.min(jsDoc, functions.length);
    return Math.round((documented / functions.length) * 100);
  }
}
