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
| **1 · Fundación** | Monorepo + motor real con tree-sitter + CLI + grafo multicapa + CODEMAP | ✅ en curso |
| **2 · Interfaz** | Web nueva (`packages/web`): grafo WebGL, capas conmutables, inspector, búsqueda | 🚧 siguiente |
| **3 · IA** | Servidor MCP para Claude Code + chat con el proyecto + "explicá este nodo" | 🔜 |
| **4 · Producto** | Extensión VS Code + landing + docs + publicar en npm | 🔜 |
| **5 · Contexto extra** | Capa git (churn, hotspots, evolución en el tiempo), anotaciones | 🔜 |

### Decisiones ya tomadas

- **Se evoluciona este repo** (no uno nuevo). El motor viejo se reescribió; la
  web vieja se migra en la Fase 2.
- **Monorepo con npm workspaces** — no hace falta instalar pnpm ni aprender nada nuevo.
- **Lenguajes:** Python, JavaScript/TypeScript, Go, Rust y Java. Sumar más es
  agregar una gramática tree-sitter + una entrada en `language-specs.ts`, sin
  tocar la arquitectura.
- **Integración IA:** las dos vías — servidor MCP *y* chat dentro de la app.
- **Objetivo:** open source / producto.

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
