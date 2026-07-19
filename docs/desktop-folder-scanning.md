# Escaneo de carpetas en escritorio

DJOrganizer incorpora mediante Tauri 2 un escaneo nativo de solo lectura por
defecto y operaciones de escritura separadas, explícitas y reversibles.

## Flujo de consentimiento

1. La persona pulsa **Seleccionar carpeta** en la ruta de importación.
2. Rust abre el selector nativo del sistema operativo.
3. Si se cancela, no se examina ninguna ruta.
4. Si se confirma, Rust recorre únicamente esa carpeta y sus subcarpetas.

La web no envía una ruta al comando. Cada escaneo exige una nueva selección
nativa, lo que evita reutilizar silenciosamente una ubicación arbitraria.

## Datos leídos

Para cada archivo compatible, el escáner obtiene:

- nombre, ruta relativa, extensión y tamaño;
- título, artista, álbum y género cuando existen en las etiquetas;
- duración indicada por las propiedades del archivo;
- BPM y tonalidad cuando están presentes en los metadatos;
- un identificador de grupo cuando dos o más archivos tienen contenido idéntico.

La lectura de etiquetas se realiza con Lofty desde Rust. Para detectar copias
exactas, primero agrupa por tamaño y calcula SHA-256 en streaming únicamente
para los archivos candidatos. La huella local nunca se devuelve a la web ni se
persiste. Tras el escaneo, la sesión autenticada puede entregar a Rust las
huellas y tamaños ya guardados en la biblioteca del usuario; Rust calcula solo
las comparaciones necesarias y conserva en memoria el vínculo entre el ID
persistente y el ID opaco del escaneo. React recibe únicamente esos pares de
identificadores para marcar las coincidencias y preparar acciones posteriores;
no recibe huellas calculadas localmente ni rutas. Las rutas absolutas permanecen
en Rust.
No se decodifican muestras ni se calcula BPM o tonalidad. Si una etiqueta o una
comparación falla, la pista se conserva y el fallo se contabiliza.

Formatos reconocidos: AAC, AIFF, ALAC, FLAC, M4A, MP3, OGG, OPUS y WAV.

## Límites y tratamiento de errores

- máximo de 100.000 entradas examinadas;
- máximo de 10.000 pistas devueltas;
- lectura de metadatos ejecutada fuera del hilo principal;
- enlaces simbólicos omitidos para no escapar del árbol elegido;
- carpetas o entradas sin permiso omitidas y contabilizadas;
- errores de etiquetas o huellas aislados por pista;
- verificación de que el tamaño no cambia mientras se calcula la huella;
- resultado marcado como truncado al alcanzar un límite;
- rutas absolutas no se devuelven a la interfaz.

## Límite de permisos

El puente global de Tauri solo está habilitado dentro del binario y su capability
remota acepta exclusivamente `https://djorganizer-beta.vercel.app`. El comando
`choose_and_scan_music_folder` siempre muestra el selector nativo antes de leer.
`link_library_tracks` acepta únicamente IDs, tamaños y huellas de la biblioteca
autenticada y guarda las coincidencias dentro de la sesión nativa activa.
`export_virtualdj_list` solo acepta identificadores que pertenecen a esa sesión;
la web no puede suministrarle rutas absolutas arbitrarias.

No se conceden plugins genéricos de sistema de archivos, shell o proceso. Las
escrituras se limitan a Lists confirmadas, movimientos derivados de IDs del
escaneo y etiquetas previsualizadas para un máximo de 25 IDs activos. No
reproduce, sube ni elimina audio. La detección nativa inicial es de igualdad binaria: una
copia idéntica se agrupa aunque cambie de nombre, pero un archivo reetiquetado o
recodificado se considera distinto.

## Previsualización de organización

La selección local puede generar tres propuestas: artista/álbum,
género/artista o tonalidad/BPM. Cada segmento se normaliza, elimina
separadores y caracteres de control, neutraliza nombres reservados de Windows
y limita su longitud. Las rutas de destino se comparan sin distinguir
mayúsculas y minúsculas; si dos pistas colisionan, la propuesta añade un sufijo
numérico determinista.

La vista recibe exclusivamente rutas relativas. Al aplicar, Rust reconstruye
el plan desde los IDs opacos, vuelve a comprobar existencia y tamaño, evita
sobrescrituras y revierte los movimientos anteriores si uno falla. El historial
de la sesión permite deshacer y se invalida al cambiar de escaneo.

## Escritura reversible de metadatos

Las etiquetas nunca se escriben durante el escaneo ni al editar la biblioteca
sincronizada. La persona selecciona hasta 25 pistas, revisa título, artista,
álbum, género, BPM y tonalidad, solicita una previsualización campo a campo y
confirma la escritura en un diálogo adicional. La web transmite únicamente el
ID opaco del escaneo y los valores revisados; Rust resuelve la ruta conservada
en la sesión.

Antes de tocar un archivo, el comando:

1. valida texto y BPM, pertenencia a la sesión, existencia, tamaño y soporte de
   escritura del contenedor;
2. copia el archivo completo, conservando su ruta relativa, dentro de
   `.djorganizer-backups/<operación>/`;
3. escribe la etiqueta principal con Lofty, la relee y compara todos los campos;
4. calcula una huella del resultado para detectar cambios externos posteriores.

Si falla cualquier pista, se restauran todas las copias del lote. El historial
local permite deshacer mientras la sesión siga activa; antes de restaurar,
compara la huella actual con la escrita por DJOrganizer y cancela todo el
deshacer si otro programa cambió un archivo. También protege temporalmente el
estado actual para poder revertir un fallo durante la restauración. Las copias
permanecen locales, nunca se devuelven a React o Supabase y su carpeta se omite
en escaneos posteriores.


## Exportación de listas para VirtualDJ

VirtualDJ 2024+ usa listas XML nativas en **My Lists**. DJOrganizer genera un
`VirtualFolder` ordenado y una entrada `song` por pista seleccionada, con la
ruta absoluta requerida, tamaño e información musical disponible. El formato
sigue la [especificación oficial de Lists de VirtualDJ](https://virtualdj.com/wiki/lists.html).

La especificación de **My Lists** documenta ruta, tamaño, artista, título,
remix, duración, BPM, tonalidad y algunos campos de karaoke/reproducción. No
define un contrato para cues, rating, color ni historial. Aunque VirtualDJ
gestiona esos conceptos en su interfaz y base de datos interna, DJOrganizer no
los inventa en las Lists ni modifica `database.xml`: esa interoperabilidad se
revisará solo si existe una especificación pública y estable.

Las rutas absolutas nunca se devuelven a React ni a Supabase. Rust las conserva
solo en memoria durante el escaneo y rechaza una exportación si el identificador
de sesión ya no coincide o si una pista no pertenece al resultado activo. El
usuario elige expresamente el destino. Existe compatibilidad M3U8, exportación
por lotes de crates y jerarquías con copia previa de Lists existentes, e
importación recursiva de **My Lists**. Las rutas se vinculan localmente con IDs
persistentes; las no resueltas se muestran como conflictos y la reconciliación
solo se aplica al pulsar combinar o reemplazar.
