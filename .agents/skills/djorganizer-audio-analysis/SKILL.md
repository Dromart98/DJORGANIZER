---
name: djorganizer-audio-analysis
description: "Implementa, revisa y documenta análisis de audio de DJOrganizer. Usar cuando una tarea afecte BPM, tonalidad o key, energía, género, subgénero, duración, modelos de audio, embeddings, inferencia, clasificación automática, caché de resultados, licencias de modelos o diferencias entre análisis web y escritorio."
---

# Análisis de audio de DJOrganizer

## Procedimiento

1. Inspeccionar antes los contratos y flujos afectados en `src/lib/audio/`, `src/lib/import/`, `src/lib/music/`, la UI de importación y las migraciones/tipos pertinentes. Consultar `PRODUCT.md`, `DESIGN.md`, `AGENTS.md` y `docs/local-web-genre-classification.md` cuando corresponda.
2. Clasificar cada salida. Tratar como **deterministas** los metadatos leídos, duración derivada del archivo, huellas y transformaciones/normalizaciones reproducibles. Tratar como **predicciones** BPM detectado, tonalidad detectada, energía calculada, géneros, subgéneros, embeddings e inferencias. Conservar procedencia, confianza y explicación de toda predicción.
3. Para cada resultado automático persistible, definir y guardar: algoritmo o modelo y versión, fecha de análisis, estado (`pending`, `running`, `completed`, `failed`, `stale` o equivalente), procedencia y compatibilidad de caché. Permitir reanálisis explícito o planificado cuando cambie el algoritmo, modelo o versión.
4. Diseñar el flujo por pista: después de importar, iniciar automáticamente el análisis solo si el flujo aprobado lo exige; procesar de forma independiente; registrar el error en esa pista; permitir reintento; y continuar guardando/importando el resto de la tanda. Nunca convertir el fallo de una pista en un bloqueo de la importación completa.
5. Reutilizar un resultado en caché si la huella/entrada, algoritmo o modelo+versión y configuración relevante son compatibles. Invalidar solamente resultados incompatibles, corruptos, obsoletos o asociados a un archivo cambiado. No reanalizar una pista sin necesidad.
6. Mantener el audio y las rutas locales privados. El análisis es local por defecto; solicitar consentimiento explícito y revisión antes de cualquier envío remoto. No exponer secretos ni rutas absolutas, y mantener los contratos de web/PWA y Tauri separados.

## Reglas de presentación y revisión

- Presentar BPM, key, energía, género y subgénero generados como sugerencias editables, con confianza, procedencia y explicación cuando existan. No presentar una sugerencia de género o subgénero como hecho confirmado, ni aplicarla sin la revisión manual requerida.
- Usar lenguaje ordinario orientado a DJs en la UI: no mostrar `local`, `nube`, `modelo` ni `inferencia` como términos técnicos. Explicar el beneficio, el estado y la acción disponible sin revelar detalles de implementación.
- Mantener tablas, campos y tarjetas densos y estables: truncar o limitar textos generados, prever alternativas y no cambiar tamaños por explicaciones largas. Conservar teclado, foco, mensajes de estado y diseño responsive.
- Documentar la escala de energía 0–100 y cómo se obtiene. Mantener BPM, tonalidad y Camelot corregibles manualmente; explicar las recomendaciones armónicas sin afirmar certeza.

## Modelos, licencia y plataformas

- Antes de incorporar pesos, etiquetas, embeddings, conversores o dependencias de un modelo, comprobar licencia, atribución, redistribución, derivados y restricciones de cada artefacto. No asumir uso comercial. Documentar de forma visible las restricciones no comerciales y su impacto antes de distribuir o activar el modelo.
- Versionar e verificar artefactos de modelo y caché mediante manifiestos e integridad cuando proceda. No almacenar audio, rutas, nombres o metadatos personales en cachés de modelo.
- Comparar web y escritorio de forma explícita: capacidades de decodificación, cómputo, almacenamiento, permisos, conectividad, resultados numéricos y fallbacks. No prometer equivalencia sin una prueba reproducible; preservar el mismo contrato de resultado o documentar sus diferencias.

## Validación mínima

- Añadir o actualizar pruebas deterministas para normalización, compatibilidad de caché, transiciones de estado, errores por pista, reintentos y reanálisis por versión.
- Para predicciones, probar contratos, límites, confianza, revisión y estabilidad/tolerancias justificadas; no tratar una salida concreta del modelo como verdad absoluta.
- Ejecutar typecheck, lint, pruebas pertinentes y build. Validar en web y escritorio cuando el cambio afecta ambos; registrar limitaciones de entorno sin ocultarlas.
