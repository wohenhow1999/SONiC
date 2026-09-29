/* =========================================================
   3D 架構圖（three.js）
   S.view3d(host, spec, { onSelect }) → { setState, dispose }

   沿用 S.diagram 的 spec：
     nodes[].x / y / w / h   平面上的位置與大小（2D 座標，y 往下）
     nodes[].lv              所在層（選用），層與層之間相隔 spec.layerGap
     spec.layers             [{ lv, label }]：每層畫一片半透明平面
     groups / edges / steps  與 2D 相同
   state = { nodes:[id], edges:[edge], sel:id|null, ordered:bool }
   ========================================================= */
(function () {
  const HEIGHT = { hw: 30, kernel: 24, db: 26, proc: 20, container: 20, ext: 22, file: 14, cli: 18 };
  const VIEWS = { tilt: [58, 0], iso: [36, -16], top: [88, 0], front: [26, 0], side: [40, -30] };

  S.has3d = function () {
    if (!window.THREE || !THREE.OrbitControls || !THREE.CSS2DRenderer) return false;
    if (S._webgl != null) return S._webgl;
    try {
      const c = document.createElement('canvas');
      S._webgl = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { S._webgl = false; }
    return S._webgl;
  };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  function isDark() { return new THREE.Color(css('--bg')).getHSL({}).l < 0.5; }
  function mix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }

  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function flat(geo) { geo.rotateX(-Math.PI / 2); return geo; }
  function outline(shape, mat) {
    const pts = shape.getPoints(6).map(p => new THREE.Vector3(p.x, 0, -p.y));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }

  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  }

  // 已從頁面移除的場景立即釋放 WebGL context（瀏覽器對同時存在的 context 數量有上限）
  const live = [];
  function sweep() {
    for (let i = live.length - 1; i >= 0; i--) if (!document.body.contains(live[i].el)) { live[i].dispose(); live.splice(i, 1); }
  }
  window.addEventListener('hashchange', () => setTimeout(sweep, 0));

  S.view3d = function (host, spec, hooks) {
    sweep();
    hooks = hooks || {};
    const W = spec.w || 1000, H = spec.h || 560, LG = spec.layerGap || 120;
    // 3D 可用 x3 / y3 覆寫平面位置（例如把 overlay 疊在 underlay 正上方）
    const has3 = o => o.x3 != null || o.y3 != null;
    const NODES = (spec.nodes || []).map(n => has3(n) ? Object.assign({}, n, { x: n.x3 != null ? n.x3 : n.x, y: n.y3 != null ? n.y3 : n.y, _moved: true }) : n);
    const GROUPS = (spec.groups || []).map(g => has3(g) ? Object.assign({}, g, { x: g.x3 != null ? g.x3 : g.x, y: g.y3 != null ? g.y3 : g.y }) : g);
    const nodes = {};
    NODES.forEach(n => { nodes[n.id] = n; });
    const lvOf = n => (n.lv || 0) * LG;
    const P = (x, y, h) => new THREE.Vector3(x - W / 2, h || 0, y - H / 2);

    // ---------- renderer ----------
    const wrap = S.el('div', { class: 'v3' });
    host.appendChild(wrap);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    const labels = new THREE.CSS2DRenderer();
    labels.domElement.className = 'v3-labels';
    wrap.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 5, 20000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.enableZoom = false; controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI * 0.47;
    controls.rotateSpeed = 0.6;

    // ---------- 光源與地面 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a93a3, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    const span = Math.max(W, H) * 0.75;
    const topLv = Math.max(0, ...(spec.nodes || []).map(n => n.lv || 0));
    const moved = e => nodes[e.from]._moved || nodes[e.to]._moved;
    sun.position.set(-W * 0.35, 900 + topLv * LG, H * 0.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 3000 + topLv * LG });
    sun.shadow.radius = 4;
    scene.add(sun);
    const ground = new THREE.Mesh(flat(new THREE.PlaneGeometry(W * 1.6, H * 1.6)), new THREE.ShadowMaterial({ opacity: 0.1 }));
    ground.position.y = -0.5; ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(Math.max(W, H) * 1.4, Math.round(Math.max(W, H) * 1.4 / 60));
    grid.material.transparent = true;
    grid.position.y = -0.4;
    scene.add(grid);

    const theme = {};
    const disposables = [];
    const track = o => { disposables.push(o); return o; };

    // ---------- 層 ----------
    const layerObjs = [];
    (spec.layers || []).forEach(L => {
      const y = L.lv * LG - 2;
      const shape = rrShape(W - 20, H - 20, 18);
      const mat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      const m = new THREE.Mesh(track(flat(new THREE.ShapeGeometry(shape))), mat);
      m.position.y = y;
      const lmat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
      const ln = outline(shape, lmat); ln.position.y = y + 0.2;
      scene.add(m); scene.add(ln);
      const lab = new THREE.CSS2DObject(S.el('div', null, S.el('span', { class: 'v3-layer' }, L.label)));
      lab.position.set(-W / 2 + 26, y + 2, H / 2 - 26);
      scene.add(lab);
      layerObjs.push({ mat, lmat, L });
    });

    // ---------- 群組 ----------
    const groupObjs = [];
    GROUPS.forEach(g => {
      const shape = rrShape(g.w, g.h, 12);
      const y = (g.lv || 0) * LG + 0.6;
      const mat = track(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }));
      const m = new THREE.Mesh(track(flat(new THREE.ShapeGeometry(shape))), mat);
      m.position.copy(P(g.x + g.w / 2, g.y + g.h / 2, y)); m.receiveShadow = true;
      const lmat = track(new THREE.LineDashedMaterial({ dashSize: 6, gapSize: 5, transparent: true, opacity: 0.8 }));
      const ln = outline(shape, lmat); ln.computeLineDistances(); ln.position.copy(m.position); ln.position.y += 0.3;
      scene.add(m); scene.add(ln);
      const gel = S.el('span', { class: 'v3-grp' }, g.label);
      const lab = new THREE.CSS2DObject(S.el('div', null, gel));
      lab.position.copy(P(g.x + 14, g.y + g.h - 14, y + 1));
      scene.add(lab);
      groupObjs.push({ g, mat, lmat, el: gel });
    });

    // ---------- 節點 ----------
    const nodeObjs = {};
    const pickables = [];
    NODES.forEach(n => {
      const k = n.kind || 'proc', hgt = HEIGHT[k] || 20, base = lvOf(n);
      const grp = new THREE.Group();
      grp.position.copy(P(n.x + n.w / 2, n.y + n.h / 2, base));
      const geo = track(THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(n.w, hgt, n.h, 3, Math.min(8, hgt / 2 - 1)) : new THREE.BoxGeometry(n.w, hgt, n.h));
      const body = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02, transparent: true })));
      body.position.y = hgt / 2; body.castShadow = true; body.receiveShadow = true;
      body.userData.id = n.id;
      grp.add(body);
      const shape = rrShape(n.w - 6, n.h - 6, k === 'db' ? 4 : 7);
      const capMat = track(new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, polygonOffset: true, polygonOffsetFactor: -1 }));
      const cap = new THREE.Mesh(track(flat(new THREE.ShapeGeometry(shape))), capMat);
      cap.position.y = hgt + 0.3; grp.add(cap);
      const lineMat = track(new THREE.LineBasicMaterial({ transparent: true }));
      const ol = outline(shape, lineMat); ol.position.y = hgt + 0.5; grp.add(ol);
      const el = S.el('div', { class: 'v3-node' }, S.el('b', null, n.label.replace(/\n/g, ' ')), n.sub ? S.el('span', null, n.sub.replace(/\n/g, ' ')) : null);
      el.addEventListener('click', ev => { ev.stopPropagation(); hooks.onSelect && hooks.onSelect(n.id); });
      const lab = new THREE.CSS2DObject(el);
      lab.position.y = hgt + 2;
      grp.add(lab);
      scene.add(grp);
      pickables.push(body);
      nodeObjs[n.id] = { n, k, grp, body, capMat, lineMat, el, base: grp.position.y, lift: 0, liftT: 0, op: 1, opT: 1, hgt };
    });

    // ---------- 連線 ----------
    function clip2(n, tx, ty, pad) {
      const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
      if (!dx && !dy) return [cx, cy];
      const s = Math.min((n.w / 2 + pad) / Math.abs(dx || 1e-9), (n.h / 2 + pad) / Math.abs(dy || 1e-9));
      return [cx + dx * s, cy + dy * s];
    }
    const edgeObjs = {};
    const ekey = e => e.id || (e.from + '>' + e.to);
    (spec.edges || []).forEach(e => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) return;
      let pts;
      const la = lvOf(a), lb = lvOf(b);
      const via3 = moved(e) ? (e.via3 || []) : (e.via || []);
      if (la !== lb && !via3.length) {
        // 跨層：由上層節點底部垂直連到下層節點頂部
        const up = la > lb ? [a, b] : [b, a];
        const hi = up[0], lo = up[1];
        const p1 = P(hi.x + hi.w / 2, hi.y + hi.h / 2, lvOf(hi));
        const p2 = P(lo.x + lo.w / 2, lo.y + lo.h / 2, lvOf(lo) + (HEIGHT[lo.kind || 'proc'] || 20) + 1);
        pts = la > lb ? [p1, p2] : [p2, p1];
      } else {
        const via = via3;
        const f = via.length ? via[0] : [b.x + b.w / 2, b.y + b.h / 2];
        const l = via.length ? via[via.length - 1] : [a.x + a.w / 2, a.y + a.h / 2];
        const p1 = clip2(a, f[0], f[1], 3), p2 = clip2(b, l[0], l[1], 6);
        const hy = Math.max(la, lb) + 7;
        pts = [p1, ...via, p2].map(p => P(p[0], p[1], hy));
      }
      const curve = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      const mat = track(new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.5 }));
      let line;
      if (e.dash) {
        const lm = track(new THREE.LineDashedMaterial({ dashSize: 7, gapSize: 5, transparent: true }));
        line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm);
        line.computeLineDistances();
        line.userData.lm = lm;
      } else {
        const segs = Math.max(8, pts.length * 12);
        line = new THREE.Mesh(track(new THREE.TubeGeometry(curve, segs, 1.7, 8, false)), mat);
        line.castShadow = true;
      }
      scene.add(line);
      const heads = [];
      const mkHead = (tip, from) => {
        const cone = new THREE.Mesh(track(new THREE.ConeGeometry(4.2, 11, 12)), mat);
        const dir = tip.clone().sub(from).normalize();
        cone.position.copy(tip).addScaledVector(dir, -5.5);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        scene.add(cone); heads.push(cone);
      };
      mkHead(pts[pts.length - 1], pts[pts.length - 2]);
      if (e.bi) mkHead(pts[0], pts[1]);
      let lab = null;
      if (e.label) {
        let best = 0, bl = -1;
        for (let i = 0; i < pts.length - 1; i++) { const d = pts[i].distanceTo(pts[i + 1]); if (d > bl) { bl = d; best = i; } }
        const pos = e.lx != null && !moved(e) ? P(e.lx, e.ly, Math.max(la, lb) + 9) : pts[best].clone().lerp(pts[best + 1], 0.5).add(new THREE.Vector3(0, 2, 0));
        lab = new THREE.CSS2DObject(S.el('div', { class: 'v3-edge' }, String(e.label).replace(/\n/g, ' ')));
        lab.position.copy(pos);
        scene.add(lab);
      }
      edgeObjs[ekey(e)] = { e, pts, curve, len: curve.getLength(), line, mat, heads, lab };
    });

    // ---------- 封包 ----------
    const packets = [];
    const pktGeo = track(new THREE.SphereGeometry(4.6, 16, 12));
    const pktMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const glowMat = track(new THREE.SpriteMaterial({ map: glow(), transparent: true, depthWrite: false }));
    function clearPackets() { packets.forEach(p => { scene.remove(p.m); scene.remove(p.s); }); packets.length = 0; }
    function addPackets(eo, delay) {
      const n = Math.max(1, Math.min(3, Math.round(eo.len / 180)));
      for (let i = 0; i < n; i++) {
        const dirs = eo.e.bi ? [1, -1] : [1];
        dirs.forEach(d => {
          const m = new THREE.Mesh(pktGeo, pktMat), s = new THREE.Sprite(glowMat);
          s.scale.set(38, 38, 1); m.visible = s.visible = false;
          scene.add(m); scene.add(s);
          packets.push({ eo, m, s, dir: d, delay, off: i / n + (d < 0 ? 0.5 / n : 0) });
        });
      }
    }

    // ---------- 主題 ----------
    function applyTheme() {
      const dark = isDark();
      theme.dark = dark;
      theme.panel = css('--panel'); theme.text = css('--text'); theme.accent = new THREE.Color(css('--accent'));
      theme.edge = new THREE.Color(css('--faint')); theme.border = css('--border-strong');
      renderer.setClearColor(0x000000, 0);
      hemi.intensity = dark ? 0.7 : 0.78;
      hemi.groundColor = new THREE.Color(dark ? 0x1a2230 : 0x8a93a3);
      sun.intensity = dark ? 0.55 : 0.7;
      ground.material.opacity = dark ? 0.35 : 0.1;
      grid.material.color = new THREE.Color(css('--border'));
      grid.material.opacity = dark ? 0.28 : 0.35;
      Object.values(nodeObjs).forEach(o => {
        const kc = css('--k-' + o.k);
        o.color = kc;
        o.bodyColor = mix(kc, theme.panel, dark ? 0.45 : 0.5);
        o.hotColor = mix(kc, theme.panel, dark ? 0.12 : 0.08);
        o.dimColor = mix(css('--faint'), theme.panel, dark ? 0.7 : 0.72);
        o.capColor = mix(kc, theme.panel, dark ? 0.72 : 0.86);
        o.lineColor = mix(kc, theme.panel, 0.15);
      });
      groupObjs.forEach(o => {
        const c = css('--k-' + (o.g.kind || 'container'));
        o.mat.color = mix(c, theme.panel, dark ? 0.78 : 0.8);
        o.lmat.color = new THREE.Color(c);
        o.el.style.color = c;
      });
      layerObjs.forEach((o, i) => {
        const c = css(['--k-hw', '--k-kernel', '--k-db', '--k-proc', '--k-container', '--k-ext'][i % 6]);
        o.mat.color = mix(c, theme.panel, dark ? 0.8 : 0.9);
        o.lmat.color = new THREE.Color(c);
      });
      pktMat.color = theme.accent.clone().lerp(new THREE.Color(0xffffff), dark ? 0.35 : 0);
      glowMat.color = theme.accent.clone();
      glowMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      glowMat.opacity = dark ? 0.9 : 0.55;
      glowMat.needsUpdate = true;
      paint();
    }

    // ---------- 狀態 ----------
    let state = { nodes: [], edges: [], sel: null, ordered: false };
    let clock = 0;
    function paint() {
      const active = state.sel || state.nodes.length || state.edges.length;
      const dark = theme.dark;
      const hlN = new Set(state.nodes), hlE = new Set(state.edges.map(ekey)), dnE = new Set((state.down || []).map(ekey));
      Object.values(nodeObjs).forEach(o => {
        const on = hlN.has(o.n.id) || state.sel === o.n.id;
        o.liftT = state.sel === o.n.id ? 14 : on ? 8 : 0;
        o.opT = !active || on ? 1 : 0.55;
        const acc = state.sel === o.n.id;
        o.body.material.color.copy(!active ? o.bodyColor : on ? o.hotColor : o.dimColor);
        o.capMat.color.copy(!active ? o.capColor : on ? mix(o.color, theme.panel, dark ? 0.55 : 0.72) : mix(css('--faint'), theme.panel, 0.85));
        o.lineMat.color.copy(acc ? theme.accent : on && active ? new THREE.Color(o.color) : o.lineColor);
        o.body.material.emissive = on && active ? new THREE.Color(o.color).multiplyScalar(0.12) : new THREE.Color(0);
        o.el.classList.toggle('on', !!(on && active));
        o.el.classList.toggle('dim', !!(active && !on));
      });
      Object.values(edgeObjs).forEach(eo => {
        const on = hlE.has(ekey(eo.e)), dn = dnE.has(ekey(eo.e));
        const c = dn ? new THREE.Color(css('--bad')) : on ? theme.accent : theme.edge;
        const op = dn ? 0.95 : !active || on ? (on ? 1 : 0.85) : 0.18;
        eo.mat.color.copy(c); eo.mat.opacity = op;
        if (eo.line.userData.lm) { eo.line.userData.lm.color.copy(c); eo.line.userData.lm.opacity = op; }
        if (eo.lab) { eo.lab.element.classList.toggle('bad', dn); eo.lab.element.classList.toggle('on', on); eo.lab.element.classList.toggle('dim', !!(active && !on)); }
      });
    }
    function setState(s) {
      state = Object.assign({ nodes: [], edges: [], down: [], sel: null, ordered: false }, s);
      clearPackets();
      clock = 0;
      state.edges.forEach((e, i) => { const eo = edgeObjs[ekey(e)]; if (eo) addPackets(eo, state.ordered ? i * 0.45 : 0); });
      paint();
      kick();
    }

    // ---------- 相機 ----------
    const bbox = new THREE.Box3();
    Object.values(nodeObjs).forEach(o => bbox.expandByPoint(o.grp.position.clone().add(new THREE.Vector3(-o.n.w / 2, 0, -o.n.h / 2))).expandByPoint(o.grp.position.clone().add(new THREE.Vector3(o.n.w / 2, o.hgt + 16, o.n.h / 2))));
    groupObjs.forEach(o => { bbox.expandByPoint(P(o.g.x, o.g.y, 0)); bbox.expandByPoint(P(o.g.x + o.g.w, o.g.y + o.g.h, 0)); });
    const center = bbox.getCenter(new THREE.Vector3());
    const corners = [];
    [bbox.min.x, bbox.max.x].forEach(x => [bbox.min.y, bbox.max.y].forEach(y => [bbox.min.z, bbox.max.z].forEach(z => corners.push(new THREE.Vector3(x, y, z)))));
    function camFor(view) {
      const [el, az] = VIEWS[view] || VIEWS.tilt;
      const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      let d = Math.max(W, H) * 1.6;
      const tmp = camera.clone();
      for (let i = 0; i < 6; i++) {
        tmp.position.copy(center).addScaledVector(dir, d);
        tmp.up.set(0, 1, 0);
        if (el > 85) tmp.up.set(0, 0, -1);
        tmp.lookAt(center); tmp.updateMatrixWorld(); tmp.updateProjectionMatrix();
        let m = 0;
        corners.forEach(c => { const p = c.clone().project(tmp); m = Math.max(m, Math.abs(p.x), Math.abs(p.y)); });
        d *= m / 0.9;
      }
      return center.clone().addScaledVector(dir, d);
    }
    let anim = null;
    function setView(view, instant) {
      const to = camFor(view);
      if (instant) { camera.position.copy(to); controls.target.copy(center); controls.update(); kick(); return; }
      anim = { from: camera.position.clone(), to, tFrom: controls.target.clone(), t: 0 };
      kick();
    }
    function zoom(f) { const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).addScaledVector(d, f); kick(); }

    // ---------- 工具列 ----------
    const bar = S.el('div', { class: 'v3-bar' });
    [['tilt', '斜視'], ['iso', '立體'], ['side', '側視'], ['top', '俯視'], ['front', '正視']].forEach(([v, l]) => bar.appendChild(S.el('button', { onclick: () => setView(v) }, l)));
    bar.appendChild(S.el('button', { onclick: () => zoom(0.82), 'aria-label': '放大' }, '+'));
    bar.appendChild(S.el('button', { onclick: () => zoom(1.22), 'aria-label': '縮小' }, '−'));
    wrap.appendChild(bar);
    wrap.appendChild(S.el('div', { class: 'v3-help' }, '拖曳旋轉 · 右鍵或雙指平移 · Ctrl + 滾輪縮放'));

    // ---------- 互動 ----------
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener('pointerup', ev => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(pickables)[0];
      if (hit && hooks.onSelect) hooks.onSelect(hit.object.userData.id);
    });
    renderer.domElement.addEventListener('pointermove', ev => {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      renderer.domElement.style.cursor = ray.intersectObjects(pickables).length ? 'pointer' : 'grab';
    });
    renderer.domElement.addEventListener('wheel', ev => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      zoom(ev.deltaY > 0 ? 1.08 : 0.93);
    }, { passive: false });
    controls.addEventListener('change', kick);

    // ---------- 尺寸 ----------
    function resize() {
      const w = wrap.clientWidth || 800;
      const h = Math.round(Math.max(340, Math.min(620, w * (H / W) * 0.9 + 60)));
      wrap.style.height = h + 'px';
      renderer.setSize(w, h); labels.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      kick();
    }
    const ro = new ResizeObserver(() => { const had = camera.aspect; resize(); if (!inited || Math.abs(had - camera.aspect) > 0.05) setView(curView, true); inited = true; });
    let inited = false, curView = typeof spec.view3d === 'string' ? spec.view3d : 'tilt';
    ro.observe(wrap);

    // ---------- 迴圈 ----------
    let lastPpu = 0, visible = true, raf = 0, last = 0, idle = 0, dead = false;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '100px' });
    io.observe(wrap);
    function kick() { idle = 0; if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function frame(t) {
      raf = 0;
      if (!document.body.contains(wrap)) { dispose(); return; }
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      clock += dt;
      let moving = false;
      if (anim) {
        anim.t = Math.min(1, anim.t + dt / 0.6);
        const k = 1 - Math.pow(1 - anim.t, 3);
        camera.position.lerpVectors(anim.from, anim.to, k);
        controls.target.lerpVectors(anim.tFrom, center, k);
        if (anim.t >= 1) anim = null;
        moving = true;
      }
      if (controls.update()) moving = true;
      Object.values(nodeObjs).forEach(o => {
        const dl = o.liftT - o.lift, dop = o.opT - o.op;
        if (Math.abs(dl) > 0.05 || Math.abs(dop) > 0.01) {
          o.lift += dl * Math.min(1, dt * 10); o.op += dop * Math.min(1, dt * 10);
          o.grp.position.y = o.base + o.lift;
          o.body.material.opacity = o.op; o.capMat.opacity = o.op; o.lineMat.opacity = o.op;
          moving = true;
        }
      });
      packets.forEach(p => {
        const tt = clock - p.delay;
        const on = tt >= 0;
        p.m.visible = p.s.visible = on;
        if (!on) return;
        const cyc = p.eo.len / 150 + 0.25;
        let u = ((tt / cyc) + p.off) % 1;
        if (p.dir < 0) u = 1 - u;
        const pos = p.eo.curve.getPointAt(Math.min(0.999, u));
        p.m.position.copy(pos); p.s.position.copy(pos);
      });
      if (packets.length) moving = true;
      if (visible) {
        const ppu = renderer.domElement.clientHeight / (2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        if (Math.abs(ppu - lastPpu) > 0.004) { wrap.style.setProperty('--v3u', ppu.toFixed(3)); lastPpu = ppu; }
        renderer.render(scene, camera); labels.render(scene, camera);
      }
      idle = moving ? 0 : idle + 1;
      if (visible && idle < 30) raf = requestAnimationFrame(frame);
    }

    // 主題變更
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => applyTheme();
    mq.addEventListener && mq.addEventListener('change', onMq);

    function dispose() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      mq.removeEventListener && mq.removeEventListener('change', onMq);
      controls.dispose();
      disposables.forEach(d => d.dispose && d.dispose());
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    }

    applyTheme();
    resize();
    setView(curView, true);
    inited = true;
    const api = { setState, dispose, setView, el: wrap };
    live.push(api);
    return api;
  };
})();
