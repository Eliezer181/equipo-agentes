const PALETTE = [
  "#f3ead8", "#f97316", "#38bdf8", "#34d399", "#a78bfa",
  "#fb7185", "#facc15", "#22d3ee", "#818cf8", "#fb923c",
];

function nextFreeColor(used) {
  const set = new Set((used || []).map((c) => String(c || "").toLowerCase()));
  return PALETTE.find((c) => !set.has(c.toLowerCase())) || PALETTE[(used || []).length % PALETTE.length];
}

function hashId(id) {
  let h = 0;
  for (const ch of String(id || "x")) h = (h + ch.charCodeAt(0) * 17) % 997;
  return h;
}

function tint(hex, amt) {
  const n = String(hex || "#f3ead8").replace("#", "");
  const v = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (v & 255) + amt));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function uid(spec) {
  return String((spec && spec.id) || "x").replace(/[^a-zA-Z0-9_-]/g, "") + hashId(spec && spec.id);
}

function buddyInner(spec) {
  const color = (spec && spec.color) || "#f3ead8";
  const id = uid(spec);
  const delay = (hashId(spec && spec.id) % 7) * 0.45;
  return `<g class="buddy-face" style="--blink:${delay}s">
    <defs>
      <clipPath id="c${id}"><ellipse cx="12" cy="11.7" rx="5.9" ry="4.8"/></clipPath>
      <radialGradient id="h${id}" cx="34%" cy="26%" r="78%">
        <stop offset="0%" stop-color="${tint(color, 55)}"/>
        <stop offset="55%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${tint(color, -45)}"/>
      </radialGradient>
      <radialGradient id="v${id}" cx="40%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#2a3348"/>
        <stop offset="100%" stop-color="#05070d"/>
      </radialGradient>
      <radialGradient id="e${id}" cx="32%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#e0f2fe"/>
        <stop offset="45%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#0369a1"/>
      </radialGradient>
    </defs>
    <ellipse cx="12" cy="12" rx="8.4" ry="8.8" fill="url(#h${id})"/>
    <ellipse cx="12" cy="11.7" rx="6.1" ry="5" fill="url(#v${id})"/>
    <g clip-path="url(#c${id})">
      <g class="eyes">
        <ellipse class="eye-led" cx="9.55" cy="12.15" rx="1.4" ry="1.65" fill="url(#e${id})"/>
        <ellipse class="eye-led" cx="14.45" cy="12.15" rx="1.4" ry="1.65" fill="url(#e${id})"/>
      </g>
      <ellipse cx="9.7" cy="9.7" rx="2.3" ry=".65" fill="#fff" opacity=".16"/>
    </g>
  </g>`;
}

function buddySvg(spec, size) {
  return `<svg class="buddy" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${buddyInner(spec)}</svg>`;
}

function packSvg(members, size) {
  const list = (members || []).slice(0, 4);
  if (!list.length) return buddySvg({ id: "grupo", color: "#818cf8" }, size);
  const spots = [[1, 2, 0.58], [11, 1, 0.54], [2, 11, 0.5], [12, 12, 0.46]];
  const bits = list.map((m, i) => {
    const [x, y, s] = spots[i];
    return `<g transform="translate(${x} ${y}) scale(${s})">${buddyInner(m)}</g>`;
  }).join("");
  return `<svg class="buddy pack" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${bits}</svg>`;
}
