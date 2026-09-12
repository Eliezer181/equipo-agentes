const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const modal = document.getElementById("modal");
const thread = document.getElementById("thread");
const input = document.getElementById("input");

let specialists = [];
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

function renderList(filter = "") {
  const q = filter.trim().toLowerCase();
  const rows = specialists.filter((s) => !q || `${s.name} ${s.title}`.toLowerCase().includes(q));
  listEl.innerHTML = rows.map((s) => `
    <button class="row" data-id="${s.id}">
      <div class="dot" style="background:${s.color}">${(s.name || "?").slice(0,1).toUpperCase()}</div>
      <div>
        <div class="name">${s.name} <span class="badge">${s.title || ""}</span></div>
        <div class="preview">${s.last_message || "Sin mensajes"}</div>
      </div>
      <div class="time">${timeLabel(s.last_at)}</div>
    </button>
  `).join("") || `<p class="preview" style="padding:16px">Todavía no hay especialistas.</p>`;
}

function renderThread(messages) {
  thread.innerHTML = (messages || []).map((m) => `<div class="bubble ${m.role}">${escapeHtml(m.content)}</div>`).join("");
  thread.scrollTop = thread.scrollHeight;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadList() {
  specialists = await (await fetch("/api/specialists")).json();
  renderList(searchEl.value);
}

async function openChat(id) {
  current = specialists.find((s) => s.id === id);
  if (!current) return;
  document.getElementById("chat-name").textContent = current.name;
  document.getElementById("chat-title").textContent = current.title || "";
  document.getElementById("chat-dot").style.background = current.color;
  const messages = await (await fetch(`/api/specialists/${id}/messages`)).json();
  renderThread(messages);
  show("chat");
  input.focus();
}

document.getElementById("btn-search").onclick = () => {
  searchEl.classList.toggle("hidden");
  if (!searchEl.classList.contains("hidden")) searchEl.focus();
};
searchEl.oninput = () => renderList(searchEl.value);
document.getElementById("btn-add").onclick = () => modal.classList.remove("hidden");
document.getElementById("btn-cancel").onclick = () => modal.classList.add("hidden");
document.getElementById("btn-back").onclick = () => { show("inbox"); loadList(); };
listEl.onclick = (e) => {
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

document.getElementById("composer").onsubmit = async (e) => {
  e.preventDefault();
  if (!current) return;
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  thread.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHtml(message)}</div>`);
  thread.scrollTop = thread.scrollHeight;
  const res = await fetch(`/api/specialists/${current.id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const payload = await res.json();
  if (!res.ok) {
    thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant">Error: ${escapeHtml(payload.detail || "no se pudo responder")}</div>`);
    return;
  }
  renderThread(payload.messages);
};

loadList();
