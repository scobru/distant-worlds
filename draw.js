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
    case 'piramide': P(-0.9, 0, 0, -1, 0.9, 0); break;
    case 'tempio':
      R(-0.85, -0.12, 1.7, 0.12);
      for (let i = 0; i < 5; i++) R(-0.72 + i * 0.35, -0.75, 0.1, 0.63);
      R(-0.9, -0.87, 1.8, 0.12); P(-0.9, -0.87, 0, -1.1, 0.9, -0.87); break;
    case 'obelisco': P(-0.1, 0, -0.07, -1.4, 0, -1.55, 0.07, -1.4, 0.1, 0); break;
    case 'castello':
      R(-1, -0.6, 2, 0.6); R(-0.35, -1.2, 0.7, 0.6);
      for (let i = 0; i < 10; i++) R(-1 + i * 0.2, -0.7, 0.1, 0.1);
      for (let i = 0; i < 4; i++) R(-0.35 + i * 0.2, -1.32, 0.1, 0.12);
      windows(-0.3, -1.15, 0.6, 0.5, 2, 2); break;
    case 'casa':
      R(-0.4, -0.45, 0.8, 0.45); P(-0.5, -0.45, 0, -0.8, 0.5, -0.45);
      windows(-0.35, -0.4, 0.7, 0.35, 2, 1); break;
    case 'mulino': {
      P(-0.25, 0, -0.15, -0.9, 0.15, -0.9, 0.25, 0);
      g.save(); g.translate(0, -0.9); g.rotate(o.t / 3000 + t.seed);
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); R(-0.04, 0, 0.08, 0.65); }
      g.restore(); break;
    }
    case 'fabbrica':
      R(-0.8, -0.45, 1.6, 0.45); P(-0.8, -0.45, -0.8, -0.65, -0.4, -0.45, -0.4, -0.65, 0, -0.45, 0, -0.65, 0.3, -0.45);
      R(0.3, -1.3, 0.13, 0.85); R(0.6, -1.05, 0.13, 0.6);
      windows(-0.75, -0.35, 1.5, 0.2, 6, 1);
      if (!t.broken) {
        g.save(); g.globalAlpha = 0.25; g.shadowBlur = 0; g.fillStyle = '#bbb';
        for (let i = 0; i < 6; i++) { const p = (o.t / 4000 + i / 6) % 1; g.beginPath(); g.arc(0.36 + p * 0.8, -1.35 - p * 1.2, 0.08 + p * 0.25, 0, 7); g.fill(); }
        g.restore();
      }
      break;
    case 'palazzo': {
      const h = 1 + r() * 1.3, w = 0.45 + r() * 0.3;
      R(-w / 2, -h, w, h); windows(-w / 2, -h, w, h, 3, Math.round(h * 6)); break;
    }
    case 'antenna':
      P(-0.18, 0, -0.02, -1.6, 0.02, -1.6, 0.18, 0); beacon(0, -1.62, 0.05, '#f33'); break;
    case 'torre':
      P(-0.22, 0, -0.07, -2, 0.07, -2, 0.22, 0);
      g.beginPath(); g.ellipse(0, -1.55, 0.4, 0.08, 0, 0, 7); f();
      R(-0.01, -2.5, 0.02, 0.5); windows(-0.12, -1.5, 0.24, 1.4, 1, 10); beacon(0, -2.5, 0.05, o.accent); break;
    case 'cupola':
      g.beginPath(); g.arc(0, 0, 0.6, Math.PI, 0); f(); R(-0.02, -0.95, 0.04, 0.4);
      windows(-0.45, -0.3, 0.9, 0.15, 5, 1); beacon(0, -0.96, 0.04, o.accent); break;
    case 'arco':
      g.beginPath(); g.arc(0, 0.2, 3, Math.PI, 0); g.arc(0, 0.2, 2.8, 0, Math.PI, true); f(); break;
    case 'guglia':
      g.beginPath(); g.moveTo(-0.25, 0); g.quadraticCurveTo(-0.1, -1, 0.15, -1.8);
      g.quadraticCurveTo(0.05, -0.9, 0.25, 0); f(); beacon(0.15, -1.8, 0.05, o.accent); break;
    case 'sfera':
      R(-0.03, -1, 0.06, 1);
      if (lit) { g.fillStyle = g.shadowColor = o.accent; g.shadowBlur = 15; g.globalAlpha = 0.8 + 0.2 * Math.sin(o.t / 700 + t.seed); }
      C(0, -1.2, 0.25); break;
    case 'baccelli':
      for (let i = 0; i < 4; i++) C(-0.5 + r(), -0.15 - r() * 0.3, 0.15 + r() * 0.25); break;
    case 'foresta':
      R(-0.05, -0.5, 0.1, 0.5); C(0, -0.75, 0.32); C(-0.22, -0.55, 0.22); C(0.22, -0.55, 0.22); break;
    case 'conifere': P(-0.3, 0, 0, -1.3, 0.3, 0); break;
    case 'cristalli':
      g.fillStyle = o.accent; g.globalAlpha = 0.75; g.shadowColor = o.accent; g.shadowBlur = 12;
      for (let i = 0; i < 3; i++) { const a = -0.3 + i * 0.3, h = 0.5 + r() * 0.9; P(a - 0.1, 0, a - 0.05, -h, a + 0.02, -h - 0.15, a + 0.1, 0); }
      break;
    case 'funghi':
      R(-0.06, -0.6, 0.12, 0.6);
      g.fillStyle = o.accent; g.globalAlpha = 0.85; g.beginPath(); g.ellipse(0, -0.6, 0.4, 0.28, 0, Math.PI, 0); f(); break;
  }
  g.restore();
}
