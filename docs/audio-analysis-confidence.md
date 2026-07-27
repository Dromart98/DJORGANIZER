# Confianza del análisis local

DJOrganizer analiza BPM y tonalidad en el navegador. El audio no se guarda, no
se incorpora a la copia de seguridad y no se envía a Supabase ni a terceros.
Solo persiste el valor resultante, su procedencia y una explicación breve.

## Procedencia

- `automatic`: resultado calculado por un analizador aprobado. Puede incluir confianza.
- `metadata`: valor leído de las etiquetas del archivo. No se inventa una
  confianza porque la etiqueta no aporta evidencia sobre cómo se obtuvo.
- `manual`: valor revisado por la persona usuaria. No se puntúa.
- `unknown`: valor anterior a este contrato; se conserva sin atribuir origen.

Al borrar un BPM o una tonalidad también se elimina su evidencia. Una edición
manual sustituye la procedencia y descarta la confianza automática anterior.

## BPM

Los archivos válidos se analizan en una, dos o tres ventanas según su duración,
con un máximo total de 90 segundos. Cada candidato se normaliza al rango DJ de
70–180 BPM para comparar lecturas a mitad o doble de tempo. El valor final es
la mediana.

La confianza combina:

1. cobertura: cuántas ventanas produjeron un candidato válido;
2. concordancia: la desviación máxima entre los candidatos normalizados.

La explicación muestra las ventanas usadas, si la concordancia es alta, media
o baja y recuerda revisar manualmente los errores de mitad/doble tempo.

## Tonalidad

El detector resume cromas de fragmentos locales y compara los 24 perfiles
mayor/menor. La confianza combina la fuerza del perfil ganador, su separación
frente al segundo candidato y la cobertura de fragmentos. La explicación
muestra la alternativa más cercana para hacer visible una lectura ambigua.

## Límites

La confianza va de 0 a 1 y sirve para priorizar revisión, no para certificar que
una pista tenga un único BPM o centro tonal. Ritmos sincopados, cambios de
tempo, modulaciones, ruido, silencios y mezclas armónicamente complejas pueden
reducir la precisión. El usuario conserva siempre la decisión final.


## Contrato neutral estabilizado

La procedencia persistente es `automatic`, `metadata`, `manual` o `unknown`; no identifica proveedores. BPM, tonalidad, energía, género y subgénero protegen una corrección `manual`. La energía pública y persistida es un entero 0–10.
