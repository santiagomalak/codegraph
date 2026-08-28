/**
 * panel.ts — El webview con el grafo.
 *
 * Carga la web ya compilada (`packages/web`, copiada a dist/webview) y le habla
 * por `postMessage`:
 *   extensión → webview:  { type: 'analysis', analysis }
 *   webview → extensión:  { type: 'ready' } | { type: 'openFile', path, line? }
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ProjectAnalysis } from '@codegraph/core';

export class GraphPanel {
  private static current: GraphPanel | undefined;

  static show(context: vscode.ExtensionContext, getAnalysis: () => ProjectAnalysis | null): void {
    const column = vscode.ViewColumn.Beside;
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel('codegraph.graph', 'Code Graph', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(join(context.extensionPath, 'dist', 'webview'))],
    });
    GraphPanel.current = new GraphPanel(panel, context, getAnalysis);
  }

  /** Manda un análisis nuevo al webview si está abierto. */
  static push(analysis: ProjectAnalysis): void {
    GraphPanel.current?.panel.webview.postMessage({ type: 'analysis', analysis });
  }

  static get isOpen(): boolean {
    return GraphPanel.current !== undefined;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly getAnalysis: () => ProjectAnalysis | null,
  ) {
    panel.webview.html = this.render(context, panel.webview);

    panel.webview.onDidReceiveMessage((msg: { type?: string; path?: string; line?: number }) => {
      if (msg?.type === 'ready') {
        const a = this.getAnalysis();
        if (a) panel.webview.postMessage({ type: 'analysis', analysis: a });
      } else if (msg?.type === 'openFile' && msg.path) {
        openFile(msg.path, msg.line);
      }
    });

    panel.onDidDispose(() => {
      GraphPanel.current = undefined;
    });
  }

  private render(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const root = join(context.extensionPath, 'dist', 'webview');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const base = webview.asWebviewUri(vscode.Uri.file(root)).toString();
    const nonce = String(Math.random()).slice(2);

    return html
      // <script src="./assets/x.js"> → URI del webview + nonce
      .replace(/(src|href)="\.\/([^"]+)"/g, (_m, attr, path) => `${attr}="${base}/${path}"`)
      .replace(/ crossorigin/g, '')
      .replace(/<script /g, `<script nonce="${nonce}" `)
      .replace(
        '<head>',
        `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">`,
      );
  }
}

/** Abre un archivo del proyecto en el editor, en preview y sin robar el foco. */
function openFile(relPath: string, line?: number): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const uri = vscode.Uri.joinPath(folder.uri, ...relPath.split('/'));
  const selection =
    line && line > 0 ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined;
  vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true, selection });
}
