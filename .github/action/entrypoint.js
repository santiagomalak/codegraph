#!/usr/bin/env node
/**
 * Code Graph Analyzer - GitHub Action Entrypoint
 * Runs the analyzer in Node.js environment for CI/CD
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import { CodeAnalyzer } from '../../src/core/analyzer.js';
import { pluginRegistry } from '../../src/core/plugins/PluginRegistry.js';
import { CodemapGenerator } from '../../src/api/codemapGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} AnalysisOptions
 * @property {string} inputPath
 * @property {'json'|'markdown'|'mermaid'} outputFormat
 * @property {string} outputFile
 * @property {string} [configFile]
 * @property {boolean} failOnErrors
 * @property {boolean} failOnCircular
 * @property {number} [maxComplexity]
 */

/**
 * @typedef {Object} FileItem
 * @property {string} name
 * @property {string} path
 * @property {string} ext
 * @property {string} content
 */

const SUPPORTED_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'scss', 'md', 'json', 'vue'
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', 'coverage', '.venv', 'venv', 'target', 'out'
]);

const IGNORE_FILES = new Set([
  '.DS_Store', '.gitignore', '.env', '.env.local',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
]);

/**
 * Collect files from directory
 * @param {string} dir
 * @returns {Promise<FileItem[]>}
 */
async function collectFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        const subResults = await collectFiles(fullPath);
        results.push(...subResults);
      }
    } else if (entry.isFile()) {
      if (!IGNORE_FILES.has(entry.name)) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (ext && SUPPORTED_EXTENSIONS.has(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            results.push({
              name: entry.name,
              path: relativePath.replace(/\\/g, '/'),
              ext,
              content,
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  return results;
}

/**
 * Create a File-like object compatible with the analyzer
 * @param {FileItem} item
 * @returns {File}
 */
function createFileObject(item) {
  const file = new File([item.content], item.name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', {
    value: item.path,
    writable: false,
    configurable: true,
  });
  return file;
}

/**
 * @param {Object} options
 */
async function runAnalysis(options) {
  const { inputPath, outputFormat, outputFile, configFile, failOnErrors, failOnCircular, maxComplexity } = options;

  console.log(`🔍 Analyzing: ${inputPath}`);

  // Collect files
  const files = await collectFiles(inputPath);
  console.log(`📁 Found ${files.length} files`);

  if (files.length === 0) {
    console.log('⚠️ No files to analyze');
    return;
  }

  // Create File objects
  const fileObjects = files.map(createFileObject);

  // Convert to FileList-like object
  const fileList = {
    length: fileObjects.length,
    item: (index) => fileObjects[index],
    [Symbol.iterator]: function* () {
      yield* fileObjects;
    }
  };

  // Run analyzer
  const analyzer = new CodeAnalyzer();
  const result = await analyzer.analyzeFiles(fileList);

  console.log(`✅ Analysis complete:`);
  console.log(`  Files: ${result.summary.totalFiles}`);
  console.log(`  Lines: ${result.summary.totalLines.toLocaleString()}`);
  console.log(`  Errors: ${result.summary.totalErrors}`);
  console.log(`  Circular deps: ${result.summary.circularDeps}`);
  console.log(`  Avg complexity: ${result.summary.avgComplexity}`);

  // Generate output
  const generator = new CodemapGenerator(result);
  let output;

  switch (outputFormat) {
    case 'json':
      output = generator.getJsonContent();
      break;
    case 'markdown':
      output = generator.getCodemapContent();
      break;
    case 'mermaid':
      // Mermaid export would need custom implementation
      output = `# Mermaid diagram not yet implemented in CLI\n\nUse JSON output and convert with mermaid-exporter plugin.`;
      break;
    default:
      output = generator.getJsonContent();
  }

  // Write output
  await fs.writeFile(outputFile, output);
  console.log(`💾 Output written to: ${outputFile}`);

  // Check failure conditions
  let shouldFail = false;
  if (failOnErrors && result.summary.totalErrors > 0) {
    console.error(`❌ Failing: ${result.summary.totalErrors} errors detected`);
    shouldFail = true;
  }
  if (failOnCircular && result.summary.circularDeps > 0) {
    console.error(`❌ Failing: ${result.summary.circularDeps} circular dependencies detected`);
    shouldFail = true;
  }
  if (maxComplexity && result.summary.avgComplexity > maxComplexity) {
    console.error(`❌ Failing: Average complexity ${result.summary.avgComplexity} exceeds threshold ${maxComplexity}`);
    shouldFail = true;
  }

  if (shouldFail) {
    process.exit(1);
  }
}

// CLI
import { Command } from 'commander';

const cli = new Command();

cli
  .name('codegraph')
  .description('Code Graph Analyzer - Analyze code dependencies and generate CODEMAP')
  .version('2.0.0');

cli
  .command('analyze')
  .description('Analyze a project directory')
  .option('-p, --path <path>', 'Path to analyze', '.')
  .option('-f, --format <format>', 'Output format: json, markdown, mermaid', 'json')
  .option('-o, --output <file>', 'Output file path', 'CODEMAP.json')
  .option('-c, --config <file>', 'Config file path')
  .option('--fail-on-errors', 'Fail if errors detected')
  .option('--fail-on-circular', 'Fail if circular dependencies detected')
  .option('--max-complexity <number>', 'Fail if avg complexity exceeds threshold')
  .action(async (opts) => {
    const options = {
      inputPath: opts.path,
      outputFormat: opts.format,
      outputFile: opts.output,
      configFile: opts.config,
      failOnErrors: opts.failOnErrors,
      failOnCircular: opts.failOnCircular,
      maxComplexity: opts.maxComplexity ? parseInt(opts.maxComplexity) : undefined,
    };

    try {
      await runAnalysis(options);
    } catch (err) {
      console.error('❌ Analysis failed:', err.message);
      process.exit(1);
    }
  });

cli.parse();