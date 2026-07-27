# DJOrganizer: contexto compacto para Proyectos de ChatGPT

Este archivo aporta únicamente contexto estable del producto. No duplica el estado del roadmap, las reglas de Codex ni la documentación técnica detallada.

## Producto

DJOrganizer es una aplicación para DJs y personas que organizan bibliotecas musicales. Su objetivo es reducir el tiempo dedicado a buscar, clasificar, analizar, preparar y portar música antes de una sesión, manteniendo el control humano sobre metadatos y archivos.

La biblioteca musical es el centro del producto. DJOrganizer combina gestión de pistas, BPM, tonalidad/Camelot, energía, género/subgénero, etiquetas, crates, análisis musical e integraciones de escritorio para trabajar con archivos y software DJ.

## Principios estables

- El usuario conserva el control sobre metadatos, clasificaciones y archivos.
- El audio y las rutas absolutas son privados y deben permanecer en el dispositivo salvo una transferencia remota explícita y acotada.
- Los resultados automáticos son revisables y no deben sobrescribir correcciones manuales de forma silenciosa.
- Las operaciones destructivas requieren previsualización, confirmación y recuperación/deshacer cuando corresponda.
- Las integraciones con software DJ deben usar contratos verificables y no inventar compatibilidad.
- La interfaz debe ser rápida, accesible y adecuada para bibliotecas grandes.

## Fuentes de verdad

Para responder o decidir sobre el estado actual, no uses este archivo como inventario de funcionalidades. Consulta, en este orden según la pregunta:

- Código de `main`: estado funcional real.
- `docs/roadmap.md`: fases, prioridades y estado de funcionalidades.
- `docs/roadmap-incidencias-observadas.md`: errores y ajustes detectados durante uso real.
- `AGENTS.md`: reglas duraderas específicas del repositorio para Codex.
- `README.md`: instalación, arquitectura y documentación general.
- `docs/`: contratos específicos de seguridad, análisis, formatos, escritorio y distribución.

Ante una contradicción, verifica primero el estado real en `main` y usa la instrucción más reciente del usuario para decisiones de producto todavía no implementadas.

## Límites de contexto

- No copies aquí el roadmap ni listas de funciones implementadas o pendientes.
- No copies aquí las instrucciones globales de Codex.
- No copies aquí prompts de tareas o PR concretas.
- No copies documentación extensa que ya exista en `README.md`, `AGENTS.md` o `docs/`.

El objetivo de este archivo es permitir que un Project de ChatGPT se oriente rápidamente y consulte después únicamente la fuente necesaria para la tarea actual.
