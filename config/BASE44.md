# Token de Base44

Ya no se carga por la web. El token vive en secretos de Fly
(o, si hace falta, en el volumen `/app/data/base44_runtime.json`).

## Cómo ponerlo o cambiarlo

En tu compu, con Fly CLI:

```bash
cd /ruta/de/equipo-agentes

fly secrets set \
  BASE44_ENABLED=1 \
  BASE44_API_KEY="pegá_acá_el_token_nuevo" \
  BASE44_BASE_URL="https://app.base44.com/api/apps/TU_APP_ID" \
  -a equipo-agentes
```

Eso reinicia la app. No subas el token a GitHub.

## Si se te acaba el crédito de Base44

1. Entrá a tu cuenta de Base44 y generá o copiá la API key nueva.
2. Correr de nuevo el `fly secrets set` de arriba con esa key.
3. Dejá `BASE44_BASE_URL` igual, salvo que hayas cambiado de app.

## Archivo de ejemplo

Copiá `config/base44.env.example` a un archivo local
`config/base44.env` (no se sube al repo) y pegá ahí los valores
para no olvidarlos. Después pasalos a Fly con el comando.

La app lee, en este orden:

1. `BASE44_API_KEY` / `BASE44_BASE_URL` / `BASE44_ENABLED` en el entorno de Fly
2. `/app/data/base44_runtime.json` en el volumen (solo si ya existía)
