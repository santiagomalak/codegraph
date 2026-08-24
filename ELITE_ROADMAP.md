# Elite Roadmap - Code Graph Unified

## Vision

Transform Code Graph Unified from a "useful tool" into the **industry-standard** code analysis platform that developers trust, extend, and embed in their workflows.

---

## Current State Assessment

| Dimension | Current | Target (Elite) |
|-----------|---------|----------------|
| **Parsing Accuracy** | ~70% (regex-based) | >95% (AST-based) |
| **Language Support** | 8 languages | 20+ languages |
| **Extensibility** | Plugin system v1 | Plugin marketplace |
| **UX/Performance** | Good | Best-in-class |
| **Distribution** | Web + GitHub Action | VS Code, CLI, CI/CD, Web |
| **Community** | 0 contributors | 50+ active |
| **Documentation** | Good | Industry-leading |
| **Testing** | Unit only | Full test pyramid |

---

## Phase 1: Foundation (Weeks 1-4) ✅ IN PROGRESS

### Completed
- [x] Modular architecture (Core/UI/API/Plugins)
- [x] Plugin system with hooks
- [x] Web Worker offloading
- [x] Incremental analysis (IndexedDB)
- [x] GitHub Action + semantic-release
- [x] Security audit + documentation

### In Progress
- [ ] Fix GraphViewer sizing/centering
- [ ] Fix structure tree click handling
- [ ] Add tree CSS styles

### Remaining
- [ ] **AST-based parsing migration** (critical)
- [ ] Comprehensive test suite (unit + integration + e2e)
- [ ] Performance benchmarks

---

## Phase 2: AST-Based Parsing (Weeks 5-8) 🎯 CRITICAL

### Why
Current regex-based parsing has fundamental limitations:
- False positives/negatives
- Can't handle complex syntax (optional chaining, decorators, JSX, etc.)
- No semantic understanding (types, scopes, references)
- Maintenance burden for edge cases

### Implementation

#### 1. Add Babel Parser Integration
```bash
npm install @babel/parser @babel/traverse @babel/types
```

#### 2. Create AST-Based Parsers
```typescript
// src/core/parsers/ASTParser.ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export class ASTJavaScriptParser extends BaseParser {
  parse(fileInfo) {
    const ast = parse(fileInfo.content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy']
    });

    const result = {
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      metrics: {},
      errors: []
    };

    traverse(ast, {
      ImportDeclaration(path) { /* extract imports */ },
      ExportNamedDeclaration(path) { /* extract exports */ },
      FunctionDeclaration(path) { /* extract functions */ },
      ClassDeclaration(path) { /* extract classes */ },
      // ...
    });

    return result;
  }
}
```

#### 3. Language Support Matrix

| Language | Parser | Status |
|----------|--------|--------|
| JavaScript | Babel | 🎯 Phase 2 |
| TypeScript | Babel (TS plugin) | 🎯 Phase 2 |
| JSX/TSX | Babel (JSX plugin) | 🎯 Phase 2 |
| Python | tree-sitter | Phase 3 |
| Go | tree-sitter | Phase 3 |
| Rust | tree-sitter | Phase 3 |
| Java | tree-sitter | Phase 4 |
| C/C++ | tree-sitter | Phase 4 |
| Rust | tree-sitter | Phase 3 |
| PHP | tree-sitter | Phase 4 |

#### 4. Tree-sitter Integration (for non-JS languages)
```bash
npm install tree-sitter tree-sitter-python tree-sitter-go tree-sitter-rust
```

```typescript
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';

const parser = new Parser();
parser.setLanguage(Python);
const tree = parser.parse(content);
// Query with tree-sitter queries
```

---

## Phase 3: Distribution & Developer Experience (Weeks 9-12)

### 3.1 VS Code Extension (Priority #1)

**Marketplace Presence**: Primary discovery channel for developers.

```typescript
// vscode-extension/src/extension.ts
import * as vscode from 'vscode';
import { CodeAnalyzer } from 'code-graph-unified/core';

export function activate(context: vscode.ExtensionContext) {
  // Command: CodeGraph: Analyze Workspace
  const analyzeCmd = vscode.commands.registerCommand('codegraph.analyze', async () => {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return;

    // Use File System Access API or read files via vscode.workspace.fs
    const files = await gatherWorkspaceFiles(workspace);
    const result = await analyzer.analyzeFiles(files);

    // Show in WebView panel
    panel.webview.html = generateGraphHTML(result);
  });

  // CodeLens for complexity
  const codeLensProvider = new ComplexityCodeLensProvider(analyzer);
  vscode.languages.registerCodeLensProvider('*', codeLensProvider);

  // Hover for imports
  const hoverProvider = new ImportHoverProvider(analyzer);
  vscode.languages.registerHoverProvider('*', hoverProvider);
}
```

**Features**:
- [ ] Analyze workspace command
- [ ] Interactive graph in WebView panel
- [ ] CodeLens for complexity/errors inline
- [ ] Hover for import details
- [ ] Quick fix for detected issues
- [ ] Export CODEMAP from command palette

### 3.2 CLI Tool

```bash
# Install globally
npm install -g code-graph-unified

# Usage
codegraph analyze ./my-project --format json --output codemap.json
codegraph analyze . --fail-on-errors --max-complexity 15
codegraph serve  # Start local web UI
```

```typescript
// cli/src/index.ts
import { Command } from 'commander';
import { CodeAnalyzer } from '../core/analyzer.js';

const program = new Command()
  .name('codegraph')
  .description('Analyze code dependencies and generate CODEMAP')
  .version('2.0.0');

program
  .command('analyze')
  .option('-p, --path <path>', 'Path to analyze', '.')
  .option('-f, --format <format>', 'json|markdown|mermaid', 'json')
  .option('-o, --output <file>', 'Output file', 'CODEMAP.json')
  .option('--fail-on-errors', 'Exit with code 1 if errors found')
  .option('--fail-on-circular', 'Exit with code 1 if circular deps')
  .option('--max-complexity <n>', 'Fail if avg complexity > n')
  .action(async (opts) => {
    const files = await gatherFiles(opts.path);
    const result = await analyzer.analyzeFiles(files);
    // ... output logic
  });

program.parse();
```

### 3.3 GitHub Action (Complete)
```yaml
# Already implemented in .github/action/
# Uses: santiagomalak/codegraph@main
# Outputs: total-files, total-errors, circular-deps, etc.
```

---

## Phase 4: Platform & Community (Weeks 13-16)

### 4.1 Plugin Marketplace

```typescript
// Registry API
interface PluginMarketplace {
  // Discovery
  search(query: string): PluginManifest[];
  getPlugin(name: string): PluginManifest;
  getPopular(limit: number): PluginManifest[];

  // Installation
  install(name: string): Promise<void>;
  uninstall(name: string): Promise<void>;
  update(name: string): Promise<void>;

  // Reviews
  getReviews(name: string): Review[];
  submitReview(name: string, review: Review): Promise<void>;
}
```

**Implementation**:
- Static JSON index hosted on GitHub Pages / CDN
- GitHub Actions for automated publishing
- `codegraph plugin install <name>` CLI command

### 4.2 Landing Page & Documentation

**Astro + Tailwind** (already scaffolded in `landing/`)

Pages needed:
- [ ] Home: Hero, features, demo embed, CTAs
- [ ] Docs: Getting Started (Web/CLI/Action/VS Code)
- [ ] API Reference (auto-generated from TypeScript)
- [ ] Plugin Development Guide
- [ ] Architecture Deep Dive
- [ ] Changelog
- [ ] Showcase/Case Studies

### 4.3 Community Infrastructure

| Channel | Purpose | Tool |
|---------|---------|------|
| GitHub Discussions | Q&A, feature requests | GitHub |
| Discord | Real-time chat | Discord |
| Twitter/X | Announcements, tips | X |
| Dev.to/Blog | Technical articles | Dev.to |
| Newsletter | Monthly updates | Buttondown/ConvertKit |

---

## Phase 5: SaaS Platform (Weeks 17-24) - Optional

### Business Model

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Unlimited public repos, basic analysis |
| Pro | $15/mo | Private repos, team sharing, advanced metrics |
| Team | $50/mo | SSO, audit logs, custom rules, API access |
| Enterprise | Custom | On-premise, SLA, dedicated support |

### Technical Requirements

| Component | Technology |
|-----------|------------|
| Auth | Clerk / NextAuth |
| Billing | Stripe |
| Database | PostgreSQL (Supabase/Neon) |
| Queue | BullMQ (Redis) |
| Storage | S3 (R2) |
| Real-time | Socket.io / PartyKit |
| Hosting | Vercel / Railway / Fly.io |

### Architecture
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web App   │────▶│   API GW    │────▶│  Workers    │
│  (Next.js)  │     │  (tRPC)     │     │  (Analysis) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           ▼
                    ┌─────────────┐
                    │  Database   │
                    │ (PostgreSQL)│
                    └─────────────┘
```

---

## Technical Excellence Metrics

### Code Quality Gates

| Metric | Threshold | Tool |
|--------|-----------|------|
| TypeScript Strict | ✅ Zero errors | `tsc --noEmit` |
| Test Coverage | >80% lines | Vitest + c8 |
| ESLint | Zero warnings | ESLint + Prettier |
| Bundle Size | <500KB gzipped | Vite + rollup-plugin-visualizer |
| Lighthouse | >90 all categories | Lighthouse CI |
| Bundle Analysis | <50KB initial JS | Rollup plugin |

### Performance Budgets

| Metric | Budget |
|--------|--------|
| Initial Load | <2s (3G) |
| Time to Interactive | <3s |
| Analysis (1000 files) | <5s |
| Graph Render (1000 nodes) | <1s |
| Memory (Worker) | <100MB |

### Monitoring

| Metric | Tool |
|--------|------|
| Errors | Sentry |
| Performance | Vercel Analytics / Web Vitals |
| Usage | Plausible / PostHog |
| Uptime | Better Uptime |

---

## Team & Governance

### Roles

| Role | Responsibility |
|------|----------------|
| **BDFL** | Santiago - Vision, final decisions |
| **Core Maintainers** (3-5) | Code review, releases, triage |
| **Plugin Maintainers** | Plugin ecosystem |
| **Community Manager** | Discord, discussions, events |

### Release Process

```bash
# Automated via semantic-release
# 1. Conventional commits
# 2. CI passes (test, lint, typecheck, build)
# 3. semantic-release determines version
# 4. Changelog generated
# 5. npm publish + GitHub Release + Docker image
```

### Branching Strategy
```
main ──────────────────────────────────▶
  │           │            │
  ▼           ▼            ▼
v1.0.0      v1.1.0       v2.0.0
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AST migration breaks parsers | High | High | Comprehensive test suite, gradual migration |
| Tree-sitter WASM size | Medium | Medium | Code splitting, lazy load |
| VS Code extension rejection | Low | High | Follow guidelines, pre-submission review |
| Supply chain attack | Low | Critical | `npm audit`, signed releases, SBOM |
| Burnout | Medium | High | Sustainable pace, shared ownership |

---

## Success Metrics (KPIs)

| Metric | 3 Months | 6 Months | 12 Months |
|--------|----------|----------|-----------|
| GitHub Stars | 500 | 2,000 | 5,000 |
| npm Downloads/week | 1,000 | 10,000 | 50,000 |
| VS Code Installs | 500 | 5,000 | 20,000 |
| GitHub Action Uses | 100 | 1,000 | 5,000 |
| Contributors | 10 | 30 | 100 |
| Plugins Published | 5 | 20 | 50 |
| Discord Members | 100 | 500 | 2,000 |

---

## Investment Required

| Resource | Estimate |
|----------|----------|
| Developer Time | 6 months (1 FTE) |
| AST Migration | 4 weeks |
| VS Code Extension | 3 weeks |
| Landing + Docs | 2 weeks |
| SaaS Platform | 8 weeks (optional) |
| **Total** | **~6 months** |

---

## Immediate Next Steps (This Week)

1. **Complete GraphViewer fixes** (size, click handling, tree CSS)
2. **Write AST migration plan** (detailed spec)
3. **Set up test infrastructure** (Vitest + Playwright)
3. **Begin Babel parser integration** (highest ROI)
4. **Create contributor guide** (`CONTRIBUTING.md`)

---

## Appendix: Technical Decisions Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Web Worker + Comlink | Day 1 | Non-blocking UI, type-safe RPC |
| IndexedDB for cache | Day 1 | Persistent, same-origin, no backend |
| Regex parsers (initial) | Day 1 | Fast to ship, good enough for MVP |
| Plugin system | Week 2 | Extensibility from day 1 |
| Web Component free | Day 1 | Framework agnostic, vanilla JS |
| Vite + TypeScript | Day 1 | Modern, fast, type-safe |
| Tailwind CSS | Day 1 | Rapid UI, consistent design system |

---

*Last Updated: 2025-01-15*
*Version: 1.0*
*Owner: Santiago Malak*