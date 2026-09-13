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

function buddySvg(spec, size) {
  const color = (spec && spec.color) || "#f97316";
  const shape = shapeOf(spec);
  const delay = (hashId(spec && spec.id) % 7) * 0.45;
  const wink = hashId(spec && spec.id) % 2 === 0 ? "wink-left" : "wink-right";
  return `<svg class="buddy ${wink}" viewBox="0 0 24 24" width="${size}" height="${size}" style="--blink:${delay}s" aria-hidden="true">
    <path fill="${color}" d="${BODY[shape]}"/>
    <ellipse class="eye eye-l" cx="9.2" cy="11.2" rx="1.35" ry="1.7"/>
    <ellipse class="eye eye-r" cx="14.8" cy="11.2" rx="1.35" ry="1.7"/>
    <path class="mouth" d="M10 14.7c.7 1.1 3.3 1.1 4 0" fill="none" stroke="#171717" stroke-width="1.15" stroke-linecap="round"/>
  </svg>`;
}

function packSvg(members, size) {
  const list = (members || []).slice(0, 4);
  if (!list.length) {
    return buddySvg({ id: "grupo", color: "#6366f1", shape: "blob" }, size);
  }
  const spots = [
    [1, 2, 14],
    [11, 1, 13],
    [2, 11, 12],
    [12, 12, 11],
  ];
  const bits = list.map((m, i) => {
    const [x, y, s] = spots[i];
    return `<g transform="translate(${x} ${y}) scale(${s / 24})">${buddySvg(m, 24)}</g>`;
  }).join("");
  return `<svg class="buddy pack" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${bits}</svg>`;
}
