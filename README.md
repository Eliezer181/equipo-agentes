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

- Por defecto todo usa Gemini (`LLM_PROVIDER=gemini`).
- Para forzar Base44 en toda la app: `LLM_PROVIDER=base44` (con `BASE44_ENABLED=1`).
- Por turno: el body del chat acepta `"provider": "base44"` en `POST /api/specialists/{id}/chat` y `POST /api/groups/{id}/chat`.

Recomendación: dejá Gemini para el chat diario y usá `provider: "base44"` solo cuando haga falta más potencia.
