# Contribuir a Code Graph Unified

¡Gracias por tu interés en contribuir! Este proyecto es open source (MIT) y toda ayuda es bienvenida.

## 🚀 Primeros pasos

```bash
# Fork + clone tu fork
git clone https://github.com/TU_USUARIO/code-graph-unified.git
cd code-graph-unified

# Instalar deps + hooks
npm ci
npm run prepare   # instala husky pre-commit

# Levantar dev
npm run dev
```

## 📋 Checklist antes de PR

- [ ] `npm run lint` pasa sin warnings
- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run test` pasa
- [ ] `npm run format` aplicado
- [ ] Commits convencionales (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)

## 🏗️ Arquitectura — dónde tocar

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Core | `src/core/analyzer.js` | AST parsing, métricas, grafo deps |
| UI | `src/ui/components/GraphViewer.js` | D3.js force graph |
| API | `src/api/codemapGenerator.js` | Export CODEMAP.md / JSON |
| Orq. | `src/app.js` | Conecta todo, maneja DOM |

**Regla de oro**: Core no conoce UI. UI no analiza código. API no toca DOM (salvo descarga).

## 🧪 Tests

- Unitarios: `src/**/*.test.js` (Vitest)
- Ejecutar: `npm run test` / `npm run test:watch`

## 🐛 Reportar bugs

Usa [GitHub Issues](https://github.com/santiagomalak/code-graph-unified/issues) con:
- Pasos para reproducir
- Proyecto de ejemplo (o repo público)
- Navegador / OS / Node version

## 💡 Ideas / Features

Abre un *Discussion* o *Issue* con label `enhancement`. Priorizamos:
1. File tree view (estructura carpetas)
2. Persistencia IndexedDB / File System Access API
3. CLI para CI/CD (`npx codegraph update`)
4. Web Worker para análisis no bloqueante
5. Soporte más lenguajes (Go, Rust, Java, etc.)

## 📄 Licencia

Al contribuir, aceptas que tu código se licencie bajo **MIT**.