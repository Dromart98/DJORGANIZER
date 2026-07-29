# Base del analizador MAEST de escritorio

## Estado de esta rama

**Runtime, decodificación acotada y preprocesamiento MAEST implementados y validados; análisis de archivos pendiente.** La capa interna de escritorio está configurada para decodificar por contenido MP3, FLAC, WAV/PCM, AAC en M4A/MP4 y OGG/Vorbis a PCM mono `f32` finito, conservando la frecuencia original. Las pruebas de decodificación ejercitan WAV/PCM y FLAC; el remuestreo, la conexión entre decodificación y preprocesamiento, la integración por pista, los lotes y la persistencia siguen fuera de alcance.

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

`ort 2.0.0-rc.9` declara MSRV 1.70 y ONNX Runtime 1.20, por lo que es compatible con el MSRV del proyecto, `rust-version = "1.89"` y dispone de CPU para Windows x86_64 sin Python ni CUDA. La compilación Windows verificada enlaza ONNX Runtime estáticamente: el ejecutable instalado no importa ni necesita `onnxruntime.dll`.

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

## Preprocesamiento validado

La implementación Rust reproduce el contrato de `TensorflowPredictMAEST` y `TensorflowInputMusiCNN` de Essentia fijado en `b9fa6cb674ca43dfb94d28d293aeda441c6745db`: `FrameCutter` centrado (`startFromZero=false`) con ceros en los bordes, Hann simétrica no normalizada con fase cero, espectro de magnitud de 512 puntos, 96 filtros Slaney Mel de 0 a 8 kHz aplicados sobre potencia y normalizados por el área triangular teórica, `log10(1 + 10000·x)` y normalización posterior. Se conserva el orden tiempo × banda consumido por `run_preprocessed`.

La referencia binaria se generó con los bindings oficiales de Essentia tras verificar que los algoritmos usados coinciden con ese commit y la señal pseudoaleatoria determinista descrita en `src-tauri/tests/fixtures/generate-maest-reference.py`. La prueba compara los 180 096 valores con tolerancias fijadas antes del resultado: diferencia máxima `≤ 2e-5` y media `≤ 1e-6`. Essentia se usa únicamente para generar el fixture de prueba y no se distribuye ni se incorpora como dependencia.

La función rechaza entrada vacía, muestras no finitas y señales con menos de 480 000 muestras mediante códigos estables. Procesa un frame cada vez y solo materializa el tensor de salida, el búfer FFT y el banco de filtros. El caso de silencio usa el resultado matemático exacto del extractor (Mel cero antes de la normalización) y permanece determinista; no replica la inyección aleatoria de ruido para silencios del `FrameCutter` *streaming*, que no forma parte de `TensorflowInputMusiCNN` y es irrelevante para el tensor matemático fijado.

## Decodificación validada

La capa Rust interna recibe una fuente multimedia confiable, sondea únicamente su contenido y elige de forma determinista la primera pista de audio decodificable por identificador. Symphonia `0.6.0` se compila sin features por defecto y solo con `mp3`, `flac`, `wav`, `pcm`, `aac`, `isomp4`, `ogg` y `vorbis`; Lofty conserva en exclusiva la lectura y escritura de etiquetas.

Cada frame se convierte a `f32`, se valida como finito y se mezcla a mono mediante la media de sus canales en precisión `f64`. La salida conserva la frecuencia original, se detiene exactamente al alcanzar el límite explícito de muestras y comunica si se alcanzó ese límite. Los errores internos usan códigos estables para fuente inválida, formato no reconocido, pista ausente, frecuencia o canales inválidos, fallo de decodificación y valores no finitos. Las pruebas cubren PCM entero mono, PCM flotante estéreo, límite exacto y un fixture FLAC sintético detectado sin extensión.

## Pendiente

- Implementar y validar el remuestreo; conectar la decodificación y el preprocesamiento validados al futuro flujo de archivos.
- Integrar análisis por pista, propuestas de género/subgénero y persistencia segura.
- Ejecutar smoke tests de empaquetado por plataforma antes de publicar instaladores macOS o Linux.

El runtime aislado, su empaquetado Windows, la decodificación acotada a PCM mono en la frecuencia original y el preprocesamiento desde PCM mono a 16 kHz están implementados y validados. El analizador de canciones completo permanece pendiente de remuestreo e integración.
