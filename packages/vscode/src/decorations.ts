/**
 * decorations.ts — Lo que se ve en el editor a partir del análisis:
 *   - una marca en el gutter de la línea 1 si el archivo es un hotspot
 *   - un ítem en la status bar con el hotspot y el acoplamiento del archivo activo
 */

import { relative } from 'node:path';
import * as vscode from 'vscode';
import type { ProjectAnalysis } from '@codegraph/core';

export class EditorUi {
  private readonly hotspotDecoration: vscode.TextEditorDecorationType;
  private readonly statusItem: vscode.StatusBarItem;
  private analysis: ProjectAnalysis | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.hotspotDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconUri(context, 'hotspot.svg'),
      gutterIconSize: 'contain',
      overviewRulerColor: 'rgba(251,146,60,0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.statusItem.command = 'codegraph.showGraph';

    context.subscriptions.push(
      this.hotspotDecoration,
      this.statusItem,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
    );
  }

  setAnalysis(analysis: ProjectAnalysis): void {
    this.analysis = analysis;
    this.refresh();
  }

  private relPathOf(editor: vscode.TextEditor): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return null;
    return relative(folder.uri.fsPath, editor.document.uri.fsPath).split('\\').join('/');
  }

  refresh(): void {
    const editor = vscode.window.activeTextEditor;
    const a = this.analysis;
    if (!editor || !a) {
      this.statusItem.hide();
      return;
    }
    const path = this.relPathOf(editor);
    if (!path) return;

    const gutterOn = vscode.workspace.getConfiguration('codegraph').get('hotspotGutter', true);
    const node = a.graph.nodes.find((n) => n.type === 'file' && n.path === path);
    const hotspot = node?.hotspot ?? 0;

    // ── gutter ──
    if (gutterOn && hotspot > 0.5) {
      editor.setDecorations(this.hotspotDecoration, [new vscode.Range(0, 0, 0, 0)]);
    } else {
      editor.setDecorations(this.hotspotDecoration, []);
    }

    // ── status bar ──
    const coupled = a.summary.temporalCoupling.filter((c) => c.a === path || c.b === path);
    const parts: string[] = [];
    if (hotspot > 0.05) parts.push(`$(flame) ${Math.round(hotspot * 100)}`);
    if (coupled.length > 0) parts.push(`$(git-compare) ${coupled.length}`);

    if (parts.length === 0) {
      this.statusItem.hide();
      return;
    }
    this.statusItem.text = `Code Graph  ${parts.join('  ')}`;
    this.statusItem.tooltip = new vscode.MarkdownString(
      [
        node?.hotspot != null ? `**Hotspot:** ${Math.round(hotspot * 100)}/100 (complejo + cambia mucho)` : '',
        coupled.length
          ? `**Cambia junto con** (no se importan):\n` +
            coupled
              .map((c) => `- \`${c.a === path ? c.b : c.a}\` · ${Math.round(c.coupling * 100)}%`)
              .join('\n')
          : '',
        '',
        '_Clic para abrir el grafo._',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    this.statusItem.show();
  }
}

function iconUri(context: vscode.ExtensionContext, name: string): vscode.Uri {
  return vscode.Uri.joinPath(context.extensionUri, 'media', name);
}
