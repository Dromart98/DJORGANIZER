# Clasificación local de género en la web

## Estado

La prueba de concepto está integrada en Importar y ha superado conversión, comparación numérica, typecheck, lint, pruebas unitarias, build e inferencia real en Chrome y Edge de escritorio. Firefox, Safari, móvil y la clasificación masiva siguen fuera de su alcance.

El audio se procesa en el dispositivo. La función no envía audio, metadatos ni rutas a DJOrganizer, Supabase, OpenAI u otros servicios. OpenAI sigue siendo una opción secundaria separada con consentimiento por pista.

## Modelo y licencia

- Modelo: `discogs-effnet-bs64-1`, versión 1 (`EffnetDiscogs`), de Music Technology Group, Universitat Pompeu Fabra.
- Autor: Pablo Alonso.
- Publicación: Pablo Alonso-Jiménez, Xavier Serra y Dmitry Bogdanov, “Music Representation Learning Based on Editorial Metadata from Discogs”, ISMIR 2022.
- Objetivo: 400 estilos de Discogs-4M; salida sigmoid multietiqueta.
- Licencia de pesos y derivados: CC BY-NC-SA 4.0.
- Uso previsto en DJOrganizer: personal y no comercial.

Licencia, atribución, metadata mínima e integridad viven en `public/models/discogs-effnet/tfjs-v1/`, separados de la licencia del código. Los `.pb` y JSON fuente no forman parte del repositorio.

## Fuente inspeccionada

Inspección: `2026-07-22T21:02:59.2714198Z`.

| Archivo fuente local | Bytes | SHA-256 |
| --- | ---: | --- |
| `discogs-effnet-bs64-1.pb` | 18.366.619 | `3ed9af50d5367c0b9c795b294b00e7599e4943244f4cbd376869f3bfc87721b1` |
| `discogs-effnet-bs64-1.json` | 14.983 | `a35003202384735c33154e20264267f9941705218a7b93202b655a1d408d4ff6` |

El Frozen Graph contiene 171 nodos y cinco funciones.

| Propósito | Tensor original | Tipo | Forma |
| --- | --- | --- | --- |
| Entrada | `serving_default_melspectrogram:0` | `float32` | `[64,128,96]` |
| Predicciones | `PartitionedCall:0` | `float32` | `[64,400]` |
| Embeddings | `PartitionedCall:1` | `float32` | `[64,1280]` |

Produce directamente las 400 puntuaciones: no necesita un segundo clasificador.

## Entorno y conversión

La conversión se realizó en un entorno temporal externo al repositorio. Su ruta absoluta no se publica.

- Python 3.11.11
- TensorFlow 2.15.0
- tensorflowjs 4.22.0
- TensorFlow Decision Forests 1.8.1
- tf-keras 2.15.0
- setuptools 69.5.1

En Windows, `tensorflowjs` importa TensorFlow Decision Forests aunque el Frozen Graph no lo use, pero esa distribución no contiene `inference.so`. En el entorno temporal se hizo opcional esa única importación. No se modificó el modelo. Después se materializaron las funciones y se añadieron identidades con nombres distintos a sus dos puertos. El intermedio fue bit a bit idéntico al original.

Comando final, sin cuantización ni poda:

```powershell
python -m tensorflowjs.converters.converter --input_format=tf_frozen_model --output_format=tfjs_graph_model --output_node_names=discogs_predictions,discogs_embeddings <temporary-workdir>\discogs-effnet-bs64-1-inlined-dual-output.pb <temporary-workdir>\tfjs-v1-dual-output
```

Tamaños y hashes finales están en `integrity-manifest.json`. El convertidor produjo cinco shards; para una publicación fiable se reempaquetó su flujo de 17.996.596 bytes, sin cambiar ningún byte, en 69 segmentos de hasta 256 KiB. Junto a ellos se incluyen `model.json`, metadata, licencia y atribución.

## Equivalencia

El mismo tensor sintético determinista `float32 [64,128,96]` se ejecutó en TensorFlow y TensorFlow.js 4.22.0 CPU. Todos los valores fueron finitos.

| Salida | Valores | Error máximo | Error medio | Correlación |
| --- | ---: | ---: | ---: | ---: |
| Predicciones | 25.600 | 0,00228532 | 0,0000001055 | 0,9999997580 |
| Embeddings | 81.920 | 0,19215775 | 0,00117792 | 0,9999998215 |

El 99,988 % de predicciones difirió como máximo `1e-5`. El p99 del error de embeddings fue `0,01729`, frente a una magnitud absoluta p99 de `43,033`. El top 5 agregado mantuvo clases y orden:

1. `Rock---Black Metal`
2. `Latin---Son Montuno`
3. `Hip Hop---DJ Battle Tool`
4. `Folk, World, & Country---Folk`
5. `Rock---Noise`

Tolerancia justificada entre kernels float32:

- predicciones: máximo `<= 0,005`, media `<= 1e-6`, correlación `>= 0,99999`;
- embeddings: máximo `<= 0,25`, media `<= 0,002`, correlación `>= 0,99999`;
- mismo top 5 agregado.

La web consume predicciones. Los embeddings se conservan y comparan, pero no se usan en esta prueba.

## Preprocesamiento oficial confirmado

1. Mono a 16.000 Hz.
2. Frames 512, hop 256, centrados con ceros en bordes.
3. Hann simétrica sin normalizar.
4. FFT 512 y magnitud, 257 bins.
5. 96 bandas Mel Slaney, 0–8.000 Hz.
6. Ponderación lineal, `unit_tri`, energía de potencia.
7. `log10(1 + 10000 × banda)`.
8. Parches 128, hop 62, último incompleto descartado.
9. Batch fijo 64; el último se rellena con ceros y se ignoran sus predicciones de relleno.

El navegador decodifica/remuestrea con `AudioContext({ sampleRate: 16000 })`. Mel, parches, inferencia y agregación se ejecutan en el Worker.

## Arquitectura y revisión

- Importar prepara el modelo en segundo plano, sin botón de descarga ni selector técnico.
- Cada backend requiere una inferencia real finita: WebGPU, WebGL, WASM, CPU.
- El Worker recibe PCM transferible, nunca nombre, metadata o ruta.
- Cancelar termina el Worker y su cómputo; las inferencias terminadas liberan tensores.
- Se promedian parches reales y se muestra una sugerencia y hasta cuatro alternativas. La puntuación es orientativa, no probabilidad calibrada.
- Aceptar cambia solo el formulario temporal. Guardar es una acción separada; rechazar conserva el valor previo.
- El contrato PostgreSQL actual no admite `genre_source = 'local'` y esta tarea excluye migraciones. Una sugerencia local aceptada se persiste como revisión `manual`; la UI identifica el cálculo local antes de aceptar.

## Caché, offline y privacidad

- CacheStorage guarda únicamente manifiesto, metadata, `model.json` y shards.
- La caché se versiona con modelo, versión y hash.
- Cada archivo se verifica por bytes y SHA-256 antes de usarlo.
- Un ausente falla; un corrupto se elimina y se recupera de red; un manifiesto incompatible se rechaza; versiones antiguas se eliminan tras preparar la nueva.
- Tras la primera carga correcta, la caché permite reutilización offline.
- Audio, rutas, nombres y metadata no se cachean, registran ni suben.
- Un error local no bloquea edición, guardado, importación ni OpenAI.
- No incluye lotes, MAEST, ONNX, Tauri, Supabase ni migraciones.

## Validación real en navegadores

El 22 y 23 de julio de 2026 se empaquetó sin sustituciones el Worker de producción y se ejecutó con PCM sintético de ocho segundos. La segunda preparación se ejecutó con el contexto completamente offline: solo podía completar usando el manifiesto y los 71 objetos verificados de Cache Storage.

| Navegador | Versión | Condición | Backend | Preparación inicial | Inferencia | Preparación offline |
| --- | --- | --- | --- | ---: | ---: | ---: |
| Chrome | 150.0.7871.129 | normal | WebGPU | 11,33 s | 1,55 s | 10,62 s, WebGPU |
| Edge | 150.0.4078.83 | normal | WebGPU | 8,77 s | 1,23 s | 7,26 s, WebGPU |
| Chrome | 150.0.7871.129 | GPU desactivada | WASM; CPU offline | 6,02 s | 6,41 s | 122,30 s, CPU |

Las tres ejecuciones produjeron `Electronic---Experimental` como primera clase y las mismas cuatro alternativas; WebGPU y WASM solo mostraron diferencias numéricas menores. La desconexión fue total y se aplicó después de la primera carga. Se inició además una inferencia de 30 segundos y se terminó su Worker: no entregó resultado posterior. Esto comprueba la inferencia, la integridad, la caché, el funcionamiento offline, la cancelación y fallbacks reales. La ruta degradada a CPU funciona offline, aunque su preparación es lenta y queda como último recurso. La verificación final no produjo errores de consola.

Los E2E automatizados cubren en español e inglés la preparación, error de backend, sugerencia, alternativas, aceptar, rechazar, cancelación, edición manual y coexistencia con OpenAI mediante un Worker determinista.

La ejecución local del E2E autenticado completo quedó bloqueada por el proyecto Supabase remoto: rechazó el dominio reservado del usuario de prueba y después devolvió límite de envío de correo. Ese flujo queda para el Supabase efímero de CI; no se debilitó la autenticación ni se añadió un bypass local.
