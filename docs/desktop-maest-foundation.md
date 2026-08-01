# Base del analizador MAEST de escritorio

## Estado de esta rama

**Pipeline, inferencia multi-ventana, análisis seguro por pista, previsualización efímera, aplicación explícita al formulario y persistencia validada de evidencia/procedencia MAEST implementados.** La capa interna de escritorio conecta una fuente multimedia confiable con decodificación por contenido, remuestreo exacto a 480 000 muestras a 16 kHz, preprocesamiento MAEST hasta tensores planos `1876 × 96`, inferencia ONNX de 519 scores y una propuesta Discogs de género/subgénero. Para pistas largas selecciona de forma determinista hasta tres ventanas de 30 segundos —inicio, centro y final—, deduplicadas después de convertirlas al tiempo real del medio, y agrega por clase mediante media aritmética. El comando Tauri `analyze_scanned_track` acepta exclusivamente `sessionId` y `scanId`, resuelve el archivo dentro de la sesión nativa activa y devuelve una propuesta revisable sin persistirla ni aplicarla automáticamente.

La edición real de una pista de Biblioteca ofrece la acción solo dentro de Tauri y cuando esa pista está vinculada a la sesión de escaneo activa. Una acción explícita prepara el modelo mediante `prepare_maest_model` y después analiza mediante `analyze_scanned_track`; nunca se prepara al cargar, seleccionar o escanear. La UI mantiene la propuesta visible de género/subgénero en memoria; el score bruto permanece como dato técnico interno. El usuario puede descartar, volver a analizar o pulsar `Aplicar al formulario`, que copia únicamente valores no vacíos a los campos editables sin guardar ni escribir el archivo. Los valores solo se persisten si después se usa el flujo normal `Guardar cambios`: si el valor aplicado sigue intacto, se guarda por campo como `automatic` junto con identidad y versión del analizador, compatibility key, fecha y score bruto; si el usuario edita ese campo, la evidencia efímera se invalida y el guardado degrada a `manual`. Evidencia inválida o incoherente nunca convierte un valor en automático. Los resultados multi-ventana nuevos usan `maest-519l|mel-16000-1876x96-f32|windows-start-center-end-mean|v3`; la evidencia legacy de una sola ventana con `maest-519l|mel-16000-1876x96-f32|v2` sigue aceptada sin migración y continúa habilitando la escritura segura de `Genre`. Offline reutiliza el mismo payload compacto y las mismas validaciones; edición masiva manual limpia la evidencia del campo afectado y backup/restore conserva o anula explícitamente las diez columnas técnicas para evitar procedencia obsoleta. Ninguna de estas rutas persiste rutas locales, `sessionId`, `scanId`, audio, PCM, tensor ni los 519 scores.

Antes de abrir el archivo, el comando verifica raíz confirmada y canónica, ruta relativa, ausencia de enlaces simbólicos, tipo regular, tamaño y versión (incluida la fecha de modificación). Vincula la ruta validada con el descriptor abierto mediante identidad de dispositivo/inode en Unix o volumen/índice de archivo obtenido desde el descriptor con la API estable del sistema en Windows; `file_versions` conserva la ruta relativa como clave para ser compatible con el escaneo incremental. Mantiene el descriptor durante el análisis y repite las comprobaciones para descartar cualquier resultado si el archivo fue sustituido o cambió. Abre cada fuente desde Rust, libera previamente el mutex del escaneo y clona un descriptor confirmado por ventana antes de ejecutar decodificación e inferencia mediante `spawn_blocking`; así `InferenceGate` sigue siendo la única autoridad de concurrencia y puede devolver `analyzer_busy`. Todas las ventanas preparadas de una pista se infieren bajo un único permiso del gate, por lo que no se intercalan con otro análisis MAEST. Requiere una sesión ONNX ya preparada y nunca inicia una descarga del modelo.

## Confirmado con la metadata oficial

- Artefacto: `discogs-maest-30s-pw-519l`, versión 2, publicado el 22 de enero de 2025.
- Metadata: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json`.
- ONNX: `https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.onnx`, `348052337` bytes.
- SHA-256 reproducido mediante GitHub Actions: `c90a51a752cdd94f37de886787d5e3a5b2071c6d0ef49ea788058f65f11883b1`.
- Entrada `melspectrogram`, `float32`, `[1, 1876, 96]`, a 16 kHz.
- La metadata TensorFlow identifica la salida sigmoid como `PartitionedCall/Identity_13`; ONNX Runtime la expone como `activations`, `float32`, `[1, 519]`. La salida directa hace redundante cargar `genre_discogs519` para este artefacto.
- La metadata contiene 519 clases. Cada clase se interpreta únicamente si contiene exactamente un separador `---`; no se traduce, fusiona ni reinterpreta.
- El recurso `src-tauri/resources/maest-discogs519-v2.json` conserva las 519 clases oficiales en orden y se valida mediante pruebas Rust.
- Los scores sigmoid se conservan como scores internos de ordenación, no como probabilidades calibradas ni como `confidence` visible. En el modo multi-ventana, el score persistido es la media aritmética de la clase ganadora entre las ventanas válidas seleccionadas.
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

Cada frame se convierte a `f32`, se valida como finito y se mezcla a mono mediante la media de sus canales en precisión `f64`. La salida conserva la frecuencia original, se detiene exactamente al alcanzar el límite explícito de muestras y comunica si se alcanzó ese límite. Para ventanas posteriores al inicio usa `SeekMode::Accurate`; el preroll entre `actual_ts` y `required_ts` se convierte con aritmética entera usando el sample rate real del buffer decodificado y redondeo hacia arriba para no comenzar antes del offset solicitado. Solo `SeekError` y `Unsupported` se clasifican como `seek_unsupported`; errores de I/O, corrupción, límites o reset se propagan como fallo de decodificación y nunca activan el fallback silencioso. Las pruebas cubren PCM entero mono, PCM flotante estéreo, límite exacto, seek fraccionario y un fixture FLAC sintético detectado sin extensión.

## Remuestreo validado

La capa Rust interna remuestrea clips completos de PCM mono `f32` finito desde una frecuencia positiva a 16 kHz con el remuestreador síncrono FFT de Rubato `4.0.0`. La dependencia deshabilita sus features por defecto y habilita únicamente `fft_resampler`, sin `log`. `process_all_into_buffer` dimensiona y procesa el clip, elimina el retardo inicial y conserva la cola; la ruta 16 kHz → 16 kHz es una identidad exacta.

La salida respeta un límite explícito y solo marca truncamiento cuando el clip produciría muestras adicionales. Los cálculos de tamaño son comprobados y los errores usan códigos estables para entrada vacía, frecuencia o límite cero, muestras no finitas, desbordamiento y fallo del remuestreador. No se normaliza ni modifica la amplitud. Las pruebas cubren 8, 16, 44,1 y 48 kHz, conservación de un tono, señal corta, determinismo y los límites exacto y excedido.

## Pipeline interno validado

El orquestador reutiliza sin duplicarlos `audio_decoder`, `audio_resampler` y `maest_preprocessing`. Tras sondear y validar la frecuencia real, calcula por ventana el límite como `frecuencia × 30 + 1` mediante operaciones comprobadas. Admite hasta 192 kHz (5 760 001 muestras decodificadas como máximo por ventana) y rechaza frecuencias superiores con un error estable. Así no trunca prematuramente 88,2, 96 o 192 kHz ni decodifica la canción completa. El remuestreador retiene exactamente 480 000 muestras por ventana; una entrada corta se rechaza sin completar con silencio y un límite configurado insuficiente se distingue de ese caso.

La duración nativa fiable selecciona como máximo tres offsets deterministas: inicio, centro y final (`duration - 30 s`). Los offsets se convierten a `Time` antes de deduplicarse. Si la duración no es fiable se conserva el comportamiento histórico de la primera ventana; si una ventana posterior no puede posicionarse porque el formato no soporta un seek seguro, todo el análisis degrada a la primera ventana. Cualquier otro error de decode, resample o preprocess en una ventana seleccionada se propaga y no se oculta como fallback.

El error unificado conserva la etapa estable (`decode`, `resample` o `preprocess`) y el código de causa. Los fixtures Base64 son tonos sintéticos deterministas WAV/PCM a 16 kHz y FLAC a 44,1 kHz, ambos de treinta segundos y detectados por contenido. Las pruebas comprueban las 180 096 salidas finitas, determinismo, entrada corta, fuente inválida, límite insuficiente, selección/deduplicación de ventanas y fallback limitado exclusivamente a `seek_unsupported`.

Los vectores PCM de decodificación y remuestreo pueden coexistir únicamente durante el remuestreo de una ventana. En el máximo admitido de 192 kHz, sus payloads `f32` quedan acotados a 24 960 004 bytes, aproximadamente 23,80 MiB (5 760 001 + 480 000 muestras). Después se libera el PCM original antes de reservar cada tensor de 720 384 bytes. Entre ventanas no se conserva PCM; antes de inferencia sobreviven como máximo tres tensores, 2 161 152 bytes de payload `f32` en total, además del overhead acotado de sus vectores. El límite excluye expresamente overhead del asignador, fuente comprimida y buffers internos acotados de Symphonia, Rubato y FFT.

## Inferencia interna desde audio

El orquestador interno encadena las fuentes multimedia seleccionadas, sus tensores validados, `run_preprocessed`, la validación de los 519 scores y el catálogo Discogs sin duplicar esos algoritmos. Toda la preparación acotada ocurre antes de adquirir `InferenceGate`; después se obtiene un único permiso que cubre todas las inferencias de la pista para impedir intercalado con otro análisis MAEST y se libera por RAII tras éxito o error.

Cada salida de 519 scores se valida de forma independiente. Para dos o tres ventanas se calcula la media aritmética por clase y después se valida el vector agregado y se exige un máximo único; un empate exacto sigue produciendo `ambiguous_output`. La clase ganadora produce campos internos `genre` y `subgenre`, ambos `completed`, de fuente `automatic`, con el mismo score bruto agregado finito. No se interpreta como probabilidad, no se normaliza y no se aplican top-k, umbrales ni calibración. El resultado conserva identidad y versión del modelo, fecha aportada por el llamador y la compatibility key multi-ventana `maest-519l|mel-16000-1876x96-f32|windows-start-center-end-mean|v3`; la key legacy `maest-519l|mel-16000-1876x96-f32|v2` se acepta únicamente para evidencia persistida anterior y no se emite en análisis nuevos. Los fallos mantienen las etapas `decode`, `resample`, `preprocess`, `inference` y `taxonomy`.

Las pruebas normales inyectan funciones deterministas y comprueban agregación de dos/tres vectores, ganador agregado, empate, validación de scores, liberación del gate y compatibilidad legacy. Una prueba ignorada recorre audio → tensor → ONNX → clase válida cuando `DJORGANIZER_MAEST_MODEL` apunta al artefacto oficial ya verificado; la suite normal no descarga pesos.

## Pendiente

- Extender la escritura de etiquetas MAEST más allá de la etiqueta estándar `Genre`; el subgénero y cualquier otra etiqueta portable siguen pendientes.
- Añadir cancelación, progreso y procesamiento por lotes en sus fases aprobadas.
- Ejecutar smoke tests de empaquetado por plataforma antes de publicar instaladores macOS o Linux.

El runtime aislado, su empaquetado Windows, el pipeline interno multi-ventana, el análisis seguro de una pista confirmada, la previsualización en Biblioteca, la aplicación explícita al formulario y la persistencia validada por campo de evidencia/procedencia MAEST están implementados. La salida del análisis y `Aplicar al formulario` nunca modifican el archivo por sí solas; guardar sigue requiriendo la acción normal del usuario. Cuando el género MAEST ya está persistido y su evidencia sigue siendo válida, Tauri permite previsualizar y confirmar explícitamente la escritura exclusiva de la etiqueta estándar `Genre` en el archivo local, con backup, relectura/verificación, historial y deshacer, además de aliases locales acotados para conservar el vínculo tras cambios de huella. El análisis de pistas largas ya usa hasta tres ventanas deterministas de 30 s con agregación media y fallback seguro a la primera solo cuando el seek adicional no es soportado. La escritura de subgénero u otras etiquetas, los lotes, el progreso y la cancelación permanecen pendientes; por tanto, el flujo completo de clasificación de Biblioteca no está terminado.