const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const modal = document.getElementById("modal");
const groupModal = document.getElementById("group-modal");
const thread = document.getElementById("thread");
const input = document.getElementById("input");
const deleteGroupBtn = document.getElementById("btn-delete-group");

let specialists = [];
let groups = [];
let current = null; // { type: "specialist" | "group", id, ... }

function show(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
}

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-PY", { hour: "numeric", minute: "2-digit" });
}

function renderList(filter = "") {
  const q = filter.trim().toLowerCase();
  const match = (text) => !q || text.toLowerCase().includes(q);

  const groupRows = groups
    .filter((g) => match(`${g.name} ${g.task} ${g.members.map((m) => m.name).join(" ")}`))
    .map((g) => `
      <button class="row group-row" data-group="${g.id}">
        <div class="dot dot-group">${initials(g.name)}</div>
        <div>
          <div class="name">${g.name} <span class="badge badge-group">grupo · ${g.members.length}</span></div>
          <div class="preview">${escapeHtml(g.last_message || "Sin mensajes")}</div>
        </div>
        <div class="time">${timeLabel(g.last_at)}</div>
      </button>`).join("");

  const specRows = specialists
    .filter((s) => match(`${s.name} ${s.title}`))
    .map((s) => `
      <button class="row" data-id="${s.id}">
        <div class="dot" style="background:${s.color}">${(s.name || "?").slice(0,1).toUpperCase()}</div>
        <div>
          <div class="name">${s.name} <span class="badge">${s.title || ""}</span></div>
          <div class="preview">${escapeHtml(s.last_message || "Sin mensajes")}</div>
        </div>
        <div class="time">${timeLabel(s.last_at)}</div>
      </button>`).join("");

  let html = "";
  if (groupRows) html += `<div class="section-label">Grupos</div>${groupRows}`;
  html += `<div class="section-label">Especialistas</div>`;
  html += specRows || `<p class="preview" style="padding:4px 16px 16px">Todavía no hay especialistas.</p>`;
  if (!groupRows && groups.length === 0) html += `<p class="hint">Para tareas complejas tocá el ícono de equipo ↑ y armá un grupo: varios especialistas conversan contigo juntos y saben que sos el líder.</p>`;
  listEl.innerHTML = html;
}

function initials(name) {
  return (name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
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

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadList() {
  const [sRes, gRes] = await Promise.all([
    fetch("/api/specialists"), fetch("/api/groups"),
  ]);
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
  document.getElementById("chat-dot").style.background = spec.color;
  deleteGroupBtn.classList.add("hidden");
  const messages = await (await fetch(`/api/specialists/${id}/messages`)).json();
  renderThread(messages);
  show("chat");
  input.focus();
}

async function openGroup(id) {
  const group = groups.find((g) => g.id === id);
  if (!group) return;
  const meta = await (await fetch(`/api/groups/${id}/messages`)).json();
  current = { type: "group", ...group };
  document.getElementById("chat-name").textContent = group.name;
  document.getElementById("chat-title").textContent =
    group.members.map((m) => m.name).join(" · ") + (group.task ? " — " + group.task : "");
  document.getElementById("chat-title").classList.add("small-meta");
  const dot = document.getElementById("chat-dot");
  dot.style.background = "linear-gradient(135deg,#6366f1,#22d3ee)";
  dot.classList.remove("dot-group");
  deleteGroupBtn.classList.remove("hidden");
  renderThread(meta);
  show("chat");
  input.focus();
}

function closeChat() {
  show("inbox");
  document.getElementById("chat-title").classList.remove("small-meta");
  deleteGroupBtn.classList.add("hidden");
  loadList();
}

document.getElementById("btn-search").onclick = () => {
  searchEl.classList.toggle("hidden");
  if (!searchEl.classList.contains("hidden")) searchEl.focus();
};
searchEl.oninput = () => renderList(searchEl.value);
document.getElementById("btn-add").onclick = () => modal.classList.remove("hidden");
document.getElementById("btn-cancel").onclick = () => modal.classList.add("hidden");
document.getElementById("btn-back").onclick = closeChat;

listEl.onclick = (e) => {
  const groupRow = e.target.closest("[data-group]");
  if (groupRow) return openGroup(groupRow.dataset.group);
  const row = e.target.closest("[data-id]");
  if (row) openChat(row.dataset.id);
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

// ---- Grupos ----

document.getElementById("btn-add-group").onclick = async () => {
  const box = document.getElementById("group-members");
  box.innerHTML = specialists.length
    ? specialists.map((s) => `
      <label class="member-check">
        <input type="checkbox" name="members" value="${s.id}" />
        <span class="dot mini" style="background:${s.color}"></span> ${s.name} <span class="badge">${s.title || ""}</span>
      </label>`).join("")
    : `<p class="preview">Primero creá especialistas con el botón +</p>`;
  groupModal.classList.remove("hidden");
};
document.getElementById("btn-cancel-group").onclick = () => groupModal.classList.add("hidden");

document.getElementById("create-group").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const members = [...form.getAll("members")];
  const payload = {
    name: form.get("name"),
    task: form.get("task"),
    leader: form.get("leader") || "Renzo",
    members,
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

deleteGroupBtn.onclick = async () => {
  if (!current || current.type !== "group") return;
  if (!confirm(`¿Eliminar el grupo "${current.name}"? Los especialistas no se borran.`)) return;
  await fetch(`/api/groups/${current.id}`, { method: "DELETE" });
  closeChat();
};

// ---- Composer ----

document.getElementById("composer").onsubmit = async (e) => {
  e.preventDefault();
  if (!current) return;
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  const url = current.type === "group"
    ? `/api/groups/${current.id}/chat`
    : `/api/specialists/${current.id}/chat`;
  thread.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(message)}</div>`);
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
        await new Promise((r) => setTimeout(r, 250));
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
