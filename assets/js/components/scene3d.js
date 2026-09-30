/* =========================================================
   3D 場景引擎（three.js）
   S.scene3d(host, {
     title, hint, height,
     view: [px, py, pz, tx, ty, tz],          // 預設相機
     build(k),                                 // 建立場景，k 為工具組
     steps: [{ title, text, view?, enter(k) }],
     intro
   })

   與 2D 架構圖不同，這裡的 3D 位置本身帶有意義（分層、包含、封裝）。
   文字以 WebGL 貼圖繪製（不使用 DOM），拖曳時不需要更新任何 DOM。
   ========================================================= */
(function () {
  const TAU = Math.PI * 2;

  S.has3d = S.has3d || function () {
    if (!window.THREE || !THREE.OrbitControls) return false;
    if (S._webgl != null) return S._webgl;
    try { const c = document.createElement('canvas'); S._webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { S._webgl = false; }
    return S._webgl;
  };

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // 已移出頁面的場景：釋放 WebGL context
  const live = [];
  function sweep() { for (let i = live.length - 1; i >= 0; i--) if (!document.body.contains(live[i].el)) { live[i].dispose(); live.splice(i, 1); } }
  window.addEventListener('hashchange', () => setTimeout(sweep, 0));

  S.scene3d = function (host, spec) {
    sweep();
    const root = S.el('div', { class: 'dg s3' });
    const head = S.el('div', { class: 'dg-head' },
      S.el('span', { class: 'dg-title' }, spec.title || '3D 模型'),
      S.el('span', { class: 'dg-hint' }, spec.hint || '拖曳旋轉 · 右鍵平移 · 點選元件看說明'));
    const stage = S.el('div', { class: 's3-stage' });
    root.appendChild(head); root.appendChild(stage);
    const panel = S.el('div', { class: 'dg-panel' });
    const stepsBox = S.el('div', { class: 'dg-steps' });
    const desc = S.el('div', { class: 'dg-desc', 'aria-live': 'polite' });
    panel.appendChild(stepsBox);
    root.appendChild(panel);
    host.appendChild(root);

    if (!S.has3d()) {
      stage.appendChild(S.el('div', { class: 's3-fallback' }, '此瀏覽器不支援 WebGL，無法顯示 3D 模型；本章其他架構圖不受影響。'));
      stepsBox.appendChild(desc);
      desc.innerHTML = spec.intro || '';
      return null;
    }

    // ---------- renderer / scene ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 2000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.enableZoom = false; controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.49; controls.rotateSpeed = 0.55;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7280, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-40, 90, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sb = spec.shadowBounds || 60;
    Object.assign(sun.shadow.camera, { left: -sb, right: sb, top: sb, bottom: -sb, near: 1, far: 300 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.14 }));
    ground.receiveShadow = true;
    scene.add(ground);

    // ---------- 主題與材質 ----------
    const themed = [];   // { mat, token, mix, prop }
    const labels = [];   // { draw }
    const disposables = [];
    function tokenColor(token, mixPanel) {
      const c = new THREE.Color(token && token.startsWith('--') ? css(token) : token || '#888');
      if (mixPanel) c.lerp(new THREE.Color(css('--panel')), mixPanel);
      return c;
    }
    function applyTheme() {
      const dark = new THREE.Color(css('--bg')).getHSL({}).l < 0.5;
      k.dark = dark;
      hemi.intensity = dark ? 0.7 : 0.85;
      hemi.groundColor = new THREE.Color(dark ? 0x1b2330 : 0x6b7280);
      sun.intensity = dark ? 0.6 : 0.75;
      ground.material.opacity = dark ? 0.35 : 0.14;
      themed.forEach(t => { t.mat[t.prop || 'color'] = tokenColor(t.token, t.mix); });
      labels.forEach(l => l.draw());
      glowMat.color = tokenColor('--accent');
      glowMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      glowMat.opacity = dark ? 0.9 : 0.5;
      glowMat.needsUpdate = true;
      kick(true);
    }

    // ---------- 工具組 ----------
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const registry = {};     // id → { obj, meshes, title, info, kind }
    const hlSet = new Set();
    let transient = [];      // 步驟中暫時加入的物件
    const k = { THREE, scene, V, registry };

    k.mat = function (token, o) {
      o = o || {};
      const m = new THREE.MeshStandardMaterial({ roughness: o.rough != null ? o.rough : 0.7, metalness: o.metal || 0, transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity != null ? o.opacity : 1, depthWrite: !(o.opacity != null && o.opacity < 0.6), side: o.side || THREE.FrontSide });
      if (token && token.startsWith('--')) themed.push({ mat: m, token, mix: o.mix });
      else m.color = new THREE.Color(token || '#999');
      if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
      disposables.push(m);
      return m;
    };
    function place(obj, o) {
      if (o.x != null || o.y != null || o.z != null) obj.position.set(o.x || 0, o.y || 0, o.z || 0);
      if (o.ry) obj.rotation.y = o.ry;
      (o.parent || scene).add(obj);
      return obj;
    }
    k.box = function (w, h, d, o) {
      o = o || {};
      const r = o.round != null ? o.round : Math.min(0.35, h / 4, w / 4, d / 4);
      const g = r > 0.02 && THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
      disposables.push(g);
      const m = new THREE.Mesh(g, o.mat || k.mat(o.token || o.color, o));
      m.castShadow = o.shadow !== false; m.receiveShadow = true;
      return place(m, o);
    };
    k.cyl = function (r, h, o) {
      o = o || {};
      const g = new THREE.CylinderGeometry(o.rTop != null ? o.rTop : r, r, h, o.seg || 40);
      disposables.push(g);
      const m = new THREE.Mesh(g, o.mat || k.mat(o.token || o.color, o));
      m.castShadow = o.shadow !== false; m.receiveShadow = true;
      return place(m, o);
    };
    // 半透明「玻璃盒」：表示容器、命名空間等邊界
    k.glass = function (w, h, d, o) {
      o = o || {};
      const grp = new THREE.Group();
      const fill = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), k.mat(o.token, { opacity: o.opacity || 0.1, mix: 0.2 }));
      fill.renderOrder = 1;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }));
      themed.push({ mat: edges.material, token: o.token });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), k.mat(o.token, { opacity: o.floorOpacity != null ? o.floorOpacity : 0.35, mix: 0.3 }));
      floor.position.y = -h / 2 + 0.06; floor.receiveShadow = true;
      grp.add(fill); grp.add(edges); grp.add(floor);
      disposables.push(fill.geometry, edges.geometry, floor.geometry);
      return place(grp, o);
    };
    // 文字：以 canvas 貼圖畫在 Sprite 上，隨距離縮放、會被物體遮擋
    k.label = function (text, o) {
      o = o || {};
      const cv = document.createElement('canvas');
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false });
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = 5;
      const size = (o.size || 1.1) * (spec.labelScale || 1);
      if (o.anchor === 'left') sp.center.set(0, 0.5); else if (o.anchor === 'right') sp.center.set(1, 0.5); else if (o.anchor === 'center') sp.center.set(0.5, 0.5); else sp.center.set(0.5, 0);
      const draw = () => {
        const P = 40, fam = css('--font') || 'sans-serif', mono = css('--mono') || 'monospace';
        const ctx = cv.getContext('2d');
        const main = `${o.weight || 600} ${P}px ${fam}`, subF = `500 ${P * 0.66}px ${mono}`;
        ctx.font = main; const w1 = ctx.measureText(text).width;
        let w2 = 0; if (o.sub) { ctx.font = subF; w2 = ctx.measureText(o.sub).width; }
        const pad = P * 0.45, lh = o.sub ? P * 1.95 : P * 1.25;
        cv.width = Math.ceil(Math.max(w1, w2) + pad * 2); cv.height = Math.ceil(lh + pad * 0.9);
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (o.bg !== false) {
          const r = P * 0.3, W = cv.width, H = cv.height;
          ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r); ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r); ctx.closePath();
          ctx.globalAlpha = 0.92; ctx.fillStyle = o.fill || css('--panel'); ctx.fill(); ctx.globalAlpha = 1;
          ctx.lineWidth = 3; ctx.strokeStyle = o.token ? css(o.token) : css('--border-strong'); ctx.stroke();
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = main; ctx.fillStyle = o.color ? css(o.color) : css('--text');
        ctx.fillText(text, cv.width / 2, o.sub ? pad * 0.45 + P * 0.62 : cv.height / 2 + 1);
        if (o.sub) { ctx.font = subF; ctx.fillStyle = css('--muted'); ctx.fillText(o.sub, cv.width / 2, pad * 0.45 + P * 1.45); }
        tex.needsUpdate = true;
        sp.scale.set(size * cv.width / (P * 1.25), size * cv.height / (P * 1.25), 1);
      };
      draw();
      labels.push({ draw });
      disposables.push(tex, mat);
      return place(sp, o);
    };
    k.arc = (a, b, lift) => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(V(0, lift == null ? a.distanceTo(b) * 0.25 : lift, 0)), b);
    k.path = (...pts) => pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    k.poly = (...pts) => { const c = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) c.add(new THREE.LineCurve3(pts[i], pts[i + 1])); return c; };
    // 靜態線纜 / 路徑
    k.wire = function (curve, o) {
      o = o || {};
      const g = new THREE.TubeGeometry(curve, o.seg || 48, o.radius || 0.18, 8, false);
      disposables.push(g);
      const m = new THREE.Mesh(g, o.mat || k.mat(o.token || '--faint', { opacity: o.opacity, rough: 0.5 }));
      m.castShadow = o.shadow === true;
      return place(m, o);
    };
    // 可點選 / 可高亮的元件
    k.reg = function (id, obj, meta) {
      const meshes = [];
      obj.traverse(o => { if (o.isMesh && o.material && o.material.emissive) meshes.push(o); });
      registry[id] = Object.assign({ obj, meshes }, meta || {});
      return obj;
    };
    function setGlow(id, v) {
      const r = registry[id]; if (!r) return;
      r.meshes.forEach(m => { m.material.emissive = v ? tokenColor('--accent') : new THREE.Color(0); m.material.emissiveIntensity = v ? v : 1; });
    }
    k.hl = function (ids) { ids.forEach(id => { hlSet.add(id); setGlow(id, 0.35); }); kick(); };
    k.flash = function (id, dur) { const r = registry[id]; if (!r) return; tweens.push({ t: 0, dur: dur || 0.9, fn: u => setGlow(id, hlSet.has(id) ? 0.35 : Math.sin(u * Math.PI) * 0.8 || 0.0001), end: () => setGlow(id, hlSet.has(id) ? 0.35 : 0) }); kick(); };
    k.temp = function (obj) { transient.push(obj); return obj; };
    k.tween = function (dur, fn, end) { tweens.push({ t: 0, dur, fn, end }); kick(); };

    // ---------- 封包 ----------
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false });
    const pktGeo = { sphere: new THREE.SphereGeometry(0.5, 16, 12), box: new THREE.BoxGeometry(1, 1, 1) };
    disposables.push(glowTex, glowMat, pktGeo.sphere, pktGeo.box);
    k.pkt = function (o) {
      o = o || {};
      const grp = new THREE.Group();
      const m = new THREE.Mesh(pktGeo[o.shape || 'sphere'], k.mat(o.token || '--accent', { emissive: o.token ? css(o.token) : css('--accent'), ei: 0.5, rough: 0.3, opacity: o.opacity }));
      m.scale.setScalar(o.size || 0.7);
      grp.add(m);
      if (o.glow !== false) { const s = new THREE.Sprite(glowMat); s.scale.setScalar((o.size || 0.7) * 3.4); grp.add(s); }
      if (o.label) { const l = k.label(o.label, { size: 0.55, parent: grp, y: (o.size || 0.7) * 0.8, token: o.token }); l.renderOrder = 6; }
      grp.visible = false;
      grp.userData.core = m;
      scene.add(grp);
      transient.push(grp);
      return grp;
    };

    // ---------- 動作序列 ----------
    // 動作：['move', obj, curve, 秒] | ['call', fn] | ['wait', 秒] | ['par', [動作...]]
    let chains = [], streams = [], tweens = [];
    k.chain = function (acts, o) { chains.push({ acts, i: 0, t: 0, loop: !(o && o.loop === false), started: false }); kick(); };
    k.stream = function (curve, o) {
      o = o || {};
      const len = curve.getLength(), speed = o.speed || 14, gap = o.every || 0.6;
      const n = Math.max(1, Math.round(len / (speed * gap)));
      const ps = [];
      for (let i = 0; i < n; i++) { const p = k.pkt({ token: o.token, size: o.size || 0.45, shape: o.shape, glow: o.glow }); p.visible = true; ps.push(p); }
      streams.push({ curve, len, speed, ps, t: 0 });
      kick();
    };
    function runAct(a, st, dt) {
      if (a[0] === 'wait') { st.t += dt; return st.t >= a[1]; }
      if (a[0] === 'call') { a[1](); return true; }
      if (a[0] === 'move') {
        const [, obj, c0, dur] = a;
        const curve = typeof c0 === 'function' ? (st.c || (st.c = c0())) : c0;   // 可延後到動作開始時才計算路徑
        st.t += dt; obj.visible = true;
        const u = Math.min(1, st.t / dur);
        obj.position.copy(curve.getPointAt(ease(u)));
        if (u >= 1) { if (!a[4]) obj.visible = false; return true; }
        return false;
      }
      if (a[0] === 'par') {
        st.sub = st.sub || a[1].map(() => ({ t: 0, done: false }));
        let all = true;
        a[1].forEach((x, i) => { if (!st.sub[i].done) { st.sub[i].done = runAct(x, st.sub[i], dt); if (!st.sub[i].done) all = false; } });
        return all;
      }
      return true;
    }
    function tickChains(dt) {
      chains.forEach(c => {
        if (c.done) return;
        if (c.pause > 0) { c.pause -= dt; if (c.pause <= 0) { c.i = 0; c.st = { t: 0 }; } return; }
        if (!c.st) c.st = { t: 0 };
        let first = true, guard = 0;
        while (c.i < c.acts.length && guard++ < 40) {
          const fin = runAct(c.acts[c.i], c.st, first ? dt : 0);
          first = false;
          if (!fin) break;
          c.i++; c.st = { t: 0 };
        }
        if (c.i >= c.acts.length) { if (c.loop) c.pause = 1.4; else c.done = true; }
      });
    }

    // ---------- 相機 ----------
    let camTw = null;
    k.view = function (v, dur) {
      if (!v) return;
      camTw = { p0: camera.position.clone(), t0: controls.target.clone(), p1: V(v[0], v[1], v[2]), t1: V(v[3], v[4], v[5]), t: 0, dur: dur || 1.1 };
      kick();
    };

    // ---------- 步驟 ----------
    const steps = spec.steps || [];
    let cur = -1, timer = null;
    let prevBtn, nextBtn, playBtn, dots;
    if (steps.length) {
      prevBtn = S.el('button', { class: 'btn sm', onclick: () => { stop(); go(cur - 1); } }, '上一步');
      nextBtn = S.el('button', { class: 'btn sm primary', onclick: () => { stop(); go(cur + 1); } }, '下一步');
      playBtn = S.el('button', { class: 'btn sm', onclick: togglePlay }, '自動播放');
      const reset = S.el('button', { class: 'btn sm', onclick: () => { stop(); go(-1); } }, '重設');
      dots = S.el('div', { class: 'dg-dots' });
      steps.forEach((st, i) => dots.appendChild(S.el('button', { title: st.title, onclick: () => { stop(); go(i); } }, String(i + 1))));
      stepsBox.appendChild(S.el('div', { class: 'dg-ctrl' }, prevBtn, nextBtn, playBtn, reset, dots));
    }
    stepsBox.appendChild(desc);

    function clearStep() {
      chains = []; streams = []; tweens = [];
      transient.forEach(o => { if (o.parent) o.parent.remove(o); });
      transient = [];
      hlSet.forEach(id => setGlow(id, 0)); hlSet.clear();
      if (spec.reset) spec.reset(k);
    }
    function go(i) {
      clearStep();
      cur = Math.max(-1, Math.min(steps.length - 1, i));
      if (dots) [...dots.children].forEach((d, j) => { d.classList.toggle('on', j === cur); d.classList.toggle('past', j < cur); });
      if (prevBtn) { prevBtn.disabled = cur <= -1; nextBtn.disabled = cur >= steps.length - 1; }
      if (cur < 0) {
        desc.innerHTML = spec.intro || `<span class="muted">共 ${steps.length} 個步驟。按「下一步」逐步播放，相機會移到該步驟相關的位置；也可以直接點選模型中的元件。</span>`;
        k.view(spec.view);
      } else {
        const st = steps[cur];
        desc.innerHTML = `<div class="st"><span class="sn">${cur + 1}/${steps.length}</span>${st.title}</div><div>${st.text || ''}</div>`;
        if (st.view) k.view(st.view);
        if (st.hl) k.hl(st.hl);
        if (st.enter) st.enter(k);
      }
      shadowDirty = 3;
      kick();
    }
    function togglePlay() {
      if (timer) { stop(); return; }
      if (cur >= steps.length - 1) go(-1);
      playBtn.textContent = '暫停';
      go(cur + 1);
      timer = setInterval(() => { if (cur >= steps.length - 1) stop(); else go(cur + 1); }, spec.interval || 6500);
    }
    function stop() { if (timer) clearInterval(timer); timer = null; if (playBtn) playBtn.textContent = '自動播放'; }

    // ---------- 工具列 ----------
    const bar = S.el('div', { class: 's3-bar' },
      S.el('button', { onclick: () => k.view(cur >= 0 && steps[cur].view ? steps[cur].view : spec.view) }, '重設視角'),
      S.el('button', { onclick: () => zoom(0.82), 'aria-label': '放大' }, '+'),
      S.el('button', { onclick: () => zoom(1.22), 'aria-label': '縮小' }, '−'));
    stage.appendChild(bar);
    stage.appendChild(S.el('div', { class: 's3-help' }, '拖曳旋轉 · 右鍵平移 · Ctrl + 滾輪縮放'));
    function zoom(f) { const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).addScaledVector(d, f); kick(); }

    // ---------- 點選 ----------
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    let down = null;
    function pick(ev) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const meshes = [];
      Object.values(registry).forEach(x => x.meshes.forEach(m => meshes.push(m)));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) return null;
      let o = hit.object;
      return Object.keys(registry).find(id => registry[id].meshes.includes(o));
    }
    renderer.domElement.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener('pointerup', ev => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) return;
      const id = pick(ev);
      if (!id) return;
      const r = registry[id];
      stop();
      hlSet.forEach(x => setGlow(x, 0)); hlSet.clear();
      k.hl([id]);
      desc.innerHTML = `<div class="nt" style="--k:var(--k-${r.kind || 'proc'})"><i></i>${S.esc(r.title || id)}${r.where ? `<span class="kind">${S.esc(r.where)}</span>` : ''}</div><div>${r.info || ''}</div>`;
    });
    // hover：只在沒按住滑鼠時、每個動畫幀最多檢查一次
    let hoverEv = null;
    renderer.domElement.addEventListener('pointermove', ev => { if (ev.buttons === 0) { hoverEv = ev; kick(); } });
    renderer.domElement.addEventListener('wheel', ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.08 : 0.93); }, { passive: false });
    controls.addEventListener('change', () => kick());

    // ---------- 尺寸 ----------
    function resize() {
      const w = stage.clientWidth || 800;
      const h = spec.height || Math.round(Math.max(380, Math.min(600, w * 0.58)));
      stage.style.height = h + 'px';
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      kick(true);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    // ---------- 迴圈（只在需要時繪製） ----------
    let raf = 0, last = 0, idle = 0, visible = true, dead = false, shadowDirty = 3, inFrame = false;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '120px' });
    io.observe(stage);
    // 迴圈執行中被呼叫時只重設閒置計數；每一幀最多排一次下一幀（避免 rAF 呈指數增加）
    function kick(shadow) { if (shadow) shadowDirty = 2; idle = 0; if (inFrame || raf || dead) return; last = performance.now(); raf = requestAnimationFrame(frame); }
    function frame(t) {
      raf = 0;
      if (!document.body.contains(stage)) { dispose(); return; }
      inFrame = true;
      const dt = Math.min(0.05, Math.max(0, t - last) / 1000);
      last = Math.max(last, t);
      let busy = false;
      if (camTw) {
        camTw.t = Math.min(1, camTw.t + dt / camTw.dur);
        const u = ease(camTw.t);
        camera.position.lerpVectors(camTw.p0, camTw.p1, u);
        controls.target.lerpVectors(camTw.t0, camTw.t1, u);
        if (camTw.t >= 1) camTw = null;
        busy = true;
      }
      if (controls.update()) busy = true;
      if (chains.length) { tickChains(dt); busy = true; }
      streams.forEach(s => {
        s.t += dt;
        s.ps.forEach((p, i) => { const u = ((s.t * s.speed / s.len) + i / s.ps.length) % 1; p.position.copy(s.curve.getPointAt(u)); });
        busy = true;
      });
      tweens = tweens.filter(tw => { tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.fn(u); if (u >= 1) { tw.end && tw.end(); return false; } return true; });
      if (tweens.length) busy = true;
      if (hoverEv) {
        const id = pick(hoverEv); hoverEv = null;
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      }
      if (visible) {
        if (shadowDirty > 0) { renderer.shadowMap.needsUpdate = true; shadowDirty--; }
        renderer.render(scene, camera);
      }
      inFrame = false;
      idle = busy ? 0 : idle + 1;
      if (visible && idle < 20 && !raf) raf = requestAnimationFrame(frame);
    }

    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', applyTheme);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { labels.forEach(l => l.draw()); kick(); });

    function dispose() {
      if (dead) return;
      dead = true; stop();
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      mq.removeEventListener && mq.removeEventListener('change', applyTheme);
      controls.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      disposables.forEach(d => d.dispose && d.dispose());
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    }

    // ---------- 建立 ----------
    spec.build(k);
    applyTheme();
    resize();
    const v = spec.view || [40, 40, 50, 0, 8, 0];
    camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]); controls.update();
    // 預先編譯 shader，避免第一次播放時卡頓
    const warm = k.pkt({});
    warm.visible = true;
    try { renderer.compile(scene, camera); } catch (e) { /* 忽略 */ }
    scene.remove(warm); transient = [];
    go(-1);
    const api = { el: stage, dispose, go };
    live.push(api);
    return api;
  };
})();
