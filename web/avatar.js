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

function ringPoint(deg) {
  const a = (deg * Math.PI) / 180;
  return [+(12 + 7.55 * Math.cos(a)).toFixed(2), +(12 - 7.55 * Math.sin(a)).toFixed(2)];
}

function buddyInner(spec) {
  const color = (spec && spec.color) || "#f97316";
  const id = uid(spec);
  const [sx, sy] = ringPoint(52);
  const [ex, ey] = ringPoint(78);
  return `<g class="buddy-face">
    <defs>
      <clipPath id="c${id}"><ellipse cx="12" cy="12.2" rx="6.05" ry="6.05"/></clipPath>
      <linearGradient id="h${id}" x1="22%" y1="8%" x2="78%" y2="92%">
        <stop offset="0%" stop-color="${tint(color, 22)}"/>
        <stop offset="55%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${tint(color, -24)}"/>
      </linearGradient>
      <filter id="g${id}" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="1.15" flood-color="${color}" flood-opacity=".35"/>
      </filter>
    </defs>
    <path class="shell" d="M ${sx} ${sy} A 7.55 7.55 0 1 1 ${ex} ${ey}" fill="none" stroke="url(#h${id})" stroke-width="3.35" stroke-linecap="round" filter="url(#g${id})"/>
    <ellipse class="visor" cx="12" cy="12.15" rx="6.05" ry="5.85" fill="#0a0c10"/>
    <g class="brows" opacity="0">
      <rect class="brow-l" x="7.15" y="9.35" width="3.5" height="0.58" rx="0.28" fill="#f8fafc" transform="rotate(26 8.9 9.64)"/>
      <rect class="brow-r" x="13.35" y="9.35" width="3.5" height="0.58" rx="0.28" fill="#f8fafc" transform="rotate(-26 15.1 9.64)"/>
    </g>
    <g clip-path="url(#c${id})">
      <g class="eyes">
        <ellipse class="eye-led eye-l" cx="9.15" cy="12.55" rx="1.55" ry="2.05" fill="#f8fafc"/>
        <ellipse class="eye-led eye-r" cx="14.85" cy="12.55" rx="1.55" ry="2.05" fill="#f8fafc"/>
      </g>
    </g>
  </g>`;
}

function buddySvg(spec, size) {
  const id = (spec && spec.id) || "x";
  return `<svg class="buddy live" data-id="${id}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${buddyInner(spec)}</svg>`;
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

const BuddyLife = {
  items: new Map(),
  tracking: false,
  px: 0,
  py: 0,
  last: 0,
  lastX: 0,
  lastY: 0,
  lastMove: 0,
  started: false,

  wake() { this.last = performance.now(); },

  attach() {
    document.querySelectorAll("svg.buddy.live").forEach((svg, i) => {
      if (this.items.has(svg)) return;
      const hid = hashId(svg.dataset.id || String(i));
      this.items.set(svg, {
        svg,
        eyes: svg.querySelector(".eyes"),
        visor: svg.querySelector(".visor"),
        brows: svg.querySelector(".brows"),
        blinkIn: 0.35 + (hid % 13) * 0.31 + (i * 0.47),
        moodIn: 1.6 + (hid % 9) * 0.55 + (i * 0.73),
        blinkGap: 2.4 + (hid % 5) * 0.7,
        moodGap: 3.2 + (hid % 4) * 0.9,
        blink: 0,
        mood: "idle",
        angryUntil: 0,
        taps: [],
        status: "ok",
        surprise: 0,
        tx: 0, ty: 0,
        lookMate: 0,
      });
    });
    [...this.items.keys()].forEach((svg) => {
      if (!svg.isConnected) this.items.delete(svg);
    });
  },

  poke(svg) {
    const b = this.items.get(svg);
    if (!b) return;
    const now = performance.now();
    b.taps = (b.taps || []).filter((t) => now - t < 1400);
    b.taps.push(now);
    b.status = "ok";
    this.wake();
    if (b.taps.length > 5) {
      b.mood = "angry";
      b.angryUntil = now + 4000;
      b.taps = [];
    }
  },

  lookAtNew(id) {
    const baby = [...this.items.values()].find((b) => b.svg.dataset.id === id);
    this.items.forEach((b) => {
      if (b === baby) return;
      b.lookMate = 2000;
      b.mate = baby;
      b.status = "ok";
    });
    this.wake();
  },

  talk(on) {
    this.items.forEach((b) => {
      if (b.svg.closest("#chat-dot")) b.status = on ? "talk" : "ok";
    });
    this.wake();
  },

  tick(now) {
    if (!this.started) return;
    const dt = Math.min(40, now - (this._t || now));
    this._t = now;
    const asleep = !this.tracking && now - this.last > 8000;
    [...this.items.values()].forEach((b, i) => {
      if (!b.svg.isConnected) return;
      if (asleep && b.status !== "talk" && b.mood !== "angry") b.status = "sleep";

      b.blinkIn -= dt / 1000;
      if (b.blinkIn <= 0 && b.blink === 0) {
        b.blink = 0.001;
        b.blinkIn = b.blinkGap + Math.random() * 1.4;
      }
      if (b.blink > 0) {
        b.blink += dt / 1000;
        if (b.blink > 0.26) b.blink = 0;
      }

      if (b.angryUntil && now > b.angryUntil) {
        b.mood = "idle";
        b.angryUntil = 0;
      }

      b.moodIn -= dt / 1000;
      if (b.moodIn <= 0 && b.mood !== "angry") {
        b.mood = Math.random() < 0.4 ? "happy" : "idle";
        b.moodIn = b.moodGap + Math.random() * 1.6;
      }

      if (b.surprise > 0) b.surprise -= dt;
      if (b.lookMate > 0) b.lookMate -= dt;

      let close = 0;
      if (b.blink > 0) close = Math.sin(Math.min(b.blink / 0.26, 1) * Math.PI);
      if (b.status === "sleep") close = Math.max(close, 0.78);

      let lookX = 0, lookY = 0;
      const box = b.svg.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      if (b.lookMate > 0 && b.mate && b.mate.svg.isConnected) {
        const m = b.mate.svg.getBoundingClientRect();
        lookX = (m.left - box.left) / 40;
        lookY = (m.top - box.top) / 40;
      } else if (this.tracking && b.status !== "sleep") {
        lookX = (this.px - cx) / (innerWidth * 0.35);
        lookY = (this.py - cy) / (innerHeight * 0.35);
        const mid = innerHeight * 0.5;
        if (Math.abs(this.py - mid) < 48) lookY = cy < mid ? 0.55 : -0.55;
        else if (this.py < mid) lookY = cy > mid ? -0.7 : lookY;
        else lookY = cy < mid ? 0.7 : lookY;
      } else if (b.status !== "sleep") {
        lookX = Math.sin(now / 900 + i * 1.3) * 0.35;
        lookY = Math.sin(now / 1400 + i * 1.7) * 0.18;
      }
      b.tx += (Math.max(-1.1, Math.min(1.1, lookX)) - b.tx) * 0.18;
      b.ty += (Math.max(-0.7, Math.min(0.7, lookY)) - b.ty) * 0.18;
      if (b.eyes) b.eyes.setAttribute("transform", `translate(${b.tx} ${b.ty})`);

      let sx = 1, sy = 1, rot = 0, fill = "";
      if (b.surprise > 0 && b.mood !== "angry") { sx = 1.25; sy = 1.35; }
      else if (b.mood === "happy" && close < 0.25) { sx = 1.45; sy = 0.28; }
      else if (b.mood === "angry" && close < 0.25) { sx = 1.08; sy = 0.48; rot = 26; fill = "#fecaca"; }
      sy = Math.max(0.08, sy * (1 - close));

      b.svg.querySelectorAll(".eye-led").forEach((el, idx) => {
        el.style.transformBox = "fill-box";
        el.style.transformOrigin = "50% 50%";
        const r = rot ? (idx ? -rot : rot) : 0;
        el.style.transform = `scale(${sx}, ${sy}) rotate(${r}deg)`;
        el.style.fill = fill;
      });
      if (b.brows) b.brows.setAttribute("opacity", b.mood === "angry" && close < 0.35 && b.status !== "sleep" ? "1" : "0");

      if (b.visor) {
        if (b.status === "talk") {
          const p = 0.5 + 0.5 * Math.sin(now / 90);
          b.visor.style.fill = `rgb(${20 + p * 40},${80 + p * 80},${180 + p * 40})`;
        } else if (b.status === "sleep") b.visor.style.fill = "#05060a";
        else b.visor.style.fill = "";
      }
      b.svg.classList.toggle("sleep", b.status === "sleep");
      b.svg.classList.toggle("talk", b.status === "talk");
    });
    requestAnimationFrame((t) => this.tick(t));
  },

  start() {
    if (this.started) { this.attach(); return; }
    this.started = true;
    this.wake();
    this.attach();
    const mark = (x, y) => {
      const now = performance.now();
      const dtm = Math.max(8, now - this.lastMove);
      const speed = Math.hypot(x - this.lastX, y - this.lastY) / dtm;
      if (speed > 1.7 && this.lastMove) this.items.forEach((b) => { b.surprise = 900; if (b.status === "sleep") b.status = "ok"; });
      this.lastMove = now; this.lastX = x; this.lastY = y;
      this.tracking = true; this.px = x; this.py = y; this.wake();
      this.items.forEach((b) => { if (b.status === "sleep") b.status = "ok"; });
    };
    window.addEventListener("pointerdown", (e) => {
      mark(e.clientX, e.clientY);
      const svg = e.target.closest && e.target.closest("svg.buddy.live");
      if (svg) {
        this.poke(svg);
        e.stopPropagation();
      }
    }, { passive: true });
    window.addEventListener("pointermove", (e) => mark(e.clientX, e.clientY), { passive: true });
    window.addEventListener("pointerup", () => { this.tracking = false; }, { passive: true });
    requestAnimationFrame((t) => this.tick(t));
  },
};

function attachBuddyLife() {
  BuddyLife.start();
  BuddyLife.attach();
}
