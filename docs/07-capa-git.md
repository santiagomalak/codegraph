# 07 · La capa git (hotspots)

## Qué agrega

Si la carpeta que analizás es un repo git, el motor lee el historial y cruza
**cuánto cambia** cada archivo con **qué tan complejo** es.

```
hotspot = media geométrica( norm(complejidad) , norm(churn) )
```

Un archivo con **hotspot alto** es complejo *y además* cambia mucho — es donde
suelen concentrarse los bugs y donde más rinde refactorizar. (La idea es de Adam
Tornhill, *Your Code as a Crime Scene*.)

- `norm(complejidad)` = complejidad / 40, tope 1
- `norm(churn)` = escala **logarítmica** de la cantidad de commits (los commits
  están muy sesgados: unos pocos archivos acaparan la mayoría)

## De dónde salen los datos

`readGitHistory(rootDir)` (en `@codegraph/core/node`) corre:

```
git log --numstat --no-renames --no-merges -n8000 --format=...
```

y para cada archivo acumula: commits, autores distintos, líneas movidas, fecha
del primer y último commit. Si `rootDir` es una subcarpeta del repo, ajusta los
paths (git los da relativos a la raíz del repo).

Si no es un repo git (o `git` no está instalado), devuelve `{}` y el análisis
sigue igual, sin hotspots.

## Dónde se ve

| Lugar | Qué muestra |
|---|---|
| `analysis.summary.hotspots` | Top 12 archivos por score |
| `analysis.files[].git` | commits / autores / líneas / fechas por archivo |
| `graph.nodes[].churn` y `.hotspot` | en los nodos de archivo |
| **CLI** | sección "Hotspots" en el resumen de `analyze` |
| **CODEMAP.md** | sección `## 🔥 Hotspots` (contexto para IA) |
| **Web** | glow naranja en los nodos calientes + lista clicable en la sidebar + datos de git en el Inspector |
| **MCP** | herramienta `hotspots` |

## Nota

En un repo joven (pocos commits) el churn casi no diferencia — todos los archivos
tienen 1–3 commits. La señal se vuelve útil en repos con historia real.

## Qué falta / se podría sumar

- **Autores por dominio** (quién conoce qué área)
- **Edad del código** (archivos que nadie toca hace años = candidatos a revisar o borrar)
- **Timeline**: un slider para ver cómo evolucionó el grafo commit a commit
- **Coupling temporal**: archivos que siempre se modifican juntos aunque no se
  importen (señal de acoplamiento oculto)
- `git blame` por símbolo (no solo por archivo)
