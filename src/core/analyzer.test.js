import { describe, it, expect } from 'vitest';
import { CodeAnalyzer } from './analyzer.js';

const analyzer = new CodeAnalyzer();

function createMockFile(name, content, relativePath) {
  const file = new File([content], name, { type: 'text/javascript' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relativePath,
    writable: false,
  });
  return file;
}

function createFileList(files) {
  const list = [...files];
  list.item = index => list[index];
  return list;
}

describe('CodeAnalyzer (integration via analyzeFiles)', () => {
  it('detecta imports ES6', async () => {
    const file = createMockFile(
      'main.js',
      `import foo from './foo';\nimport { bar } from 'bar';`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.imports.map(i => i.module)).toContain('./foo');
    expect(mainFile.imports.map(i => i.module)).toContain('bar');
  });

  it('detecta require CommonJS', async () => {
    const file = createMockFile(
      'main.js',
      `const fs = require('fs');\nconst local = require('./local');`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.imports.map(i => i.module)).toContain('fs');
    expect(mainFile.imports.map(i => i.module)).toContain('./local');
  });

  it('detecta imports dinámicos', async () => {
    const file = createMockFile(
      'main.js',
      `const mod = await import('./lazy');`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.imports.map(i => i.module)).toContain('./lazy');
  });

  it('detecta funciones JS', async () => {
    const file = createMockFile(
      'main.js',
      `function foo() {}\nconst bar = () => {}\nconst baz = async () => {};`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.functions).toContain('foo');
    expect(mainFile.functions).toContain('bar');
    expect(mainFile.functions).toContain('baz');
  });

  it('detecta funciones Python', async () => {
    const file = createMockFile(
      'main.py',
      `def foo():\n    pass\n\ndef bar(x, y):\n    return x + y`,
      'project/main.py'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.py');
    expect(mainFile.functions).toContain('foo');
    expect(mainFile.functions).toContain('bar');
  });

  it('detecta clases', async () => {
    const file = createMockFile(
      'main.js',
      `class Foo {}\nclass Bar extends Foo {}`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.classes).toContain('Foo');
    expect(mainFile.classes).toContain('Bar');
  });

  it('detecta errores: console.log', async () => {
    const file = createMockFile('main.js', `console.log('hola');`, 'project/main.js');
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.errors.some(e => e.type === 'debug')).toBe(true);
  });

  it('detecta errores: debugger', async () => {
    const file = createMockFile('main.js', `debugger;`, 'project/main.js');
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.errors.some(e => e.type === 'debug')).toBe(true);
  });

  it('detecta errores: innerHTML', async () => {
    const file = createMockFile('main.js', `el.innerHTML = '<script>';`, 'project/main.js');
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.errors.some(e => e.type === 'security')).toBe(true);
  });

  it('detecta errores: eval', async () => {
    const file = createMockFile('main.js', `eval('code');`, 'project/main.js');
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.errors.some(e => e.type === 'security')).toBe(true);
  });

  it('calcula complejidad ciclomática', async () => {
    const file = createMockFile(
      'main.js',
      `if (a) {}\nelse if (b) {}\nfor (;;) {}\nwhile (c) {}\nswitch (d) { case 1: }\ntry {} catch (e) {}`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.complexity).toBeGreaterThan(1);
  });

  it('calcula doc coverage', async () => {
    const file = createMockFile(
      'main.js',
      `/** doc */\nfunction foo() {}\nfunction bar() {}`,
      'project/main.js'
    );
    const result = await analyzer.analyzeFiles(createFileList([file]));
    const mainFile = result.files.find(f => f.path === 'project/main.js');
    expect(mainFile.docCoverage).toBe(50);
  });

  it('resuelve rutas relativas y construye grafo', async () => {
    const fileA = createMockFile('a.js', `import './b'`, 'project/src/a.js');
    const fileB = createMockFile('b.js', `export const x = 1`, 'project/src/b.js');
    const result = await analyzer.analyzeFiles(createFileList([fileA, fileB]));
    const edge = result.graph.edges.find(
      e => e.source === 'project/src/a.js' && e.target === 'project/src/b.js'
    );
    expect(edge).toBeDefined();
  });

  it('detecta dependencias circulares en grafo', async () => {
    const fileA = createMockFile('a.js', `import './b'`, 'project/a.js');
    const fileB = createMockFile('b.js', `import './c'`, 'project/b.js');
    const fileC = createMockFile('c.js', `import './a'`, 'project/c.js');
    const result = await analyzer.analyzeFiles(createFileList([fileA, fileB, fileC]));
    expect(result.graph.circular.length).toBeGreaterThan(0);
  });
});
