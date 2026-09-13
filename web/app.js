const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const modal = document.getElementById("modal");
const groupModal = document.getElementById("group-modal");
const infoModal = document.getElementById("info-modal");
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

  const specRows = specialists
    .filter((s) => match(`${s.name} ${s.title}`))
    .map((s) => `
      <div class="row" data-id="${s.id}">
        ${buddySvg(s, 42)}
        <button type="button" class="open-spec" data-open="${s.id}">
          <div class="name">${escapeHtml(s.name)} <span class="badge">${escapeHtml(s.title || "")}</span></div>
          <div class="preview">${escapeHtml(s.last_message || "Sin mensajes")}</div>
        </button>
        <div class="time">${timeLabel(s.last_at)}</div>
        <button type="button" class="grip" data-grip="${s.id}" aria-label="Mover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>
        </button>
      </div>`).join("");

  let html = "";
  if (groupRows) html += `<div class="section-label">Grupos</div>${groupRows}`;
  html += `<div class="section-label">Agentes</div>`;
  html += specRows || `<p class="preview" style="padding:8px 16px">Todavía no hay agentes.</p>`;
  listEl.innerHTML = html;
}

function renderThread(messages) {
  if (!current) return;
  if (current.type === "group") {
    thread.innerHTML = (messages || []).map((m) => groupBubble(m)).join("");
  } else {
    thread.innerHTML = (messages || []).map((m) => `<div class="bubble ${m.role}">${escapeHtml(m.content)}</div>`).join("");
  }
  thread.scrollTop = thread.scrollHeight;
}

function groupBubble(m) {
  if (m.role === "user") {
    return `<div class="bubble user"><div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${escapeHtml(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  return `<div class="bubble assistant"><div class="sender" style="color:${color}">${escapeHtml(m.sender)}</div>${escapeHtml(m.content)}</div>`;
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

document.getElementById("btn-search").onclick = () => {
  searchEl.classList.toggle("hidden");
  if (!searchEl.classList.contains("hidden")) searchEl.focus();
};
searchEl.oninput = () => renderList(searchEl.value);
document.getElementById("btn-add").onclick = () => modal.classList.remove("hidden");
document.getElementById("btn-cancel").onclick = () => modal.classList.add("hidden");
document.getElementById("btn-back").onclick = closeChat;
document.getElementById("btn-close-info").onclick = () => infoModal.classList.add("hidden");

document.getElementById("chat-who").onclick = () => {
  if (current && current.type === "group") openGroupInfo();
};

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
      body: JSON.stringify({ message }),
    });
    const payload = await res.json();
    if (!res.ok) {
      thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant">Error: ${escapeHtml(payload.detail || "no se pudo responder")}</div>`);
      return;
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
