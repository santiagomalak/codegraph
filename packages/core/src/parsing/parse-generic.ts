/**
 * parse-generic.ts — Parser guiado por `LanguageSpec` (Go, Rust, Java).
 *
 * Recibe el AST y una `LanguageSpec` (ver language-specs.ts) y saca lo mismo que
 * los parsers dedicados: imports, símbolos (funciones / clases / métodos),
 * llamadas, complejidad y % documentado.
 *
 * La idea: los 3 lenguajes comparten estructura ("esto es una función, esto una
 * clase con métodos adentro"), así que en vez de 3 archivos casi iguales hay uno
 * solo + una tabla de nombres de nodo por lenguaje.
 */

import type { ImportRef, SymbolDef } from '../model.js';
import type { SyntaxNode } from './parser-registry.js';
import { lineOf, endLineOf } from './parser-registry.js';
import { collectCalls, cyclomaticComplexity, walk } from './ast-utils.js';
import type { LanguageSpec } from './language-specs.js';
import type { ParseStructure } from './types.js';

/** Nombre de un nodo declaración, con un par de fallbacks. */
function nameOf(node: SyntaxNode, field: string): string {
  const n =
    node.childForFieldName(field) ??
    node.childForFieldName('name') ??
    node.namedChildren.find((c) => c.type.endsWith('identifier') || c.type === 'type_identifier');
  return n?.text ?? '(anon)';
}

function isAsync(node: SyntaxNode): boolean {
  return node.children.some((c) => c.type === 'async' || c.text === 'async');
}

/** El cuerpo de un contenedor: donde viven sus métodos. */
function bodyOf(node: SyntaxNode): SyntaxNode | null {
  return (
    node.childForFieldName('body') ??
    node.namedChildren.find((c) => c.type.endsWith('_body') || c.type === 'declaration_list') ??
    null
  );
}

export function parseGeneric(root: SyntaxNode, path: string, spec: LanguageSpec): ParseStructure {
  const symbols: SymbolDef[] = [];
  const nameCount = new Map<string, number>();

  const makeSymbol = (
    node: SyntaxNode,
    kind: SymbolDef['kind'],
    name: string,
    exported: boolean,
  ): SymbolDef => {
    // Id único aunque haya dos símbolos con el mismo nombre en el archivo.
    const prev = nameCount.get(name) ?? 0;
    nameCount.set(name, prev + 1);
    const id = prev === 0 ? `${path}#${name}` : `${path}#${name}@${lineOf(node)}`;
    return {
      id,
      name,
      kind,
      line: lineOf(node),
      endLine: endLineOf(node),
      exported,
      async: isAsync(node),
      calls: collectCalls(node, spec.callNodes),
      documented: spec.isDocumented(node),
    };
  };

  // Recorremos todo el árbol: las declaraciones pueden estar anidadas
  // (Java: clases internas; Rust: fn dentro de mod; Go: todo a nivel archivo).
  walk(root, (node) => {
    if (spec.containerNodes.has(node.type)) {
      if (spec.containerFilter && !spec.containerFilter(node)) return;
      const cname = spec.containerName ? spec.containerName(node) : nameOf(node, spec.nameField);
      if (spec.containerIsSymbol ? spec.containerIsSymbol(node) : true) {
        symbols.push(makeSymbol(node, 'class', cname, spec.isExported(node, cname)));
      }

      const body = bodyOf(node);
      for (const member of body?.namedChildren ?? []) {
        if (spec.methodNodes.has(member.type)) {
          const mname = nameOf(member, spec.nameField);
          symbols.push(
            makeSymbol(member, 'method', `${cname}.${mname}`, spec.isExported(member, mname)),
          );
        }
      }
      return;
    }

    // Método suelto: en Go los métodos van a nivel archivo con un `receiver`.
    if (spec.methodNodes.has(node.type)) {
      if (hasContainerAncestor(node, spec)) return; // ya lo contó su contenedor
      const recv = node.childForFieldName('receiver');
      const owner = recv ? cleanTypeName(recv.text) : '';
      const mname = nameOf(node, spec.nameField);
      const full = owner ? `${owner}.${mname}` : mname;
      symbols.push(makeSymbol(node, owner ? 'method' : 'function', full, spec.isExported(node, mname)));
      return;
    }

    if (spec.functionNodes.has(node.type)) {
      if (hasContainerAncestor(node, spec)) return; // fn dentro de un impl/clase
      const fname = nameOf(node, spec.nameField);
      symbols.push(makeSymbol(node, 'function', fname, spec.isExported(node, fname)));
    }
  });

  const rawImports = spec.extractImports(root);
  const imports: ImportRef[] = rawImports.map((imp) => ({
    specifier: imp.specifier,
    kind: imp.internal ? 'internal' : 'external',
    line: 1,
  }));

  const documented = symbols.filter((s) => s.documented).length;
  return {
    imports: dedupeImports(imports),
    exports: symbols.filter((s) => s.exported).map((s) => s.name),
    symbols,
    complexity: cyclomaticComplexity(root, spec.decisionNodes, spec.logicalOps),
    documentedRatio: symbols.length ? Math.round((documented / symbols.length) * 100) : 100,
  };
}

/** ¿`node` está dentro de un contenedor (clase / impl / trait)? */
function hasContainerAncestor(node: SyntaxNode, spec: LanguageSpec): boolean {
  let cur: SyntaxNode | null = node.parent;
  while (cur) {
    if (spec.containerNodes.has(cur.type)) return true;
    cur = cur.parent;
  }
  return false;
}

/** "(s *Server)" o "&mut self" → "Server". Limpia el texto de un receiver de Go. */
function cleanTypeName(text: string): string {
  const m = text.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\)?\s*$/);
  return m ? m[1]! : '';
}

function dedupeImports(imports: ImportRef[]): ImportRef[] {
  const seen = new Set<string>();
  return imports.filter((i) => {
    if (seen.has(i.specifier)) return false;
    seen.add(i.specifier);
    return true;
  });
}
