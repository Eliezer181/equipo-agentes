const NOTIFY_KEY = "equipo-notify";
const agentModal = document.getElementById("agent-modal");
const editForm = document.getElementById("edit-agent");

function notifyOn() {
  return localStorage.getItem(NOTIFY_KEY) !== "off";
}

function setNotify(on) {
  localStorage.setItem(NOTIFY_KEY, on ? "on" : "off");
  const box = document.getElementById("notify-toggle");
  if (box) box.checked = on;
  if (on && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function pingNotice(title, body) {
  if (!notifyOn()) return;
  if (document.visibilityState === "visible" && document.getElementById("chat").classList.contains("active")) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: String(body || "").slice(0, 90) });
  } catch (_) {}
}

function openAgentSheet() {
  if (!current || current.type !== "specialist") return;
  document.getElementById("edit-name").value = current.name || "";
  document.getElementById("edit-title").value = current.title || "";
  document.getElementById("edit-instructions").value = current.instructions || "";
  document.getElementById("edit-color").value = current.color || "";
  document.getElementById("notify-toggle").checked = notifyOn();
  const pal = document.getElementById("edit-palette");
  pal.innerHTML = PALETTE.map((c) =>
    `<button type="button" data-color="${c}" style="background:${c}" class="${(current.color || "").toLowerCase() === c.toLowerCase() ? "on" : ""}"></button>`
  ).join("");
  document.getElementById("btn-archive").textContent = current.archived ? "Desarchivar" : "Archivar";
  agentModal.classList.remove("hidden");
}

document.getElementById("edit-palette").onclick = (e) => {
  const b = e.target.closest("[data-color]");
  if (!b) return;
  document.getElementById("edit-color").value = b.dataset.color;
  document.querySelectorAll("#edit-palette button").forEach((x) => x.classList.toggle("on", x === b));
};

document.getElementById("btn-close-agent").onclick = () => agentModal.classList.add("hidden");
document.getElementById("notify-toggle").onchange = (e) => setNotify(e.target.checked);

const prevWho = document.getElementById("chat-who").onclick;
document.getElementById("chat-who").onclick = () => {
  if (current && current.type === "specialist") return openAgentSheet();
  if (prevWho) prevWho();
};

document.getElementById("btn-agent-menu").onclick = (e) => {
  e.stopPropagation();
  if (current && current.type === "specialist") openAgentSheet();
  else if (current && current.type === "group") openGroupInfo();
};

editForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!current || current.type !== "specialist") return;
  const payload = {
    name: document.getElementById("edit-name").value.trim(),
    title: document.getElementById("edit-title").value.trim(),
    instructions: document.getElementById("edit-instructions").value,
    color: document.getElementById("edit-color").value || current.color,
  };
  const res = await fetch(`/api/specialists/${current.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const item = await res.json();
  if (!res.ok) {
    alert(item.detail || "No se pudo guardar");
    return;
  }
  current = { type: "specialist", ...item };
  const idx = specialists.findIndex((s) => s.id === item.id);
  if (idx >= 0) specialists[idx] = item;
  document.getElementById("chat-name").textContent = item.name;
  document.getElementById("chat-title").textContent = item.title || "";
  document.getElementById("chat-dot").innerHTML = buddySvg(item, 42);
  agentModal.classList.add("hidden");
  if (typeof attachBuddyLife === "function") attachBuddyLife();
};

document.getElementById("btn-clear-chat").onclick = async () => {
  if (!current || current.type !== "specialist") return;
  if (!confirm("¿Vaciar este chat? No se borra el agente.")) return;
  const res = await fetch(`/api/specialists/${current.id}/messages`, { method: "DELETE" });
  if (!res.ok) return alert("No se pudo vaciar");
  renderThread([]);
  agentModal.classList.add("hidden");
};

document.getElementById("btn-archive").onclick = async () => {
  if (!current || current.type !== "specialist") return;
  const next = !current.archived;
  const res = await fetch(`/api/specialists/${current.id}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: next }),
  });
  const item = await res.json();
  if (!res.ok) return alert(item.detail || "No se pudo archivar");
  current = { type: "specialist", ...item };
  agentModal.classList.add("hidden");
  closeChat();
};

document.getElementById("btn-delete-agent").onclick = async () => {
  if (!current || current.type !== "specialist") return;
  if (!confirm(`¿Eliminar a ${current.name}? Se borra el chat también.`)) return;
  const res = await fetch(`/api/specialists/${current.id}`, { method: "DELETE" });
  if (!res.ok) return alert("No se pudo eliminar");
  agentModal.classList.add("hidden");
  closeChat();
};

const _renderList = renderList;
renderList = function (filter = "") {
  const q = (filter || "").trim().toLowerCase();
  const match = (text) => !q || text.toLowerCase().includes(q);
  const active = specialists.filter((s) => !s.archived && match(`${s.name} ${s.title}`));
  const stored = specialists.filter((s) => s.archived && match(`${s.name} ${s.title}`));
  const saved = specialists;
  specialists = active;
  _renderList(filter);
  specialists = saved;
  if (stored.length) {
    listEl.insertAdjacentHTML("beforeend", `<div class="section-label">Archivados</div>` + stored.map((s) => `
      <div class="row archived" data-id="${s.id}">
        ${buddySvg(s, 42)}
        <button type="button" class="open-spec" data-open="${s.id}">
          <div class="name">${escapeHtml(s.name)} <span class="badge">${escapeHtml(s.title || "")}</span></div>
          <div class="preview">${escapeHtml(s.last_message || "Sin mensajes")}</div>
        </button>
        <div class="time">${timeLabel(s.last_at)}</div>
        <span></span>
      </div>`).join(""));
  }
  if (typeof attachBuddyLife === "function") attachBuddyLife();
};

const _openChat = openChat;
openChat = async function (id) {
  await _openChat(id);
  document.getElementById("btn-agent-menu").classList.remove("hidden");
};

new MutationObserver((muts) => {
  if (!current) return;
  for (const mut of muts) {
    for (const node of mut.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!node.classList.contains("assistant")) continue;
      const name = current.type === "group" ? (node.querySelector(".sender") || {}).textContent || current.name : current.name;
      pingNotice(name, node.textContent);
    }
  }
}).observe(thread, { childList: true });

if (notifyOn() && "Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}
