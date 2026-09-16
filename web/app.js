const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const modal = document.getElementById("modal");
const groupModal = document.getElementById("group-modal");
const infoModal = document.getElementById("info-modal");
const agentModal = document.getElementById("agent-modal");
const thread = document.getElementById("thread");
const input = document.getElementById("input");

let specialists = [];
let groups = [];
let current = null;

function show(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
}

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-PY", { hour: "numeric", minute: "2-digit" });
}


const heavyToggle = document.getElementById("heavy-toggle");
const heavyBar = document.getElementById("heavy-bar");
const heavyHint = document.getElementById("heavy-hint");
const toastEl = document.getElementById("toast");
let toastTimer = null;

function syncHeavyUi() {
  const on = !!(heavyToggle && heavyToggle.checked);
  if (heavyBar) heavyBar.classList.toggle("on", on);
  const heavyLabel = document.getElementById("heavy-label");
  if (heavyLabel) heavyLabel.textContent = on ? "Base44" : "Gemini";
  if (heavyHint) heavyHint.textContent = on ? "Respuestas más profundas · usa créditos" : "Más liviano · sin créditos Base44";
}

function showToast(text, kind) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.toggle("heavy", kind === "heavy");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

if (heavyToggle) {
  heavyToggle.addEventListener("change", syncHeavyUi);
  syncHeavyUi();
}

// Convierte markdown mínimo a HTML seguro: imágenes ![alt](url) y links [texto](url)
function renderContent(text) {
  let html = escapeHtml(text);
  const IMG_STYLE = "display:block;max-width:100%;width:100%;height:auto;border-radius:12px;margin:6px 0;border:1px solid rgba(0,0,0,.08);";
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    (m, alt, url) => `<a href="${url}" target="_blank" rel="noopener"><img class="chat-img" style="${IMG_STYLE}" src="${url}" alt="${alt}" loading="lazy" /></a>`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderList(filter = "") {
  const q = filter.trim().toLowerCase();
  const match = (text) => !q || text.toLowerCase().includes(q);

  const groupRows = groups
    .filter((g) => match(`${g.name} ${g.task} ${g.members.map((m) => m.name).join(" ")}`))
    .map((g) => `
      <button class="row group-row" data-group="${g.id}">
        ${packSvg(g.members, 42)}
        <div>
          <div class="name">${escapeHtml(g.name)} <span class="badge badge-group">${g.members.length}</span></div>
          <div class="preview">${escapeHtml(g.last_message || "Sin mensajes")}</div>
        </div>
        <div class="time">${timeLabel(g.last_at)}</div>
      </button>`).join("");

  const active = specialists.filter((s) => !s.archived && match(`${s.name} ${s.title}`));
  const stored = specialists.filter((s) => s.archived && match(`${s.name} ${s.title}`));
  const specRow = (s) => `
      <div class="row${s.archived ? " archived" : ""}" data-id="${s.id}">
        ${buddySvg(s, 42)}
        <button type="button" class="open-spec" data-open="${s.id}">
          <div class="name">${escapeHtml(s.name)} <span class="badge">${escapeHtml(s.title || "")}</span></div>
          <div class="preview">${escapeHtml(s.last_message || "Sin mensajes")}</div>
        </button>
        <div class="time">${timeLabel(s.last_at)}</div>
        ${s.archived ? "<span></span>" : `<button type="button" class="grip" data-grip="${s.id}" aria-label="Mover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>
        </button>`}
      </div>`;

  let html = "";
  if (groupRows) html += `<div class="section-label">Grupos</div>${groupRows}`;
  html += `<div class="section-label">Agentes</div>`;
  html += active.map(specRow).join("") || `<p class="preview" style="padding:8px 16px">Todavía no hay agentes.</p>`;
  if (stored.length) html += `<div class="section-label">Archivados</div>${stored.map(specRow).join("")}`;
  listEl.innerHTML = html || `<div class="empty-inbox"><strong>Tu equipo está vacío</strong><span>Creá un especialista o un grupo para empezar.</span></div>`;
}

function renderThread(messages) {
  if (!current) return;
  if (current.type === "group") {
    thread.innerHTML = (messages || []).map((m) => groupBubble(m)).join("");
  } else {
    thread.innerHTML = (messages || []).map((m) => `<div class="bubble ${m.role}">${renderContent(m.content)}</div>`).join("");
  }
  thread.scrollTop = thread.scrollHeight;
}

function groupBubble(m) {
  if (m.role === "user") {
    return `<div class="bubble user"><div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${escapeHtml(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  return `<div class="bubble assistant"><div class="sender" style="color:${color}">${escapeHtml(m.sender)}</div>${renderContent(m.content)}</div>`;
}

async function loadList() {
  const [sRes, gRes] = await Promise.all([fetch("/api/specialists"), fetch("/api/groups")]);
  specialists = await sRes.json();
  groups = await gRes.json();
  renderList(searchEl.value);
}

async function openChat(id) {
  const spec = specialists.find((s) => s.id === id);
  if (!spec) return;
  current = { type: "specialist", ...spec };
  document.getElementById("chat-name").textContent = spec.name;
  document.getElementById("chat-title").textContent = spec.title || "";
  document.getElementById("chat-title").classList.remove("small-meta");
  document.getElementById("chat-dot").innerHTML = buddySvg(spec, 42);
  const messages = await (await fetch(`/api/specialists/${id}/messages`)).json();
  renderThread(messages);
  show("chat");
}

async function openGroup(id) {
  const group = groups.find((g) => g.id === id) || (await refreshGroup(id));
  if (!group) return;
  const meta = await (await fetch(`/api/groups/${id}/messages`)).json();
  current = { type: "group", ...group };
  document.getElementById("chat-name").textContent = group.name;
  document.getElementById("chat-title").textContent = `${group.members.length} integrantes`;
  document.getElementById("chat-title").classList.add("small-meta");
  document.getElementById("chat-dot").innerHTML = packSvg(group.members, 42);
  renderThread(meta);
  show("chat");
}

async function refreshGroup(id) {
  groups = await (await fetch("/api/groups")).json();
  return groups.find((g) => g.id === id);
}

function closeChat() {
  show("inbox");
  infoModal.classList.add("hidden");
  if (agentModal) agentModal.classList.add("hidden");
  
(function setupSecretAdmin() {
  const btn = document.getElementById("btn-admin-secret");
  if (!btn) return;
  let timer = null;
  const go = () => { window.location.href = "/admin/base44"; };
  const start = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    timer = setTimeout(go, 900);
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener("mousedown", start);
  btn.addEventListener("touchstart", start, { passive: true });
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) => btn.addEventListener(ev, cancel));
})();

loadList();
}

function openGroupInfo() {
  if (!current || current.type !== "group") return;
  document.getElementById("info-name").textContent = current.name;
  document.getElementById("info-task").textContent = current.task || "Sin objetivo definido";
  const canKick = (current.members || []).length > 1;
  document.getElementById("info-members").innerHTML = (current.members || []).map((m) => `
    <div class="info-row">
      ${buddySvg(m, 36)}
      <div>
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="preview">${escapeHtml(m.title || "Agente")}</div>
      </div>
      ${canKick ? `<button type="button" class="kick" data-kick="${m.id}">Quitar</button>` : ""}
    </div>`).join("");
  infoModal.classList.remove("hidden");
}

function openAgentSheet() {
  if (!current || current.type !== "specialist" || !agentModal) return;
  document.getElementById("edit-name").value = current.name || "";
  document.getElementById("edit-title").value = current.title || "";
  document.getElementById("edit-instructions").value = current.instructions || "";
  document.getElementById("edit-color").value = current.color || "";
  const box = document.getElementById("notify-toggle");
  if (box) box.checked = localStorage.getItem("equipo-notify") !== "off";
  const pal = document.getElementById("edit-palette");
  const colors = (typeof PALETTE !== "undefined" && PALETTE) || ["#f97316", "#38bdf8", "#34d399", "#a78bfa", "#fb7185", "#facc15"];
  pal.innerHTML = colors.map((c) =>
    `<button type="button" data-color="${c}" style="background:${c}" class="${(current.color || "").toLowerCase() === c.toLowerCase() ? "on" : ""}"></button>`
  ).join("");
  document.getElementById("btn-archive").textContent = current.archived ? "Desarchivar" : "Archivar";
  agentModal.classList.remove("hidden");
}

document.getElementById("btn-search").onclick = () => {
  searchEl.classList.toggle("hidden");
  if (!searchEl.classList.contains("hidden")) searchEl.focus();
};
searchEl.oninput = () => renderList(searchEl.value);
document.getElementById("btn-add").onclick = () => modal.classList.remove("hidden");
document.getElementById("btn-cancel").onclick = () => modal.classList.add("hidden");
document.getElementById("btn-back").onclick = closeChat;
document.getElementById("btn-close-info").onclick = () => infoModal.classList.add("hidden");

document.getElementById("chat-who").addEventListener("click", (e) => {
  e.preventDefault();
  if (!current) return;
  if (current.type === "specialist") openAgentSheet();
  else openGroupInfo();
});

const menuBtn = document.getElementById("btn-agent-menu");
if (menuBtn) {
  menuBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!current) return;
    if (current.type === "specialist") openAgentSheet();
    else openGroupInfo();
  });
}

if (agentModal) {
  document.getElementById("edit-palette").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]");
    if (!b) return;
    document.getElementById("edit-color").value = b.dataset.color;
    document.querySelectorAll("#edit-palette button").forEach((x) => x.classList.toggle("on", x === b));
  });
  document.getElementById("btn-close-agent").onclick = () => agentModal.classList.add("hidden");
  document.getElementById("notify-toggle").onchange = (e) => {
    localStorage.setItem("equipo-notify", e.target.checked ? "on" : "off");
    if (e.target.checked && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };
  document.getElementById("edit-agent").onsubmit = async (e) => {
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
    if (!res.ok) return alert(item.detail || "No se pudo guardar");
    current = { type: "specialist", ...item };
    const idx = specialists.findIndex((s) => s.id === item.id);
    if (idx >= 0) specialists[idx] = item;
    document.getElementById("chat-name").textContent = item.name;
    document.getElementById("chat-title").textContent = item.title || "";
    document.getElementById("chat-dot").innerHTML = buddySvg(item, 42);
    agentModal.classList.add("hidden");
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
    const res = await fetch(`/api/specialists/${current.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !current.archived }),
    });
    const item = await res.json();
    if (!res.ok) return alert(item.detail || "No se pudo archivar");
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
}

listEl.onclick = (e) => {
  if (e.target.closest("[data-grip]")) return;
  const groupRow = e.target.closest("[data-group]");
  if (groupRow) return openGroup(groupRow.dataset.group);
  const open = e.target.closest("[data-open]");
  if (open) return openChat(open.dataset.open);
};

document.getElementById("create").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const created = await (await fetch("/api/specialists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })).json();
  modal.classList.add("hidden");
  e.target.reset();
  await loadList();
  openChat(created.id);
};

document.getElementById("btn-add-group").onclick = async () => {
  const box = document.getElementById("group-members");
  box.innerHTML = specialists.length
    ? specialists.map((s) => `
      <label class="member-check">
        <input type="checkbox" name="members" value="${s.id}" />
        ${buddySvg(s, 22)}
        ${escapeHtml(s.name)}
      </label>`).join("")
    : `<p class="preview">Primero creá un agente con +</p>`;
  groupModal.classList.remove("hidden");
};
document.getElementById("btn-cancel-group").onclick = () => groupModal.classList.add("hidden");

document.getElementById("create-group").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = {
    name: form.get("name"),
    task: form.get("task"),
    leader: form.get("leader") || "Renzo",
    members: [...form.getAll("members")],
  };
  const res = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const created = await res.json();
  groupModal.classList.add("hidden");
  e.target.reset();
  if (!res.ok) {
    alert(created.detail || "No se pudo crear el grupo");
    return;
  }
  await loadList();
  openGroup(created.id);
};

document.getElementById("info-members").onclick = async (e) => {
  const btn = e.target.closest("[data-kick]");
  if (!btn || !current || current.type !== "group") return;
  const name = (current.members.find((m) => m.id === btn.dataset.kick) || {}).name || "este agente";
  if (!confirm(`¿Sacar a ${name} del grupo?`)) return;
  const res = await fetch(`/api/groups/${current.id}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: btn.dataset.kick }),
  });
  const payload = await res.json();
  if (!res.ok) {
    alert(payload.detail || "No se pudo sacar");
    return;
  }
  const fresh = await refreshGroup(current.id);
  current = { type: "group", ...fresh };
  document.getElementById("chat-title").textContent = `${current.members.length} integrantes`;
  openGroupInfo();
};

document.getElementById("btn-delete-group").onclick = async () => {
  if (!current || current.type !== "group") return;
  if (!confirm(`¿Borrar el grupo "${current.name}"? Los agentes siguen.`)) return;
  await fetch(`/api/groups/${current.id}`, { method: "DELETE" });
  infoModal.classList.add("hidden");
  closeChat();
};

let dragId = null;
listEl.addEventListener("pointerdown", (e) => {
  const grip = e.target.closest("[data-grip]");
  if (!grip) return;
  dragId = grip.dataset.grip;
  const row = grip.closest("[data-id]");
  if (row) row.classList.add("dragging");
  grip.setPointerCapture(e.pointerId);
});
listEl.addEventListener("pointermove", (e) => {
  if (!dragId) return;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const row = over && over.closest("#list [data-id]");
  if (!row || row.dataset.id === dragId) return;
  const dragging = listEl.querySelector(`[data-id="${dragId}"]`);
  if (!dragging) return;
  const rect = row.getBoundingClientRect();
  if (e.clientY < rect.top + rect.height / 2) row.before(dragging);
  else row.after(dragging);
});
listEl.addEventListener("pointerup", async () => {
  if (!dragId) return;
  const ids = [...listEl.querySelectorAll(".row[data-id]")].map((el) => el.dataset.id);
  dragId = null;
  listEl.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  specialists = await (await fetch("/api/specialists/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })).json();
  renderList(searchEl.value);
});

document.getElementById("composer").onsubmit = async (e) => {
  e.preventDefault();
  if (!current) return;
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  const url = current.type === "group"
    ? `/api/groups/${current.id}/chat`
    : `/api/specialists/${current.id}/chat`;
  thread.insertAdjacentHTML("beforeend", current.type === "group"
    ? groupBubble({ role: "user", content: message })
    : `<div class="bubble user">${escapeHtml(message)}</div>`);
  if (current.type === "group") {
    thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant thinking" id="thinking"><div class="sender">El equipo está trabajando…</div></div>`);
  }
  thread.scrollTop = thread.scrollHeight;
  const sendBtn = e.target.querySelector("button[type=submit]");
  sendBtn.disabled = true;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        provider: (heavyToggle && heavyToggle.checked) ? "base44" : "gemini",
      }),
    });
    const payload = await res.json();
    if (res.status === 402 || payload.error_code === "credits_exhausted" || (payload.detail && payload.detail.error_code === "credits_exhausted")) {
      location.href = "/paywall";
      return;
    }
    if (!res.ok) {
      const detail = typeof payload.detail === "string" ? payload.detail : (payload.detail && payload.detail.message) || "no se pudo responder";
      thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant">Error: ${escapeHtml(detail)}</div>`);
      return;
    }
    if (payload.provider === "gemini_fallback") {
      showToast("Base44 falló · seguimos con Gemini.");
    }
    if (current.type === "group") {
      const thinking = document.getElementById("thinking");
      if (thinking) thinking.remove();
      for (const reply of payload.replies || []) {
        thread.insertAdjacentHTML("beforeend", groupBubble(reply));
        thread.scrollTop = thread.scrollHeight;
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      renderThread(payload.messages);
    }
  } finally {
    sendBtn.disabled = false;
    const thinking = document.getElementById("thinking");
    if (thinking) thinking.remove();
  }
};

loadList();
