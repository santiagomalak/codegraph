/**
 * analyze-folder.ts — Analiza una carpeta del disco 100% en el navegador.
 *
 * No se sube nada a ningún servidor: leemos los archivos con las APIs del
 * navegador (File System Access API, `<input webkitdirectory>` o arrastrar y
 * soltar), los filtramos igual que el CLI y se los pasamos a `analyzeProject`,
 * que corre tree-sitter compilado a WebAssembly (los `.wasm` los sirve la web
 * desde `/wasm`).
 *
 * Lo que NO tenemos acá (sí en el CLI y en VS Code): historial de git, o sea
 * hotspots, timeline y snapshots. El navegador no ve el `.git`.
 */

import {
  analyzeProject,
  EXTENSION_LANGUAGE,
  IGNORE_DIRS,
  IGNORE_FILES,
  type ProjectAnalysis,
  type SourceFile,
} from '@codegraph/core';

/** Carpeta donde la web sirve los `.wasm` (respeta el `base` de Vite). */
const WASM_DIR = new URL('wasm', document.baseURI).href.replace(/\/$/, '');

/** Igual que el CLI: archivos más grandes que esto no se leen. */
const MAX_FILE_BYTES = 1_500_000;
/** Tope de archivos: por encima, el navegador se queda sin memoria. */
const MAX_FILES = 4000;

const KNOWN_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE));

/**
 * La File System Access API todavía no está completa en el lib.dom de TS: le
 * falta el iterador `values()`. Lo declaramos nosotros (lo que usamos).
 */
interface DirHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterableIterator<DirHandle | FileHandle>;
}
interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}

export interface FolderProgress {
  phase: 'reading' | 'parsing';
  done: number;
  total: number;
  path: string;
}

export interface FolderResult {
  analysis: ProjectAnalysis;
  /** Archivos salteados por tamaño o por pasar el tope. */
  skipped: number;
  truncated: boolean;
}

export class FolderEmptyError extends Error {
  constructor() {
    super('No se encontraron archivos de código soportados en esa carpeta.');
  }
}

/** ¿La extensión de este path la entiende el motor? */
function isKnownFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
  return KNOWN_EXTENSIONS.has(ext) && !IGNORE_FILES.has(name);
}

/** ¿Entramos a esta carpeta? (saltea node_modules, .git, dist, dotfolders…). */
function enterDir(name: string): boolean {
  return !IGNORE_DIRS.has(name) && !name.startsWith('.');
}

// ── Recolección de archivos según el origen ──────────────────────────────────

interface Collected {
  files: SourceFile[];
  skipped: number;
  truncated: boolean;
  rootName: string;
}

async function readFileEntry(
  file: File,
  relPath: string,
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<void> {
  if (acc.files.length >= MAX_FILES) {
    acc.truncated = true;
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    acc.skipped++;
    return;
  }
  const content = await file.text();
  acc.files.push({ path: relPath, content });
  onProgress?.({ phase: 'reading', done: acc.files.length, total: MAX_FILES, path: relPath });
}

/** File System Access API: `window.showDirectoryPicker()`. */
async function collectFromHandle(
  dir: DirHandle,
  prefix: string,
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<void> {
  for await (const entry of dir.values()) {
    if (acc.truncated) return;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (enterDir(entry.name)) await collectFromHandle(entry, rel, acc, onProgress);
    } else if (isKnownFile(entry.name)) {
      await readFileEntry(await entry.getFile(), rel, acc, onProgress);
    }
  }
}

/** `<input type="file" webkitdirectory>`: una `FileList` con `webkitRelativePath`. */
async function collectFromFileList(
  list: FileList,
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<void> {
  const all = Array.from(list);
  acc.rootName = all[0]?.webkitRelativePath.split('/')[0] ?? acc.rootName;

  for (const file of all) {
    if (acc.truncated) break;
    // webkitRelativePath: "miproyecto/src/app.ts" → sacamos "miproyecto/".
    const parts = file.webkitRelativePath.split('/');
    const rel = parts.slice(1).join('/');
    // Carpetas intermedias (sin la raíz en parts[0] ni el archivo al final).
    if (parts.slice(1, -1).some((p) => !enterDir(p))) continue;
    if (!isKnownFile(parts[parts.length - 1] ?? '')) continue;
    await readFileEntry(file, rel, acc, onProgress);
  }
}

/** Arrastrar y soltar: recorre una carpeta soltada (`FileSystemDirectoryEntry`). */
async function collectDirChildren(
  dir: FileSystemDirectoryEntry,
  prefix: string,
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<void> {
  const reader = dir.createReader();
  // readEntries() devuelve de a tandas: hay que llamarlo hasta que venga vacío.
  for (;;) {
    if (acc.truncated) return;
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    );
    if (batch.length === 0) break;
    for (const child of batch) await collectFromEntry(child, prefix, acc, onProgress);
  }
}

/** Un item soltado: `DataTransferItem.webkitGetAsEntry()`. `prefix` = carpeta padre. */
async function collectFromEntry(
  entry: FileSystemEntry,
  prefix: string,
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<void> {
  if (acc.truncated) return;
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    if (!isKnownFile(entry.name)) return;
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    );
    await readFileEntry(file, rel, acc, onProgress);
  } else if (entry.isDirectory && enterDir(entry.name)) {
    await collectDirChildren(entry as FileSystemDirectoryEntry, rel, acc, onProgress);
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/** `true` si el navegador tiene la File System Access API (Chrome/Edge). */
export function supportsDirectoryPicker(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

async function finish(
  acc: Collected,
  onProgress?: (p: FolderProgress) => void,
): Promise<FolderResult> {
  if (acc.files.length === 0) throw new FolderEmptyError();
  acc.files.sort((a, b) => a.path.localeCompare(b.path));

  const analysis = await analyzeProject(acc.files, {
    projectName: acc.rootName || 'proyecto',
    wasmDir: WASM_DIR,
    onProgress: (done, total, path) =>
      onProgress?.({ phase: 'parsing', done, total, path }),
  });

  return { analysis, skipped: acc.skipped, truncated: acc.truncated };
}

function emptyAcc(): Collected {
  return { files: [], skipped: 0, truncated: false, rootName: '' };
}

/** Abre el selector de carpeta y analiza. Lanza si el usuario cancela. */
export async function pickAndAnalyze(
  onProgress?: (p: FolderProgress) => void,
): Promise<FolderResult> {
  const acc = emptyAcc();

  if (supportsDirectoryPicker()) {
    const win = window as unknown as { showDirectoryPicker: () => Promise<DirHandle> };
    const handle = await win.showDirectoryPicker();
    acc.rootName = handle.name;
    await collectFromHandle(handle, '', acc, onProgress);
    return finish(acc, onProgress);
  }

  // Fallback: <input webkitdirectory> (Firefox, Safari).
  const list = await pickViaInput();
  await collectFromFileList(list, acc, onProgress);
  return finish(acc, onProgress);
}

function pickViaInput(): Promise<FileList> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = input.files;
      input.remove();
      if (files && files.length) resolve(files);
      else reject(new Error('cancelado'));
    });
    document.body.append(input);
    input.click();
  });
}

/** Analiza lo que se soltó en la ventana (una carpeta o varios archivos). */
export async function analyzeDrop(
  dt: DataTransfer,
  onProgress?: (p: FolderProgress) => void,
): Promise<FolderResult> {
  const acc = emptyAcc();
  const entries = Array.from(dt.items)
    .map((it) => it.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);

  if (entries.length === 0) throw new FolderEmptyError();

  // Si soltaron una sola carpeta, sus hijos van en la raíz (sin el nombre de la
  // carpeta como prefijo), igual que con el selector nativo.
  if (entries.length === 1 && entries[0]!.isDirectory) {
    acc.rootName = entries[0]!.name;
    await collectDirChildren(entries[0] as FileSystemDirectoryEntry, '', acc, onProgress);
  } else {
    for (const entry of entries) await collectFromEntry(entry, '', acc, onProgress);
  }
  return finish(acc, onProgress);
}
