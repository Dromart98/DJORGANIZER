# Roadmap de DJOrganizer

Actualizado: 2026-07-19.

Este documento distingue lo que ya está disponible de las fases que todavía
requieren implementación. Cada fase funcional se entrega en una rama y pull
request independiente, con pruebas, revisión y despliegue de producción desde
`main`.

## Disponible

- [x] Base Next.js, TypeScript estricto, Tailwind y diseño responsive.
- [x] Supabase Auth, esquema PostgreSQL, RLS y aislamiento por usuario.
- [x] Biblioteca persistente con CRUD, búsqueda, filtros, ordenación y paginación.
- [x] Importación local de metadatos y detección SHA-256 de duplicados.
- [x] Crates y etiquetas persistentes con orden manual.
- [x] Normalización tonal, rueda Camelot y recomendaciones armónicas.
- [x] Estimación local de BPM y tonalidad, sin subir audio.
- [x] Edición masiva, diseño premium y PWA instalable con fallback sin conexión.
- [x] Base Tauri 2 y escaneo local de carpetas con metadatos y duplicados exactos.
- [x] Revisión del escaneo con búsqueda, filtros, paginación y selección.
- [x] Previsualización segura de reorganización sin mover archivos.
- [x] Exportación de una selección local como List XML nativa de VirtualDJ 2024+.

## Próximas fases prioritarias

### Integración con VirtualDJ

- [x] Exportar también M3U8 como formato de compatibilidad heredada.
- [ ] Asociar de forma local una pista persistente de DJOrganizer con su archivo
  en cada dispositivo mediante huella y ruta, sin publicar la ruta absoluta.
- [ ] Exportar crates de DJOrganizer a Lists de VirtualDJ conservando su orden.
- [ ] Exportar varios crates y jerarquías de listas en una sola operación.
- [ ] Previsualizar e importar cambios de **My Lists** sin sobrescribir datos.
- [ ] Añadir reconciliación de conflictos, copias de seguridad e historial.
- [ ] Evaluar cues, rating, color e historial solo tras validar oficialmente cada
  campo; no modificar `database.xml` directamente en el MVP.

VirtualDJ 2024+ usa XML en **My Lists**; M3U se mantiene como compatibilidad
heredada. Referencias oficiales:
[Lists](https://virtualdj.com/wiki/lists.html),
[Playlists](https://virtualdj.com/manuals/virtualdj/interface/database/playlists.html)
y [Export](https://virtualdj.com/manuals/virtualdj/appendix/export.html).

### Gestión real del sistema de archivos

- [ ] Aplicar el plan de reorganización con confirmación y simulación final.
- [ ] Registrar cada movimiento y ofrecer deshacer o recuperación.
- [ ] Detectar cambios externos y evitar sobrescrituras o colisiones.
- [ ] Escribir metadatos en archivos solo como opción explícita, con copia de
  seguridad y reversión.
- [ ] Vigilar carpetas e incorporar escaneos incrementales.

### Inteligencia y calidad musical

- [x] Analizar automáticamente BPM y tonalidad en cuanto se seleccionen archivos
  para importar, sin requerir un botón adicional; mostrar progreso, permitir
  cancelar y conservar la corrección manual. El análisis sigue siendo local.
- [ ] Clasificar géneros con la API de OpenAI y la familia `gpt-audio`. Esta
  función será opcional y requerirá consentimiento explícito antes de enviar un
  fragmento autorizado; la clave permanecerá en el servidor. Definir taxonomía,
  respuesta estructurada, confianza, límites de coste, caché por huella y
  corrección manual. Confirmar el modelo de audio vigente al implementar.
  Referencia: [gpt-audio](https://developers.openai.com/api/docs/models/gpt-audio).
- [ ] Calcular energía real con una escala documentada y editable.
- [ ] Detectar duplicados acústicos o versiones recodificadas, además de copias
  binarias exactas.
- [ ] Mejorar confianza y explicación de BPM y tonalidad.
- [ ] Añadir comparación de versiones, remixes y ediciones.
- [ ] Mantener género automático como función opcional y revisable.

### Offline, rendimiento y distribución

- [ ] Cola de edición offline y sincronización segura con resolución de conflictos.
- [ ] Virtualización y pruebas con bibliotecas de decenas de miles de pistas.
- [ ] Instaladores firmados para Windows y macOS.
- [ ] Actualizaciones automáticas verificadas para la aplicación de escritorio.
- [ ] Copias de seguridad, exportación general de datos y restauración.
- [ ] Observabilidad respetuosa con la privacidad y diagnóstico de fallos.

### Calidad de producto

- [ ] Pruebas end-to-end de autenticación, importación, biblioteca y crates.
- [ ] Auditoría automatizada de RLS y separación entre usuarios.
- [ ] Accesibilidad completa con teclado y lectores de pantalla.
- [ ] Onboarding, ayuda contextual y recuperación ante estados vacíos o errores.
- [ ] Internacionalización.
- [ ] Integraciones posteriores con Rekordbox, Serato, Traktor y ecosistemas CDJ,
  después de estabilizar VirtualDJ.
