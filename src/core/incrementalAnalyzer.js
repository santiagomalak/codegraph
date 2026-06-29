import { hashFile, computeProjectHash } from '../utils/hash.js';
import {
  putFileRecord,
  deleteFileRecord,
  clearAllFiles,
  getAllFileRecords,
  getProjectHash,
  setProjectHash,
  getLastScanTimestamp,
  setLastScanTimestamp,
  getFileCount,
  getMeta,
  setMeta,
} from '../utils/storage.js';
import { buildGraph, buildSummary, inferProjectName } from './graphBuilder.js';

export class IncrementalAnalyzer {
  constructor(workerAnalyzer) {
    this.workerAnalyzer = workerAnalyzer;
  }

  async analyzeFiles(fileList, options = {}) {
    const { forceFullScan = false } = options;

    const currentProjectHash = await computeProjectHash(fileList);
    const storedProjectHash = await getProjectHash();

    if (!forceFullScan && currentProjectHash === storedProjectHash) {
      return this._loadFromCache();
    }

    const fileMap = new Map();
    for (const file of fileList) {
      const path = file.webkitRelativePath;
      const hash = await hashFile(file);
      fileMap.set(path, { file, hash });
    }

    const storedRecords = await getAllFileRecords();
    const storedMap = new Map(storedRecords.map(r => [r.path, r]));

    const filesToAnalyze = [];
    const unchangedFiles = [];

    for (const [path, { file, hash }] of fileMap) {
      const stored = storedMap.get(path);
      if (stored && stored.hash === hash) {
        unchangedFiles.push(stored);
        storedMap.delete(path);
      } else {
        filesToAnalyze.push(file);
      }
    }

    for (const [path] of storedMap) {
      await deleteFileRecord(path);
    }

    let analyzedFiles = [];

    if (filesToAnalyze.length > 0) {
      const newAnalyzedFiles = await this.workerAnalyzer.analyzeFiles(filesToAnalyze);
      analyzedFiles = newAnalyzedFiles;

      for (const file of analyzedFiles) {
        const originalFile = fileMap.get(file.path);
        if (originalFile) {
          await putFileRecord({
            path: file.path,
            hash: originalFile.hash,
            data: file,
            timestamp: Date.now(),
          });
        }
      }
    }

    for (const stored of unchangedFiles) {
      analyzedFiles.push(stored.data);
    }

    analyzedFiles.sort((a, b) => a.path.localeCompare(b.path));

    const graph = buildGraph(analyzedFiles);
    const summary = buildSummary(analyzedFiles, graph);
    const projectName = inferProjectName(fileList);

    await setProjectHash(currentProjectHash);
    await setLastScanTimestamp(Date.now());
    await setMeta('projectName', projectName);

    return { files: analyzedFiles, graph, summary, projectName };
  }

  async _loadFromCache() {
    const storedRecords = await getAllFileRecords();
    const files = storedRecords.map(r => r.data).sort((a, b) => a.path.localeCompare(b.path));

    const graph = buildGraph(files);
    const summary = buildSummary(files, graph);
    const projectName = (await getMeta('projectName')) || 'Proyecto';

    return { files, graph, summary, projectName };
  }

  async clearCache() {
    await clearAllFiles();
    await setMeta('projectHash', null);
    await setMeta('lastScan', null);
    await setMeta('projectName', null);
  }

  async getCacheInfo() {
    const count = await getFileCount();
    const lastScan = await getLastScanTimestamp();
    const projectHash = await getProjectHash();

    return { count, lastScan, projectHash };
  }
}
