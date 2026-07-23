---
name: djorganizer-library-integrity
description: Protege la integridad de la biblioteca de DJOrganizer. Usar al cambiar o investigar importación de canciones, duplicados, identidad de pistas, etiquetas, crates, playlists, orden manual, archivos desaparecidos, cambios de ubicación, metadatos, exportaciones o sincronización con el Explorador de Windows.
---

# Integridad de biblioteca DJOrganizer

Aplicar este procedimiento para conservar la biblioteca utilizable y recuperable: una pista, sus relaciones, su orden de set y sus archivos locales no son intercambiables.

## Contexto que se debe comprobar antes de cambiar

1. Leer `AGENTS.md`, `PRODUCT.md` y `DESIGN.md`, y después inspeccionar las migraciones, contratos y flujos que intervengan. No convertir una capacidad futura en una afirmación de implementación actual.
2. Tratar `tracks.id` como la identidad estable de la pista. Una ruta, un nombre de archivo, una importación o unos metadatos pueden cambiar; no deben crear una identidad nueva si representan la misma pista ya registrada.
3. Mantener las rutas absolutas y las asociaciones de archivos locales fuera de Supabase. Para Windows/Tauri, usar selección nativa, raíces confirmadas e identificadores opacos de sesión; nunca aceptar una ruta arbitraria desde la web.
4. Revisar las relaciones antes de diseñar un cambio: `track_tags` enlaza pistas y etiquetas; `crate_tracks` enlaza pistas y crates con `position`; los historiales de integración contienen exportaciones o reconciliaciones. Comprobar también RLS, pertenencia de usuario e índices afectados.

## Clasificar antes de actuar

No llamar «duplicado» a una coincidencia sin indicar cuál de estos casos es y qué evidencia lo sustenta:

| Caso | Evidencia principal | Comportamiento seguro |
| --- | --- | --- |
| **Archivo duplicado** | Misma huella de archivo estable, por ejemplo SHA-256; tamaño como comprobación auxiliar. | No insertar otra pista. Informar de la pista existente y, si se detecta una nueva ubicación, proponer vincular o actualizar la asociación local sin cambiar el `id`. |
| **Grabación duplicada** | Firma acústica, duración, BPM y título sugieren la misma interpretación; puede ser una edición, remix o remaster. | Mostrar la relación y confianza para revisión humana. Conservar ambas pistas salvo decisión explícita; no fusionar por heurística. |
| **Metadatos coincidentes** | Título, artista, álbum o campos normalizados similares. | Marcar como posible coincidencia para revisar. Nunca deduplicar ni sobrescribir solo por texto. |

Separar siempre la detección de la decisión. Explicar falsos positivos posibles (reencodes, metadatos incorrectos, remixes y títulos repetidos) y ofrecer una acción reversible.

## Flujo obligatorio para cambios y reparaciones

1. **Investigar la causa raíz.** Reproducir y acotar el problema: origen de importación, huella, tamaño, metadatos, estado del archivo local, cambio externo, historial de sincronización y relaciones afectadas. No reparar síntomas ni borrar datos para ocultar la causa.
2. **Inventariar el impacto.** Para cada pista, etiqueta, crate o archivo afectado, contar relaciones de `track_tags` y `crate_tracks`, posiciones, crates padres/hijos, exportaciones y sincronizaciones. Incluir qué se conservará, actualizará, omitirá o quedará sin resolver.
3. **Preparar una vista previa.** Para importaciones y operaciones masivas, presentar entradas, clasificaciones de duplicado, conflictos, cambios de metadatos, vínculos de ubicación, relaciones y orden que se modificarían. Pedir confirmación explícita antes de una acción destructiva o sobre archivos.
4. **Aplicar de forma atómica o compensable.** Agrupar los cambios de datos relacionados en una transacción cuando sea posible. Si se trabaja con archivos, comprobar primero existencia, tamaño, permisos, origen, destino y cambios externos; si una operación por lotes falla, revertir lo aplicado o dejar resultados explícitos y recuperables. No dejar relaciones apuntando a registros inexistentes.
5. **Verificar y comunicar.** Recargar o consultar el resultado y comparar con la vista previa. Dar un resumen verificable con aplicados, omitidos, duplicados, conflictos, fallos, IDs/elementos afectados y recuperación o siguiente acción.

## Invariantes no negociables

- Conservar una sola identidad interna estable por pista aunque cambie su ruta o nombre local.
- Evitar duplicados silenciosos tanto dentro de un lote como en reimportaciones; comprobar antes de insertar y mantener una protección de persistencia contra carreras.
- Preservar integridad referencial y propiedad por usuario. No eliminar un registro ni una relación sin conocer y mostrar el efecto en etiquetas, crates, jerarquías y exportaciones.
- Conservar el orden manual de cada crate mediante posiciones explícitas. Al añadir, retirar, reconciliar o reordenar, definir un orden determinista y no usar orden alfabético, de creación o de consulta como sustituto del orden del DJ.
- Considerar las playlists como crates hasta que un contrato separado defina otra entidad; no inventar una representación ni perder posiciones al convertir formatos.
- No mover, renombrar, sobrescribir ni eliminar archivos originales sin una confirmación explícita, informada y específica de los elementos afectados. Registrar o mostrar una vía de recuperación cuando aplique.
- Mantener metadatos manuales y procedencia/confianza de análisis. Una importación o análisis automático debe proponer cambios, no reemplazar silenciosamente correcciones del usuario.
- Tratar un archivo desaparecido como un estado de vinculación local que requiere diagnóstico y recuperación; no borrar automáticamente la pista ni sus relaciones.

## Importación y ubicaciones locales

- Calcular y validar la huella antes de persistir cuando esté disponible. Deduplicar dentro del lote y contra la biblioteca del mismo usuario.
- Si se reconoce la misma huella en otra ubicación, conservar la pista, etiquetas, crates, notas y orden; proponer actualizar o añadir el vínculo local conforme al contrato nativo, no crear una pista nueva.
- Si no hay huella o la comprobación falla, no afirmar que no existen duplicados. Marcar el resultado como no verificado, permitir reintento y evitar inserciones silenciosas si no se puede mantener la garantía requerida.
- Para Explorador de Windows y Tauri, detectar cambios mediante sesiones y raíces autorizadas. Mostrar archivo ausente, reubicado, modificado o ambiguo; requerir selección/confirmación del usuario para resolver ambigüedades.

## Crates, etiquetas y cambios masivos

- Antes de eliminar una pista o etiqueta, calcular y mostrar sus membresías y dependencias. Preferir retirar una relación concreta frente a borrar el registro base.
- Al fusionar registros por una decisión explícita, migrar relaciones con reglas de colisión definidas y conservar posiciones de crate; verificar después que no haya claves foráneas rotas, pertenencias duplicadas ni posiciones inesperadas.
- Para reordenar, validar que cada pista aparece una sola vez, que todas pertenecen al crate y que la secuencia resultante es completa y determinista. Usar controles accesibles además de arrastrar y soltar.
- Las operaciones masivas deben incluir vista previa, alcance, confirmación, resumen y resultado verificable. Informar de cada elemento no aplicado; no declarar éxito global si hubo fallos parciales.

## Exportación e integración

- Generar exportaciones desde la instantánea validada de pistas y crates del usuario, preservando jerarquía y orden manual.
- Antes de declarar una exportación correcta, validar formato, codificación, nombres, referencias de pistas, cantidad, jerarquía y posición; leer o volver a analizar el artefacto cuando el formato lo permita.
- Tratar importación y sincronización externa como propuesta de reconciliación: previsualizar altas, cambios, eliminaciones, pistas no resueltas y conflictos. No sobrescribir localmente sin confirmación.
- Registrar la exportación o reconciliación solo tras conocer el resultado. Distinguir éxito total, éxito parcial y fallo; no presentar un archivo generado como una sincronización aplicada.

## Criterio de entrega

Incluir en la respuesta o en el cambio una breve evidencia de: causa raíz investigada, impacto revisado, vista previa/confirmación, estrategia de atomicidad o recuperación, invariantes verificadas y validación de exportación cuando corresponda. Añadir pruebas de dominio para identidad, duplicados, relaciones y orden; cubrir el flujo crítico de importación, recuperación de archivo o sincronización con E2E cuando se modifique.
