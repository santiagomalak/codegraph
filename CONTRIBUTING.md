# Contributing to Code Graph Unified

¡Gracias por tu interés en contribuir! Este documento te guiará para configurar el entorno, entender los estándares y enviar contribuciones de calidad.

---

## Tabla de Contenidos

1. [Configuración del Entorno](#configuración-del-entorno)
2. [Estándares de Código](#estándares-de-código)
3. [Flujo de Trabajo Git](#flujo-de-trabajo-git)
4. [Testing](#testing)
5. [Tipos de Contribuciones](#tipos-de-contribuciones)
6. [Proceso de Review](#proceso-de-review)
7. [Comunicación](#comunicación)

---

## Configuración del Entorno

### Prerrequisitos

- **Node.js** 20+ (recomendado: 20 LTS)
- **npm** 10+ (incluido con Node)
- **Git** 2.30+

### Instalación

```bash
# 1. Fork y clone
git clone https://github.com/TU_USUARIO/codegraph.git
cd codegraph

# 2. Instalar dependencias
npm ci

# 3. Verificar que todo funciona
npm run typecheck
npm run lint
npm test
npm run build:vercel
```

### Scripts Disponibles

```bash
npm run dev           # Dev server (Vite) - http://localhost:5173
npm run build         # Build producción (tsc + vite)
npm run build:vercel  # Build para Vercel
npm run build:action  # Build GitHub Action
npm run preview       # Preview build local
npm run typecheck     # TypeScript strict check
npm run lint          # ESLint + Prettier
npm run test          # Tests unitarios (Vitest)
npm run test:watch    # Tests en modo watch
npm run format        # Formatear código con Prettier
```

---

## Estándares de Código

### TypeScript

- **Strict mode**: Activado (`"strict": true` en tsconfig.json)
- **No `any`**: Usa tipos explícitos o `unknown`
- **Interfaces sobre types**: Para objetos que se extienden
- **Explicit returns**: En funciones públicas
- **Null safety**: Strict null checks activados

```typescript
// ✅ Bien
function parseFile(content: string, path: string): ParseResult {
  // ...
}

// ❌ Mal
function parseFile(content, path) {
  // ...
}
```

### ESLint + Prettier

```bash
# Auto-fix
npx eslint src --ext js,ts,tsx --fix
npx prettier --write "src/**/*.{js,ts,tsx,json,css,md}"
```

**Reglas clave**:
- No `console.log` en producción (usa `logger.debug()`)
- No `any` implícito
- Variables `const` por defecto
- `await` sobre `.then()`
- Imports ordenados (externos → internos → relativos)

### Git Hooks (Husky)

```bash
# Se instalan automáticamente con `npm run prepare`
# Pre-commit: lint-staged (ESLint + Prettier en archivos staged)
# Commit-msg: conventional commits validation
```

---

## Flujo de Trabajo Git

### Convención de Commits (Conventional Commits)

```bash
# Formato
<type>(<scope>): <subject>

# Tipos
feat:     Nueva funcionalidad
fix:      Corrección de bug
docs:     Documentación
style:    Formato (prettier, etc.)
refactor: Refactor sin cambio de comportamiento
perf:     Mejora de performance
test:     Tests
chore:    Mantenimiento (deps, build, etc.)
ci:       CI/CD
```

**Ejemplos**:
```bash
git commit -m "feat(parser): add support for Vue SFC parsing"
git commit -m "fix(graph): fix tree centering on resize"
git commit -m "docs(api): add plugin API reference"
git commit -m "refactor(core): extract parser factory"
git commit -m "test(analyzer): add integration tests for circular deps"
```

### Branching Strategy

```
main ──────────────────────────────────▶
  │           │            │
  ▼           ▼            ▼
v1.0.0      v1.1.0       v2.0.0
```

| Rama | Propósito |
|------|-----------|
| `main` | Código estable, listo para release |
| `feat/*` | Nuevas features |
| `fix/*` | Bug fixes |
| `docs/*` | Documentación |
| `chore/*` | Mantenimiento |

### Pull Requests

1. **Rama**: `feat/nombre-descriptivo` o `fix/nombre-descriptivo`
2. **Commits**: Conventional commits (se squash en merge)
3. **CI**: Debe pasar (tests, lint, typecheck, build)
4. **Descripción**: Qué, por qué, cómo testear
5. **Reviewers**: Mínimo 1 approval

---

## Testing

### Estructura de Tests

```
src/
├── core/
│   ├── analyzer.test.js          # Tests de integración (14 tests)
│   └── parsers/
│       └── *.test.ts             # Tests unitarios por parser (TODO)
├── utils/
│   └── *.test.ts                 # Utils tests (TODO)
└── e2e/                          # Playwright (TODO)
```

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Watch mode
npm run test:watch

# Con coverage
npx vitest run --coverage
```

### Escribir Tests

#### Unit Test (Parser)

```typescript
// src/core/parsers/my-parser.test.ts
import { describe, it, expect } from 'vitest';
import { myParser } from './my-parser.ts';

describe('MyParser', () => {
  it('parses imports correctly', () => {
    const content = `import foo from './foo'\nimport { bar } from 'bar'`;
    const result = myParser.parse({
      content,
      path: 'test.myext',
      name: 'test.myext',
      ext: 'myext'
    });
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].module).toBe('./foo');
    expect(result.imports[1].module).toBe('bar');
  });

  it('handles empty files', () => {
    const result = myParser.parse({
      content: '',
      path: 'empty.myext',
      name: 'empty.myext',
      ext: 'myext'
    });
    expect(result.imports).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
  });
});
```

#### Integration Test

```typescript
// src/core/analyzer.integration.test.ts
import { describe, it, expect } from 'vitest';
import { CodeAnalyzer } from './analyzer.js';

describe('CodeAnalyzer Integration', () => {
  const analyzer = new CodeAnalyzer();

  it('analyzes a simple JS project', async () => {
    const files = createMockFileList([
      { name: 'main.js', content: `import foo from './foo'\nfunction main() {}` },
      { name: 'foo.js', content: `export const foo = 1` }
    ]);

    const result = await analyzer.analyzeFiles(files);

    expect(result.files).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.summary.totalFiles).toBe(2);
  });
});
```

### Mock FileList Helper

```typescript
function createMockFileList(files: { name: string; content: string; path: string }[]) {
  const fileObjects = files.map(f => {
    const file = new File([f.content], f.name, { type: 'text/javascript' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: f.path,
      writable: false
    });
    return file;
  });

  const list = [...fileObjects];
  list.item = (index: number) => list[index];
  list[Symbol.iterator] = function* () { yield* list; };
  return list as unknown as FileList;
}
```

---

## Tipos de Contribuciones

### 🐛 Bug Reports

**Template**:
```markdown
## Bug Report

**Descripción**: Breve descripción del bug

**Pasos para reproducir**:
1. Paso 1
2. Paso 2
3. Paso 3

**Comportamiento esperado**: Qué debería pasar
**Comportamiento actual**: Qué pasa realmente

**Entorno**:
- OS: [ej. macOS 14.2]
- Browser: [ej. Chrome 120]
- Node: [ej. 20.10.0]

**Logs/Errores**: 
```
Pega aquí cualquier error de consola
```

**Screenshots**: Si aplica

**Checklist**:
- [ ] He buscado issues existentes
- [ ] Puedo reproducir consistentemente
- [ ] Incluí pasos mínimos para reproducir
```

### ✨ Feature Requests

```markdown
## Feature Request

**Problema**: Qué problema resuelve esta feature

**Solución propuesta**: Descripción de la feature

**Alternativas consideradas**: Otras opciones evaluadas

**Contexto adicional**: Mockups, links, referencias

**Checklist**:
- [ ] He verificado que no existe ya
- [ ] He considerado el impacto en arquitectura
- [ ] He pensado en compatibilidad hacia atrás
```

### 📝 Documentation

- Typos, claridad, ejemplos
- Traducciones (ES/EN)
- API reference, guías, tutoriales

### 🔧 Code Contributions

| Tipo | Rama | Tests Requeridos |
|------|------|------------------|
| Bug fix | `fix/*` | Sí (regression test) |
| New feature | `feat/*` | Unit + integration |
| Refactor | `refactor/*` | Existing tests pass |
| Performance | `perf/*` | Benchmarks |
| Docs | `docs/*` | N/A |

---

## Proceso de Review

### Como Autor

1. **Self-review** antes de abrir PR
2. **Descripción clara**: Qué, por qué, cómo testear
3. **Commits limpios**: Conventional commits
4. **CI pasa**: Tests, lint, typecheck, build
5. **Responder feedback** en 24-48h

### Como Reviewer

**Checklist**:
- [ ] Código sigue estándares (ESLint, TypeScript strict)
- [ ] Tests cubren cambios (unit + integration)
- [ ] No breaking changes sin version bump
- [ ] Documentación actualizada si aplica
- [ ] Performance: no regresiones obvias
- [ ] Seguridad: validación, escaping, no secrets

**Comentarios**:
- `👍` / `👎` para aprobaciones rápidas
- `💡 Sugerencia` para mejoras opcionales
- `❓ Pregunta` para clarificaciones
- `🔴 Bloqueante` para cambios requeridos

### Merge Criteria

- [ ] CI passing (tests, lint, typecheck, build)
- [ ] ≥ 1 approval
- [ ] No conflicts con main
- [ ] Squash and merge (default)

---

## Comunicación

### Canales

| Canal | Propósito |
|-------|-----------|
| **GitHub Issues** | Bugs, features, preguntas técnicas |
| **GitHub Discussions** | Preguntas generales, ideas, show & tell |
| **GitHub PRs** | Code review, discusión técnica |
| **Discord** | Chat en tiempo real, community |

### Etiqueta

- Sé respetuoso y constructivo
- Asume buena intención
- Cita código/contexto relevante
- Cierra issues/PRs con contexto si no proceden

---

## Reconocimientos

### Contributors

Todos los contribuyentes aparecen en:
- `AUTHORS.md` (generado automáticamente)
- GitHub Contributors graph
- Release notes

### Tipos de Contribución Reconocidos

| Tipo | Badge |
|------|-------|
| Code | 💻 |
| Docs | 📖 |
| Tests | 🧪 |
| Design | 🎨 |
| Translation | 🌐 |
| Ideas/Planning | 💡 |
| Review | 👀 |
| Maintenance | 🔧 |
| Community | 🤝 |

---

## Código de Conducta

Este proyecto sigue el [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of-conduct/).

**Resumen**:
- Sé respetuoso e inclusivo
- No toleramos acoso, discriminación, insultos
- Reporta violaciones a conduct@codegraph.dev

---

## Licencia

Al contribuir, aceptas que tu código se licencie bajo **MIT License** (igual que el proyecto).

---

## ¿Preguntas?

- **GitHub Discussions**: Para preguntas generales
- **Issues**: Para bugs/features específicas
- **Email**: conduct@codegraph.dev (conducta)

¡Gracias por contribuir! 🚀