---
name: djorganizer-audio-analysis
description: "Implementa, revisa y documenta análisis de audio de DJOrganizer. Usar cuando una tarea afecte BPM, tonalidad o key, energía, género, subgénero, duración, modelos de audio, embeddings, inferencia, clasificación automática, caché de resultados, licencias de modelos o diferencias entre análisis web y escritorio."
---

# Análisis de audio de DJOrganizer

## Procedimiento

1. Inspeccionar antes los contratos y flujos afectados en `src/lib/audio/`, `src/lib/import/`, `src/lib/music/`, la UI de importación y las migraciones/tipos pertinentes. Consultar `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `docs/roadmap.md` y la documentación del proveedor o modelo cuando corresponda. Distinguir siempre entre capacidad actual y objetivo aprobado pendiente de implementación.
2. Clasificar cada salida. Tratar como **deterministas** los metadatos leídos, duración derivada del archivo, huellas y transformaciones o normalizaciones reproducibles. Tratar como **predicciones** BPM detectado, tonalidad detectada, energía calculada, géneros, subgéneros, embeddings e inferencias. Mantener internamente los datos técnicos necesarios para validación, caché y diagnóstico, sin convertir confianza, modelo o procedencia en contenido visible de la interfaz ordinaria.
3. Para cada resultado automático persistible, definir y guardar internamente: algoritmo o versión compatible, fecha de análisis, estado (`pending`, `running`, `completed`, `failed`, `stale` o equivalente) y compatibilidad de caché. Permitir reanálisis cuando cambie el algoritmo, modelo, versión o archivo.
4. Diseñar el flujo por pista y por lote. Al seleccionar o importar archivos, iniciar automáticamente los análisis aprobados sin exigir botones como «Sugerir género» o «Sugerir género localmente». Procesar cada pista de forma independiente, mostrar progreso y cancelación, registrar el error en esa pista, permitir reintento y continuar con el resto de la tanda.
5. Reutilizar un resultado en caché si la huella o entrada, la versión del analizador y la configuración relevante son compatibles. Invalidar solamente resultados incompatibles, corruptos, obsoletos o asociados a un archivo cambiado. No reanalizar una pista sin necesidad.
6. Mantener el audio, las rutas y los secretos privados. Separar técnicamente los contratos de web/PWA, servicios y Tauri, pero no exponer en la interfaz términos como `local`, `web`, `nube`, `modelo`, `proveedor` o `inferencia`. Cualquier procesamiento externo debe respetar la configuración y autorización general aprobada para la función, sin introducir un botón manual por pista como requisito del flujo automático.

## Automatización y corrección manual

- Calcular automáticamente BPM, tonalidad, energía, género y subgénero cuando el analizador correspondiente esté disponible y el flujo aprobado incluya ese campo.
- Aplicar automáticamente los resultados válidos a pistas sin una corrección manual protegida. La persona puede corregir después BPM, tonalidad, Camelot, energía, género y subgénero.
- No sobrescribir silenciosamente valores editados manualmente. Marcar internamente esa prioridad y exigir una acción explícita para reemplazarlos o reanalizarlos.
- No bloquear la importación completa cuando falle género, subgénero u otro análisis. Guardar los demás datos correctos y dejar el campo fallido pendiente de reintento.
- No presentar una predicción como certeza absoluta, pero tampoco obligar a aceptar cada resultado individualmente. La seguridad se consigue con corrección manual, protección de ediciones y reanálisis controlado.

## Reglas de presentación

- Mostrar resultados y estados con lenguaje cotidiano orientado a DJs. No mostrar porcentajes, barras o etiquetas de confianza, procedencia técnica, nombres de modelos ni explicaciones extensas generadas.
- Mantener tablas, campos y tarjetas densos y estables: truncar textos auxiliares, reservar espacio para estados y no cambiar tamaños de título, artista, álbum u otros campos por resultados del análisis.
- Usar una escala de energía **0–10** en contratos visibles, formularios, filtros, tablas y documentación de producto. Si un algoritmo devuelve otra escala, convertirla de forma determinista y probar los límites antes de persistir.
- Mantener BPM, tonalidad, Camelot, energía, género y subgénero editables. Conservar teclado, foco, mensajes de estado, accesibilidad y diseño responsive.

## Modelos, licencias y plataformas

- Antes de incorporar pesos, etiquetas, embeddings, conversores o dependencias de un modelo, comprobar licencia, atribución, redistribución, derivados y restricciones de cada artefacto. No asumir uso comercial. Documentar las restricciones en documentación técnica o legal, no como ruido permanente en la interfaz de análisis.
- Versionar y verificar artefactos de modelo y caché mediante manifiestos e integridad cuando proceda. No almacenar audio, rutas, nombres ni metadatos personales dentro de artefactos o cachés del modelo.
- Comparar capacidades de web y escritorio de forma explícita en la implementación y las pruebas: decodificación, cómputo, almacenamiento, permisos, conectividad, resultados numéricos y fallbacks. No prometer equivalencia sin una prueba reproducible; preservar el mismo contrato de resultado visible o documentar internamente sus diferencias.

## Validación mínima

- Añadir o actualizar pruebas deterministas para normalización, escala de energía 0–10, compatibilidad de caché, transiciones de estado, análisis automático tras importar, errores por pista, reintentos, prioridad de correcciones manuales y reanálisis por versión.
- Para predicciones, probar contratos, límites, automatización, estabilidad y tolerancias justificadas. Las métricas internas de calidad pueden emplearse para pruebas o decisiones técnicas, pero no deben aparecer como confianza visible.
- Ejecutar typecheck, lint, pruebas pertinentes y build. Validar web y escritorio cuando el cambio afecta ambos; registrar limitaciones de entorno sin ocultarlas.
