/**
 * language-specs.ts — Descripción declarativa de Go, Rust y Java para el parser
 * genérico (`parse-generic.ts`).
 *
 * Python y JS/TS tienen parsers propios (parse-python.ts / parse-javascript.ts)
 * porque su estructura es bastante particular. Go/Rust/Java, en cambio, encajan
 * bien en un molde común: "estos nodos son funciones, estos son clases, así se
 * saca un import". Cada `LanguageSpec` llena ese molde.
 *
 * Nombres de nodo: son los de las gramáticas tree-sitter oficiales
 * (tree-sitter-go, tree-sitter-rust, tree-sitter-java).
 */

import type { LanguageId } from '../model.js';
import type { SyntaxNode } from './parser-registry.js';

export interface ParsedImport {
  /** El módulo/paquete tal cual: "fmt", "crate::foo", "com.example.Bar". */
  specifier: string;
  /** `true` si a primera vista apunta a código del propio proyecto. */
  internal: boolean;
}

export interface LanguageSpec {
  /** Nodos que declaran una función suelta (nivel archivo). */
  functionNodes: ReadonlySet<string>;
  /** Nodos que declaran un "contenedor" con métodos: clase, struct, trait, impl… */
  containerNodes: ReadonlySet<string>;
  /** Filtro extra para contenedores (ej: en Go, solo struct/interface, no alias). */
  containerFilter?: (node: SyntaxNode) => boolean;
  /** Nombre del contenedor, si no alcanza con el field `name` (ej: `impl Foo` de Rust). */
  containerName?: (node: SyntaxNode) => string;
  /**
   * `false` = el contenedor NO genera un símbolo propio, solo aporta sus métodos
   * a un tipo ya existente (ej: un bloque `impl` de Rust extiende un `struct`).
   */
  containerIsSymbol?: (node: SyntaxNode) => boolean;
  /** Nodos que declaran un método dentro de un contenedor. */
  methodNodes: ReadonlySet<string>;
  /** Field del que sacar el nombre (default: "name"). */
  nameField: string;
  /** Nodos que cuentan como "punto de decisión" para la complejidad. */
  decisionNodes: ReadonlySet<string>;
  /** Operadores lógicos que suman complejidad. */
  logicalOps: ReadonlySet<string>;
  /** Nodos que cuentan como "llamada". */
  callNodes: ReadonlySet<string>;
  /** Extrae los imports del archivo entero. */
  extractImports: (root: SyntaxNode) => ParsedImport[];
  /** ¿El símbolo tiene documentación (comentario/doc-comment justo antes)? */
  isDocumented: (node: SyntaxNode) => boolean;
  /** ¿El símbolo es "público"? (export). */
  isExported: (node: SyntaxNode, name: string) => boolean;
}

// ── helpers compartidos ─────────────────────────────────────────────────────

function stripQuotes(s: string): string {
  return s.replace(/^["'`]|["'`]$/g, '');
}

/** Comentario inmediatamente anterior (salta líneas en blanco). */
function prevComment(node: SyntaxNode): SyntaxNode | null {
  let prev = node.previousSibling;
  // En Rust/Java los atributos/anotaciones/modificadores pueden envolver.
  while (prev && (prev.type === 'attribute_item' || prev.type === 'modifiers' || prev.type === 'annotation')) {
    prev = prev.previousSibling;
  }
  return prev && prev.type.includes('comment') ? prev : null;
}

function hasLineOrBlockDoc(node: SyntaxNode, blockPrefix: string): boolean {
  const c = prevComment(node);
  if (!c) return false;
  return c.text.startsWith(blockPrefix) || c.text.startsWith('///') || c.text.startsWith('//!');
}

// ── Go ──────────────────────────────────────────────────────────────────────

const GO: LanguageSpec = {
  functionNodes: new Set(['function_declaration']),
  containerNodes: new Set(['type_spec']),
  containerFilter: (node) =>
    node.namedChildren.some((c) => c.type === 'struct_type' || c.type === 'interface_type'),
  methodNodes: new Set(['method_declaration']),
  nameField: 'name',
  decisionNodes: new Set([
    'if_statement',
    'for_statement',
    'expression_case',
    'type_case',
    'communication_case',
    'select_statement',
  ]),
  logicalOps: new Set(['&&', '||']),
  callNodes: new Set(['call_expression']),
  isExported: (_node, name) => /^[A-Z]/.test(name), // Go: identificador con mayúscula = exportado
  isDocumented: (node) => Boolean(prevComment(node)),
  extractImports: (root) => {
    const out: ParsedImport[] = [];
    for (const decl of root.namedChildren) {
      if (decl.type !== 'import_declaration') continue;
      for (const spec of decl.descendantsOfType('import_spec')) {
        const pathNode = spec.childForFieldName('path') ?? spec.namedChildren[spec.namedChildren.length - 1];
        if (!pathNode) continue;
        const specifier = stripQuotes(pathNode.text);
        // Los imports del stdlib de Go no tienen ".", los de terceros/propios sí.
        out.push({ specifier, internal: specifier.includes('.') || specifier.includes('/') });
      }
    }
    return out;
  },
};

// ── Rust ────────────────────────────────────────────────────────────────────

const RUST: LanguageSpec = {
  functionNodes: new Set(['function_item']),
  containerNodes: new Set(['struct_item', 'enum_item', 'trait_item', 'impl_item', 'union_item']),
  // Un `impl Foo` no es un tipo nuevo: aporta métodos al `struct Foo`.
  containerIsSymbol: (node) => node.type !== 'impl_item',
  containerName: (node) => {
    if (node.type === 'impl_item') {
      // `impl Foo` / `impl Trait for Foo` → el tipo implementado es el field `type`.
      const t = node.childForFieldName('type');
      return (t?.text ?? '(impl)').replace(/<.*$/s, '').trim();
    }
    return node.childForFieldName('name')?.text ?? '(anon)';
  },
  methodNodes: new Set(['function_item']), // dentro de impl/trait
  nameField: 'name',
  decisionNodes: new Set([
    'if_expression',
    'while_expression',
    'for_expression',
    'loop_expression',
    'match_arm',
  ]),
  logicalOps: new Set(['&&', '||']),
  callNodes: new Set(['call_expression', 'macro_invocation']),
  isExported: (node) => {
    // `pub fn`, `pub struct`… → el primer hijo es `visibility_modifier`.
    return node.children.some((c) => c.type === 'visibility_modifier');
  },
  isDocumented: (node) => hasLineOrBlockDoc(node, '/**'),
  extractImports: (root) => {
    const out: ParsedImport[] = [];
    const visit = (node: SyntaxNode): void => {
      if (node.type === 'use_declaration') {
        const arg = node.childForFieldName('argument') ?? node.namedChildren[0];
        if (arg) {
          // "crate::foo::Bar", "self::x", "super::y", "std::collections::HashMap"
          const head = arg.text.split('::')[0]!.trim();
          const internal = head === 'crate' || head === 'self' || head === 'super';
          out.push({ specifier: arg.text.replace(/\s+/g, ''), internal });
        }
      } else if (node.type === 'mod_item' && !node.childForFieldName('body')) {
        // `mod foo;` → declara el archivo foo.rs / foo/mod.rs
        const name = node.childForFieldName('name')?.text;
        if (name) out.push({ specifier: `mod::${name}`, internal: true });
      }
      for (const c of node.namedChildren) visit(c);
    };
    visit(root);
    return out;
  },
};

// ── Java ────────────────────────────────────────────────────────────────────

const JAVA: LanguageSpec = {
  functionNodes: new Set<string>(), // Java no tiene funciones sueltas
  containerNodes: new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
  ]),
  methodNodes: new Set(['method_declaration', 'constructor_declaration']),
  nameField: 'name',
  decisionNodes: new Set([
    'if_statement',
    'for_statement',
    'enhanced_for_statement',
    'while_statement',
    'do_statement',
    'catch_clause',
    'switch_label',
    'ternary_expression',
  ]),
  logicalOps: new Set(['&&', '||']),
  callNodes: new Set(['method_invocation', 'object_creation_expression']),
  isExported: (node) => {
    // `public` en los modificadores.
    const mods = node.children.find((c) => c.type === 'modifiers');
    return mods ? mods.text.includes('public') : false;
  },
  isDocumented: (node) => hasLineOrBlockDoc(node, '/**'),
  extractImports: (root) => {
    const out: ParsedImport[] = [];
    for (const node of root.namedChildren) {
      if (node.type !== 'import_declaration') continue;
      const scoped = node.namedChildren.find((c) => c.type === 'scoped_identifier' || c.type === 'identifier');
      if (!scoped) continue;
      const specifier = scoped.text;
      // El propio proyecto se resuelve después contra el índice de paquetes;
      // marcamos como internos los que no son del JDK ni libs muy conocidas.
      const internal = !/^(java|javax|jakarta|kotlin|scala|android)\./.test(specifier);
      out.push({ specifier, internal });
    }
    return out;
  },
};

export const LANGUAGE_SPECS: Partial<Record<LanguageId, LanguageSpec>> = {
  go: GO,
  rust: RUST,
  java: JAVA,
};
