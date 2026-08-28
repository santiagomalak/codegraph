# 05 · La interfaz web (`@codegraph/web`)

## Cómo verla

```bash
npm install
npm run build
npm run serve -- "C:\ruta\a\tu-proyecto"
```

Abrí **http://localhost:4173**. El CLI analiza la carpeta al arrancar y la UI
la dibuja.

Para cambiar de proyecto: `Ctrl+C` y volvé a correr `npm run serve -- <otra carpeta>`.
El botón **↻ Re-analizar** vuelve a analizar la misma carpeta (útil después de
cambiar código).

## Cómo se conecta

```
navegador (la UI)  ──GET /api/analysis──▶  codegraph serve (Node)
                                              │
                                              ▼  usa @codegraph/core
                                           analiza la carpeta del disco
```

La UI **no** analiza nada: solo pide el JSON y lo dibuja. Todo el trabajo pesado
es del CLI.

## Qué se ve

### El grafo (centro)

- Cada **círculo es un archivo**. El tamaño = líneas de código.
- El **color = dominio** (área del proyecto). La leyenda está en la sidebar.
- Borde **rojo** = el archivo tiene issues. Borde **violeta** = está en un ciclo.
- Las **líneas son imports** internos. Punteadas violetas = dependencia circular.
- **Glow** en un nodo = riesgo alto (mucha complejidad + issues).

Interacción: rueda para zoom, arrastrar el fondo para moverse, arrastrar un nodo
para fijarlo, click en un nodo para abrir el Inspector, hover para resaltar sus
vecinos, "Centrar vista" para reencuadrar.

### Sidebar (izquierda)

Health score, métricas, stack detectado, lenguajes, lista de dominios y el
desglose de qué le baja la nota al proyecto.

### Inspector (derecha, al seleccionar)

Lenguaje y métricas del archivo, sus imports (con la ruta resuelta), sus símbolos
(funciones/clases, marca `async` y `sin doc`) y sus issues con la línea.

### Toolbar (arriba)

- **Buscar archivo**: filtra el grafo (los que no matchean se atenúan).
- **Agrupar por dominio**: separa visualmente las áreas en la pantalla.
- **Mostrar paquetes externos**: agrega nodos para `react`, `os`, etc.
- **↻ Re-analizar**: vuelve a correr el análisis.

## Desarrollo con hot reload

```bash
# terminal 1
npm run serve -- /ruta/a/tu-proyecto
# terminal 2
npm run dev:web        # Vite en :5173, proxya /api a :4173
```
