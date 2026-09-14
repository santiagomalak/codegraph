/**
 * node/index.ts — Punto de entrada público para utilidades Node-only del core.
 * Re-exporta desde submódulos para mantener la API estable.
 */

export {
  discoverFiles,
  isWithinRoot,
  validateRootDir,
  nodeWasmDir,
  type DiscoverResult,
} from './discover-files.js';

export {
  readGitHistory,
  runGit,
  buildTimeline,
  buildCoupling,
  TIMELINE_BUCKETS,
  COUPLING,
  type GitHistoryResult,
} from './git-history.js';

export {
  readProjectConfig,
} from './project-config.js';

export {
  buildSnapshots,
  pickEvenly,
  toSnapshotPoint,
  type SnapshotOptions,
} from './snapshots.js';