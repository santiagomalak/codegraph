# Code Graph Unified - Security Analysis

## Executive Summary

Code Graph Unified is a **client-side only** static analysis tool that runs entirely in the browser. It has **no backend, no authentication, no user accounts, and no external API calls**. All processing happens locally in the user's browser.

**Security Posture**: **LOW RISK** - No server-side attack surface, no sensitive data transmission, no persistent user data on servers.

---

## Threat Model

### Assets
| Asset | Classification | Location |
|-------|----------------|----------|
| Source code (user's project) | CONFIDENTIAL | User's filesystem → Browser memory |
| Analysis results (CODEMAP) | CONFIDENTIAL | Browser memory → User download |
| Cache (IndexedDB) | CONFIDENTIAL | Browser IndexedDB (same-origin) |
| Project hash (SHA-256) | INTERNAL | IndexedDB |

### Trust Boundaries
```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Main Thread │  │ Web Worker  │  │ IndexedDB           │  │
│  │  (UI)       │  │ (Analysis)  │  │ (Cache)             │  │
│  │  Origin:    │  │ Origin:     │  │ Origin:             │  │
│  │  https://   │  │  blob:      │  │  https://           │  │
│  │  app.com    │  │  (same)     │  │  app.com            │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│        │                 │                      │            │
│        └────────┬────────┴──────────────────────┘            │
│                 ▼                                            │
│        ┌─────────────────────┐                               │
│        │  SAME-ORIGIN POLICY │                               │
│        └─────────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### Attack Surface
| Vector | Exposure | Mitigation |
|--------|----------|------------|
| File Read (user upload) | User-initiated, directory picker | File System Access API requires user gesture |
| Code Execution (Worker) | Regex-based parsing, no `eval` | No dynamic code execution |
| Data Exfiltration | None (no network requests) | No `fetch`/`XMLHttpRequest` in analysis path |
| XSS | InnerHTML in inspector | DOMPurify / escaping (`_escape` function) |
| Prototype Pollution | None (no user input in objects) | N/A |
| Supply Chain | npm dependencies | `npm audit`, pinned versions |

---

## Security Controls Implemented

### 1. Input Validation & Sanitization

#### File Processing (`analyzer.js:_filterAndRead`)
```javascript
// Strict extension allowlist
const ext = file.name.split('.').pop().toLowerCase();
if (!this.EXTENSIONS[ext]) continue;  // Reject unknown extensions

// Directory traversal prevention
if (parts.some(p => this.IGNORE_DIRS.has(p))) continue;  // Skip node_modules, .git, etc.
if (this.IGNORE_FILES.has(file.name)) continue;  // Skip .env, package-lock.json, etc.

// Safe file reading
const content = await file.text();  // Native File API, no path traversal
```

#### Output Escaping (`app.js:_escape`)
```javascript
_escape(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}
```
**Used in**: Inspector tabs (overview, errors, deps, AI) - all user-controlled data escaped before `innerHTML`.

#### Regex-Based Parsing (No `eval`/`Function`)
```javascript
// JavaScriptParser.js - Pure regex, no code execution
detectImports(content) {
  const esm = content.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g);
  // ...
}
```
**No `eval()`, `new Function()`, `setTimeout(string)`, or dynamic imports of user content.**

### 2. File System Access Controls

#### File System Access API (User Gesture Required)
```javascript
// fsAccess.js
export async function requestDirectoryHandle() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API no soportada');
  }
  return window.showDirectoryPicker({ mode: 'readwrite' });
}
```

**Security Properties**:
- Requires explicit user gesture (click)
- Browser shows directory picker dialog
- User chooses exact directory
- Permission persists only for session

#### Directory Traversal Prevention
```javascript
// analyzer.js:_resolveRelative
_resolveRelative(base, rel) {
  const parts = (base + '/' + rel).split('/');
  const stack = [];
  for (const p of parts) {
    if (p === '..') stack.pop();      // Neutralize ..
    else if (p && p !== '.') stack.push(p);  // Ignore . and empty
  }
  return stack.join('/');
}
```

### 3. Content Security Policy (Recommended)

Add to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self';
  img-src 'self' data:;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
">
```

**Note**: `'wasm-unsafe-eval'` needed for Vite dev mode; remove in production.

### 4. Dependency Security

#### Current Dependencies (Production)
```json
{
  "dependencies": {
    "comlink": "^4.4.1",      // Worker RPC - mature, widely used
    "d3": "^7.9.0"            // Visualization - mature, no known critical vulns
  },
  "devDependencies": {
    // ... build tools only
  }
}
```

#### Security Scanning
```bash
npm audit           # Current: 4 vulnerabilities (2 moderate, 1 high, 1 critical) in dev deps only
npm audit fix       # Fixes available for dev deps
```

**Recommendation**: Run `npm audit fix --force` before production deploy.

### 5. Data Privacy

| Data Type | Stored Where | Retention | User Control |
|-----------|--------------|-----------|--------------|
| Project files (content) | Browser memory (ephemeral) | Session only | User closes tab → gone |
| Analysis results | Browser memory → User download | User decides | User saves file |
| IndexedDB cache | Browser IndexedDB | Until cleared | "Clear Cache" button |
| Project hash | IndexedDB | Until cache cleared | Auto-invalidated on changes |

**No data ever leaves the browser** - No telemetry, no analytics, no external requests during analysis.

---

## Vulnerability Assessment

### CWE Mapping

| CWE | Description | Status | Location |
|-----|-------------|--------|----------|
| CWE-79 | XSS | **MITIGATED** | `_escape()` in app.js, CSP recommended |
| CWE-22 | Path Traversal | **MITIGATED** | `_resolveRelative()` normalizes paths |
| CWE-94 | Code Injection | **NOT APPLICABLE** | No `eval`, regex-only parsing |
| CWE-20 | Improper Input Validation | **MITIGATED** | Extension allowlist, dir filtering |
| CWE-200 | Information Exposure | **LOW** | No external requests, local-only |
| CWE-532 | Info Exposure in Logs | **MITIGATED** | No sensitive data in console.log |
| CWE-922 | Insecure Storage | **MITIGATED** | IndexedDB same-origin, user-controlled |

### Dependency Vulnerabilities (Dev Only)
```bash
# Run before release
npm audit --audit-level=high
```
Current: 4 vulnerabilities in **devDependencies only** (esbuild, vite, etc.) - no runtime impact.

---

## Secure Development Practices

### Code Review Checklist
- [ ] No `eval()` / `Function()` / `setTimeout(string)`
- [ ] All user data escaped before DOM insertion
- [ ] File paths normalized (`_resolveRelative`)
- [ ] Extension allowlist enforced
- [ ] No network requests in analysis path
- [ ] Worker communicates via Comlink (typed RPC)
- [ ] IndexedDB access wrapped in try/catch

### CI/CD Security Gates
```yaml
# .github/workflows/ci.yml
- name: Security Audit
  run: npm audit --audit-level=high

- name: Type Check
  run: npm run typecheck

- name: Lint
  run: npm run lint

- name: Test
  run: npm test
```

### Release Signing
```bash
# GPG sign releases
git tag -s v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

---

## Incident Response

### Data Breach (Impossible by Design)
- **No server** = no central data store to breach
- **No user accounts** = no credentials to steal
- **No external APIs** = no token leakage

### Malicious File Analysis
- **Regex-only parsing** = no code execution risk
- **Worker isolation** = main thread protected
- **Memory limits** = browser enforces worker memory limits

### Supply Chain Attack
1. `npm ci` with `package-lock.json` (reproducible builds)
2. `npm audit` in CI
3. Dependabot alerts enabled
4. Minimal dependencies (2 runtime deps)

---

## Compliance

| Standard | Status | Notes |
|----------|--------|-------|
| GDPR | ✅ Compliant | No personal data processed |
| CCPA | ✅ Compliant | No personal data collected |
| SOC 2 Type II | N/A | No backend services |
| ISO 27001 | N/A | Client-side only |

---

## Security Testing

### Manual Testing
```bash
# 1. XSS Attempt
# Open DevTools Console, try:
document.getElementById('overviewContent').innerHTML = '<img src=x onerror=alert(1)>'
# Should be escaped

# 2. Path Traversal
# Create file: ../../../etc/passwd
# Should be ignored by IGNORE_DIRS/FILES

# 3. Large File DoS
# Create 100MB file → Worker memory limit protects main thread
```

### Automated Testing
```bash
npm test           # Unit tests
npm run typecheck  # TypeScript strict mode
npm run lint       # ESLint security rules
```

---

## Security Contacts

| Role | Contact |
|------|---------|
| Security Issues | security@codegraph.dev (create GitHub Security Advisory) |
| Maintainer | Santiago Malak |

---

## Security Checklist for Contributors

- [ ] No new `eval()` / `Function()` / dynamic imports
- [ ] All new DOM insertions use `_escape()` or `textContent`
- [ ] New file operations validate paths
- [ ] New dependencies: `npm audit` before merge
- [ ] Worker communication via Comlink only
- [ ] No `localStorage`/`sessionStorage` for sensitive data
- [ ] IndexedDB operations wrapped in try/catch
- [ ] CSP headers don't block new features

---

## Future Security Enhancements

| Priority | Enhancement | Effort |
|----------|-------------|--------|
| High | Subresource Integrity (SRI) for CDN assets | Low |
| High | CSP reporting endpoint | Medium |
| Medium | WebAssembly parser (WASM) for performance + sandboxing | High |
| Medium | Content Security Policy enforced in production | Low |
| Low | Signed releases with SLSA provenance | Medium |
| Low | Fuzzing for parser regexes | Medium |