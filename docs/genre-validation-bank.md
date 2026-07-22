# Banco local de validación de géneros

## Propósito y límites

Esta infraestructura permite comparar de forma repetible las salidas de OpenAI `gpt-audio`, Discogs-EffNet, MAEST Discogs519, LAION CLAP u otro proveedor **contra el mismo conjunto local**. Define contratos y métricas; no descarga modelos, no ejecuta inferencia, no envía audio, no añade una interfaz ni constituye todavía un banco musical real.

Los fixtures versionados en `src/lib/music/fixtures/` son metadatos sintéticos para pruebas. Sus nombres WAV no designan archivos existentes y no validan la calidad musical de ningún proveedor.

## Preparar un banco real fuera de Git

1. Cree `genre-validation-data/` solo en su equipo (está ignorado por Git) y conserve dentro el audio propio o correctamente licenciado.
2. Cree un manifiesto JSON usando `djorganizer-genre-manifest-v1`. Incluya `bankId` opaco, `taxonomyVersion: "djorganizer-genre-v1"` y `samples`.
3. Por muestra use un `id` opaco estable, `file` relativo a esa carpeta, SHA-256 hexadecimal, `durationSeconds` o `null`, `expectedGenres` no vacío, `manualReview` (`approved` o `needs-review`) y una anotación opcional. Nunca use rutas absolutas, letras de unidad, `file://`, `..`, contenido base64, secretos o datos personales.
4. Escuche y etiquete manualmente cada muestra. Una pista ambigua puede tener varias etiquetas de la taxonomía cerrada; documente la decisión en `annotation` y mantenga la revisión pendiente hasta que alguien la confirme.
5. Calcule la huella SHA-256 del archivo local y compárela con `sha256` antes de una ejecución. Si cambia, vuelva a revisar y etiquetar la muestra.

El audio real no se sube a Supabase ni Vercel, no entra en CI y no se comparte con un proveedor sin consentimiento explícito por la muestra autorizada. Los resultados no contienen rutas ni audio: guárdelos localmente bajo `genre-validation-results/`, también ignorado por Git.

## Registrar una ejecución

Una ejecución `djorganizer-genre-execution-v1` declara proveedor, modelo, versión del proveedor o artefacto, fecha ISO, configuración, versión de taxonomía e `executionId`. Cada resultado referencia solo `sampleId` y tiene uno de estos estados:

- `success`: predicciones ya ordenadas (`genre`, confianza 0–1), latencia obligatoria y memoria máxima, coste y explicación opcionales.
- `skipped`: el proveedor no procesó la muestra.
- `error`: únicamente un código saneado (`timeout`, `unsupported`, etc.), nunca una ruta, token o mensaje privado.

Las ejecuciones y el manifiesto se validan juntos: no se admiten IDs ni resultados duplicados, géneros fuera de la taxonomía ni resultados para muestras inexistentes. No compare proveedores si su salida no se adaptó y documentó para la misma versión de taxonomía; una taxonomía distinta cambia el significado de precisión y recall.

## Métricas y reglas deterministas

El evaluador puro recibe contratos ya validados y permite `confidenceThreshold` (por defecto 0) y `maxLabelsPerSample` (por defecto sin límite). Conserva el orden declarado por el proveedor, elimina por validación las etiquetas duplicadas, filtra por umbral y toma las primeras *k*. Una predicción vacía `success` cuenta como evaluada pero incorrecta.

Las muestras `success` entran en las métricas de etiquetas; `skipped`, `error` y muestras sin resultado no inventan etiquetas y reducen cobertura. Por tanto: cobertura = muestras `success` / total; exactitud de primera predicción y coincidencia exacta del conjunto se dividen entre muestras evaluadas. `samplesCorrect` cuenta coincidencias exactas de conjunto.

Para cada género se calculan soporte, TP, FP, FN, precisión `TP/(TP+FP)`, recall `TP/(TP+FN)` y F1 armónico. Micro agrega TP/FP/FN de toda la taxonomía. Macro promedia los géneros con soporte o alguna predicción; los géneros sin soporte ni predicción quedan visibles con ceros pero no sesgan el promedio. Toda división por cero produce `0`; los ratios y promedios se redondean a cuatro decimales, por lo que nunca se emiten `NaN` ni `Infinity`.

Latencia media, p50 y p95 usan solo éxitos, con percentiles *nearest-rank* sobre latencias ordenadas. La memoria es el máximo observado. Coste total y medio usan solo éxitos que informaron coste; cada métrica de rendimiento es `null` si no existe ninguna observación. Las entradas no se mutan.

Conserve las correcciones manuales como parte del proceso de etiquetado (anotación y estado de revisión), no como una sobrescritura automática de los resultados de un proveedor.

## Estado pendiente

La infraestructura está preparada, pero el roadmap sigue pendiente: falta poblar una colección real, privada o correctamente licenciada, verificar sus huellas, revisar manualmente sus etiquetas y ejecutar proveedores adaptados al contrato antes de declarar resultados comparables.
