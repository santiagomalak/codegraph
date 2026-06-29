import { CodeAnalyzer } from './analyzer.js';

const analyzer = new CodeAnalyzer();

export function buildGraph(files) {
  return analyzer._buildGraph(files);
}

export function buildSummary(files, graph) {
  return analyzer._buildSummary(files, graph);
}

export function inferProjectName(fileList) {
  return analyzer._inferProjectName(fileList);
}

export function analyzeFilesSync(files) {
  return files.map(f => analyzer._analyzeFile(f));
}
