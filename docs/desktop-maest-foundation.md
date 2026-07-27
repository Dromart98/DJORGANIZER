# Base del analizador MAEST de escritorio

## Estado de esta rama

**Bloqueado, no implementado.** El entorno de desarrollo devolvió `403 Forbidden` al acceder al registro oficial `essentia.upf.edu`. Por ello no fue posible descargar ni calcular de forma independiente los SHA-256 del ONNX y del catálogo oficial. DJOrganizer no descarga ni acepta pesos MAEST sin un digest oficial reproducido. No hay descarga al arranque, inferencia real, persistencia ni integración con Importar en esta rama.

La base incorporada se limita al contrato neutral, parser estricto, validación de salida y exclusión mutua que podrá usar el comando Tauri después de cerrar la integridad del paquete.

## Hechos verificados

- La metadata oficial vigente describe `discogs-maest-30s-pw-519l`, 16 kHz, entrada `float32` `[1, 1876, 96]` y salida sigmoid de 519 valores. Esa salida hace redundante `genre_discogs519` para el artefacto 519l; no se deben cargar dos modelos sin nueva evidencia.
- Los scores sigmoid se conservan como scores internos de ordenación, no como probabilidades calibradas ni como `confidence` visible.
- La taxonomía se interpreta únicamente cuando contiene exactamente un separador `---`, sin traducción ni normalización destructiva.
- La licencia publicada por MTG para estos modelos es CC BY-NC-SA 4.0: atribución, uso no comercial y ShareAlike para derivados. Una distribución comercial requiere revisar y obtener la licencia propietaria ofrecida por MTG.

## Runtime evaluado

`ort 2.0.0-rc.9` declara MSRV 1.70 y ONNX Runtime 1.20, por lo que es compatible en principio con el `rust-version = 1.77.2` actual y dispone de CPU para Windows x86_64 sin Python ni CUDA. No se añadió todavía: integrar un runtime antes de disponer del modelo verificado no produciría un analizador ejecutable y aumentaría innecesariamente el binario. La versión actual `rc.12` exige Rust 1.88; no se justificó subir el toolchain.

## Diseño de la siguiente implementación

1. Manifiesto compilado con URL oficial fija, versión, tamaño exacto, límite superior y SHA-256 reproducido; React no proporcionará URL ni ruta.
2. Descarga explícita con `reqwest`/Rustls por streaming a un temporal en el directorio de datos de la aplicación, timeout, token de cancelación, límite de bytes, hash incremental, sincronización y rename atómico. Un error elimina el temporal.
3. Resolución exclusiva de `session_id + scan_id` bajo el `ScanSession` activo. Antes y después de leer se comparan tamaño y fecha del `FileVersion`; ningún DTO o log incluye la ruta.
4. Decodificación mantenida y acotada, mezcla mono, resampleo determinista a 16 kHz y preprocesamiento reproducido desde los parámetros oficiales. No se asumirá el Mel de Discogs-EffNet.
5. Sesión ONNX perezosa única y reutilizable tras un semáforo de una inferencia. El trabajo se ejecutará fuera del hilo principal de Tauri y será cancelable entre etapas.
6. Validación exacta `[519]`, finitud y catálogo oficial completo antes de producir propuestas `automatic`; nunca se escribe audio, tags ni Supabase.

## Criterio de desbloqueo

Obtener los artefactos desde el origen oficial, guardar URL/tamaño/SHA-256 reales y las 519 etiquetas, validar cada etiqueta, ejecutar al menos una inferencia con audio de prueba autorizado y registrar métricas saneadas. Hasta entonces el roadmap no debe indicar «Preparado» ni «Implementado».
