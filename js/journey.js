/* Journey: reusable SVG "toward the light" progress landscape.
 *
 *   Journey.render(container, {
 *     total, completed,            // chapter count / chapters finished
 *     selected,                    // optional zero-based marker to ring
 *     interactive, onSelect(i),    // marker taps
 *     animateSun, label            // completion rise / aria label
 *   })
 *
 * Marker positions are computed by flattening the Bezier path and walking its arc length,
 * so markers stay exactly on the curve for any chapter count.
 */
(function (global) {
  const W = 400, H = 240, PX = 8;
  let uidCounter = 0;

  /* sky palette keyframes: [progress, top, bottom] */
  const SKY = [
    [0.0, '#04061a', '#0e1840'],
    [0.35, '#12165a', '#363a8c'],
    [0.6, '#33277a', '#9c4f8c'],
    [0.8, '#6e3d7e', '#f09878'],
    [0.92, '#bf6279', '#ffb676'],
    [1.0, '#f2a15a', '#ffe49c'],
  ];

  /* ---------- colour helpers ---------- */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  };
  function sky(p) {
    for (let i = 1; i < SKY.length; i++) {
      if (p <= SKY[i][0]) {
        const [p0, t0, b0] = SKY[i - 1], [p1, t1, b1] = SKY[i];
        const t = (p - p0) / (p1 - p0);
        return { top: mix(t0, t1, t), bottom: mix(b0, b1, t) };
      }
    }
    return { top: SKY[SKY.length - 1][1], bottom: SKY[SKY.length - 1][2] };
  }

  /* ---------- the curve ---------- */
  const CONTROL = [[26, 204], [96, 178], [150, 124], [214, 150], [268, 104], [322, 126]];

  function catmullToBezier(pts) {
    const p = [pts[0], ...pts, pts[pts.length - 1]];
    const segs = [];
    for (let i = 1; i < p.length - 2; i++) {
      const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
      segs.push([
        p1,
        [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
        [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
        p2,
      ]);
    }
    return segs;
  }

  const BEZ = catmullToBezier(CONTROL);
  const PATH_D =
    `M${BEZ[0][0][0]} ${BEZ[0][0][1]} ` +
    BEZ.map((s) => `C${s[1][0].toFixed(1)} ${s[1][1].toFixed(1)} ${s[2][0].toFixed(1)} ${s[2][1].toFixed(1)} ${s[3][0]} ${s[3][1]}`).join(' ');

  /* Flatten once: polyline + cumulative length table. */
  const SAMPLES = (() => {
    const pts = [];
    const N = 40;
    BEZ.forEach((s, si) => {
      for (let k = si === 0 ? 0 : 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        pts.push([
          u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
          u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
        ]);
      }
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, length: cum[cum.length - 1] };
  })();

  /** Point at fraction t (0..1) of the path's arc length. */
  function pointAt(t) {
    const target = Math.max(0, Math.min(1, t)) * SAMPLES.length;
    const { pts, cum } = SAMPLES;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid; else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    const f = (target - cum[lo]) / span;
    return { x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f, len: target };
  }

  function markerPositions(n) {
    return Array.from({ length: n }, (_, i) => pointAt(n === 1 ? 0 : i / (n - 1)));
  }

  /* ---------- pixel scenery ---------- */
  const rnd = (seed) => {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  };

  function stars(p) {
    const r = rnd(7);
    const op = Math.max(0, 1 - p * 1.35);
    if (op <= 0.02) return '';
    let out = `<g class="stars" opacity="${op.toFixed(2)}">`;
    for (let i = 0; i < 34; i++) {
      const x = Math.round((r() * (W - 20) + 10) / 4) * 4;
      const y = Math.round((r() * 120 + 8) / 4) * 4;
      const big = r() > 0.8;
      const s = big ? 4 : 2;
      out += `<rect class="twinkle" style="animation-delay:${(r() * 4).toFixed(1)}s" x="${x}" y="${y}" width="${s}" height="${s}" fill="#e9ecff"/>`;
    }
    return out + '</g>';
  }

  function moon(p) {
    const op = Math.max(0, 1 - p * 2.2);
    if (op <= 0.02) return '';
    const cx = 64, cy = 44, R = 12;
    let out = `<g opacity="${op.toFixed(2)}">`;
    for (let dy = -R; dy <= R; dy += 4)
      for (let dx = -R; dx <= R; dx += 4) {
        const inMoon = dx * dx + dy * dy <= R * R;
        const inBite = (dx - 6) * (dx - 6) + (dy + 4) * (dy + 4) <= (R - 1) * (R - 1);
        if (inMoon && !inBite) out += `<rect x="${cx + dx}" y="${cy + dy}" width="4" height="4" fill="#dfe4ff"/>`;
      }
    return out + '</g>';
  }

  function sun(p, animate, complete) {
    const e = p * p * (3 - 2 * p);
    const cx = 322, R = Math.round((16 + 14 * e) / 4) * 4, cy = 232 - (232 - 112) * e;
    const core = mix('#ff9f6e', '#ffe08a', e);
    const rim = mix('#ff7f66', '#ffbf5e', e);
    let out = `<g class="${animate ? 'sun-rise' : ''}"><g class="${complete ? 'sun-full' : ''}">`;
    out += `<circle cx="${cx}" cy="${cy}" r="${(R * 3.4).toFixed(0)}" fill="url(#GL)" opacity="${(0.15 + 0.85 * e).toFixed(2)}"/>`;
    for (let dy = -R; dy <= R; dy += 4)
      for (let dx = -R; dx <= R; dx += 4) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= R * R) out += `<rect x="${(cx + dx - 2).toFixed(0)}" y="${(cy + dy - 2).toFixed(0)}" width="4" height="4" fill="${d2 > (R - 5) * (R - 5) ? rim : core}"/>`;
      }
    if (complete) {
      const ray = R + 10;
      for (let a = 0; a < 16; a++) {
        const th = (a * Math.PI) / 8;
        const long = a % 2 === 0;
        const x = cx + Math.cos(th) * (ray + (long ? 4 : 0)), y = cy + Math.sin(th) * (ray + (long ? 4 : 0));
        out += `<rect class="ray" style="animation-delay:${(a * 0.12).toFixed(2)}s" x="${(Math.round(x / 2) * 2 - 2).toFixed(0)}" y="${(Math.round(y / 2) * 2 - 2).toFixed(0)}" width="${long ? 6 : 4}" height="${long ? 6 : 4}" fill="#ffe9a8"/>`;
      }
    }
    return out + '</g></g>';
  }

  function hills(p, skyBottom) {
    const dark = '#070a1c';
    const layers = [
      { base: 54, amp: 22, f: 0.22, ph: 1.3, tint: 0.5, mixDark: 0.5 },
      { base: 38, amp: 18, f: 0.31, ph: 4.2, tint: 0.3, mixDark: 0.68 },
      { base: 20, amp: 12, f: 0.45, ph: 2.1, tint: 0.14, mixDark: 0.84 },
    ];
    let out = '';
    layers.forEach((L, li) => {
      const color = mix(mix(skyBottom, '#2a2250', 0.25), dark, L.mixDark);
      const lit = mix(color, skyBottom, L.tint * p);
      const r = rnd(31 + li * 11);
      out += `<g fill="${lit}">`;
      for (let i = 0; i < W / PX; i++) {
        const h = Math.round((L.base + Math.sin(i * L.f + L.ph) * L.amp + (r() - 0.5) * 6) / 4) * 4;
        out += `<rect x="${i * PX}" y="${H - h}" width="${PX}" height="${h}"/>`;
      }
      out += '</g>';
    });
    return out;
  }

  /* ---------- main render ---------- */
  function render(container, opts) {
    const total = Math.max(1, opts.total | 0);
    const completed = Math.max(0, Math.min(total, opts.completed | 0));
    const done = completed >= total;
    const p = completed / total;
    const id = 'j' + ++uidCounter;
    const { top, bottom } = sky(p);
    const marks = markerPositions(total);
    const curIdx = done ? total - 1 : completed;
    const litPos = done ? 1 : total === 1 ? 0 : curIdx / (total - 1);
    const litLen = litPos * SAMPLES.length;
    const radius = total > 40 ? 3 : total > 24 ? 3.6 : 4.6;

    let m = '';
    marks.forEach((pt, i) => {
      const isDone = i < completed;
      const isCur = i === curIdx && !done;
      const sel = opts.selected === i;
      const cls = isCur ? 'mk cur' : isDone ? 'mk done' : 'mk todo';
      const r = isCur ? radius + 2.6 : radius;
      m += `<g class="${cls}${sel ? ' sel' : ''}" data-i="${i}" transform="translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})">`;
      if (isDone || isCur) m += `<circle class="halo" r="${r + 5}"/>`;
      if (isCur) m += `<circle class="pulse" r="${r + 2}"/>`;
      m += `<circle class="dot" r="${r}"/>`;
      if (sel) m += `<circle class="selring" r="${r + 5}"/>`;
      if (opts.interactive) m += `<circle class="hit" r="13" tabindex="0" role="button" aria-label="Chapter ${i + 1}, ${isDone ? 'completed' : isCur ? 'current' : 'upcoming'}"/>`;
      m += '</g>';
    });

    container.innerHTML = `
<svg class="journey${done ? ' is-complete' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img"
     aria-label="${Services.esc(opts.label || `Progress: ${completed} of ${total} chapters`)}" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="${id}S" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <radialGradient id="${id}G"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset=".45" stop-color="#ff9f6e" stop-opacity=".28"/><stop offset="1" stop-color="#ff9f6e" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}P" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa6ff"/><stop offset=".55" stop-color="#ffb98a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}S)"/>
  ${stars(p)}${moon(p)}
  ${sun(p, opts.animateSun, done).replace('url(#GL)', `url(#${id}G)`)}
  ${hills(p, bottom)}
  <g class="trail" shape-rendering="geometricPrecision" fill="none" stroke-linecap="round">
    <path d="${PATH_D}" class="trail-base" stroke-width="3"/>
    <path d="${PATH_D}" class="trail-lit-glow" stroke="url(#${id}P)" stroke-width="8" opacity=".22" pathLength="${SAMPLES.length.toFixed(2)}" stroke-dasharray="0 ${SAMPLES.length.toFixed(2)}" data-lit="${litLen.toFixed(2)}"/>
    <path d="${PATH_D}" class="trail-lit" stroke="url(#${id}P)" stroke-width="3" pathLength="${SAMPLES.length.toFixed(2)}" stroke-dasharray="0 ${SAMPLES.length.toFixed(2)}" data-lit="${litLen.toFixed(2)}"/>
  </g>
  <g class="markers" shape-rendering="geometricPrecision">${m}</g>
</svg>`;

    const svg = container.firstElementChild;
    // Animate the lit portion of the trail growing to the reader's position.
    requestAnimationFrame(() => {
      svg.querySelectorAll('[data-lit]').forEach((el) => {
        el.style.strokeDasharray = `${el.dataset.lit} ${SAMPLES.length.toFixed(2)}`;
      });
    });

    if (opts.interactive && opts.onSelect) {
      const pick = (el) => {
        const g = el.closest('.mk');
        if (g) opts.onSelect(Number(g.dataset.i));
      };
      svg.addEventListener('click', (e) => pick(e.target));
      svg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(e.target);
        }
      });
    }
    return svg;
  }

  global.Journey = { render, markerPositions, pointAt, PATH_D };
})(window);
