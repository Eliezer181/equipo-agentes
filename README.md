Glou — Equipo de agentes IA

Glou es una aplicación web de agentes de IA con interfaz de chat. Permite crear especialistas con instrucciones propias, conversar con ellos individualmente o formar grupos de agentes que colaboran sobre una misma tarea.

El backend está construido con FastAPI + Python y el frontend es una aplicación web en HTML/CSS/JavaScript.

Estado: proyecto en desarrollo. Algunas funciones dependen de proveedores externos y de variables de entorno.

✨ Qué hace

* 🤖 Especialistas configurables: crea, edita, archiva, elimina y reordena agentes con nombre, título, color e instrucciones.
* 👥 Grupos de agentes: reúne varios especialistas y permite que respondan en paralelo o reaccionen cuando otro agente los menciona.
* 💬 Historial persistente: conserva conversaciones y grupos en el almacenamiento del servidor.
* 🧠 Múltiples proveedores LLM: Gemini como motor principal, con soporte para Base44 y Deep Hat.
* 🔄 Fallback automático: si un proveedor falla, el backend puede intentar continuar con Gemini.
* 🖥️ Computadora por agente: cada especialista puede disponer de un directorio persistente para archivos, comandos, Python, generación de PDF y acceso web.
* 🌐 Navegación web: incluye herramientas para consultar páginas web.
* 🔐 Autenticación: registro, login, sesiones mediante cookies y logout.
* 💳 Créditos y Premium: sistema de créditos y flujo manual de activación Premium mediante USDT TRC20.
* 🔎 Búsqueda interna: búsqueda de especialistas, grupos y mensajes.
* 🖼️ Multimedia: puede adjuntar imágenes encontradas mediante Wikimedia Commons cuando la solicitud lo requiere.
* 📱 Interfaz responsive: landing, autenticación, chat, grupos, escritorio, conectores y paneles auxiliares.
* 🐳 Docker + Fly.io: preparado para desplegar como servicio FastAPI con almacenamiento persistente.

⸻

🏗️ Arquitectura

                         ┌─────────────────────┐
                         │      Navegador       │
                         │   HTML / CSS / JS    │
                         └──────────┬──────────┘
                                    │ HTTP
                                    ▼
                         ┌─────────────────────┐
                         │       FastAPI       │
                         │      app/main.py    │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
       ┌─────────────┐       ┌──────────────┐      ┌──────────────┐
       │   Agentes   │       │    Grupos    │      │  Computer    │
       │ Specialists │       │ Multi-agent  │      │  por agente  │
       └──────┬──────┘       └──────┬───────┘      └──────┬───────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
                           ┌─────────────────┐
                           │    Router LLM   │
                           │      llm.py     │
                           └────────┬────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
              Gemini             Base44            Deep Hat
                 │                  │                  │
                 └──────────────────┴──────────────────┘
                                    │
                                    ▼
                              Persistencia
                         data/ + volumen Fly.io

⸻

📁 Estructura principal

.
├── app/
│   ├── main.py              # API FastAPI y lógica principal
│   ├── llm.py               # selección de proveedor y fallback
│   ├── base44_client.py     # integración Base44
│   ├── async_chat.py        # utilidades de chat asíncrono
│   ├── parallel_group.py    # respuestas paralelas de grupos
│   ├── computer.py          # computadora/herramientas por agente
│   ├── browsers.py          # navegador automatizado
│   ├── connectors.py        # conectores externos
│   ├── media.py             # imágenes y enlaces
│   ├── search_api.py        # búsqueda interna
│   ├── store.py             # persistencia
│   ├── users_auth.py        # usuarios, sesiones y créditos
│   ├── billing.py           # sistema de pagos
│   └── ...
│
├── config/
│   ├── BASE44.md
│   └── base44.env.example
│
├── data/
│   ├── specialists.json
│   └── conversations/
│
├── web/
│   ├── index.html           # aplicación principal
│   ├── landing.html         # landing pública
│   ├── auth.html            # registro/login
│   ├── app.js               # lógica principal
│   ├── computer-ui.js       # escritorio del agente
│   ├── group-ui.js          # interfaz de grupos
│   ├── connectors.js        # conectores
│   ├── paywall.js           # flujo Premium
│   └── brand/               # identidad visual
│
├── Dockerfile
├── fly.toml
├── requirements.txt
├── .env.example
└── README.md

⸻

🧠 Proveedores de IA

El router de app/llm.py permite seleccionar el proveedor mediante LLM_PROVIDER o por solicitud.

Gemini

Gemini funciona como uno de los proveedores principales y puede utilizarse como fallback.

GEMINI_API_KEY=tu_clave
MODEL=gemini-flash-latest

El proyecto utiliza el endpoint compatible con OpenAI de Google AI Studio.

⸻

Base44

Base44 puede configurarse como proveedor preferente:

LLM_PROVIDER=base44
BASE44_ENABLED=1
BASE44_API_KEY=tu_clave
BASE44_BASE_URL=https://app.base44.com/api/agents/TU_AGENT_ID
BASE44_TIMEOUT=60

Cuando Base44 falla, el sistema puede intentar continuar mediante Gemini.

⸻

Deep Hat

También existe soporte opcional para Deep Hat mediante Hugging Face Router o un servidor compatible:

LLM_PROVIDER=deephat
DEEPHAT_API_KEY=hf_xxxxxxxx
DEEPHAT_MODEL=DeepHat/DeepHat-V1-7B

También puede utilizarse:

DEEPHAT_BASE_URL=...

para apuntar a un servidor compatible.

⸻

👤 Autenticación

La aplicación incluye:

* Registro mediante email y contraseña.
* Login.
* Sesiones mediante cookies.
* Cookie HttpOnly.
* Cookie Secure en despliegues HTTPS.
* Logout.
* Consulta del usuario actual mediante /api/auth/me.

La gestión se encuentra principalmente en:

app/users_auth.py

⸻

🤝 Grupos de agentes

Los grupos permiten combinar varios especialistas para trabajar sobre una misma tarea.

Un grupo puede definir:

* Nombre.
* Tarea.
* Líder.
* Integrantes.
* Historial compartido.

Los agentes pueden ser mencionados mediante:

@NombreDelAgente

El sistema incluye ejecución paralela para que varios especialistas puedan trabajar simultáneamente.

También existe lógica para que un agente pueda responder cuando otro especialista lo menciona durante una conversación.

⸻

🖥️ Computadora de cada agente

Cada especialista puede disponer de su propio directorio persistente:

data/computers/<agent_id>/

Las herramientas implementadas incluyen:

* Listar archivos.
* Leer archivos.
* Escribir archivos.
* Eliminar archivos.
* Ejecutar comandos Bash.
* Ejecutar Python.
* Generar PDFs.
* Consultar páginas web.
* Descargar contenido.
* Utilizar herramientas de navegador.
* Guardar credenciales mediante un vault.

Por ejemplo:

Agente
   │
   ├── archivos
   ├── scripts
   ├── documentos
   ├── PDFs
   └── credenciales

Los comandos poseen límites de tiempo y de salida.

⸻

🔐 Seguridad de la computadora

La ejecución de comandos actualmente utiliza validaciones, timeout y una lista de comandos bloqueados.

Esto no debe considerarse un sandbox de seguridad fuerte.

La aplicación permite ejecutar código y comandos dentro del entorno del backend. Por ello, para un despliegue público o multiusuario se recomienda aislar estas operaciones.

Para producción se recomienda:

1. Sandbox independiente por ejecución.
2. Contenedores aislados.
3. Usuario del sistema sin privilegios.
4. Filesystem restringido.
5. Límites de CPU y RAM.
6. Límites de procesos.
7. Límites de tiempo.
8. Control de acceso a red.
9. Egress de red controlado.
10. Protección contra SSRF.
11. Auditoría y logs.
12. Gestión segura de secretos.

⸻

🔑 Vault de credenciales

El sistema incluye un vault para almacenar credenciales asociadas a un agente.

Cuando está disponible, utiliza Fernet para cifrar los valores.

La clave puede configurarse mediante:

VAULT_KEY=...

La clave debe mantenerse fuera del repositorio.

Nunca deben almacenarse API keys, contraseñas o tokens reales dentro de GitHub.

⸻

💳 Créditos y Premium

El proyecto incorpora un sistema de créditos para limitar el uso gratuito.

Ejemplo:

FREE_USER_CREDITS=5

El sistema Premium utiliza USDT mediante la red TRC20.

Configuración:

USDT_TRC20_ADDRESS=tu_direccion
USDT_AMOUNT=30

El flujo es:

Usuario
   ↓
Inicia sesión
   ↓
Consulta el pago
   ↓
Envía USDT por TRC20
   ↓
Marca el pago como realizado
   ↓
Administrador revisa
   ↓
Premium activado

La confirmación de pago es manual.

No se debe asumir que el sistema verifica automáticamente una transacción blockchain.

⸻

🔎 Búsqueda

La API:

/api/search

permite buscar:

* Especialistas.
* Grupos.
* Mensajes recientes.

Las búsquedas de mensajes están limitadas para evitar recorrer indefinidamente todo el historial.

⸻

🖼️ Multimedia

El módulo:

app/media.py

detecta solicitudes relacionadas con:

* Imagen.
* Foto.
* GIF.
* Enlace.
* URL.

Cuando corresponde, busca una imagen utilizando Wikimedia Commons y puede incorporarla a la respuesta del agente.

⸻

🌐 API

Algunas de las rutas principales son:

Ruta	Método	Función
/health	GET	Health check
/api/version	GET	Información de versión
/api/auth/register	POST	Registro
/api/auth/login	POST	Login
/api/auth/logout	POST	Cerrar sesión
/api/auth/me	GET	Usuario actual
/api/specialists	GET/POST	Listar/crear agentes
/api/specialists/{id}	PATCH/DELETE	Editar/eliminar agente
/api/specialists/{id}/chat	POST	Chat individual
/api/groups	GET/POST	Listar/crear grupos
/api/groups/{id}/chat	POST	Chat con grupo
/api/search	GET	Búsqueda
/api/billing/config	GET	Configuración de pago
/api/billing/mark-paid	POST	Avisar pago

También existen rutas adicionales para:

* Computadora.
* Archivos.
* Navegador.
* Conectores.
* Administración.
* Multimedia.
* Grupos.
* Proveedores LLM.

⸻

🔄 Flujo de una conversación

Una conversación individual sigue aproximadamente este flujo:

Usuario
   ↓
/api/specialists/{id}/chat
   ↓
Carga historial
   ↓
Carga instrucciones del especialista
   ↓
Router LLM
   ↓
Proveedor de IA
   │
   ├── Gemini
   ├── Base44
   └── Deep Hat
   ↓
¿Necesita herramientas?
   │
   ├── Sí
   │     ↓
   │   Computer / Browser / Connector
   │     ↓
   │   Resultado
   │     ↓
   │   Nueva ronda
   │
   └── No
         ↓
      Respuesta
         ↓
Adjuntar multimedia si corresponde
         ↓
Guardar historial
         ↓
Respuesta al frontend

En los grupos se añade:

Usuario
   ↓
Grupo
   ↓
Selección de especialistas
   ↓
Ejecución paralela
   ↓
Respuestas
   ↓
Detección de menciones
   ↓
Nuevas respuestas si corresponde
   ↓
Historial compartido

⸻

🚀 Instalación local

Requisitos

* Python 3.12
* pip
* API key de al menos un proveedor LLM

Clonar:

git clone https://github.com/Eliezer181/equipo-agentes.git
cd equipo-agentes

Crear entorno virtual:

python -m venv .venv

Activarlo en Linux/macOS:

source .venv/bin/activate

Instalar dependencias:

pip install -r requirements.txt

Crear configuración:

cp .env.example .env

Configurar como mínimo:

GEMINI_API_KEY=tu_clave
MODEL=gemini-flash-latest
HOST=127.0.0.1
PORT=8000

Ejecutar:

uvicorn app.main:app --host 0.0.0.0 --port 8000

Abrir:

http://127.0.0.1:8000

⸻

🐳 Docker

El proyecto incluye un Dockerfile basado en Python 3.12.

Construir:

docker build -t equipo-agentes .

Ejecutar:

docker run --env-file .env -p 8000:8000 equipo-agentes

⸻

☁️ Fly.io

El proyecto incluye configuración para Fly.io mediante:

fly.toml

La configuración utiliza:

* Región primaria gru.
* Puerto interno 8000.
* HTTPS.
* Health check.
* Volumen persistente.
* Directorio /app/data.
* 1 CPU compartida.
* 512 MB de RAM.

Desplegar:

fly launch
fly deploy

Configurar Gemini:

fly secrets set GEMINI_API_KEY='tu-key'

Configurar Base44:

fly secrets set \
  BASE44_ENABLED=1 \
  BASE44_API_KEY='tu-key' \
  BASE44_BASE_URL='https://app.base44.com/api/agents/TU_AGENT_ID'

⸻

🔐 Variables de entorno

Consulta:

.env.example

para la configuración disponible.

Variables principales:

Variable	Función
GEMINI_API_KEY	API de Gemini
MODEL	Modelo configurado
LLM_PROVIDER	Proveedor seleccionado
BASE44_ENABLED	Activa Base44
BASE44_API_KEY	Credencial Base44
BASE44_BASE_URL	Endpoint Base44
DEEPHAT_API_KEY	Credencial Deep Hat
DEEPHAT_BASE_URL	Servidor Deep Hat/Ollama
DEEPHAT_MODEL	Modelo Deep Hat
ADMIN_TOKEN	Acceso administrativo
VAULT_KEY	Clave del vault
USDT_TRC20_ADDRESS	Dirección de pago
USDT_AMOUNT	Precio Premium
FREE_USER_CREDITS	Créditos iniciales

⚠️ Nunca subir secretos

No subas a GitHub:

.env
API keys
tokens
contraseñas
VAULT_KEY
credenciales de usuarios
claves privadas

⸻

🧪 Desarrollo

El proyecto contiene varias capas que han ido creciendo durante el desarrollo.

Antes de realizar cambios importantes conviene comprobar:

* Compatibilidad entre frontend y backend.
* Rutas FastAPI.
* Configuración de proveedores LLM.
* Persistencia.
* Volumen de Fly.io.
* Sistema de autenticación.
* Créditos.
* Ejecución paralela de grupos.
* Herramientas de computadora.
* Navegador.
* Conectores.
* Gestión de secretos.

⸻

🛡️ Consideraciones de seguridad

Debido a que los agentes pueden interactuar con:

* Archivos.
* Python.
* Bash.
* Internet.
* Navegadores.
* Credenciales.

la aplicación debe tratarse como un sistema con alto nivel de privilegio operativo.

Especialmente importante:

La denylist de comandos no constituye un aislamiento de seguridad completo.

Para producción multiusuario se recomienda utilizar un sandbox real para las herramientas de ejecución.

También se recomienda:

┌─────────────────────────────┐
│          Usuario            │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│        Aplicación           │
│          FastAPI            │
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│      Sandbox aislado        │
│                             │
│  CPU limit                  │
│  RAM limit                  │
│  Network policy             │
│  Filesystem aislado         │
│  Process limit              │
└─────────────────────────────┘

Esto evita que una herramienta del agente tenga acceso innecesario al entorno principal del servidor.

⸻

📌 Estado actual

Glou actualmente combina:

AI Agents
    +
Multi-Agent Groups
    +
LLM Router
    +
Persistent Memory
    +
Agent Computer
    +
Browser
    +
Connectors
    +
Authentication
    +
Credits
    +
Premium
    +
Responsive Web UI

El objetivo es proporcionar una experiencia donde el usuario pueda trabajar con un equipo completo de especialistas de IA desde una sola interfaz, sin tener que cambiar constantemente entre herramientas.

⸻

📄 Licencia

Actualmente el repositorio no declara una licencia open source específica.

Si deseas permitir reutilización, modificación o distribución por terceros, añade un archivo:

LICENSE

con la licencia que corresponda.

⸻

👨‍💻 Autor

Desarrollado por Renzo Eliezer.

GitHub:

https://github.com/Eliezer181

Repositorio:

https://github.com/Eliezer181/equipo-agentes