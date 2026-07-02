/**
 * Ejemplo: Regla personalizada - Detección de "console.log" en producción
 * Demuestra cómo crear reglas de linting personalizadas
 */

import type { RulePlugin, RuleViolation, RuleContext } from '../index.ts';

const noConsoleLogRule: RulePlugin = {
  name: 'no-console-log',
  id: 'custom:no-console-log',
  languages: ['javascript', 'typescript', 'vue', 'jsx', 'tsx'],
  severity: 'warning',
  description: 'Evita console.log en código de producción',
  check: (line: string, context: RuleContext): RuleViolation | null => {
    // Ignorar comentarios
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return null;

    // Detectar console.log, console.debug, console.info
    if (/\bconsole\.(log|debug|info)\s*\(/.test(line)) {
      return {
        message: 'Evita console.log/debug/info en producción. Usa un logger adecuado.',
        line: context.lineNumber,
        severity: 'warning',
        fix: content => content.replace(/console\.(log|debug|info)\s*\(/g, 'logger.$1('),
      };
    }

    // Detectar console.error, console.warn (permitidos pero avisar)
    if (/\bconsole\.(error|warn)\s*\(/.test(line)) {
      return {
        message: 'console.error/warn detectado. Considera usar un logger estructurado.',
        line: context.lineNumber,
        severity: 'info',
      };
    }

    return null;
  },
};

export default noConsoleLogRule;
