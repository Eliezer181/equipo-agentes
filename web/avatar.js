const SHAPES = ["hex", "drop", "cloud", "circle", "blob", "squircle"];
const BODY = {
  hex: "M12 2.2 20.4 7v10L12 21.8 3.6 17V7Z",
  drop: "M12 2.4C12 2.4 5.2 10.2 5.2 15a6.8 6.8 0 0 0 13.6 0C18.8 10.2 12 2.4 12 2.4Z",
  cloud: "M8 10.2a3.6 3.6 0 0 1 3.3-2.4 4.2 4.2 0 0 1 4.2 3.4A3.4 3.4 0 0 1 18.6 17H6.6A3.3 3.3 0 0 1 8 10.2Z",
  circle: "M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6Z",
  blob: "M8.2 5.4c2.4-2 6.4-2.2 8.8.2 2.2 2.2 2.4 5.6.8 8.2-1.4 2.2-1 4.6-3.2 5.8-2.6 1.4-6 .6-8-1.4-2.2-2.2-2.8-5.8-1.6-8.4 1-2.2 1.4-3.2 3.2-4.4Z",
  squircle: "M7 3.4h10c2.4 0 3.6 1.2 3.6 3.6v10c0 2.4-1.2 3.6-3.6 3.6H7c-2.4 0-3.6-1.2-3.6-3.6V7c0-2.4 1.2-3.6 3.6-3.6Z",
};

function hashId(id) {
  let h = 0;
  for (const ch of String(id || "x")) h = (h + ch.charCodeAt(0) * 17) % 997;
  return h;
}

function shapeOf(spec) {
  if (spec && spec.shape && BODY[spec.shape]) return spec.shape;
  return SHAPES[hashId(spec && spec.id) % SHAPES.length];
}

function tint(hex, amt) {
  const n = hex.replace("#", "");
  const v = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (v & 255) + amt));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function uid(spec) {
  return String(spec && spec.id || "x").replace(/[^a-zA-Z0-9_-]/g, "") + hashId(spec && spec.id);
}

function buddyInner(spec) {
  const color = (spec && spec.color) || "#f97316";
  const shape = shapeOf(spec);
  const id = uid(spec);
  const delay = (hashId(spec && spec.id) % 7) * 0.45;
  const wink = hashId(spec && spec.id) % 2 === 0 ? "wink-left" : "wink-right";
  return `<g class="buddy-face ${wink}" style="--blink:${delay}s">
    <defs>
      <radialGradient id="g${id}" cx="32%" cy="28%" r="78%">
        <stop offset="0%" stop-color="${tint(color, 70)}"/>
        <stop offset="42%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${tint(color, -55)}"/>
      </radialGradient>
      <filter id="s${id}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.1" stdDeviation="0.7" flood-color="#000" flood-opacity=".45"/>
      </filter>
    </defs>
    <path fill="${tint(color, -70)}" d="${BODY[shape]}" transform="translate(0 0.7)" opacity=".35"/>
    <path fill="url(#g${id})" filter="url(#s${id})" d="${BODY[shape]}"/>
    <ellipse fill="#fff" opacity=".28" cx="8.4" cy="7.6" rx="3.2" ry="2.1"/>
    <g class="eyes">
      <ellipse class="eye-white" cx="9.1" cy="11.15" rx="1.85" ry="2.15" fill="#fff"/>
      <ellipse class="eye eye-l" cx="9.25" cy="11.35" rx="1.15" ry="1.45"/>
      <circle cx="9.7" cy="10.7" r=".35" fill="#fff"/>
      <ellipse class="eye-white" cx="14.9" cy="11.15" rx="1.85" ry="2.15" fill="#fff"/>
      <ellipse class="eye eye-r" cx="14.75" cy="11.35" rx="1.15" ry="1.45"/>
      <circle cx="15.2" cy="10.7" r=".35" fill="#fff"/>
    </g>
    <path class="mouth" d="M10.1 14.85c.7 1.25 3.1 1.25 3.8 0" fill="none" stroke="#3f1f14" stroke-width="1.05" stroke-linecap="round"/>
  </g>`;
}

function buddySvg(spec, size) {
  return `<svg class="buddy" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${buddyInner(spec)}</svg>`;
}

function packSvg(members, size) {
  const list = (members || []).slice(0, 4);
  if (!list.length) return buddySvg({ id: "grupo", color: "#6366f1", shape: "blob" }, size);
  const spots = [[1, 2, 0.58], [11, 1, 0.54], [2, 11, 0.5], [12, 12, 0.46]];
  const bits = list.map((m, i) => {
    const [x, y, s] = spots[i];
    return `<g transform="translate(${x} ${y}) scale(${s})">${buddyInner(m)}</g>`;
  }).join("");
  return `<svg class="buddy pack" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${bits}</svg>`;
}
