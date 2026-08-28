/**
 * extension.ts — Punto de entrada de la extensión Code Graph.
 *
 * Al activarse: analiza la carpeta abierta y, si `analyzeOnSave` está prendido,
 * la re-analiza (con debounce) al guardar. El resultado alimenta:
 *   - el panel del grafo (comando "Code Graph: mostrar el grafo")
 *   - las marcas de hotspot en el gutter + la status bar del archivo activo
 */

import * as vscode from 'vscode';
import type { ProjectAnalysis } from '@codegraph/core';
import { analyzeWorkspace, debounce } from './analysis.js';
import { EditorUi } from './decorations.js';
import { GraphPanel } from './panel.js';

let latest: ProjectAnalysis | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel('Code Graph');
  const editorUi = new EditorUi(context);
  context.subscriptions.push(out);

  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const run = async (reason: string): Promise<void> => {
    if (!rootDir) return;
    try {
      const t0 = Date.now();
      const result = await analyzeWorkspace(rootDir, context.extensionPath);
      if (!result) {
        out.appendLine('No se encontraron archivos de código soportados.');
        return;
      }
      latest = result.analysis;
      const s = result.analysis.summary;
      out.appendLine(
        `[${reason}] ${s.totalFiles} archivos · salud ${s.health.score}/100 · ${Date.now() - t0}ms`,
      );
      editorUi.setAnalysis(result.analysis);
      GraphPanel.push(result.analysis);
    } catch (err) {
      out.appendLine(`Error: ${(err as Error).message}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('codegraph.showGraph', async () => {
      GraphPanel.show(context, () => latest);
      if (!latest) await run('abrir grafo');
    }),
    vscode.commands.registerCommand('codegraph.reanalyze', () => run('manual')),
  );

  // Re-análisis al guardar (con debounce).
  const debouncedRun = debounce(() => run('guardar'), 800);
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (vscode.workspace.getConfiguration('codegraph').get('analyzeOnSave', true)) {
        debouncedRun();
      }
    }),
  );

  // Primer análisis en segundo plano.
  void run('activación');
}

export function deactivate(): void {
  latest = null;
}
