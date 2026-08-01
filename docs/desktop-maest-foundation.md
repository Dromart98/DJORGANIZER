# Base del analizador MAEST de escritorio

## Estado de esta rama

**Pipeline, inferencia, análisis seguro por pista, previsualización efímera y aplicación explícita al formulario de Biblioteca implementados.** La capa interna de escritorio conecta una fuente multimedia confiable con decodificación por contenido, remuestreo exacto a 480 000 muestras a 16 kHz, preprocesamiento MAEST hasta un tensor plano `1876 × 96`, inferencia ONNX de 519 scores y una propuesta Discogs de género/subgénero. El comando Tauri `analyze_scanned_track` acepta exclusivamente `sessionId` y `scanId`, resuelve el archivo dentro de la sesión nativa activa y devuelve una propuesta revisable sin persistirla ni aplicarla automáticamente.

La edición real de una pista de Biblioteca ofrece la acción solo dentro de Tauri y cuando esa pista está vinculada a la sesión de escaneo activa. Una acción explícita prepara el modelo mediante `prepare_maest_model` y después analiza mediante `analyze_scanned_track`; nunca se prepara al cargar, seleccionar o escanear. La UI mantiene la propuesta visible de género/subgénero en memoria; el score bruto permanece como dato técnico interno. El usuario puede descartar, volver a analizar o pulsar `Aplicar al formulario`, que copia únicamente valores no vacíos a los campos editables sin guardar ni escribir el archivo. Los valores solo se persisten si después se usa el flujo normal `Guardar cambios`; en esta fase siguen tratándose como una edición revisada por el usuario, sin persistencia específica de evidencia o procedencia MAEST. El estado invalida propuestas al cambiar la identidad opaca de pista, sesión o vínculo y no llama directamente a Supabase, acciones de escritura ni metadata de archivos.

Antes de abrir el archivo, el comando verifica raíz confirmada y canónica, ruta relativa, ausencia de enlaces simbólicos, tipo regular, tamaño y versión (incluida la fecha de modificación). Vincula la ruta validada con el descriptor abierto mediante identidad de dispositivo/inode en Unix o volumen/índice de archivo obtenido desde el descriptor con la API estable del sistema en Windows; `file_versions` conserva la ruta relativa como clave para ser compatible con el escaneo incremental. Mantiene el descriptor durante el análisis y repite las comprobaciones para descartar cualquier resultado si el archivo fue sustituido o cambió. Abre la fuente desde Rust, libera previamente el mutex del escaneo y clona un `Arc` de la sesión ONNX antes de ejecutar decodificación e inferencia mediante `spawn_blocking`; así `InferenceGate` sigue siendo la única autoridad de concurrencia y puede devolver `analyzer_busy`. Requiere una sesión ONNX ya preparada y nunca inicia una descarga del modelo.

## Confirmado con la metadata oficial

- Artefacto: `discogs-maest-30s-pw-519l`, versión 2, publicado el 22 de enero de 2025.
- Metadata: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json`.
- ONNX: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.onnx`, `348052337` bytes.
- SHA-256 reproducido mediante GitHub Actions: `c90a51a752cdd94f37de886787d5e3a5b2071c6d0ef49ea788058f65f11883b1`.
- Entrada `melspectrogram`, `float32`, `[1, 1876, 96]`, a 16 kHz.
- La metadata TensorFlow identifica la salida sigmoid como `PartitionedCall/Identity_13`; ONNX Runtime la expone como `activations`, `float32 [1, 519]`. La salida directa hace redundante cargar `genre_discogs519` para este artefacto.
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

## Remuestreo validado

La capa Rust interna remuestrea clips completos de PCM mono `f32` finito desde una frecuencia positiva a 16 kHz con el remuestreador síncrono FFT de Rubato `4.0.0`. La dependencia deshabilita sus features por defecto y habilita únicamente `fft_resampler`, sin `log`. `process_all_into_buffer` dimensiona y procesa el clip, elimina el retardo inicial y conserva la cola; la ruta 16 kHz → 16 kHz es una identidad exacta.

La salida respeta un límite explícito y solo marca truncamiento cuando el clip produciría muestras adicionales. Los cálculos de tamaño son comprobados y los errores usan códigos estables para entrada vacía, frecuencia o límite cero, muestras no finitas, desbordamiento y fallo del remuestreador. No se normaliza ni modifica la amplitud. Las pruebas cubren 8, 16, 44,1 y 48 kHz, conservación de un tono, señal corta, determinismo y los límites exacto y excedido.

## Pipeline interno validado

El orquestador reutiliza sin duplicarlos `audio_decoder`, `audio_resampler` y `maest_preprocessing`. Tras sondear y validar la frecuencia real, calcula el límite como `frecuencia × 30 + 1` mediante operaciones comprobadas. Admite hasta 192 kHz (5 760 001 muestras decodificadas como máximo) y rechaza frecuencias superiores con un error estable. Así no trunca prematuramente 88,2, 96 o 192 kHz ni decodifica minutos innecesarios a frecuencias bajas. El remuestreador retiene exactamente 480 000 muestras; una entrada corta se rechaza sin completar con silencio y un límite configurado insuficiente se distingue de ese caso.

El error unificado conserva la etapa estable (`decode`, `resample` o `preprocess`) y el código de causa. Los fixtures Base64 son tonos sintéticos deterministas WAV/PCM a 16 kHz y FLAC a 44,1 kHz, ambos de treinta segundos y detectados por contenido. Las pruebas comprueban las 180 096 salidas finitas, determinismo, entrada corta, fuente inválida y límite insuficiente.

Los vectores PCM de decodificación y remuestreo pueden coexistir únicamente durante el remuestreo. En el máximo admitido de 192 kHz, sus payloads `f32` quedan acotados a 24 960 004 bytes, aproximadamente 23,80 MiB (5 760 001 + 480 000 muestras). Después se libera el PCM original antes de reservar el tensor de 720 384 bytes. El límite excluye expresamente overhead del asignador, fuente comprimida y buffers internos acotados de Symphonia, Rubato y FFT; el tensor tampoco forma parte de ese pico porque se reserva después de liberar el PCM original.

## Inferencia interna desde audio

El orquestador interno encadena la fuente multimedia, el tensor validado, `run_preprocessed`, la validación de los 519 scores y el catálogo Discogs sin duplicar esos algoritmos. Adquiere `InferenceGate` justo antes de invocar ONNX y lo libera por RAII tras éxito o error. El `Vec<f32>` de 180 096 valores se mueve al runtime sin clonarlo; el resultado Rust añade solo 519 scores (2 076 bytes). ONNX Runtime puede reservar memoria interna adicional que no queda controlada por estos payloads Rust.

La clase con el score máximo produce campos internos `genre` y `subgenre`, ambos `completed`, de fuente `automatic`, con el mismo score bruto finito. No se interpreta como probabilidad, no se normaliza y no se aplican top-k, umbrales, calibración ni ventanas múltiples. El resultado conserva identidad, versión, compatibility key, fecha aportada por el llamador y una lista de errores parciales vacía. Los fallos mantienen las etapas `decode`, `resample`, `preprocess`, `inference` y `taxonomy`.

Las pruebas normales inyectan una función determinista que recibe el tensor por valor. Una prueba ignorada recorre audio → tensor → ONNX → clase válida cuando `DJORGANIZER_MAEST_MODEL` apunta al artefacto oficial ya verificado; la suite normal no descarga pesos.

## Pendiente

- Persistir de forma segura la evidencia/procedencia MAEST cuando una propuesta aplicada se guarda, sin confundirla con una edición manual posterior.
- Añadir escritura de etiquetas y soporte seguro para ventanas múltiples.
- Añadir selección de ventanas, cancelación, progreso y procesamiento por lotes en sus fases aprobadas.
- Ejecutar smoke tests de empaquetado por plataforma antes de publicar instaladores macOS o Linux.

El runtime aislado, su empaquetado Windows, el pipeline interno, el análisis seguro de una pista confirmada, la previsualización en Biblioteca y la aplicación explícita al formulario están implementados. La salida no modifica el archivo ni persiste por sí sola; guardar sigue requiriendo la acción normal del usuario. Persistencia específica de evidencia/procedencia MAEST, escritura de etiquetas, ventanas múltiples, lotes, progreso y cancelación permanecen pendientes; por tanto, el flujo completo de clasificación de Biblioteca no está terminado.
