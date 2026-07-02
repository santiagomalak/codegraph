import { build } from 'esbuild';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildAction() {
  const distDir = path.join(__dirname, '..', '.github', 'action', 'dist');
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [path.join(__dirname, '..', '.github', 'action', 'entrypoint.js')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(distDir, 'index.js'),
    format: 'cjs',
    external: [],
    sourcemap: true,
    minify: false,
  });

  console.log('✅ Action bundled successfully');
}

buildAction().catch(() => process.exit(1));