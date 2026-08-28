# 01 · Visión y fases

## La idea

Le pasás una carpeta de proyecto y la app te devuelve un **mapa vivo** de ese
proyecto: todos los archivos, cómo se conectan, en qué lenguaje están, qué áreas
lo componen, dónde están los problemas. Un grafo tipo "red de ideas" donde cada
parte del proyecto se ve y se relaciona con las demás.

Dos usuarios de ese mapa:

1. **Vos**, para entender de un vistazo un proyecto (propio o ajeno).
2. **La IA** (Claude), para que entienda gráficamente qué estás construyendo antes
   de ponerse a programar: el stack, la arquitectura, las dependencias.

## De dónde venimos (v2)

La versión anterior era una web que:
- cargaba la carpeta en el navegador,
- parseaba con **expresiones regulares** (~70% de acierto, sin entender la sintaxis real),
- dibujaba un grafo de dependencias con D3,
- exportaba un texto que **copiabas y pegabas a mano** en el chat.

Servía, pero tenía techo: sin AST no hay call graph ni análisis serio, el grafo
era solo "archivo importa archivo", y la IA no "veía" nada — recibía texto.

## A dónde vamos

Un **grafo de conocimiento multicapa** con la IA integrada de verdad. El mismo
motor sirve a un CLI, a una web y a un servidor MCP.

### Fases

| Fase | Qué entrega | Estado |
|---|---|---|
| **1 · Fundación** | Monorepo + motor real con tree-sitter (5 lenguajes) + CLI + grafo multicapa + CODEMAP | ✅ hecho |
| **2 · Interfaz** | Web (`packages/web`): grafo d3-force, capas conmutables, inspector, búsqueda, timeline | ✅ hecho |
| **3 · IA** | Servidor MCP para Claude Code (13 herramientas) + CODEMAP con niveles | ✅ hecho · falta el chat en la UI |
| **4 · Capa git** | Hotspots + acoplamiento oculto + timeline + snapshots históricos | ✅ hecho |
| **5 · Escala y producto** | Render canvas/WebGL · extensión VS Code · publicar en npm · panel de IA en la web | 🚧 en curso |

### Decisiones ya tomadas

- **Se evoluciona este repo** (no uno nuevo). El motor viejo se reescribió, la
  web vieja se borró.
- **Monorepo con npm workspaces** — no hace falta instalar pnpm ni aprender nada nuevo.
- **Lenguajes:** Python, JavaScript/TypeScript, Go, Rust y Java. Sumar más es
  agregar una gramática tree-sitter + una entrada en `language-specs.ts`, sin
  tocar la arquitectura.
- **Integración IA:** las dos vías — servidor MCP *y* (pendiente) chat dentro de la app.
- **Objetivo:** open source / producto.

## Extensión de VS Code

La forma más directa de meter el grafo donde ya se programa, sin construir un
editor. El motor (`@codegraph/core`) ya corre en Node; la extensión sería una
capa fina encima:

| Función | Cómo |
|---|---|
| **Panel del grafo** | Webview lateral que reusa `packages/web` apuntando a un análisis en memoria |
| **"Explicá este archivo / dominio"** | Botón que arma el contexto (`describe_file` + vecinos) y se lo pasa a Claude vía el MCP ya existente |
| **Marcas de hotspot** | Decoraciones en el gutter (color según el score) + hover con churn/complejidad |
| **Saltar a dependencia** | Code lens "importado por N archivos" → lista para navegar |
| **Aviso de acoplamiento** | Al abrir un archivo, "suele cambiar junto con: …" en la status bar |
| **Re-análisis** | Al guardar (con debounce), incremental cuando esté listo |

**Estado (v0.1, `packages/vscode`):** hecho el panel del grafo (reusa
`packages/web` en un webview, comunicación por `postMessage`), clic en nodo →
abre el archivo, marcas de hotspot en el gutter, acoplamiento en la status bar,
re-análisis al guardar. Falta: empaquetar el `.vsix`, "explicá este archivo" vía
MCP, snapshots en el panel, análisis incremental.

## ¿Un editor de código propio / app de escritorio?

Idea sobre la mesa. Lectura honesta:

- **Construir un editor** (competir con VS Code en edición) es un pozo sin fondo y
  saca el foco de lo que hace único a este proyecto: el grafo.
- **La extensión de VS Code** da "el grafo donde ya programás" gratis. Es el
  camino con mejor relación esfuerzo/valor.
- **Una app de escritorio** (Tauri/Electron envolviendo `packages/web` + el motor
  local) tiene sentido **solo** si el valor es *navegar el proyecto por el grafo*
  —abrir archivos desde el mapa, no desde el árbol— más que editar. Sería un
  "explorador de proyectos" visual, no un IDE. Candidata a un experimento
  post-Fase 5, no antes.

En orden de prioridad: **extensión de VS Code** → (opcional) explorador de
escritorio. Editor propio: no.

## El grafo multicapa (hacia dónde crece)

El grafo mezcla varios "planos" en una sola estructura y la UI elige cuáles mostrar:

| Plano | Qué conecta | Estado |
|---|---|---|
| Estructura | carpetas → archivos | Fase 2 (UI) |
| Dependencias | archivo → archivo (imports) | ✅ |
| Símbolos / call graph | función → función | ✅ (datos) |
| Dominios | archivos de una misma área | ✅ |
| Flujo de datos | API → store → componente | 🔜 |
| Conceptual ("ideas") | "Sistema de pagos" → archivos que lo implementan | 🔜 (lo genera la IA) |
