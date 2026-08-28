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

## El timeline

`readGitHistory` también divide la historia en **48 tramos iguales** por fecha y
devuelve `analysis.timeline`:

- `commitsPerBucket` — cuántos commits en cada tramo (el histograma de la barra)
- `fileFirstBucket` — en qué tramo apareció cada archivo
- `fileActivity` — cuántos commits tocaron cada archivo en cada tramo

En la web hay un botón **⏱ Timeline**: abre una barra abajo del grafo con ese
histograma y un playhead. Al moverlo (o darle play), los archivos **aparecen** a
medida que se crearon y los que se tocaron en ese tramo **pulsan** (las "olas").

> Se ve mejor en repos con historia repartida en el tiempo. Si casi todos los
> commits son del mismo día, el timeline queda plano.

## Qué falta / se podría sumar

- **Snapshots reales** (enfoque "los dos"): re-analizar ~20 puntos de la historia
  con `git worktree` para tener las métricas reales de cada época.
- **Autores por dominio** (quién conoce qué área)
- **Edad del código** (archivos que nadie toca hace años)
- **Coupling temporal**: archivos que siempre se modifican juntos aunque no se
  importen (acoplamiento oculto)
- `git blame` por símbolo
