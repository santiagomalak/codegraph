export async function requestDirectoryHandle() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API no soportada en este navegador');
  }
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

export async function createCodeMapHandle(directoryHandle, projectName) {
  const safeName = projectName.replace(/[^a-z0-9-_]/gi, '_');
  const fileName = `CODEMAP_${safeName}.json`;
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  return fileHandle;
}

export async function writeFileHandle(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function saveCodeMapToProject(analysisResult, directoryHandle) {
  const projectName = analysisResult.projectName || 'project';
  const fileHandle = await createCodeMapHandle(directoryHandle, projectName);

  const payload = {
    meta: {
      project: projectName,
      generated: new Date().toISOString(),
      tool: 'Code Graph Unified v2.0',
      version: '2.0',
    },
    summary: analysisResult.summary,
    files: analysisResult.files.map(f => ({
      path: f.path,
      lang: f.lang,
      lines: f.lines,
      complexity: f.complexity,
      functions: f.functions,
      classes: f.classes,
      imports: f.imports.map(i => i.module),
      exports: f.exports.map(e => e.name),
      errors: f.errors,
      docCoverage: f.docCoverage,
    })),
    dependencyGraph: {
      edges: analysisResult.graph.edges.map(e => ({
        from: e.source?.id || e.source,
        to: e.target?.id || e.target,
        circular: e.circular,
      })),
      circular: analysisResult.graph.circular,
    },
  };

  const content = JSON.stringify(payload, null, 2);
  await writeFileHandle(fileHandle, content);
  return fileHandle.name;
}

export async function readCodeMapFromProject(directoryHandle, projectName) {
  const safeName = projectName.replace(/[^a-z0-9-_]/gi, '_');
  const fileName = `CODEMAP_${safeName}.json`;
  try {
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content);
  } catch {
    return null;
  }
}
