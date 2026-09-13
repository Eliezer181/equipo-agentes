from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

ASK = re.compile(
    r"\b(imagen|im[aá]gen|foto|fotos|picture|image|gif|enlace|link|url)\b",
    re.I,
)
HAS_URL = re.compile(r"https?://\S+", re.I)
NOISE = re.compile(
    r"\b(pasame|p[aá]same|mandame|mandáme|enviame|env[ií]ame|quiero|buscame|busca|una|un|de|del|la|el|los|las|por|favor|please|imagen|im[aá]gen|foto|fotos|picture|image|enlace|link|url)\b",
    re.I,
)


def wants_media(text: str) -> bool:
    return bool(ASK.search(text or ""))


def topic_of(text: str) -> str:
    cleaned = NOISE.sub(" ", text or "")
    cleaned = re.sub(r"[^\w\sáéíóúñÁÉÍÓÚÑ-]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or (text or "").strip() or "world"


def find_image(query: str) -> str | None:
    q = (query or "").strip() or "world"
    params = urllib.parse.urlencode({
        "action": "query",
        "generator": "search",
        "gsrsearch": q,
        "gsrlimit": "1",
        "gsrnamespace": "6",
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": "900",
        "format": "json",
        "origin": "*",
    })
    url = "https://commons.wikimedia.org/w/api.php?" + params
    req = urllib.request.Request(url, headers={"User-Agent": "EquipoAgentes/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode("utf-8"))
        pages = (data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            info = (page.get("imageinfo") or [{}])[0]
            found = info.get("thumburl") or info.get("url")
            if found and found.startswith("http"):
                return found
    except Exception:
        pass
    slug = urllib.parse.quote(q)
    return f"https://loremflickr.com/800/500/{slug}"


def attach_media(user_text: str, reply: str) -> str:
    text = (reply or "").strip()
    if not wants_media(user_text):
        return text
    if HAS_URL.search(text):
        return text
    topic = topic_of(user_text)
    url = find_image(topic)
    if not url:
        return text
    extra = f"![{topic}]({url})\n{url}"
    return f"{text}\n\n{extra}" if text else extra
