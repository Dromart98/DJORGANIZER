# Distribución de DJOrganizer

Los instaladores de escritorio se generan con Tauri para Windows, macOS y
Linux mediante `.github/workflows/release.yml`. Las actualizaciones se verifican
criptográficamente antes de instalarse.

## Preparación única

1. Generar el par de claves con `tauri signer generate`.
2. Guardar la clave privada y su contraseña como secretos
   `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Guardar el contenido de la clave pública como `TAURI_UPDATER_PUBKEY`.
4. Configurar los certificados de firma de código de Apple y Windows antes de
   publicar fuera de un entorno de pruebas.

Nunca se debe incorporar la clave privada al repositorio. La clave pública se
inyecta en el binario durante el workflow de release. Un tag `app-v*` crea un
borrador de release con instaladores y `latest.json`; debe revisarse antes de
publicarlo.
