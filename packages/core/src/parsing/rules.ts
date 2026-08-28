/**
 * rules.ts — Reglas heurísticas que detectan "olores" en el código.
 *
 * NO son errores de compilación: son avisos ("acá quedó un console.log",
 * "esto usa eval", "hay un TODO"). Cada regla es un patrón + un mensaje.
 *
 * Se aplican línea por línea sobre el texto crudo (rápido y simple).
 * Las reglas que necesitan el AST (ej: catch vacío) se detectan en los parsers.
 */

import type { Issue, LanguageId } from '../model.js';

interface Rule {
  id: string;
  category: Issue['category'];
  severity: Issue['severity'];
  message: string;
  pattern: RegExp;
}

/** Reglas que aplican a cualquier lenguaje (comentarios de tarea). */
const COMMON_RULES: Rule[] = [
  { id: 'todo', category: 'todo', severity: 'info', message: 'TODO pendiente', pattern: /\b(?:\/\/|#|\/\*)\s*TODO\b/i },
  { id: 'fixme', category: 'todo', severity: 'warning', message: 'FIXME pendiente', pattern: /\b(?:\/\/|#|\/\*)\s*FIXME\b/i },
  { id: 'hack', category: 'smell', severity: 'warning', message: 'HACK marcado en el código', pattern: /\b(?:\/\/|#|\/\*)\s*HACK\b/i },
  { id: 'xxx', category: 'smell', severity: 'info', message: 'Marca XXX en el código', pattern: /\b(?:\/\/|#|\/\*)\s*XXX\b/ },
];

const JS_RULES: Rule[] = [
  { id: 'no-console', category: 'debug', severity: 'warning', message: 'console.* olvidado', pattern: /\bconsole\.(log|debug|info|warn|error|trace)\s*\(/ },
  { id: 'no-debugger', category: 'debug', severity: 'error', message: 'sentencia debugger activa', pattern: /\bdebugger\b/ },
  { id: 'no-eval', category: 'security', severity: 'error', message: 'uso de eval()', pattern: /\beval\s*\(/ },
  { id: 'no-inner-html', category: 'security', severity: 'warning', message: 'asignación a innerHTML (posible XSS)', pattern: /\.innerHTML\s*=/ },
  { id: 'no-var', category: 'style', severity: 'info', message: 'usar const/let en vez de var', pattern: /(^|[^.\w])var\s+\w/ },
  { id: 'eqeqeq', category: 'style', severity: 'info', message: 'usar === en vez de ==', pattern: /[^=!<>]==[^=]/ },
  { id: 'no-any', category: 'style', severity: 'info', message: 'tipo "any" explícito', pattern: /:\s*any\b/ },
];

const PY_RULES: Rule[] = [
  { id: 'no-print', category: 'debug', severity: 'info', message: 'print() (¿debug olvidado?)', pattern: /(^|[^.\w])print\s*\(/ },
  { id: 'no-eval', category: 'security', severity: 'error', message: 'uso de eval()', pattern: /(^|[^.\w])eval\s*\(/ },
  { id: 'no-exec', category: 'security', severity: 'error', message: 'uso de exec()', pattern: /(^|[^.\w])exec\s*\(/ },
  { id: 'bare-except', category: 'smell', severity: 'warning', message: 'except: sin tipo (atrapa todo)', pattern: /^\s*except\s*:/ },
  { id: 'eq-none', category: 'style', severity: 'info', message: 'usar "is None" en vez de "== None"', pattern: /==\s*None\b/ },
  { id: 'shell-true', category: 'security', severity: 'warning', message: 'subprocess con shell=True', pattern: /shell\s*=\s*True/ },
];

const BY_LANGUAGE: Partial<Record<LanguageId, Rule[]>> = {
  javascript: JS_RULES,
  jsx: JS_RULES,
  typescript: JS_RULES,
  tsx: JS_RULES,
  python: PY_RULES,
};

/** ¿La línea es un comentario entero? (para no marcar código comentado). */
function isCommentLine(line: string, language: LanguageId): boolean {
  const t = line.trim();
  if (language === 'python') return t.startsWith('#');
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * ¿La posición `index` de la línea cae dentro de un string literal?
 * Heurística: cuenta comillas sin escapar antes de esa posición; si son impares,
 * estamos dentro de un string. Evita falsos positivos cuando el código define
 * mensajes o patrones (ej: message: 'uso de eval()').
 */
function insideStringLiteral(line: string, index: number): boolean {
  let single = 0;
  let double = 0;
  let back = 0;
  for (let i = 0; i < index; i++) {
    if (line[i - 1] === '\\') continue;
    if (line[i] === "'") single++;
    else if (line[i] === '"') double++;
    else if (line[i] === '`') back++;
  }
  return single % 2 === 1 || double % 2 === 1 || back % 2 === 1;
}

/** Aplica todas las reglas de texto a un archivo. */
export function detectIssues(language: LanguageId, content: string): Issue[] {
  const rules = [...COMMON_RULES, ...(BY_LANGUAGE[language] ?? [])];
  const issues: Issue[] = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const commentLine = isCommentLine(line, language);
    for (const rule of rules) {
      // En líneas comentadas solo dejamos pasar las reglas de "tarea" (todo/fixme/...).
      if (commentLine && rule.category !== 'todo' && rule.category !== 'smell') continue;

      const match = new RegExp(rule.pattern.source, rule.pattern.flags).exec(line);
      if (!match) continue;
      // Ignorar cuando el match está dentro de un string (mensajes, patrones, flags...).
      if (rule.category !== 'todo' && insideStringLiteral(line, match.index)) continue;

      issues.push({
        rule: rule.id,
        category: rule.category,
        severity: rule.severity,
        message: rule.message,
        line: i + 1,
        snippet: line.trim().slice(0, 100),
      });
    }
  });

  return issues;
}
