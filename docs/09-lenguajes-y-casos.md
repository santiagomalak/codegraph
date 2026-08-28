# 09 · Lenguajes y casos de uso

Qué se saca de cada lenguaje, en qué tipo de proyectos rinde más y dónde todavía
no llega.

---

## Lenguajes con AST

El motor usa **tree-sitter** (el parser real de cada lenguaje, compilado a
WebAssembly). Para cada archivo saca: imports, funciones, clases/métodos,
llamadas entre símbolos, complejidad ciclomática y cobertura de documentación.

| Lenguaje | Extensiones | Símbolos | Resolución de imports internos |
|---|---|:---:|---|
| **Python** | `.py` `.pyi` | funciones, clases, métodos | relativos (`.`, `..`) + módulo absoluto (`paquete.modulo`) |
| **JavaScript** | `.js` `.mjs` `.cjs` `.jsx` | funciones, clases, métodos, arrow-fns asignadas | relativos + `require()` + `import()` dinámico |
| **TypeScript** | `.ts` `.mts` `.cts` `.tsx` | idem + `export`s nombrados | relativos + **alias de `tsconfig`** (`@/x`) + **`baseUrl`** + **paquetes de un monorepo** (npm workspaces, incluso subpaths de `exports`) + **re-exports** (`export … from`) |
| **Go** | `.go` | funciones, structs, interfaces, métodos (con receiver) | vía `module` de `go.mod` → carpeta del paquete |
| **Rust** | `.rs` | funciones, structs, enums, traits, métodos de `impl` | `mod x;`, `crate::`, `self::`, `super::` → `x.rs` / `x/mod.rs` |
| **Java** | `.java` | clases, interfaces, enums, records, métodos, constructores | por nombre completo (`com.example.Foo` → el archivo que termina en `com/example/Foo.java`) |

Python y JS/TS tienen parsers dedicados (`parse-python.ts`, `parse-javascript.ts`).
Go, Rust y Java comparten un **parser genérico** (`parse-generic.ts`) guiado por
una tabla de nombres de nodo AST (`language-specs.ts`).

### Solo listados (sin símbolos ni imports)

CSS / SCSS, JSON, Markdown. Cuentan para las métricas de líneas y aparecen en el
grafo, pero el motor no los "entiende".

### Limitaciones conocidas por lenguaje

- **Go**: un import a un paquete resuelve a **un archivo representativo** de esa
  carpeta (Go no tiene archivo por módulo). Los imports del stdlib quedan externos.
- **Rust**: la resolución de `use` es heurística (crate root = `src/lib.rs` o
  `src/main.rs`). `use` de dependencias externas se detecta como externo.
- **Java**: el índice por nombre completo asume una raíz de fuentes estándar
  (`src/main/java/…`). En proyectos multi-módulo (`services/x/src/main/java/…`)
  los imports internos pueden no resolver.
- **Go/Rust/Java**: los imports se registran en "línea 1" (el parser genérico
  todavía no guarda la línea real).

### Sumar un lenguaje

1. Confirmar que `tree-sitter-wasms` trae la gramática (`node_modules/tree-sitter-wasms/out/`).
2. Extensión → `LanguageId` en `languages.ts`, color, agregar a `PARSEABLE`.
3. Nombre del `.wasm` en `parser-registry.ts`.
4. Una entrada en `language-specs.ts` (qué nodos son funciones, clases, imports…).
5. Etiqueta en `summary.ts` y un test en `test/languages.test.ts`.

Candidatos directos (la gramática ya está): **C#, Ruby, Kotlin, PHP, C/C++,
Swift, Scala, Lua**.

---

## Tipos de proyecto donde rinde

### Monorepos y proyectos grandes
El punto más fuerte. Los **dominios** revelan la arquitectura real (no la que
dice el README), la resolución de alias/workspaces conecta lo que otras
herramientas dejan suelto, y el MCP deja que una IA navegue sin cargar 200
archivos.

### Bases de código heredadas / auditorías
**Hotspots** + **dependencias circulares** + **acoplamiento oculto** = un mapa de
dónde está la deuda técnica y el riesgo, respaldado por el historial de git, no
por intuición.

### Onboarding
Un desarrollador nuevo abre `codegraph serve`, mira los dominios y los entry
points, y en cinco minutos tiene el modelo mental que antes tomaba una semana.
El **Timeline** muestra en qué orden se construyó el proyecto.

### Trabajo con asistentes de IA
El caso que motivó el proyecto. En vez de pegar archivos sueltos, la IA tiene el
`CODEMAP.md` como contexto y el servidor MCP para preguntas puntuales
(`impact_of`, `find_symbol`, `describe_file`). Entiende el proyecto "de un
vistazo" y gasta órdenes de magnitud menos tokens.

### Revisión de arquitectura / CI
`--fail-on-cycles` y `--max-complexity` como gate. El grafo en un PR para
discutir un cambio estructural antes de escribirlo.

## Dónde todavía no llega

- **Proyectos de miles de archivos en la web**: el render SVG se satura pasando
  ~500 nodos. (Canvas/WebGL en el roadmap. El CLI y el MCP no tienen ese límite.)
- **Análisis de tipos**: no hay inferencia. Sabe que `foo()` se llama, no de qué
  tipo es `foo`.
- **Llamadas dinámicas / reflexión / inyección de dependencias**: el call graph
  es por coincidencia de nombre; los frameworks muy "mágicos" quedan cortos.
- **Lenguajes no listados**: entran como archivos sin analizar.
- **Cross-language**: un front que llama a un back por HTTP no se conecta en el
  grafo (no hay imports que seguir).
