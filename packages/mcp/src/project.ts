/**
 * project.ts — Carga y cachea el análisis del proyecto.
 *
 * El servidor MCP apunta a UNA carpeta (por `--project`, `CODEGRAPH_PROJECT`
 * o el directorio actual). El análisis se calcula la primera vez que se pide
 * y se guarda hasta que alguien llame a la herramienta `refresh`.
 */

import { basename } from 'node:path';
import { analyzeProject, type ProjectAnalysis } from '@codegraph/core';
import { discoverFiles, readGitHistory } from '@codegraph/core/node';

export class Project {
  private analysis: ProjectAnalysis | null = null;
  private loading: Promise<ProjectAnalysis> | null = null;

  constructor(public readonly rootDir: string) {}

  async get(): Promise<ProjectAnalysis> {
    if (this.analysis) return this.analysis;
    if (!this.loading) {
      this.loading = (async () => {
        const { files } = await discoverFiles(this.rootDir);
        if (files.length === 0) {
          throw new Error(`No hay archivos de código soportados en ${this.rootDir}`);
        }
        const git = await readGitHistory(this.rootDir, files.map((f) => f.path));
        const result = await analyzeProject(files, {
          projectName: basename(this.rootDir),
          git: Object.keys(git).length > 0 ? git : undefined,
        });
        this.analysis = result;
        return result;
      })();
    }
    return this.loading;
  }

  async refresh(): Promise<ProjectAnalysis> {
    this.analysis = null;
    this.loading = null;
    return this.get();
  }
}
