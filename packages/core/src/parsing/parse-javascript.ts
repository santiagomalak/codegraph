/**
 * parse-javascript.ts — Extrae estructura de archivos JS / JSX / TS / TSX.
 *
 * El mismo código sirve para los 4: la gramática tree-sitter cambia
 * (ver parser-registry.ts) pero los nombres de nodo que nos importan son iguales.
 *
 * Nodos relevantes:
 *   import_statement                       →  import x from './y'
 *   call_expression con function=require   →  const x = require('y')
 *   call_expression con function=import    →  await import('y')
 *   export_statement                       →  export const/function/class ...
 *   function_declaration / arrow_function  →  funciones
 *   class_declaration + method_definition  →  clases y métodos
 *   call_expression / new_expression       →  llamadas
 */

import type { ImportRef, SymbolDef } from '../model.js';
import type { SyntaxNode } from './parser-registry.js';
import { lineOf, endLineOf } from './parser-registry.js';
import { collectCalls, cyclomaticComplexity, findAll } from './ast-utils.js';
import type { ParseStructure } from './types.js';

const DECISION = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'switch_case', // los `case` con valor; `switch_default` no está en esta lista
]);
const LOGICAL = new Set(['&&', '||', '??']);
const CALLS = new Set(['call_expression', 'new_expression']);

function stripQuotes(s: string): string {
  return s.replace(/^['"`]|['"`]$/g, '');
}

function isAsync(node: SyntaxNode): boolean {
  return node.children.some((c) => c.type === 'async');
}

/** ¿La función/clase tiene un comentario JSDoc justo antes? */
function hasJsDoc(node: SyntaxNode): boolean {
  let prev = node.previousSibling;
  // Saltar decoradores / export wrapper handled by caller; mirar el comentario anterior.
  if (node.parent?.type === 'export_statement') prev = node.parent.previousSibling;
  return prev?.type === 'comment' && prev.text.startsWith('/**');
}

function parseImports(root: SyntaxNode): ImportRef[] {
  const imports: ImportRef[] = [];

  findAll(root, new Set(['import_statement', 'call_expression'])).forEach((node) => {
    if (node.type === 'import_statement') {
      const src = node.childForFieldName('source');
      if (src) {
        const spec = stripQuotes(src.text);
        imports.push({ specifier: spec, kind: spec.startsWith('.') ? 'internal' : 'external', line: lineOf(node) });
      }
      return;
    }
    // call_expression: require('x') o import('x')
    const fn = node.childForFieldName('function');
    const isRequire = fn?.type === 'identifier' && fn.text === 'require';
    const isDynImport = fn?.type === 'import';
    if (!isRequire && !isDynImport) return;
    const arg = node.childForFieldName('arguments')?.namedChildren[0];
    if (arg?.type === 'string') {
      const spec = stripQuotes(arg.text);
      imports.push({ specifier: spec, kind: spec.startsWith('.') ? 'internal' : 'external', line: lineOf(node) });
    }
  });

  // Dedup por (specifier + línea aprox)
  const seen = new Set<string>();
  return imports.filter((i) => {
    const key = i.specifier;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeSymbol(
  path: string,
  node: SyntaxNode,
  kind: SymbolDef['kind'],
  name: string,
  exported: boolean,
): SymbolDef {
  return {
    id: `${path}#${name}`,
    name,
    kind,
    line: lineOf(node),
    endLine: endLineOf(node),
    exported,
    async: isAsync(node),
    calls: collectCalls(node, CALLS),
    documented: hasJsDoc(node),
  };
}

export function parseJavaScript(root: SyntaxNode, path: string): ParseStructure {
  const imports = parseImports(root);
  const symbols: SymbolDef[] = [];
  const exports: string[] = [];

  const handleDeclaration = (node: SyntaxNode, exported: boolean): void => {
    switch (node.type) {
      case 'function_declaration':
      case 'generator_function_declaration': {
        const name = node.childForFieldName('name')?.text ?? '(anon)';
        if (exported) exports.push(name);
        symbols.push(makeSymbol(path, node, 'function', name, exported));
        break;
      }
      case 'class_declaration': {
        const name = node.childForFieldName('name')?.text ?? '(anon)';
        if (exported) exports.push(name);
        symbols.push(makeSymbol(path, node, 'class', name, exported));
        const body = node.childForFieldName('body');
        for (const member of body?.namedChildren ?? []) {
          if (member.type === 'method_definition') {
            const mName = member.childForFieldName('name')?.text ?? '(anon)';
            symbols.push(makeSymbol(path, member, 'method', `${name}.${mName}`, exported));
          }
        }
        break;
      }
      case 'lexical_declaration':
      case 'variable_declaration': {
        for (const decl of node.namedChildren) {
          if (decl.type !== 'variable_declarator') continue;
          const value = decl.childForFieldName('value');
          if (value && (value.type === 'arrow_function' || value.type === 'function_expression' || value.type === 'function')) {
            const name = decl.childForFieldName('name')?.text ?? '(anon)';
            if (exported) exports.push(name);
            symbols.push(makeSymbol(path, value, 'function', name, exported));
          }
        }
        break;
      }
    }
  };

  for (const node of root.namedChildren) {
    if (node.type === 'export_statement') {
      const decl = node.childForFieldName('declaration');
      if (decl) {
        handleDeclaration(decl, true);
      } else {
        // export { a, b }  /  export default X
        if (node.text.includes('default')) exports.push('default');
        for (const spec of findAll(node, new Set(['export_specifier']))) {
          const n = spec.childForFieldName('name')?.text;
          if (n) exports.push(n);
        }
      }
      continue;
    }
    handleDeclaration(node, false);
  }

  const documented = symbols.filter((s) => s.documented).length;
  return {
    imports,
    exports: [...new Set(exports)],
    symbols,
    complexity: cyclomaticComplexity(root, DECISION, LOGICAL),
    documentedRatio: symbols.length ? Math.round((documented / symbols.length) * 100) : 100,
  };
}
