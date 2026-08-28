/**
 * ast-utils.ts — Helpers para recorrer el árbol de sintaxis de tree-sitter.
 *
 * tree-sitter nos da un árbol de nodos. Cada nodo tiene:
 *   - .type          → nombre del nodo ("function_definition", "call", ...)
 *   - .text          → el código fuente de ese nodo
 *   - .namedChildren → hijos "de verdad" (sin comas, paréntesis, etc.)
 *   - .childForFieldName("name") → hijo con un rol concreto
 *
 * Estas funciones son genéricas; lo específico de cada lenguaje vive en
 * parse-python.ts / parse-javascript.ts.
 */

import type { SyntaxNode } from './parser-registry.js';

/** Recorre el árbol en preorden y llama `visit` en cada nodo. */
export function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) walk(child, visit);
}

/** Igual que `walk` pero se puede cortar una rama devolviendo `false` en `visit`. */
export function walkPrune(node: SyntaxNode, visit: (n: SyntaxNode) => boolean): void {
  if (visit(node) === false) return;
  for (const child of node.namedChildren) walkPrune(child, visit);
}

/** Devuelve todos los descendientes (incluido `node`) cuyo `.type` esté en `types`. */
export function findAll(node: SyntaxNode, types: ReadonlySet<string>): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  walk(node, (n) => {
    if (types.has(n.type)) out.push(n);
  });
  return out;
}

/** El primer ancestro cuyo `.type` esté en `types`, o null. */
export function closest(node: SyntaxNode, types: ReadonlySet<string>): SyntaxNode | null {
  let cur: SyntaxNode | null = node.parent;
  while (cur) {
    if (types.has(cur.type)) return cur;
    cur = cur.parent;
  }
  return null;
}

/**
 * Nombre "invocado" de un nodo de llamada.
 *  foo()          → "foo"
 *  obj.bar()      → "bar"
 *  a.b.c()        → "c"
 *  new Thing()    → "Thing"
 * Devuelve null si no se puede sacar un identificador simple.
 */
export function calleeName(callNode: SyntaxNode): string | null {
  // El nodo "función" puede estar en el field "function" (JS) o ser el primer hijo (Python).
  const fn = callNode.childForFieldName('function') ?? callNode.namedChildren[0];
  if (!fn) return null;

  switch (fn.type) {
    case 'identifier':
    case 'property_identifier':
      return fn.text;
    // obj.method  /  a.b.c
    case 'member_expression':
    case 'attribute': {
      const prop =
        fn.childForFieldName('property') ??
        fn.childForFieldName('attribute') ??
        fn.namedChildren[fn.namedChildren.length - 1];
      return prop?.text ?? null;
    }
    // new Thing()
    case 'new_expression': {
      const ctor = fn.childForFieldName('constructor') ?? fn.namedChildren[0];
      return ctor?.text ?? null;
    }
    default:
      return null;
  }
}

/**
 * Junta los nombres de todas las funciones llamadas dentro de `node`.
 * `callTypes` = qué nodos cuentan como "llamada" en ese lenguaje.
 */
export function collectCalls(node: SyntaxNode, callTypes: ReadonlySet<string>): string[] {
  const names = new Set<string>();
  walk(node, (n) => {
    if (!callTypes.has(n.type)) return;
    const name = calleeName(n);
    if (name) names.add(name);
  });
  return [...names];
}

/**
 * Complejidad ciclomática aproximada de un subárbol:
 * 1 + (nodos de decisión) + (operadores lógicos && || and or ??).
 */
export function cyclomaticComplexity(
  root: SyntaxNode,
  decisionTypes: ReadonlySet<string>,
  logicalOperators: ReadonlySet<string>,
): number {
  let count = 1;
  walk(root, (n) => {
    if (decisionTypes.has(n.type)) count++;
    // operadores binarios lógicos: el operador está en el field "operator"
    if (n.type === 'binary_expression' || n.type === 'boolean_operator') {
      const op = n.childForFieldName('operator')?.text ?? '';
      if (logicalOperators.has(op)) count++;
    }
  });
  return count;
}
