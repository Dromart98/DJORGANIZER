# Base del analizador MAEST de escritorio

## Estado de esta rama

**Runtime MAEST implementado y validado con el ONNX oficial, incluido el instalador Windows x64; análisis de audio pendiente.** La rama descarga y verifica el artefacto fijado, carga una sesión reutilizable de ONNX Runtime, acepta el tensor preprocesado oficial y obtiene una salida finita de 519 clases. Windows enlaza ONNX Runtime estáticamente y el instalador NSIS se ha construido, instalado e inspeccionado. La decodificación, el preprocesamiento equivalente y la integración por pista siguen fuera de alcance.

## Confirmado con la metadata oficial

- Artefacto: `discogs-maest-30s-pw-519l`, versión 2, publicado el 22 de enero de 2025.
- Metadata: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json`.
- ONNX: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.onnx`, `348052337` bytes.
- SHA-256 reproducido mediante GitHub Actions: `c90a51a752cdd94f37de886787d5e3a5b2071c6d0ef49ea788058f65f11883b1`.
- Entrada `melspectrogram`, `float32`, `[1, 1876, 96]`, a 16 kHz.
- La metadata TensorFlow identifica la salida sigmoid como `PartitionedCall/Identity_13`; ONNX Runtime la expone como `activations`, `float32`, `[1, 519]`. La salida directa hace redundante cargar `genre_discogs519` para este artefacto.
- La metadata contiene 519 clases. Cada clase se interpreta únicamente si contiene exactamente un separador `---`; no se traduce, fusiona ni reinterpreta.
- El recurso `src-tauri/resources/maest-discogs519-v2.json` conserva las 519 clases oficiales en orden y se valida mediante pruebas Rust.
- Los scores sigmoid se conservan como scores internos de ordenación, no como probabilidades calibradas ni como `confidence` visible.
- La licencia publicada por MTG para estos modelos es CC BY-NC-SA 4.0: atribución, uso no comercial y ShareAlike para derivados. Una distribución comercial requiere revisar y obtener la licencia propietaria ofrecida por MTG.

## Runtime validado

`ort 2.0.0-rc.9` declara MSRV 1.70 y ONNX Runtime 1.20, por lo que es compatible con el `rust-version = 1.77.2` actual y dispone de CPU para Windows x86_64 sin Python ni CUDA. La compilación Windows verificada enlaza ONNX Runtime estáticamente: el ejecutable instalado no importa ni necesita `onnxruntime.dll`.

GitHub Actions cargó el ONNX oficial verificado y ejecutó una inferencia determinista completa en Linux y Windows:

- integridad, sesión y contrato: PASS;
- entrada: `float32 [1, 1876, 96]`;
- salida seleccionada: `activations`, `float32 [1, 519]`;
- valores finitos: PASS;
- prueba real Windows: PASS.

## Empaquetado Windows validado

Se construyó un instalador NSIS x64 sin publicarlo, se instaló de forma silenciosa en un directorio temporal y se inspeccionó el ejecutable instalado:

- instalador: `DJOrganizer_0.1.0_x64-setup.exe`;
- ejecutable: `djorganizer-desktop.exe`;
- instalación: PASS;
- enlace de ONNX Runtime: estático;
- inferencia real en Windows antes del empaquetado: PASS.

Las comprobaciones específicas de los instaladores macOS y Linux no forman parte de esta base orientada al entorno Windows principal y deberán ejecutarse antes de una distribución oficial para esas plataformas.

## Preprocesamiento pendiente de equivalencia

Las fuentes oficiales relacionan `TensorflowPredictMAEST` con `TensorflowInputMusiCNN`: 16 kHz, 96 bandas Mel, FFT 512, hop 256, `max_length` 1876, compresión `logC` y normalización con media `2.06755686098554` y desviación `1.268292820667291`; el patch hop predeterminado es 1875. Estos datos todavía no constituyen una implementación Rust: antes hay que inspeccionar el código oficial completo y demostrar equivalencia numérica con Essentia. No se reutilizará el Mel de Discogs-EffNet por aproximación.

## Pendiente

- Implementar y validar decodificación, remuestreo y preprocesamiento equivalente.
- Integrar análisis por pista, propuestas de género/subgénero y persistencia segura.
- Ejecutar smoke tests de empaquetado por plataforma antes de publicar instaladores macOS o Linux.

El runtime aislado y su empaquetado Windows están implementados y validados. El analizador de canciones completo permanece pendiente hasta cerrar preprocesamiento e integración.
