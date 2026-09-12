# Equipo de agentes

Primera versión de un equipo de especialistas con interfaz de lista + chat.
Vos creás los especialistas con el botón `+`. El código vive acá; la clave de la API no.

## Paso 1 — clonar

```bash
git clone https://github.com/Eliezer1817/equipo-agentes.git
cd equipo-agentes
```

## Paso 2 — entorno

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Editá `.env` y pegá tu clave de [console.x.ai](https://console.x.ai):

```
XAI_API_KEY=xai-...
MODEL=grok-4.3
```

Si preferís otro modelo de la API de xAI, cambialo en `MODEL` (`grok-4.6`, `grok-4.3`, etc.).

## Paso 3 — correr

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Abrí [http://127.0.0.1:8000](http://127.0.0.1:8000) en el teléfono (misma red) o en la computadora.

## Qué hay hoy

- Lista de especialistas, buscar y crear con `+`
- Chat por especialista, con memoria en `data/conversations/`
- Un especialista inicial (`Asistente`) para probar

## Qué no hay todavía (siguientes pasos)

- Computadora Linux 24/7 (VPS)
- Navegador / tools reales
- App de iPhone nativa
- Grupos entre especialistas

## Crear un especialista

En la UI: `+` → nombre, cargo, instrucciones.

También se puede editar `data/specialists.json`.
