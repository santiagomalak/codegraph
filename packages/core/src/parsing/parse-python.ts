/**
 * parse-python.ts — Extrae estructura de un archivo Python usando su AST.
 *
 * Saca: imports, funciones y clases (con métodos), llamadas entre ellas,
 * complejidad y cobertura de docstrings.
 *
 * Nodos tree-sitter-python relevantes:
 *   import_statement          →  import os, import a.b as c
 *   import_from_statement     →  from a.b import x  /  from . import y
 *   function_definition       →  def foo(...): ...
 *   class_definition          →  class Bar: ...
 *   decorated_definition      →  @deco\n def/class ...
 *   call                      →  foo(...)
 */

import type { ImportRef, SymbolDef } from '../model.js';
import type { SyntaxNode } from './parser-registry.js';
import { lineOf, endLineOf } from './parser-registry.js';
import { collectCalls, cyclomaticComplexity } from './ast-utils.js';
import type { ParseStructure } from './types.js';

const DECISION = new Set([
  'if_statement',
  'elif_clause',
  'for_statement',
  'while_statement',
  'except_clause',
  'conditional_expression',
  'assert_statement',
  'list_comprehension',
  'dictionary_comprehension',
  'set_comprehension',
  'generator_expression',
]);
const LOGICAL = new Set(['and', 'or']);
const CALLS = new Set(['call']);

/** Desenvuelve `decorated_definition` para llegar a la función/clase real. */
function unwrap(node: SyntaxNode): SyntaxNode {
  if (node.type === 'decorated_definition') {
    return node.childForFieldName('definition') ?? node;
  }
  return node;
}

function isAsync(node: SyntaxNode): boolean {
  return node.children.some((c) => c.type === 'async');
}

/** ¿El cuerpo arranca con un docstring? */
function hasDocstring(body: SyntaxNode | null): boolean {
  const first = body?.namedChildren[0];
  if (!first || first.type !== 'expression_statement') return false;
  return first.namedChildren[0]?.type === 'string';
}

/** En Python "público" = el nombre no empieza con "_". */
function isPublic(name: string): boolean {
  return !name.startsWith('_');
}

function parseImports(root: SyntaxNode): ImportRef[] {
  const imports: ImportRef[] = [];

  for (const node of root.namedChildren) {
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        const spec =
          child.type === 'aliased_import'
            ? (child.childForFieldName('name')?.text ?? child.text)
            : child.text;
        if (spec) imports.push({ specifier: spec, kind: 'external', line: lineOf(node) });
      }
    } else if (node.type === 'import_from_statement') {
      const mod = node.childForFieldName('module_name');
      const spec = mod?.text ?? '';
      if (spec) {
        imports.push({
          specifier: spec,
          // "from . import x" o "from .mod import y" → relativo = interno
          kind: spec.startsWith('.') ? 'internal' : 'external',
          line: lineOf(node),
        });
      }
    }
  }
  return imports;
}

function makeSymbol(
  path: string,
  node: SyntaxNode,
  kind: SymbolDef['kind'],
  namePrefix = '',
): SymbolDef {
  const nameNode = node.childForFieldName('name');
  const name = (namePrefix ? namePrefix + '.' : '') + (nameNode?.text ?? '(anon)');
  const body = node.childForFieldName('body');
  return {
    id: `${path}#${name}`,
    name,
    kind,
    line: lineOf(node),
    endLine: endLineOf(node),
    exported: isPublic(nameNode?.text ?? ''),
    async: isAsync(node),
    calls: body ? collectCalls(body, CALLS) : [],
    documented: hasDocstring(body),
  };
}

export function parsePython(root: SyntaxNode, path: string): ParseStructure {
  const imports = parseImports(root);
  const symbols: SymbolDef[] = [];

  for (const raw of root.namedChildren) {
    const node = unwrap(raw);

    if (node.type === 'function_definition') {
      symbols.push(makeSymbol(path, node, 'function'));
    } else if (node.type === 'class_definition') {
      const classSym = makeSymbol(path, node, 'class');
      symbols.push(classSym);

      const body = node.childForFieldName('body');
      for (const memberRaw of body?.namedChildren ?? []) {
        const member = unwrap(memberRaw);
        if (member.type === 'function_definition') {
          symbols.push(makeSymbol(path, member, 'method', classSym.name));
        }
      }
    }
  }

  const documented = symbols.filter((s) => s.documented).length;
  return {
    imports,
    exports: [], // Python no tiene "export"; usamos `exported` por símbolo.
    symbols,
    complexity: cyclomaticComplexity(root, DECISION, LOGICAL),
    documentedRatio: symbols.length ? Math.round((documented / symbols.length) * 100) : 100,
  };
}
