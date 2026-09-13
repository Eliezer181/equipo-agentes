# Equipo de agentes

Equipo de especialistas con interfaz de lista + chat.
Vos creás los especialistas con el botón `+`. El código vive acá; la clave de la API no.

## Publicar en Fly.io (para verlo en el celular)

1. Entrá a [https://fly.io/dashboard](https://fly.io/dashboard) con la cuenta que ya conectaste.
2. **Launch App** → conectá GitHub si no está → elegí el repo **Eliezer1817/equipo-agentes**.
3. Si pide nombre de app, usá `equipo-agentes-eliezer` (tiene que ser único).
4. Región sugerida: `gru` (São Paulo).
5. En **Secrets** agregá:
   - `XAI_API_KEY` = tu clave de [console.x.ai](https://console.x.ai)
   - `MODEL` = `grok-4.3`
6. Deploy.

Cuando termine, el link va a ser:

`https://equipo-agentes-eliezer.fly.dev`

Si el nombre de la app cambió, Fly te muestra la URL final.

Desde una PC también se puede:

```bash
fly launch --copy-config --yes
fly secrets set XAI_API_KEY=xai-... MODEL=grok-4.3
fly deploy
```

## Correr en local

```bash
git clone https://github.com/Eliezer1817/equipo-agentes.git
cd equipo-agentes
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

En `.env`:

```
XAI_API_KEY=xai-...
MODEL=grok-4.3
```

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Notas

- Sin `XAI_API_KEY` la interfaz abre, pero el chat falla.
- Los chats se guardan en el disco de la máquina de Fly. Si se apaga y no hay volumen, se pueden perder. Eso lo afinamos después.
