# Equipo de agentes

Usa la API de Gemini (Google AI Studio). La clave no va en GitHub: solo en Fly o en `.env` local.

## Fly.io

1. Repo: `Eliezer1817/equipo-agentes`
2. Puerto interno: **8000**
3. Variables:
   - `GEMINI_API_KEY` = la clave de [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - `MODEL` = `gemini-2.5-flash`
4. Sin Postgres. Desplegar.

URL: `https://NOMBRE-DE-LA-APP.fly.dev`
