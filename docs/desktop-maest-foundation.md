# Base del analizador MAEST de escritorio

## Estado de esta rama

**No implementado.** La metadata oficial ya está identificada y su catálogo de 519 clases está disponible, pero el entorno local devuelve `403 Forbidden` al origen de Essentia. DJOrganizer no descarga ni acepta pesos MAEST hasta reproducir el SHA-256 del ONNX. Todavía no hay descarga de producto, inferencia real, persistencia ni integración con Importar.

La base incorporada se limita al contrato neutral, parser estricto, validación de salida y exclusión mutua que usarán los comandos Tauri después de cerrar la integridad y el preprocesamiento.

## Confirmado con la metadata oficial

- Artefacto: `discogs-maest-30s-pw-519l`, versión 2, publicado el 22 de enero de 2025.
- Metadata: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json`.
- ONNX: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.onnx`, con tamaño publicado de `348052337` bytes.
- Entrada `melspectrogram`, `float32`, `[1, 1876, 96]`, a 16 kHz.
- Salida sigmoid `PartitionedCall/Identity_13`, `[1, 519]`. La salida directa hace redundante cargar `genre_discogs519` para este artefacto.
- La metadata contiene 519 clases. Cada clase se interpreta únicamente si contiene exactamente un separador `---`; no se traduce, fusiona ni reinterpreta.
- Los scores sigmoid se conservan como scores internos de ordenación, no como probabilidades calibradas ni como `confidence` visible.
- La licencia publicada por MTG para estos modelos es CC BY-NC-SA 4.0: atribución, uso no comercial y ShareAlike para derivados. Una distribución comercial requiere revisar y obtener la licencia propietaria ofrecida por MTG.

## Runtime evaluado

`ort 2.0.0-rc.9` declara MSRV 1.70 y ONNX Runtime 1.20, por lo que es compatible en principio con el `rust-version = 1.77.2` actual y dispone de CPU para Windows x86_64 sin Python ni CUDA. No se añadió todavía: primero se debe fijar el digest y ejecutar el runtime contra el ONNX concreto. La versión `rc.12` exige Rust 1.88; no se justificó subir el toolchain.

## Preprocesamiento pendiente de equivalencia

Las fuentes oficiales relacionan `TensorflowPredictMAEST` con `TensorflowInputMusiCNN`: 16 kHz, 96 bandas Mel, FFT 512, hop 256, `max_length` 1876, compresión `logC` y normalización con media `2.06755686098554` y desviación `1.268292820667291`; el patch hop predeterminado es 1875. Estos datos todavía no constituyen una implementación Rust: antes hay que inspeccionar el código oficial completo y demostrar equivalencia numérica con Essentia. No se reutilizará el Mel de Discogs-EffNet por aproximación.

## Pendiente

- Reproducir el SHA-256 del ONNX. El workflow de escritorio contiene temporalmente un diagnóstico acotado que valida HTTP, timeout y exactamente `348052337` bytes, imprime nombre fijo/tamaño/digest y elimina el archivo sin publicarlo como artifact.
- Incorporar de forma reproducible el catálogo oficial completo y ejecutar su prueba Rust sobre las 519 etiquetas.
- Ejecutar `ort` contra este ONNX y confirmar nombres, tipos y shapes en runtime.
- Implementar y validar el preprocesamiento equivalente.
- Ejecutar una inferencia real autorizada y registrar métricas técnicas saneadas.

Hasta cerrar estos puntos el roadmap no debe indicar «Preparado» ni «Implementado».
