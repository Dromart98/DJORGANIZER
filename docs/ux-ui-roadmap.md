# Fase futura de simplificación UX/UI

Actualizado: 2026-07-21.

## Decisión

DJOrganizer tendrá una fase específica de auditoría, simplificación y rediseño UX/UI cuando las funcionalidades prioritarias estén implementadas y estabilizadas.

Esta fase no consiste solo en cambiar colores o hacer la aplicación más atractiva. Su objetivo es que un DJ pueda entender qué debe hacer, completar las tareas principales sin instrucciones externas y confiar en que no perderá música, metadatos ni listas.

Los defectos graves de uso, bloqueos, pantallas cortadas y acciones peligrosamente confusas deben corregirse cuando se detecten. El rediseño integral se realizará después de estabilizar el núcleo funcional, para evaluar recorridos reales y no pantallas aisladas.

## Orden de trabajo

1. Resolver errores base y bloqueos actuales.
2. Completar y estabilizar las funcionalidades prioritarias.
3. Validar los recorridos completos con datos y archivos de prueba.
4. Auditar arquitectura de información, navegación, lenguaje y jerarquía de acciones.
5. Simplificar los flujos antes de modificar el aspecto visual.
6. Aplicar el rediseño visual y responsive.
7. Repetir pruebas de uso, teclado, lector de pantalla y recuperación.

No se añadirán funciones nuevas durante esta fase mientras exista un problema principal de comprensión o navegación sin resolver.

## Flujos que deben auditarse

- Registro, confirmación, inicio y cierre de sesión.
- Primera importación de canciones.
- Selección de archivos o carpetas y análisis local.
- Revisión de BPM, tonalidad, Camelot, energía, género y duplicados.
- Corrección individual y edición masiva.
- Búsqueda, filtros, ordenación y paginación de bibliotecas grandes.
- Creación, edición, jerarquía y ordenación de crates.
- Preparación de una sesión y recomendaciones armónicas.
- Asociación entre pistas y archivos locales.
- Reorganización de archivos con previsualización, confirmación y deshacer.
- Escritura segura de metadatos.
- Exportación e importación con VirtualDJ.
- Exportación e importación con Rekordbox y futuras integraciones.
- Funcionamiento offline, conflictos, backups y restauración.
- Configuración, idioma, modelos locales y clasificación mediante OpenAI.

## Problemas que deben localizarse

Durante las pruebas se registrará cualquier punto donde:

- no resulte evidente cuál es la siguiente acción;
- haya demasiadas opciones al mismo nivel;
- la acción principal no destaque;
- se utilice lenguaje técnico innecesario;
- falte información para decidir con seguridad;
- haya información técnica compitiendo con los datos musicales principales;
- el usuario tema sobrescribir, mover o perder archivos;
- una tarea requiera más pasos de los necesarios;
- el estado de progreso, éxito, error o cancelación no sea claro;
- sea difícil volver atrás o recuperarse de un fallo;
- web y escritorio presenten comportamientos incoherentes;
- móvil, teclado o lector de pantalla tengan un recorrido peor.

## Principios de simplificación

### Biblioteca como centro

La biblioteca seguirá siendo el centro del producto. Debe mostrar primero la información necesaria para preparar música:

- título y artista;
- género;
- BPM;
- tonalidad y Camelot;
- energía;
- rating o favorito;
- acciones principales.

La huella del archivo, firma acústica, procedencia, confianza, explicación técnica y otros datos avanzados deben permanecer disponibles, pero mediante divulgación progresiva o vistas de detalle.

### Flujos predecibles

Cada operación importante debe seguir, cuando corresponda, una secuencia reconocible:

1. Seleccionar.
2. Analizar o preparar.
3. Previsualizar.
4. Revisar y corregir.
5. Confirmar.
6. Mostrar el resultado.
7. Permitir recuperar o deshacer.

Las operaciones destructivas conservan siempre previsualización, confirmación, historial y recuperación cuando sea viable.

### Navegación contenida

La navegación principal debe limitarse a áreas de trabajo comprensibles, por ejemplo:

- Biblioteca.
- Importar.
- Crates o sesiones.
- Integraciones.
- Ajustes.

Las funciones avanzadas deben aparecer dentro del contexto donde se utilizan, no competir todas en la navegación principal.

### Lenguaje orientado al DJ

La interfaz debe priorizar mensajes como:

- “Copia exacta detectada”.
- “Posible versión de la misma canción”.
- “Analizado en este dispositivo”.
- “Tres canciones no tienen archivo vinculado”.
- “Revisa los cambios antes de exportar”.

Términos como SHA-256, inferencia, runtime, reconciliación o proveedor pueden conservarse en información avanzada y diagnósticos, pero no deben ser necesarios para completar una tarea normal.

## Rediseño visual posterior

Solo después de simplificar los recorridos se revisarán:

- jerarquía visual;
- densidad de la tabla;
- espaciados;
- tipografía;
- contraste;
- botones principales y secundarios;
- filtros y barras de herramientas;
- formularios, diálogos y paneles laterales;
- estados vacíos, carga, error, offline y éxito;
- adaptación móvil y ventanas Tauri pequeñas;
- consistencia entre web, PWA y escritorio.

El diseño debe conservar el carácter oscuro, profesional, denso y orientado a bibliotecas grandes, pero sin convertir la densidad en ruido visual.

## Validación y definición de terminado

La fase no se considerará terminada por disponer de nuevas pantallas o estilos. Se deberá comprobar que usuarios sin instrucciones externas pueden:

- importar música;
- entender y corregir un análisis;
- encontrar canciones;
- crear y ordenar un crate;
- preparar una progresión;
- exportar a una integración;
- cancelar una operación;
- recuperarse de un error;
- comprender qué datos o archivos se modificarán.

Las pruebas deben registrar tiempo, errores, dudas, abandonos y pasos innecesarios. También deben repetirse con teclado, NVDA, móvil, escritorio, conexión lenta y bibliotecas grandes.

## Áreas que no deben romperse

El rediseño no puede:

- debilitar autenticación o RLS;
- subir audio completo o rutas locales;
- retirar confirmaciones de operaciones destructivas;
- modificar archivos silenciosamente;
- eliminar historial, rollback o deshacer;
- alterar el orden persistente de crates;
- romper formatos de VirtualDJ o Rekordbox;
- sustituir análisis o correcciones manuales automáticamente;
- cargar toda la biblioteca en memoria;
- ocultar errores técnicos necesarios para diagnóstico, aunque se presenten en una vista avanzada.
