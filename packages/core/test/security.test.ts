/**
 * security.test.ts — Tests para validar fixes de seguridad:
 * - Path traversal protection en discoverFiles
 * - Command injection protection en runGit
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { platform } from 'node:process';
import {
  discoverFiles,
  isWithinRoot,
  validateRootDir,
  runGit,
} from '../src/node/index.js';

const isWindows = platform === 'win32';
const describeIfNotWindows = isWindows ? describe.skip : describe;

describe('Security: Path Traversal Protection', () => {
  let testDir: string;
  let linkDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `codegraph-test-${Date.now()}`);
    linkDir = join(tmpdir(), `codegraph-link-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(linkDir, { recursive: true });
    await writeFile(join(testDir, 'legit.ts'), 'export const x = 1;');
    await writeFile(join(linkDir, 'outside.ts'), 'export const y = 2;');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
    await rm(linkDir, { recursive: true, force: true }).catch(() => {});
  });

  it('isWithinRoot rechaza paths fuera del root', () => {
    const root = '/home/user/project';
    expect(isWithinRoot(root, '/home/user/project/src/file.ts')).toBe(true);
    expect(isWithinRoot(root, '/home/user/project')).toBe(true);
    expect(isWithinRoot(root, '/home/user/other/file.ts')).toBe(false);
    expect(isWithinRoot(root, '/etc/passwd')).toBe(false);
  });

  it('validateRootDir rechaza paths inválidos', () => {
    expect(() => validateRootDir('/nonexistent/path')).toThrow('Invalid rootDir');
    expect(() => validateRootDir('/etc/passwd')).toThrow('Invalid rootDir');
  });

  describeIfNotWindows('symlink protection', () => {
    it('discoverFiles ignora symlinks que escapan del root', async () => {
      // Crear symlink dentro de testDir que apunta afuera
      const linkPath = join(testDir, 'escape.ts');
      await symlink(join(linkDir, 'outside.ts'), linkPath);

      const result = await discoverFiles(testDir);
      
      // El archivo legítimo debe estar
      expect(result.files.some(f => f.path === 'legit.ts')).toBe(true);
      // El symlink que escapa debe ser ignorado (no aparece en results)
      expect(result.files.some(f => f.path === 'escape.ts')).toBe(false);
    });

    it('discoverFiles no sigue symlinks a directorios fuera del root', async () => {
      const subDir = join(testDir, 'sub');
      await mkdir(subDir);
      await writeFile(join(subDir, 'inside.ts'), 'export const z = 3;');
      
      // Symlink a directorio fuera
      const linkDirPath = join(testDir, 'external');
      await symlink(linkDir, linkDirPath);

      const result = await discoverFiles(testDir);
      
      expect(result.files.some(f => f.path === 'sub/inside.ts')).toBe(true);
      expect(result.files.some(f => f.path.startsWith('external/'))).toBe(false);
    });
  });
});

describe('Security: Command Injection Protection', () => {
  it('runGit valida rootDir antes de spawn', async () => {
    // Debe fallar con directorio inexistente
    const result = await runGit('/nonexistent/path', ['status']);
    expect(result).toBeNull();
  });

  it('runGit rechaza rootDir que no es directorio', async () => {
    // En Windows usamos un archivo que existe
    const testFile = isWindows ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/passwd';
    const result = await runGit(testFile, ['status']);
    expect(result).toBeNull();
  });

  it('runGit funciona con directorio válido (aunque no sea repo git)', async () => {
    // Crear directorio temporal
    const testDir = join(tmpdir(), `codegraph-test-${Date.now()}-no-git`);
    await mkdir(testDir, { recursive: true });
    
    // Debe ejecutar sin tirar error (puede encontrar repo padre o no)
    const result = await runGit(testDir, ['status']);
    // El resultado puede ser string (output de git) o null
    expect(result === null || typeof result === 'string').toBe(true);
    
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });
});

describe('Security: Input Validation', () => {
  it('discoverFiles rechaza rootDir con path traversal attempt', async () => {
    const testDir = join(tmpdir(), `codegraph-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'normal.ts'), 'export const a = 1;');

    // Intentar usar path con traversal como rootDir
    const maliciousRoot = join(testDir, '..', '..', 'etc');
    
    await expect(discoverFiles(maliciousRoot)).rejects.toThrow('Invalid rootDir');
    
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });
});