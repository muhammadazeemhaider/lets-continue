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
  // Three broad switchbacks give each chapter a proper stretch of trail
  // without changing the landscape size or the reader's saved progress.
  const CONTROL = [
    [24, 208], [90, 190], [160, 204], [225, 183],
    [164, 157], [80, 161], [54, 134],
    [124, 114], [210, 128], [284, 104], [344, 120], [365, 94],
  ];

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
      const color = mix(mix(skyBottom, '#3a2058', 0.35), dark, L.mixDark * (1 - 0.18 * p));
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

  // Four-direction, three-frame sprite. The outer group owns position;
  // the inner frames own limbs, so stepping never changes the world position.
  function lanternSprite() {
    let out='';
    for(const direction of ['down','up','right','left'])for(let frame=0;frame<3;frame++){
      const step=frame===1?-1:frame===2?1:0;
      const side=direction==='left'||direction==='right';
      out+=`<g class="explorer-frame" data-facing="${direction}" data-pose="${frame}"${direction==='left'?' transform="scale(-1 1)"':''}>`;
      out+=`<path d="M-4 ${9+step}h3v4h-3zM1 ${9-step}h3v4H1z" fill="#665570"/><path d="M-5 ${12+step}h4v2h-4zM1 ${12-step}h4v2H1z" fill="#292840"/>`;
      // A stepped cloak and oversized hood keep the silhouette readable at scene scale.
      out+='<path d="M-3-1h6v3h2v5h2v3H-7V7h2V2h2z" fill="#415866"/><path d="M-3 0h6v3h2v5H-5V3h2z" fill="#88b7ac"/><path d="M-3-9h6v2h2v2h1v5H-6v-5h1v-2h2z" fill="#3b455e"/><path d="M-3-8h6v2h2v5H-5v-5h2z" fill="#a4c8b7"/>';
      if(direction==='up'){
        out+='<path d="M-2-6h4v6h-4z" fill="#7fa79f"/><path d="M-3 2h6v5h-6z" fill="#c5aa86"/><path d="M-2 2h4v1h-4z" fill="#e2c49d"/>';
      }else if(side){
        out+='<path d="M0-5h4v5H0zM3-3h2v2H3z" fill="#36364e"/><rect x="3" y="-4" width="1" height="2" fill="#ffe3a2"/><path d="M-4 0h8v2H-4zM-5 2h3v3h-3z" fill="#e4ab94"/><path d="M-1 3h3v3h-3z" fill="#b5d1bd"/>';
      }else{
        out+='<path d="M-3-5h6v5h-6z" fill="#36364e"/><path d="M-2-4h1v2h-1zM1-4h1v2H1z" fill="#ffe3a2"/><path d="M-4 0h8v2H-4zM-4 2h2v3h-2z" fill="#e4ab94"/><path d="M-3 3h2v4h-2z" fill="#ccba96"/>';
      }
      out+=`<g transform="translate(0 ${step})"><path d="M5 3h3v2H7V4H6v2H5z" fill="#e3d1a6"/><rect x="5" y="6" width="4" height="5" fill="#655063"/><rect x="6" y="7" width="2" height="3" fill="#ffe2a1"/><rect x="5" y="5" width="4" height="1" fill="#edc19a"/></g></g>`;
    }
    return out;
  }

  function fantasySprite(kind){
    let out='';
    const sage=kind==='sage',bard=kind==='bard';
    const dark=sage?'#4c4269':bard?'#694559':'#4b566d';
    const cloth=sage?'#aaa0cf':bard?'#b7778b':'#9cafc6';
    for(const direction of ['down','up','right','left'])for(let frame=0;frame<3;frame++){
      const step=frame===1?-1:frame===2?1:0,side=direction==='left'||direction==='right';
      out+=`<g class="explorer-frame" data-facing="${direction}" data-pose="${frame}"${direction==='left'?' transform="scale(-1 1)"':''}>`;
      out+=`<path d="M-4 ${8+step}h3v5h-3zM1 ${8-step}h3v5H1z" fill="${dark}"/><path d="M-5 ${12+step}h4v2h-4zM1 ${12-step}h4v2H1z" fill="#28283e"/>`;
      out+=`<path d="M-3-1h6v2h2v5h1v4H-6V6h1V1h2z" fill="${dark}"/><path d="M-3 1h6v7h-6z" fill="${cloth}"/><path d="M-5 ${2+step}h2v4h-2zM3 ${2-step}h2v4H3z" fill="${sage||bard?'#efd0af':'#c4d0db'}"/>`;
      if(direction!=='up')out+='<path d="M-3-6h6v6h-6z" fill="#efd0af"/>';
      if(sage){
        out+='<path d="M-2-11h3v3h2v3h2v2H-6v-2h2v-3h2z" fill="#776294"/><path d="M-6-4H6v2H-6z" fill="#b9a2ce"/>';
        if(direction!=='up')out+=side?'<path d="M2-2h1v1H2zM1 0h3v4H1z" fill="#f4e7d0"/>':'<path d="M-2-2h1v1h-1zM1-2h1v1H1z" fill="#37344f"/><path d="M-3 0h6v2H2v2H0v1h-1V3h-2z" fill="#f4e7d0"/>';
        out+=`<g transform="translate(0 ${step})"><path d="M7-5h2v18H7z" fill="#b7a088"/><path d="M6-9h4v2h1v3H5v-3h1z" fill="#bcb5ed"/><rect x="7" y="-8" width="2" height="3" fill="#f3e3bc"/></g>`;
      }else if(bard){
        out+='<path d="M-4-7h8v3H-4zM-6-4H6v2H-6z" fill="#8ba99d"/><path d="M2-9h3v2H3v3H1v-2h1z" fill="#f0c99c"/>';
        if(direction!=='up')out+=side?'<rect x="2" y="-2" width="1" height="1" fill="#38304a"/>':'<path d="M-2-2h1v1h-1zM1-2h1v1H1z" fill="#38304a"/>';
        out+='<path d="M-3 0h6v2h-6zM-4 2h2v3h-2z" fill="#ead0a3"/>';
        out+=`<g transform="translate(0 ${step})"><path d="M7 1h2v5h1v4H4V6h3z" fill="#dcb082"/><rect x="6" y="7" width="2" height="2" fill="#624451"/><path d="M8 0h2v2H8z" fill="#f2ce9f"/></g>`;
      }else{
        out+='<path d="M-3-8h6v2h2v6H-5v-6h2z" fill="#9cafc6"/><path d="M-3-7h5v2h2v1h-7z" fill="#d5dde0"/>';
        if(direction!=='up')out+=side?'<path d="M1-3h4v2H1z" fill="#30364d"/>':'<path d="M-3-3h6v2h-6z" fill="#30364d"/><path d="M-2-3v2M0-3v2M2-3v2" stroke="#b3b6c4" stroke-width="1"/>';
        out+='<path d="M-1-10h3v3h-3zM1-10h3v1H1z" fill="#cf8e9a"/><path d="M-4 1h8v2h-8z" fill="#d4bea2"/>';
        out+=`<g transform="translate(0 ${step})"><path d="M-8 3h5v6h-1v2h-3V9h-1z" fill="#586d8b"/><path d="M-7 4h3v4h-3z" fill="#e3cca0"/><path d="M7-4h2v10H7z" fill="#d9e2dc"/><path d="M5 5h6v2H5zM7 7h2v4H7z" fill="#e1bd8e"/></g>`;
      }
      if(direction==='up')out+=`<path d="M-3 0h6v8h-6z" fill="${dark}"/><path d="M-1 1h2v6h-2z" fill="${cloth}"/>`;
      out+='</g>';
    }
    return out;
  }

  function spaceSprite(kind){
    let out='';
    for(const direction of ['down','up','right','left'])for(let frame=0;frame<3;frame++){
      const step=frame===1?-1:frame===2?1:0,side=direction==='left'||direction==='right',back=direction==='up';
      out+=`<g class="explorer-frame crew-${kind}" data-facing="${direction}" data-pose="${frame}"${direction==='left'?' transform="scale(-1 1)"':''}>`;
      if(kind==='sentinel'){
        out+=`<path d="M-6 ${7+step}h5v5h-5zM1 ${7-step}h5v5H1z" fill="#55718e"/><path d="M-7 ${12+step}h6v2h-6zM1 ${12-step}h6v2H1z" fill="#324561"/><path d="M-5-2H5V0h3v8H-8V0h3z" fill="#718eab"/><path d="M-9-1h5v5h-5zM4-1h5v5H4z" fill="#c8dbe3"/><path d="M-4-9h8v2h2v6H-6v-6h2z" fill="#a4bfce"/><path d="M-5-6H5v4H-5z" fill="#263e5b"/>`;
        if(!back)out+=side?'<path d="M1-5h5v2H1z" fill="#f3c594"/>':'<path d="M-4-5h8v1h-8zM-1-4h2v3h-2z" fill="#f3c594"/><path d="M-4 2h8v3h-8z" fill="#b9d6db"/>';
        else out+='<path d="M-4 0h8v6h-8z" fill="#354d6b"/><path d="M-3 1h6v1h-6zM-3 4h6v1h-6z" fill="#a6ccd4"/>';
        out+=`<g transform="translate(0 ${step})"><path d="M5 4h7v4H5zM6 8h3v3H6z" fill="#3f5874"/><rect x="10" y="4" width="3" height="2" fill="#8ce3eb"/></g>`;
      }else if(kind==='technomancer'){
        out+=`<path d="M-3 ${8+step}h2v5h-2zM1 ${8-step}h2v5H1z" fill="#373c5e"/><path d="M-4 ${12+step}h3v2h-3zM1 ${12-step}h3v2H1z" fill="#c4b7e4"/><path d="M-3-2h6v3h2v7h2v4H2V5h-4v7h-5V8h2V1h2z" fill="#65567f"/><path d="M-2 0h4v8h-4z" fill="#a99acb"/><path d="M-4-8h7v7h-7z" fill="#e0c9d3"/><path d="M-5-8v-3h8v2h2v4H2v-3H0v3h-5z" fill="#c5b7ed"/>`;
        if(!back)out+=side?'<path d="M2-5h2v1H2z" fill="#81e2e0"/>':'<path d="M-3-5h6v2h-6z" fill="#3c416b"/><rect x="-2" y="-5" width="2" height="1" fill="#92e2e5"/>';
        else out+='<path d="M-4-7h7v5h-7z" fill="#9182b8"/><path d="M-2 0h4v6h-4z" fill="#423e65"/>';
        out+=`<path d="M5 3h4v5H5z" fill="#8092b5"/><path d="M6 4h2v2H6z" fill="#b6f1eb"/><g transform="translate(0 ${step})"><path d="M8-9h2v2h2v2h-2v2H8v-2H6v-2h2z" fill="#b8e8eb"/><rect x="8" y="-7" width="2" height="2" fill="#f4e5b4"/></g>`;
      }else if(kind==='pilot'){
        out+=`<path d="M-4 ${7+step}h3v6h-3zM1 ${7-step}h3v6H1z" fill="#885368"/><path d="M-5 ${12+step}h4v2h-4zM1 ${12-step}h4v2H1z" fill="#ead0aa"/><path d="M-4-1h8v8h-8z" fill="#c8806c"/><path d="M-2 0h4v6h-4z" fill="#f2ca9e"/><path d="M-5-8h10v6H-5z" fill="#6e526e"/><path d="M-3-5h6v5h-6z" fill="#edc6a2"/><path d="M-5-8h9v2h-9zM-6-6h3v4h-3z" fill="#c1b9c8"/>`;
        if(!back)out+=side?'<rect x="2" y="-4" width="1" height="1" fill="#30354f"/>':'<path d="M-3-5h6v2h-6z" fill="#516780"/><path d="M-2-5h2v1h-2z" fill="#b8e4e4"/>';
        else out+='<path d="M-4-5h8v4h-8z" fill="#6e526e"/><path d="M-4 0h8v7h-8z" fill="#728da7"/>';
        out+=`<path d="M-4 0h8v2h-8zM-5 1h-5v2h7v2h-2z" fill="#eee0b1"/><path d="M-7 2h3v6h-3z" fill="#69849d"/><path d="M-7 8h3v2h-3z" fill="#a9dcdf"/><g transform="translate(0 ${step})"><path d="M5 4h6v2H5zM6 6h2v3H6z" fill="#a0bbce"/></g>`;
      }else{
        out+=`<path d="M-3 ${8+step}h2v4h-2zM1 ${8-step}h2v4H1z" fill="#b9dbcf"/><path d="M-4 ${12+step}h3v2h-3zM1 ${12-step}h3v2H1z" fill="#78a59f"/><path d="M-3 1h6v7h-6z" fill="#c9e9df"/><path d="M-1 3h2v3h-2z" fill="#7ad8ce"/><path d="M-4-8h8v2h2v6H4v2h-8V0h-2v-6h2z" fill="#d9ebe4"/><path d="M-4-6h8v5h-8z" fill="#334c62"/><path d="M-5-12h2v5h-2zM3-11h2v4H3z" fill="#a0ccce"/>`;
        if(!back)out+=side?'<path d="M2-5h2v2H2z" fill="#c5b9ef"/>':'<path d="M-3-5h2v2h-2zM1-5h2v2H1z" fill="#a6ece1"/><path d="M-1-2h2v1h-2z" fill="#a6ece1"/>';
        else out+='<path d="M-3-5h6v3h-6z" fill="#8bb5ae"/><rect x="-1" y="-5" width="2" height="2" fill="#c8baef"/>';
        out+=`<path d="M-5 ${3+step}h2v5h-2zM3 ${3-step}h2v5H3z" fill="#8bb9b2"/><path d="M-3 7h-5v-3h-2v5h7z" fill="#8cb7bb"/><rect x="-10" y="3" width="2" height="2" fill="#d5c0ef"/>`;
      }
      out+='</g>';
    }
    return out;
  }
  let fantasyCharacter='lantern',world='fantasy';
  try{const saved=global.localStorage?.getItem('ttl.character');if(global.Characters.forWorld('fantasy').some(c=>c.id===saved))fantasyCharacter=saved;else if(saved==='reader')global.localStorage.setItem('ttl.character','lantern');}catch{}
  let character=fantasyCharacter;
  const bookWorld=book=>global.Characters.normalizeWorld(book?.world);
  const characterForBook=book=>global.Characters.get(book?.companions?.[bookWorld(book)]||(bookWorld(book)==='fantasy'?fantasyCharacter:bookWorld(book)==='pirates'?'captain':'sentinel'),bookWorld(book)).id;
  function useBook(book){world=bookWorld(book);character=characterForBook(book);}
  const getWorld=()=>world;
  const getCharacter=()=>character;
  const getCharacters=(selectedWorld=world)=>global.Characters.forWorld(selectedWorld);
  const getCharacterInfo=(value=character)=>global.Characters.get(value,world);
  function setCharacter(value){
    if(!global.Characters.forWorld(world).some(c=>c.id===value))return;
    character=value;
    if(world==='fantasy'){fantasyCharacter=value;try{global.localStorage?.setItem('ttl.character',value);}catch{}}
  }
  const characterSprite=value=>['captain','navigator','deckhand','sea-witch'].includes(value)?global.PirateWorld.sprite(value):['sentinel','technomancer','pilot','android'].includes(value)?spaceSprite(value):['sage','bard','knight'].includes(value)?fantasySprite(value):lanternSprite();

  function walkingSteps(from, to) {
    const first=pointAt(from), last=pointAt(to), points=[{x:first.x,y:first.y,direction:'down'}];
    const count=Math.max(1,Math.ceil(Math.abs(to-from)*SAMPLES.length/6));
    let x=first.x,y=first.y;
    for(let i=1;i<=count;i++){
      const pt=pointAt(from+(to-from)*i/count);
      const targetX=i===count?last.x:Math.round(pt.x/4)*4;
      const targetY=i===count?last.y:Math.round(pt.y/4)*4;
      // Complete one axis before turning, like a classic tile-based overworld.
      if(Math.abs(targetX-x)>.01){points.push({x:targetX,y,direction:targetX>x?'right':'left'});x=targetX;}
      if(Math.abs(targetY-y)>.01){points.push({x,y:targetY,direction:targetY>y?'down':'up'});y=targetY;}
    }
    return points;
  }
  const walkDuration = (total,from,to) => (walkingSteps(from/total,to/total).length-1)*85;

  function scenery(p, completed, marks, traveler) {
    let out = '<g aria-hidden="true" class="landscape-details">';
    // Distant clouds use the same square grid and palette as the original sky.
    [[120,46,1],[278,30,.75]].forEach(([x,y,scale],i) => {
      out += `<g class="drifting-cloud cloud-${i}" opacity="${.08+p*.12}" transform="translate(${x} ${y}) scale(${scale})"><path d="M0 8h8V4h12V0h16v4h12v4h8v8H0z" fill="#f7d1c2"/></g>`;
    });
    [[12,218,1],[71,227,.8],[116,204,.8],[197,218,1.1],[246,199,.7],[365,206,1.2],[388,225,.8]].forEach(([x,y,scale])=>{
      out += `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-1 0h3v17h-3z" fill="${mix('#171630','#77535e',p*.65)}"/><path d="M-2-13h4v5h4v5h4v5h4v5h-28V2h4v-5h4v-5h4z" fill="${mix('#11152e','#4d5866',p*.8)}"/><path d="M-2-8h4v5h4v5h-12v-5h4z" fill="${mix('#202044','#7b7b77',p*.6)}"/></g>`;
    });
    marks.slice(0,completed).forEach((pt,i)=>{
      const x=Math.round(pt.x/2)*2+7,y=Math.round(pt.y/2)*2+12;
      out += `<g class="trail-flower" style="animation-delay:${i*.05}s"><path d="M${x} ${y}v6h2v-6z" fill="#91a795"/><path d="M${x-2} ${y-2}h6v2h-6zM${x} ${y-4}h2v6h-2z" fill="${i%2?'#c0b5ed':'#f2be9b'}"/><rect x="${x}" y="${y-2}" width="2" height="2" fill="#ffe3a0"/></g>`;
    });
    const campX=Math.min(355,traveler.x+22),campY=Math.min(226,traveler.y+22);
    if(p<1)out += `<g class="little-camp" transform="translate(${campX.toFixed(1)} ${campY.toFixed(1)})"><path d="M-9 0v-4h3v-4h3v-4h6v4h3v4h3v4z" fill="#aa8395"/><path d="M-3 0v-4h2v-4h2v4h2v4z" fill="#26213c"/><path d="M-10 0h20v2h-20z" fill="#dab2a0"/><rect x="15" y="-2" width="6" height="2" fill="#826271"/><path class="camp-ember" d="M17-8h2v2h2v4h-6v-4h2z" fill="#ffcf89"/></g>`;
    if(p<.85){for(let i=0;i<9;i++){const x=38+(i*47)%315,y=148+(i*19)%73;out+=`<rect class="firefly" style="animation-delay:${i*.43}s" x="${x}" y="${y}" width="1.5" height="1.5" fill="#ffe2a2"/>`;}}
    if(p>=.8)out += '<g class="morning-birds" fill="none" stroke="#65516c" stroke-width="1.5"><path d="M230 54h3v2h3v-2h3M249 45h3v2h3v-2h3M265 58h3v2h3v-2h3"/></g>';
    return out+'</g>';
  }

  function atmosphere(world, layer, id) {
    if(layer==='sky') {
      if(world==='scifi') return `<g class="world-atmosphere space-meteors" aria-hidden="true" shape-rendering="geometricPrecision"><defs><linearGradient id="${id}-meteor" gradientUnits="userSpaceOnUse" x1="-20" y1="-10" x2="0" y2="0"><stop offset="0" stop-color="#abd7f2" stop-opacity="0"/><stop offset=".7" stop-color="#c4e9fa" stop-opacity=".35"/><stop offset="1" stop-color="#effaff" stop-opacity=".85"/></linearGradient></defs>${[[65,22,0],[225,30,11]].map(([x,y,delay])=>`<g transform="translate(${x} ${y})"><g class="shooting-star" style="animation-delay:-${delay}s"><path d="M-20-10L0 0" stroke="url(#${id}-meteor)" stroke-width=".85" stroke-linecap="round"/><circle r=".9" fill="#f1fbff"/></g></g>`).join('')}</g>`;
      if(world==='pirates') return '<g class="world-atmosphere sea-gulls" aria-hidden="true"><g class="gull-flock"><path d="M42 43h4v2h3v-2h4M64 35h4v2h3v-2h4M80 48h4v2h3v-2h4" fill="none" stroke="#e6e9d8" stroke-width="1.4"/></g></g>';
      return '<g class="world-atmosphere enchanted-sky" aria-hidden="true"><g class="fantasy-wisp"><path d="M59 58h2v2h2v2h-2v2h-2v-2h-2v-2h2z" fill="#d9c0fa"/><rect x="51" y="65" width="1" height="1" fill="#f2d4a6"/></g><g class="fantasy-wisp wisp-two"><path d="M270 66h2v2h2v2h-2v2h-2v-2h-2v-2h2z" fill="#aee4cb"/></g></g>';
    }
    if(world==='pirates') return '<g class="world-atmosphere sea-shimmer" aria-hidden="true"><g class="sea-glints"><path d="M75 196h8M79 193v6M265 211h10M270 208v6M343 176h7M346 173v6" stroke="#c0f0e5" stroke-width="1"/></g><g class="sea-ripples"><path d="M50 224h12m3 0h4M204 232h17m3 0h4M307 203h13" stroke="#99d9d1" stroke-width="1.5" opacity=".4"/></g></g>';
    if(world==='fantasy') return `<g class="world-atmosphere forest-magic" aria-hidden="true">${[[39,174],[149,146],[236,178],[336,141]].map(([x,y],i)=>`<g transform="translate(${x} ${y})"><g class="magic-mote" style="animation-delay:-${i*2}s"><rect width="2" height="2" fill="${i%2?'#d5b1f0':'#ffe1a2'}"/><rect x="-2" y="-2" width="6" height="6" fill="#e8caee" opacity=".08"/></g></g>`).join('')}</g>`;
    return '<g class="world-atmosphere orbit-signal" aria-hidden="true"><circle class="signal-ring" cx="354" cy="63" r="6" fill="none" stroke="#87cee2" stroke-width=".7"/></g>';
  }

  const CHAPTERS_PER_STRETCH = 8;
  function stretchAt(total, requestedIndex) {
    const count = Math.max(1, Math.ceil(total / CHAPTERS_PER_STRETCH));
    const index = Math.max(0, Math.min(count - 1, requestedIndex));
    return {index, count, start: Math.ceil(index * total / count), end: Math.ceil((index + 1) * total / count)};
  }
  function chapterStretch(total, selected) {
    const count = Math.max(1, Math.ceil(total / CHAPTERS_PER_STRETCH));
    return stretchAt(total, Math.floor(Math.max(0, Math.min(total - 1, selected)) * count / total));
  }

  /* ---------- main render ---------- */
  function render(container, opts) {
    const total = Math.max(1, opts.total | 0);
    const completed = Math.max(0, Math.min(total, opts.completed | 0));
    const done = completed >= total;
    const p = completed / total;
    const id = 'j' + ++uidCounter;
    const sceneWorld=opts.world?global.Characters.normalizeWorld(opts.world):world;
    const sceneSky=sceneWorld==='scifi'?global.SpaceWorld.palette:sceneWorld==='pirates'?global.PirateWorld.palette:sky;
    const { top, bottom } = sceneSky(p);
    const stretch = opts.interactive && total > CHAPTERS_PER_STRETCH
      ? chapterStretch(total, opts.selected ?? Math.min(completed, total - 1))
      : {start: 0, end: total};
    const span = stretch.end - stretch.start;
    const trailProgress = value => Math.max(0, Math.min(1, (value * total - stretch.start) / span));
    // Small bookshelf previews show representative stops rather than stacking every chapter.
    const markerCount = Math.min(span, opts.interactive ? span : 10);
    const indices = Array.from({length: markerCount}, (_, i) =>
      stretch.start + Math.ceil((i + 1) * span / markerCount) - 1);
    const marks = indices.map(i => pointAt((i + 1 - stretch.start) / span));
    const visibleCompleted = indices.filter(i => i < completed).length;
    const traveler = pointAt(trailProgress(p));
    const curIdx = done ? total - 1 : completed;
    const litPos = trailProgress(p);
    const litLen = litPos * SAMPLES.length;
    const radius = sceneWorld==='pirates'?2.4:4.6;

    let m = '';
    marks.forEach((pt, localIndex) => {
      const i = indices[localIndex];
      const isDone = i < completed;
      const isCur = i === curIdx && !done;
      const sel = opts.selected === i;
      const cls = isCur ? 'mk cur' : isDone ? 'mk done' : 'mk todo';
      const r = isCur ? radius + (sceneWorld==='pirates'?1:2.6) : radius;
      m += `<g class="${cls}${sel ? ' sel' : ''}" data-i="${i}" transform="translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})">`;
      if (isDone || isCur) m += `<circle class="halo" r="${r + 5}"/>`;
      if (isCur) m += `<circle class="pulse" r="${r + 2}"/>`;
      m += `<circle class="dot" r="${r}"/>`;
      if (sel) m += `<circle class="selring" r="${r + 5}"/>`;
      if (opts.interactive) m += `<circle class="hit" r="13" tabindex="0" role="button" aria-label="Chapter ${i + 1}, ${isDone ? 'completed' : isCur ? 'current' : 'upcoming'}"/>`;
      m += '</g>';
    });

    const focalMarkup=`<g data-sun>${sceneWorld==='scifi'?global.SpaceWorld.moon(p,opts.animateSun,done):sceneWorld==='pirates'?global.PirateWorld.horizon(p,opts.animateSun,done):sun(p,opts.animateSun,done).replace('url(#GL)',`url(#${id}G)`)}</g>`;
    container.innerHTML = `
<svg data-world="${sceneWorld}" class="journey${done ? ' is-complete' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="${opts.interactive ? 'group' : 'img'}"
     aria-label="${Services.esc(opts.label || `Progress: ${completed} of ${total} chapters`)}" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="${id}S" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <radialGradient id="${id}G"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset=".45" stop-color="#ff9f6e" stop-opacity=".28"/><stop offset="1" stop-color="#ff9f6e" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}P" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa6ff"/><stop offset=".55" stop-color="#ffb98a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}S)"/>
  ${stars(sceneWorld==='scifi'||sceneWorld==='pirates'?p*.25:p)}${sceneWorld==='scifi'?global.SpaceWorld.orbit():sceneWorld==='pirates'?global.PirateWorld.orbit():moon(p)}
  ${atmosphere(sceneWorld,'sky',id)}
  ${sceneWorld==='pirates'?'':focalMarkup}
  ${sceneWorld==='scifi'?global.SpaceWorld.terrain(p):sceneWorld==='pirates'?global.PirateWorld.terrain(p):hills(p, bottom)}
  ${sceneWorld==='pirates'?focalMarkup:''}
  <g class="trail" shape-rendering="geometricPrecision" fill="none" stroke-linecap="round">
    <path d="${PATH_D}" class="trail-base" stroke-width="3"/>
    <path d="${PATH_D}" class="trail-lit-glow" stroke="url(#${id}P)" stroke-width="8" opacity=".22" pathLength="${SAMPLES.length.toFixed(2)}" stroke-dasharray="0 ${SAMPLES.length.toFixed(2)}" data-lit="${litLen.toFixed(2)}"/>
    <path d="${PATH_D}" class="trail-lit" stroke="url(#${id}P)" stroke-width="3" pathLength="${SAMPLES.length.toFixed(2)}" stroke-dasharray="0 ${SAMPLES.length.toFixed(2)}" data-lit="${litLen.toFixed(2)}"/>
  </g>
  ${sceneWorld==='scifi'?global.SpaceWorld.scenery(p,visibleCompleted,marks,traveler):sceneWorld==='pirates'?global.PirateWorld.scenery(p,visibleCompleted,marks,traveler):scenery(p, visibleCompleted, marks, traveler)}
  ${atmosphere(sceneWorld,'ground',id)}
  <g class="markers" shape-rendering="geometricPrecision">${m}</g>
  <g class="landscape-explorer" data-direction="down" data-frame="0" style="pointer-events:none" transform="translate(${traveler.x.toFixed(1)} ${(traveler.y-15).toFixed(1)})" shape-rendering="crispEdges" aria-hidden="true">
    ${sceneWorld==='pirates'?global.PirateWorld.boat(characterSprite(opts.character||character)):`<ellipse cx="0" cy="15" rx="5" ry="2" fill="#080b26" opacity=".5"/>${characterSprite(opts.character||character)}`}
  </g>
</svg>`;

    const svg = container.firstElementChild;
    const reduced = global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previous = Number.isFinite(opts.previousCompleted) ? Math.max(0, Math.min(total, opts.previousCompleted))/total : p;
    const moving = previous !== p && !reduced;
    const walker = svg.querySelector('.landscape-explorer');
    const sunGroup = svg.querySelector('[data-sun]');
    const skyStops = svg.querySelectorAll(`#${id}S stop`);
    const sunY = value => sceneWorld==='pirates'?global.PirateWorld.focalY(value):232-120*(value*value*(3-2*value));
    function paintProgress(value, position) {
      const pt = position || pointAt(trailProgress(value)), palette=sceneSky(value);
      if(sceneWorld==='pirates')global.PirateWorld.setLight(svg,value);
      walker.setAttribute('transform',`translate(${pt.x.toFixed(1)} ${(pt.y-15).toFixed(1)})`);
      sunGroup.setAttribute('transform',`translate(0 ${(sunY(value)-sunY(p)).toFixed(1)})`);
      skyStops[0].setAttribute('stop-color', palette.top);
      skyStops[1].setAttribute('stop-color', palette.bottom);
      svg.querySelectorAll('[data-lit]').forEach(el => {el.style.strokeDasharray=`${trailProgress(value)*SAMPLES.length} ${SAMPLES.length}`;});
    }
    if(moving){
      paintProgress(previous);
      walker.classList.add('walking');
      svg.classList.add('journey-moving');
      const steps=walkingSteps(trailProgress(previous),trailProgress(p)), duration=(steps.length-1)*85;
      let started;
      const frame = now => {
        if(!svg.isConnected)return;
        if(started===undefined)started=now;
        const elapsed=now-started;
        const t=duration?Math.min(1,elapsed/duration):1;
        const index=Math.min(steps.length-1,Math.floor(elapsed/85));
        const from=steps[index], step=steps[Math.min(index+1,steps.length-1)];
        const blend=t===1?1:(elapsed/85-index);
        const position={x:from.x+(step.x-from.x)*blend,y:from.y+(step.y-from.y)*blend};
        paintProgress(previous+(p-previous)*t,position);
        walker.setAttribute('data-direction',t===1?'down':step.direction);
        walker.setAttribute('data-frame',sceneWorld==='pirates'||t===1?'0':String(index%2+1));
        if(t<1)requestAnimationFrame(frame);
        else{walker.classList.remove('walking');svg.classList.remove('journey-moving');opts.onArrival?.();}
      };
      requestAnimationFrame(frame);
    }else{
      paintProgress(p);
      walker.setAttribute('data-direction','down');
      walker.setAttribute('data-frame','0');
      if(opts.onArrival)requestAnimationFrame(()=>{if(svg.isConnected)opts.onArrival();});
    }

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

  global.Journey = { render, chapterStretch, stretchAt, CHAPTERS_PER_STRETCH, markerPositions, pointAt, walkingSteps, walkDuration, useBook, getWorld, characterForBook, getCharacter, getCharacters, getCharacterInfo, setCharacter, characterSprite, PATH_D };
})(window);
