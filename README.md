# Equipo de agentes

Usa la API de Gemini (Google AI Studio) por defecto. La clave no va en GitHub: solo en Fly o en `.env` local.

Opcional: Base44 Superagent para turnos más pesados (créditos limitados en el plan gratis).

## Fly.io

1. Repo: `Eliezer1817/equipo-agentes`
2. Puerto interno: **8000**
3. Variables:
   - `GEMINI_API_KEY` = la clave de [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - `MODEL` = `gemini-2.5-flash`
4. Sin Postgres. Desplegar.

URL: `https://NOMBRE-DE-LA-APP.fly.dev`

## Base44 (opcional)

Secrets (nunca en el frontend ni en el repo):

```bash
fly secrets set \
  BASE44_ENABLED=1 \
  BASE44_API_KEY='tu-key' \
  BASE44_BASE_URL='https://app.base44.com/api/agents/TU_AGENT_ID' \
  -a equipo-agentes
```

Routing:

- Por defecto la app usa **Base44** cuando `BASE44_ENABLED=1` (o `LLM_PROVIDER=base44`).
- Si Base44 falla → fallback automático a Gemini (`provider: gemini_fallback`).
- Para forzar solo Gemini: `LLM_PROVIDER=gemini` o por turno `"provider":"gemini"`.

Recomendación del Jefe: Base44 primero; Gemini como respaldo.

Si Base44 falla (timeout, sin créditos, error HTTP), el backend hace **fallback automático a Gemini** y la respuesta incluye `"provider": "gemini_fallback"` para que el front muestre el toast.


## Rotar Base44 (panel admin)

Cuando se acaben los créditos de una cuenta:

1. Abrí `https://TU-APP.fly.dev/admin/base44`
2. Entrá con `ADMIN_TOKEN` (secret de Fly)
3. Pegá la Base URL y API key de la otra cuenta → Guardar

La key se guarda en el volumen (`data/base44_runtime.json`), no en el repo. El chat la usa al instante. "Volver a Fly" borra el override.
