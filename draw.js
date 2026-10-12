import { rng } from './world.js';

// Draws one structure or plant standing at (x, y) on the ground, `s` px tall-ish.
// Shapes are in local units (ground at 0, up is negative) and filled as silhouettes.
export function drawThing(g, t, x, y, s, o) {
  const r = rng(t.seed);
  const neon = o.style === 'neon';
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.fillStyle = o.color;
  if (neon) { g.strokeStyle = o.accent; g.lineWidth = 1.5 * devicePixelRatio / s; g.shadowColor = o.accent; g.shadowBlur = 8; }
  if (t.broken) {
    // Ruins: jagged clip so everything above a broken line is gone.
    g.beginPath(); g.moveTo(-3, 1);
    for (let k = -3; k <= 3; k += 0.25) g.lineTo(k, -0.3 - r() * 0.9);
    g.lineTo(3, 1); g.clip();
  }
  const f = () => { g.fill(); if (neon) g.stroke(); };
  const P = (...pts) => { g.beginPath(); for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); f(); };
  const R = (a, b, w, h) => { g.beginPath(); g.rect(a, b, w, h); f(); };
  const C = (a, b, rad) => { g.beginPath(); g.arc(a, b, rad, 0, 7); f(); };
  const lit = o.lights && !t.broken;
  const windows = (a, b, w, h, cols, rows) => {
    if (!lit) return;
    g.save(); g.shadowBlur = 0; g.fillStyle = o.light; g.globalAlpha = o.night ? 1 : 0.35;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
      if (r() < 0.55) g.fillRect(a + (i + 0.3) * w / cols, b + (j + 0.3) * h / rows, 0.4 * w / cols, 0.4 * h / rows);
    g.restore();
  };
  const beacon = (a, b, rad, color) => {
    if (!lit || Math.sin(o.t / 400 + t.seed) < 0) return;
    g.save(); g.fillStyle = g.shadowColor = color; g.shadowBlur = 10; g.beginPath(); g.arc(a, b, rad, 0, 7); g.fill(); g.restore();
  };

  switch (t.kind) {
    case 'pyramid': P(-0.9, 0, 0, -1, 0.9, 0); break;
    case 'temple':
      R(-0.85, -0.12, 1.7, 0.12);
      for (let i = 0; i < 5; i++) R(-0.72 + i * 0.35, -0.75, 0.1, 0.63);
      R(-0.9, -0.87, 1.8, 0.12); P(-0.9, -0.87, 0, -1.1, 0.9, -0.87); break;
    case 'obelisk': P(-0.1, 0, -0.07, -1.4, 0, -1.55, 0.07, -1.4, 0.1, 0); break;
    case 'castle':
      R(-1, -0.6, 2, 0.6); R(-0.35, -1.2, 0.7, 0.6);
      if (r() < 0.5) { R(-1.1, -0.95, 0.35, 0.95); P(-1.15, -0.95, -0.925, -1.3, -0.7, -0.95); }
      if (r() < 0.5) { R(0, -1.75, 0.02, 0.55); P(0.02, -1.75, 0.3, -1.65, 0.02, -1.55); }
      for (let i = 0; i < 10; i++) R(-1 + i * 0.2, -0.7, 0.1, 0.1);
      for (let i = 0; i < 4; i++) R(-0.35 + i * 0.2, -1.32, 0.1, 0.12);
      windows(-0.3, -1.15, 0.6, 0.5, 2, 2); break;
    case 'house': {
      const w = 0.6 + r() * 0.6, h = 0.35 + r() * 0.3;
      R(-w / 2, -h, w, h);
      if (r() < 0.6) P(-w / 2 - 0.1, -h, 0, -h - 0.35, w / 2 + 0.1, -h); else R(-w / 2 - 0.05, -h - 0.06, w + 0.1, 0.06);
      if (r() < 0.4) R(w / 4, -h - 0.35, 0.08, 0.25);
      windows(-w / 2 + 0.05, -h + 0.05, w - 0.1, h - 0.1, Math.round(w * 3), 1); break;
    }
    case 'windmill': {
      P(-0.25, 0, -0.15, -0.9, 0.15, -0.9, 0.25, 0);
      g.save(); g.translate(0, -0.9); g.rotate(o.t / 3000 + t.seed);
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); R(-0.04, 0, 0.08, 0.65); }
      g.restore(); break;
    }
    case 'factory':
      R(-0.8, -0.45, 1.6, 0.45); P(-0.8, -0.45, -0.8, -0.65, -0.4, -0.45, -0.4, -0.65, 0, -0.45, 0, -0.65, 0.3, -0.45);
      R(0.3, -1.3, 0.13, 0.85); R(0.6, -1.05, 0.13, 0.6);
      windows(-0.75, -0.35, 1.5, 0.2, 6, 1);
      if (!t.broken) {
        g.save(); g.globalAlpha = 0.25; g.shadowBlur = 0; g.fillStyle = '#bbb';
        for (let i = 0; i < 6; i++) { const p = (o.t / 4000 + i / 6) % 1; g.beginPath(); g.arc(0.36 + p * 0.8, -1.35 - p * 1.2, 0.08 + p * 0.25, 0, 7); g.fill(); }
        g.restore();
      }
      break;
    case 'block': {
      const h = 1 + r() * 1.3, w = 0.45 + r() * 0.3;
      R(-w / 2, -h, w, h); windows(-w / 2, -h, w, h, 3, Math.round(h * 6)); break;
    }
    case 'antenna':
      P(-0.18, 0, -0.02, -1.6, 0.02, -1.6, 0.18, 0); beacon(0, -1.62, 0.05, '#f33'); break;
    case 'tower': {
      const h = 1.5 + r() * 1.2;
      P(-0.22, 0, -0.07, -h, 0.07, -h, 0.22, 0);
      for (let k = 1 + Math.floor(r() * 3); k--;) { g.beginPath(); g.ellipse(0, -h * (0.5 + r() * 0.35), 0.2 + r() * 0.3, 0.07, 0, 0, 7); f(); }
      R(-0.01, -h - 0.5, 0.02, 0.5); windows(-0.12, -h * 0.75, 0.24, h * 0.7, 1, Math.round(h * 5)); beacon(0, -h - 0.5, 0.05, o.accent); break;
    }
    case 'dome':
      for (let k = Math.floor(r() * 3); k--;) { g.beginPath(); g.arc((r() - 0.5) * 1.6, 0, 0.2 + r() * 0.2, Math.PI, 0); f(); }
      g.beginPath(); g.arc(0, 0, 0.6, Math.PI, 0); f(); R(-0.02, -0.95, 0.04, 0.4);
      windows(-0.45, -0.3, 0.9, 0.15, 5, 1); beacon(0, -0.96, 0.04, o.accent); break;
    case 'arch':
      g.beginPath(); g.arc(0, 0.2, 3, Math.PI, 0); g.arc(0, 0.2, 2.8, 0, Math.PI, true); f(); break;
    case 'spire':
      g.beginPath(); g.moveTo(-0.25, 0); g.quadraticCurveTo(-0.1, -1, 0.15, -1.8);
      g.quadraticCurveTo(0.05, -0.9, 0.25, 0); f(); beacon(0.15, -1.8, 0.05, o.accent); break;
    case 'orb':
      R(-0.03, -1, 0.06, 1);
      if (lit) { g.fillStyle = g.shadowColor = o.accent; g.shadowBlur = 15; g.globalAlpha = 0.8 + 0.2 * Math.sin(o.t / 700 + t.seed); }
      C(0, -1.2, 0.25); break;
    case 'pods':
      for (let i = 0; i < 4; i++) C(-0.5 + r(), -0.15 - r() * 0.3, 0.15 + r() * 0.25); break;
    case 'portal':
      R(-0.75, -0.25, 0.25, 0.25); R(0.5, -0.25, 0.25, 0.25);
      g.save(); g.fillStyle = g.strokeStyle = g.shadowColor = o.accent; g.shadowBlur = 20;
      g.globalAlpha = 0.2 + 0.1 * Math.sin(o.t / 500); g.beginPath(); g.ellipse(0, -1.1, 0.5, 0.8, 0, 0, 7); g.fill();
      g.globalAlpha = 1; g.lineWidth = 0.1; g.beginPath(); g.ellipse(0, -1.1, 0.6, 0.9, 0, 0, 7); g.stroke(); g.restore(); break;
    case 'monolith':
      g.fillStyle = '#050505'; g.strokeStyle = '#fff3'; g.lineWidth = 0.02; R(-0.18, -1.7, 0.36, 1.7); g.stroke(); break;
    case 'skeleton':
      g.strokeStyle = g.fillStyle = '#e8e0d0'; g.globalAlpha = 0.85; g.lineWidth = 0.06;
      g.beginPath(); g.moveTo(-1.6, -0.05); g.lineTo(0.9, -0.45); g.stroke();
      for (let i = 0; i < 7; i++) { const x = -1 + i * 0.27; g.beginPath(); g.ellipse(x, -0.05, 0.13, 0.5 - Math.abs(i - 3) * 0.06, 0, Math.PI, 0); g.stroke(); }
      g.beginPath(); g.ellipse(1.1, -0.45, 0.25, 0.15, -0.3, 0, 7); g.fill(); break;
    case 'beacon': { // a colonist's flag: pole, waving pennant, light
      R(-0.03, -2, 0.06, 2);
      g.save(); g.fillStyle = g.shadowColor = o.accent; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(0.03, -2);
      for (let k = 0; k <= 10; k++) g.lineTo(0.03 + k * 0.08, -1.95 + Math.sin(o.t / 300 + k * 0.7) * 0.05 * k / 10 + k * 0.012);
      for (let k = 10; k >= 0; k--) g.lineTo(0.03 + k * 0.08, -1.6 + Math.sin(o.t / 300 + k * 0.7) * 0.05 * k / 10);
      g.fill(); g.globalAlpha = 0.5 + 0.5 * Math.sin(o.t / 500);
      g.beginPath(); g.arc(0, -2.05, 0.07, 0, 7); g.fill(); g.restore(); break;
    }
    case 'forest':
      R(-0.05, -0.5, 0.1, 0.5); C(0, -0.75, 0.32); C(-0.22, -0.55, 0.22); C(0.22, -0.55, 0.22); break;
    case 'conifers': P(-0.3, 0, 0, -1.3, 0.3, 0); break;
    case 'crystals':
      g.fillStyle = o.accent; g.globalAlpha = 0.75; g.shadowColor = o.accent; g.shadowBlur = 12;
      for (let i = 0; i < 3; i++) { const a = -0.3 + i * 0.3, h = 0.5 + r() * 0.9; P(a - 0.1, 0, a - 0.05, -h, a + 0.02, -h - 0.15, a + 0.1, 0); }
      break;
    case 'mushrooms':
      R(-0.06, -0.6, 0.12, 0.6);
      g.fillStyle = o.accent; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(0, -0.6, 0.4, 0.28, 0, Math.PI, 0); f(); break;
  }
  g.restore();
}

// Creatures, drawn facing their direction of travel. `o.t` drives gait / flapping.
export function drawCreature(g, c, x, y, s, o) {
  const r = rng(c.seed), ph = r() * 7, t = o.t;
  const neon = o.style === 'neon';
  g.save();
  g.translate(x, y); g.scale(c.speed < 0 ? -s : s, s);
  g.fillStyle = g.strokeStyle = o.color; g.lineCap = 'round';
  if (neon) { g.strokeStyle = g.shadowColor = o.accent; g.shadowBlur = 8; }
  const swing = Math.sin(t / 220 + ph);
  const leg = (a, b, len, w, k) => { g.lineWidth = w; g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.sin(t / 220 + ph + k) * len * 0.35, b + len); g.stroke(); };
  const E = (a, b, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(a, b, rx, ry, rot, 0, 7); g.fill(); if (neon) { g.lineWidth = 1.5 * devicePixelRatio / s; g.stroke(); } };
  if (!neon) g.strokeStyle = o.color;

  switch (c.kind) {
    case 'flock':
      g.strokeStyle = o.bird; g.lineWidth = 0.25;
      for (let i = 0; i < 3 + r() * 7; i++) {
        const bx = -i * (1.5 + r() * 2), by = (r() - 0.5) * 4 + Math.sin(t / 900 + i) * 0.5, f = Math.sin(t / 140 + i * 1.3) * 0.7;
        g.beginPath(); g.moveTo(bx - 1, by - f); g.lineTo(bx, by); g.lineTo(bx + 1, by - f); g.stroke();
      }
      break;
    case 'jellyfish': {
      g.translate(0, Math.sin(t / 1500 + ph) * 0.5);
      g.fillStyle = g.strokeStyle = g.shadowColor = o.accent; g.shadowBlur = 12; g.globalAlpha = 0.65; g.lineWidth = 0.06;
      g.beginPath(); g.ellipse(0, 0, 0.5, 0.4, 0, Math.PI, 0); g.fill();
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 0.2, 0);
        for (let k = 1; k <= 6; k++) g.lineTo(i * 0.2 + Math.sin(t / 400 + k + i) * 0.08, k * 0.18);
        g.stroke();
      }
      break;
    }
    case 'whale':
      g.translate(0, Math.sin(t / 3000 + ph) * 0.05); g.fillStyle = o.whale; g.globalAlpha = 0.8;
      E(0, 0, 1, 0.28);
      g.save(); g.translate(-0.95, 0); g.rotate(Math.sin(t / 1200 + ph) * 0.25);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.35, -0.2); g.lineTo(-0.28, 0); g.lineTo(-0.35, 0.2); g.fill(); g.restore();
      E(0.1, 0.25, 0.25, 0.05, 0.5);
      break;
    case 'species': {
      // Built from DNA (see makeSpecies); scaled so the whole animal is ~1 unit tall.
      const d = c.dna, L = d.legLen, bl = d.bodyLen, bh = d.bodyH, H = L + bh + d.neckLen + 0.25;
      g.scale(1 / H, 1 / H);
      const lw = 0.05 + bh * 0.25;
      const at = d.legs === 2 ? [0] : d.legs === 4 ? [-bl * 0.65, bl * 0.65] : [-bl * 0.7, 0, bl * 0.7];
      at.forEach((a, k) => { leg(a, -L, L, lw, k * 1.5); leg(a + 0.04, -L, L, lw, k * 1.5 + Math.PI); });
      E(0, -L, bl, bh);
      if (d.pattern !== 'plain') {
        g.save(); g.beginPath(); g.ellipse(0, -L, bl, bh, 0, 0, 7); g.clip();
        g.fillStyle = o.accent; g.globalAlpha = 0.35;
        for (let k = 0; k < 6; k++) {
          const x = -bl + (k + 0.5) * (bl / 3);
          if (d.pattern === 'stripes') g.fillRect(x, -L - bh, bl * 0.12, bh * 2);
          else { g.beginPath(); g.arc(x, -L + (r() - 0.5) * bh, bh * 0.25, 0, 7); g.fill(); }
        }
        g.restore();
      }
      // Tail.
      g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(-bl * 0.9, -L);
      if (d.tail === 'short') { g.lineTo(-bl - 0.15, -L - 0.08 + swing * 0.02); g.stroke(); }
      if (d.tail === 'long') { g.quadraticCurveTo(-bl - 0.4, -L + swing * 0.05, -bl - 0.6, -L + 0.15); g.stroke(); }
      if (d.tail === 'bushy') E(-bl - 0.15, -L - 0.1 + swing * 0.02, 0.18, 0.1, -0.5);
      // Neck and head.
      const hx = bl * 0.85 + d.neckLen * 0.35, hy = -L - bh * 0.5 - d.neckLen + swing * 0.02;
      if (d.neckLen) { g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(bl * 0.7, -L - bh * 0.3); g.quadraticCurveTo(bl * 0.8, (hy - L) / 2, hx, hy); g.stroke(); }
      const [hw, hh] = { round: [0.14, 0.12], long: [0.24, 0.09], flat: [0.2, 0.06] }[d.head];
      E(hx + hw * 0.5, hy, hw, hh, 0.15);
      g.lineWidth = lw * 0.5; g.beginPath();
      if (d.extra === 'horns') { g.moveTo(hx, hy - hh); g.quadraticCurveTo(hx - 0.1, hy - hh - 0.2, hx - 0.2, hy - hh - 0.15); g.stroke(); }
      if (d.extra === 'antennae') {
        for (const dx of [0, 0.08]) { g.moveTo(hx + dx, hy - hh); g.lineTo(hx + dx + 0.12, hy - hh - 0.25); }
        g.stroke(); if (o.lights) { g.fillStyle = g.shadowColor = o.accent; g.shadowBlur = 6; } E(hx + 0.2, hy - hh - 0.25, 0.03, 0.03);
      }
      if (d.extra === 'crest') { g.moveTo(hx - 0.1, hy - hh * 0.5); g.lineTo(hx + 0.05, hy - hh - 0.15); g.lineTo(hx + 0.2, hy - hh * 0.6); g.fill(); }
      break;
    }
    case 'human':
      leg(0, -0.5, 0.5, 0.1, 0); leg(0, -0.5, 0.5, 0.1, Math.PI);
      g.lineWidth = 0.14; g.beginPath(); g.moveTo(0, -0.5); g.lineTo(0, -0.95); g.stroke();
      leg(0, -0.9, 0.35, 0.07, Math.PI); E(0, -1.08, 0.11, 0.12);
      break;
    case 'alien':
      for (const k of [0, 2.1, 4.2]) leg(0, -0.7, 0.7, 0.06, k);
      g.lineWidth = 0.08; g.beginPath(); g.moveTo(0, -0.7); g.lineTo(0, -1.2); g.stroke();
      E(0.05, -1.35, 0.2, 0.15, -0.2);
      if (o.lights) { g.fillStyle = g.shadowColor = o.accent; g.shadowBlur = 6; E(0.14, -1.37, 0.04, 0.03); }
      break;
  }
  g.restore();
}

// ---- vertical features -------------------------------------------------------------------------

/** A river coming towards the viewer: a ribbon from the ridge at `top` down to `bottom`, widening and
 *  winding, with ripples flowing downwards. Call with the layer's shape as clip. */
export function drawRiver(g, x, top, bottom, width, depth, phase, t, color) {
  const span = bottom - top;
  if (span <= 0) return;
  const at = (u) => x + Math.sin(u * 5 + phase) * width * 0.6 * (0.3 + depth);
  const half = (u) => width * (0.04 + 0.5 * depth) * (0.25 + 0.75 * u);
  g.save();
  g.fillStyle = color; g.globalAlpha = 0.9;
  g.beginPath();
  for (let u = 0; u <= 1.001; u += 0.05) g.lineTo(at(u) - half(u), top + u * span);
  for (let u = 1; u >= -0.001; u -= 0.05) g.lineTo(at(u) + half(u), top + u * span);
  g.fill();
  // ripples drift down the stream
  g.strokeStyle = '#fff'; g.globalAlpha = 0.25; g.lineWidth = Math.max(1, width * 0.02 * (0.5 + depth));
  for (let j = 0; j < 14; j++) {
    const u = (j / 14 + t * 0.00006 * (1 + depth)) % 1, y = top + u * span, hw = half(u) * (0.2 + 0.5 * ((j * 7) % 5) / 5);
    g.beginPath(); g.moveTo(at(u) - hw, y); g.lineTo(at(u) + hw * 0.6, y + span * 0.015); g.stroke();
  }
  g.restore();
}

/** A floating island: grassy top, jagged rock hanging below, roots, maybe a tree and a waterfall. */
export function drawIsland(g, x, y, s, isl, o) {
  const r = rng(isl.seed);
  g.save();
  if (isl.fall) { // the waterfall goes behind the rock, fading as it falls
    const fx = x + s * (0.4 + r() * 0.4), len = s * (4 + r() * 4);
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, o.water); grad.addColorStop(1, 'transparent');
    g.fillStyle = grad; g.fillRect(fx - s * 0.06, y, s * 0.12, len);
    g.strokeStyle = '#fff'; g.globalAlpha = 0.35; g.lineWidth = Math.max(1, s * 0.02);
    for (let j = 0; j < 6; j++) { const u = (j / 6 + o.t * 0.0004) % 1; g.beginPath(); g.moveTo(fx, y + u * len); g.lineTo(fx, y + u * len + s * 0.3); g.stroke(); }
    g.globalAlpha = 1;
  }
  g.fillStyle = o.rock;
  g.beginPath(); g.moveTo(x - s, y);
  for (let k = 0; k <= 8; k++) g.lineTo(x - s + (k / 8) * 2 * s, y + s * (0.15 + r() * 0.35) * Math.sin((k / 8) * Math.PI) * 3);
  g.lineTo(x + s, y); g.fill();
  g.strokeStyle = o.rock; g.lineWidth = Math.max(1, s * 0.03);
  for (let k = 0; k < 4; k++) { const rx = x - s * 0.6 + r() * s * 1.2; g.beginPath(); g.moveTo(rx, y + s * 0.3); g.quadraticCurveTo(rx + s * 0.1, y + s * 1.2, rx - s * 0.05, y + s * (1.3 + r())); g.stroke(); }
  g.fillStyle = o.top; g.beginPath(); g.ellipse(x, y, s * 1.05, s * 0.18, 0, 0, 7); g.fill();
  if (isl.tree) { g.fillStyle = o.rock; g.fillRect(x - s * 0.04, y - s * 0.5, s * 0.08, s * 0.5); g.fillStyle = o.top; g.beginPath(); g.arc(x, y - s * 0.6, s * 0.28, 0, 7); g.fill(); }
  g.restore();
}

/** Aurora: curtains of light hanging from the top of the sky. */
export function drawAurora(g, w, h, t, hue) {
  g.save();
  for (let k = 0; k < 3; k++) {
    const grad = g.createLinearGradient(0, 0, 0, h * 0.45);
    grad.addColorStop(0, 'transparent'); grad.addColorStop(0.3, `hsla(${hue + k * 40} 90% 60% / .16)`); grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    const step = 6 * devicePixelRatio;
    for (let x = 0; x < w; x += step) {
      const top = h * (0.04 + 0.05 * Math.sin(x * 0.003 + t / 4000 + k * 2));
      const len = h * (0.2 + 0.12 * Math.sin(x * 0.008 + k + t / 2500));
      g.fillRect(x, top, step + 1, len);
    }
  }
  g.restore();
}

/** A column of smoke rising from (x, y), drifting with the wind. */
export function drawSmoke(g, x, y, s, t, phase, color) {
  g.save(); g.fillStyle = color;
  for (let j = 0; j < 12; j++) {
    const u = (j / 12 + t * 0.00004) % 1;
    g.globalAlpha = 0.18 * (1 - u);
    g.beginPath(); g.arc(x + Math.sin(u * 4 + phase) * s * 0.3 + u * s * 1.2, y - u * s * 6, s * (0.15 + u * 0.6), 0, 7); g.fill();
  }
  g.restore();
}
