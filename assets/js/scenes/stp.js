/* STP 立體模型：交換機的高度代表它到 root bridge 的路徑成本。
   選出 root 後整棵生成樹「吊掛」在 root 下方；多餘的鏈路被阻斷。
   鏈路故障時，交換機移動到新的高度，重新收斂的過程直接可見。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.stp = function (host) {
    let k, V, THREE;
    const SW = {
      A: { x: 0, z: -12, bid: '4096 · 00:aa', name: 'SW-A' },
      B: { x: -15, z: -2, bid: '8192 · 00:bb', name: 'SW-B' },
      C: { x: 15, z: -2, bid: '32768 · 00:cc', name: 'SW-C' },
      D: { x: -10, z: 12, bid: '32768 · 00:dd', name: 'SW-D' },
      E: { x: 10, z: 12, bid: '32768 · 00:ee', name: 'SW-E' },
    };
    const HOSTS = { H1: { x: -18, z: 22, sw: 'D' }, H2: { x: 18, z: 22, sw: 'E' } };
    const LINKS = [['A', 'B', 2000], ['A', 'C', 2000], ['B', 'D', 2000], ['C', 'E', 2000], ['C', 'D', 20000], ['D', 'E', 2000]];
    const FLAT = 8;
    const yOf = cost => 22 - cost * 0.0022;
    // 兩種收斂結果（成本與各 port 角色）
    const T1 = {
      cost: { A: 0, B: 2000, C: 2000, D: 4000, E: 4000 },
      role: { 'A-B': ['DP', 'RP'], 'A-C': ['DP', 'RP'], 'B-D': ['DP', 'RP'], 'C-E': ['DP', 'RP'], 'C-D': ['DP', 'BLK'], 'D-E': ['DP', 'BLK'] },
    };
    const T2 = {
      cost: { A: 0, B: 2000, C: 8000, D: 4000, E: 6000 },
      role: { 'A-B': ['DP', 'RP'], 'A-C': ['X', 'X'], 'B-D': ['DP', 'RP'], 'C-E': ['RP', 'DP'], 'C-D': ['BLK', 'DP'], 'D-E': ['DP', 'RP'] },
    };
    const nodes = {}, links = {}, hostObjs = {};
    let mats, crown;

    function build(kit) {
      k = kit; V = k.V; THREE = k.THREE;
      mats = {
        line: k.mat('--faint', { rough: 0.5 }), fwd: k.mat('--accent', { rough: 0.4 }),
        blk: k.mat('--bad', { rough: 0.5, opacity: 0.45 }), down: k.mat('--bad', { rough: 0.5 }),
        RP: k.mat('--good', { emissive: '#000' }), DP: k.mat('--accent', { emissive: '#000' }), BLK: k.mat('--bad', { emissive: '#000' }),
      };
      k.box(70, 0.4, 56, { color: '#9aa3ae', y: -0.2, round: 0, rough: 0.95 });
      // 交換機
      Object.entries(SW).forEach(([id, s]) => {
        const g = new THREE.Group();
        k.box(8, 1.6, 6, { color: '#2b3139', parent: g, metal: 0.3, rough: 0.5 });
        for (let i = 0; i < 6; i++) k.box(0.5, 0.25, 0.1, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, parent: g, x: -2.8 + i * 1.1, y: 0.35, z: 3.05, shadow: false, round: 0 });
        k.label(s.name, { parent: g, y: 1.3, sub: 'BID ' + s.bid, token: '--k-hw', size: 0.7 });
        g.position.set(s.x, FLAT, s.z);
        k.scene.add(g);
        // 立柱：顯示高度（= 到 root 的成本）
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8).translate(0, 0.5, 0), k.mat('--border-strong', { opacity: 0.6 }));
        pole.position.set(s.x, 0, s.z);
        k.scene.add(pole);
        const costLab = k.label('', { x: s.x + 4.6, y: 1, z: s.z, anchor: 'left', size: 0.5, bg: false, color: '--muted' });
        costLab.visible = false;
        nodes[id] = { g, pole, s, y: FLAT, costLab };
        k.reg(id, g, { title: `${s.name}（BID ${s.bid}）`, where: 'Bridge ID = priority · MAC', kind: 'hw', info: `<p>Bridge ID 由 priority（4096 的倍數）與 MAC 組成，數值最小者成為 root bridge。${id === 'A' ? '這台的 priority 設為 4096，會成為 root。' : id === 'B' ? 'priority 8192，常作為備援 root。' : '使用預設 priority 32768。'}</p>` });
      });
      crown = k.label('ROOT BRIDGE', { token: '--warn', color: '--warn', size: 0.62 });
      crown.visible = false;
      // 主機
      Object.entries(HOSTS).forEach(([id, h]) => {
        const g = new THREE.Group();
        k.box(4, 2.6, 3, { token: '--k-ext', mix: 0.3, parent: g, y: 1.3 });
        k.label(id === 'H1' ? 'Host 1' : 'Host 2', { parent: g, y: 2.9, size: 0.55, token: '--k-ext' });
        g.position.set(h.x, 0, h.z);
        k.scene.add(g);
        hostObjs[id] = g;
      });
      // 鏈路（兩端會隨交換機移動）
      const unit = new THREE.CylinderGeometry(0.22, 0.22, 1, 10);
      const mk = (id, a, b, cost) => {
        const mesh = new THREE.Mesh(unit, mats.line); mesh.castShadow = false;
        k.scene.add(mesh);
        const mA = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), mats.DP), mB = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), mats.DP);
        mA.visible = mB.visible = false;
        k.scene.add(mA); k.scene.add(mB);
        const lab = cost ? k.label(cost === 20000 ? '1G · cost 20000' : '10G · cost 2000', { size: 0.42, bg: true, anchor: 'center' }) : null;
        const tA = k.label('', { size: 0.4, bg: false, anchor: 'center' }), tB = k.label('', { size: 0.4, bg: false, anchor: 'center' });
        tA.visible = tB.visible = false;
        links[id] = { a, b, mesh, mA, mB, lab, tA, tB };
      };
      LINKS.forEach(([a, b, c]) => mk(`${a}-${b}`, a, b, c));
      Object.entries(HOSTS).forEach(([id, h]) => mk(id, id, h.sw, 0));
      update();
    }

    const pos = id => (nodes[id] ? nodes[id].g.position : hostObjs[id].position.clone().add(V(0, 2.4, 0)));
    function update() {
      const Y = new THREE.Vector3(0, 1, 0);
      Object.values(links).forEach(l => {
        const pa = pos(l.a).clone(), pb = pos(l.b).clone();
        const d = pb.clone().sub(pa), len = d.length(), dir = d.clone().normalize();
        l.mesh.position.copy(pa).addScaledVector(d, 0.5);
        l.mesh.quaternion.setFromUnitVectors(Y, dir);
        l.mesh.scale.set(1, len, 1);
        const off = nodes[l.a] ? 5.2 : 2.2;
        l.mA.position.copy(pa).addScaledVector(dir, Math.min(off, len * 0.3));
        l.mB.position.copy(pb).addScaledVector(dir, -Math.min(nodes[l.b] ? 5.2 : 2.2, len * 0.3));
        l.tA.position.copy(l.mA.position).add(V(0, 1.1, 0));
        l.tB.position.copy(l.mB.position).add(V(0, 1.1, 0));
        if (l.lab) l.lab.position.copy(pa).addScaledVector(d, 0.5).add(V(0, 1, 0));
      });
      Object.values(nodes).forEach(n => { n.pole.scale.y = Math.max(0.01, n.g.position.y - 0.8); n.costLab.position.set(n.s.x + 4.6, n.g.position.y, n.s.z); });
      if (crown.visible) crown.position.copy(nodes.A.g.position).add(V(0, 3.4, 0));
    }
    // 把交換機移到指定高度
    function moveTo(heights, dur) {
      const from = {}; Object.keys(nodes).forEach(id => { from[id] = nodes[id].g.position.y; });
      if (!dur) { Object.keys(nodes).forEach(id => { nodes[id].g.position.y = heights[id]; }); update(); return; }
      k.tween(dur, u => { const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; Object.keys(nodes).forEach(id => { nodes[id].g.position.y = from[id] + (heights[id] - from[id]) * e; }); update(); });
    }
    const flatH = () => { const h = {}; Object.keys(SW).forEach(id => { h[id] = FLAT; }); return h; };
    const treeH = T => { const h = {}; Object.keys(SW).forEach(id => { h[id] = yOf(T.cost[id]); }); return h; };
    const TXT = { RP: 'Root port', DP: 'Designated', BLK: 'Blocked', X: '' };
    function roles(T, show) {
      Object.entries(links).forEach(([id, l]) => {
        const r = T && T.role[id];
        const hostLink = !nodes[l.a];
        l.mA.visible = l.mB.visible = l.tA.visible = l.tB.visible = false;
        if (!T || !show) { l.mesh.material = mats.line; return; }
        if (hostLink) { l.mesh.material = mats.fwd; return; }
        if (r[0] === 'X') { l.mesh.material = mats.down; return; }
        const blocked = r.includes('BLK');
        l.mesh.material = blocked ? mats.blk : mats.fwd;
        [[l.mA, l.tA, r[0]], [l.mB, l.tB, r[1]]].forEach(([m, t, role]) => {
          if (show === 'rp' && role !== 'RP') return;
          m.material = mats[role]; m.visible = true;
          t.visible = true; setText(t, TXT[role], role === 'BLK' ? '--bad' : role === 'RP' ? '--good' : '--accent');
        });
      });
    }
    function setText(sp, text, color) {
      if (sp.userData.t === text) return;
      sp.userData.t = text;
      // 重新建立文字貼圖（標籤數量少，只在步驟切換時發生）
      const n = k.label(text, { size: 0.4, bg: false, anchor: 'center', color });
      sp.material.map = n.material.map; sp.material.needsUpdate = true; sp.scale.copy(n.scale);
      k.scene.remove(n);
    }
    function costs(T) {
      Object.entries(nodes).forEach(([id, n]) => {
        if (!T) { n.costLab.visible = false; return; }
        n.costLab.visible = true;
        setText(n.costLab, id === 'A' ? 'root · cost 0' : 'root path cost ' + T.cost[id], '--muted');
        n.costLab.center.set(0, 0.5);
      });
    }
    function setRoot(on) { crown.visible = on; update(); }
    const seg = (...ids) => () => k.poly(...ids.map(i => pos(i).clone()));
    const segPart = (a, b, f) => () => { const pa = pos(a).clone(), pb = pos(b).clone(); return k.poly(pa, pa.clone().lerp(pb, f)); };

    const steps = [
      {
        title: '有迴圈的實體拓樸', text: '5 台交換機以 6 條鏈路相連，形成兩個迴圈（A-B-D-C 與 C-D-E）。多條路徑提供備援，但對乙太網路而言，迴圈會造成嚴重問題。',
        view: [0, 30, 58, 0, 7, 3],
        enter() { setRoot(false); moveTo(flatH()); roles(null); costs(null); },
      },
      {
        title: '沒有 STP：廣播風暴', text: 'Host 1 送出一個廣播（例如 ARP）。每台交換機都把它送往其他所有 port，封包沿著迴圈不斷繞圈並持續複製；乙太網路訊框沒有 TTL，數量會一直增加，直到鏈路與 CPU 滿載，MAC 表也不斷跳動。',
        view: [0, 30, 56, 0, 7, 3],
        enter() {
          setRoot(false); moveTo(flatH()); roles(null); costs(null);
          const loop1 = k.poly(...['A', 'B', 'D', 'C', 'A'].map(i => pos(i).clone()));
          const loop2 = k.poly(...['C', 'D', 'E', 'C'].map(i => pos(i).clone()));
          const loop3 = k.poly(...['A', 'C', 'D', 'B', 'A'].map(i => pos(i).clone()));
          const first = k.pkt({ token: '--bad', label: 'broadcast' });
          k.chain([
            ['move', first, seg('H1', 'D'), 0.8],
            ['call', () => k.stream(loop1, { token: '--bad', every: 1.6, speed: 18, size: 0.8 })],
            ['wait', 1.4], ['call', () => k.stream(loop2, { token: '--bad', every: 1.2, speed: 18, size: 0.8 })],
            ['wait', 1.4], ['call', () => k.stream(loop3, { token: '--bad', every: 0.9, speed: 20, size: 0.8 })],
            ['wait', 1.4], ['call', () => k.stream(loop1, { token: '--bad', every: 0.6, speed: 22, size: 0.8 })],
          ], { loop: false });
        },
      },
      {
        title: '交換 BPDU，選出 root bridge', text: '啟用 STP 後，每台交換機送出 BPDU，宣告自己認為的 root。比較 Bridge ID（priority · MAC），數值最小者勝出：SW-A 的 priority 4096 最小，成為 root bridge，升到最上方。',
        view: [0, 36, 54, 0, 10, 0], hl: ['A'],
        enter() {
          setRoot(false); moveTo(flatH()); roles(null); costs(null);
          LINKS.forEach(([a, b], i) => {
            const p = k.pkt({ size: 0.45, token: '--k-proc' }), q = k.pkt({ size: 0.45, token: '--k-proc' });
            k.chain([['wait', i * 0.15], ['par', [['move', p, seg(a, b), 1], ['move', q, seg(b, a), 1]]], ['wait', 3]], { loop: false });
          });
          k.chain([['wait', 1.6], ['call', () => { const h = flatH(); h.A = yOf(0); moveTo(h, 1.2); setRoot(true); k.tween(1.2, update); }]], { loop: false });
        },
      },
      {
        title: '計算到 root 的路徑成本', text: '其他交換機依收到的 BPDU 計算到 root 的最低成本（10G 鏈路 2000、1G 鏈路 20000），並以成本最低的 port 作為 root port（綠）。高度就是成本：SW-B、SW-C 為 2000，SW-D、SW-E 為 4000，整棵樹吊掛在 root 下方。',
        view: [26, 30, 50, 0, 12, 0], hl: ['A', 'B', 'C', 'D', 'E'],
        enter() { setRoot(true); moveTo(treeH(T1), 1.4); costs(T1); roles(T1, 'rp'); },
      },
      {
        title: '阻斷多餘的鏈路', text: '每條鏈路上只有一端是 designated port（藍）負責轉送。C-D 由成本較低的 SW-C 擔任 designated，SW-D 那端被阻斷；D-E 兩端成本相同，比較 Bridge ID，SW-D 較小，SW-E 那端被阻斷。兩條紅色鏈路不轉送資料，迴圈消失。',
        view: [0, 32, 64, 0, 12, 4], hl: ['D', 'E', 'C'],
        enter() { setRoot(true); moveTo(treeH(T1)); costs(T1); roles(T1, true); },
      },
      {
        title: '廣播只沿著樹走一次', text: 'Host 1 的廣播從 SW-D 出發，沿著樹經 B、A、C、E 到達 Host 2，每台交換機只收到一次。SW-D 送往 SW-E、SW-C 送往 SW-D 的副本，在對端被阻斷的 port 上丟棄（紅）。',
        view: [0, 30, 56, 0, 11, 4],
        enter() {
          setRoot(true); moveTo(treeH(T1)); costs(T1); roles(T1, true);
          const main = k.pkt({ label: 'broadcast' }), x1 = k.pkt({ token: '--bad', size: 0.5 }), x2 = k.pkt({ token: '--bad', size: 0.5 });
          k.chain([['move', main, seg('H1', 'D', 'B', 'A', 'C', 'E', 'H2'), 5]]);
          k.chain([['move', x1, seg('H1', 'D'), 5 * 0.12, true], ['move', x1, segPart('D', 'E', 0.8), 1.1], ['wait', 3.3]]);
          k.chain([['wait', 5 * 0.62], ['move', x2, segPart('C', 'D', 0.85), 1.4], ['wait', 0.5]]);
        },
      },
      {
        title: '鏈路故障與重新收斂', text: 'A-C 鏈路斷線。SW-C 失去 root port，改經 SW-E 到達 root：原本阻斷的 D-E 轉為轉送，SW-E 成本變為 6000、SW-C 變為 8000，兩台往下移。RSTP 以 proposal / agreement 在一秒內完成，傳統 STP 需等待約 30–50 秒。',
        view: [-10, 30, 64, 2, 10, 2], hl: ['C', 'E', 'D'],
        enter() {
          setRoot(true); moveTo(treeH(T1)); costs(T1); roles(T1, true);
          k.chain([
            ['wait', 0.8],
            ['call', () => { links['A-C'].mesh.material = mats.down; }],
            ['wait', 0.8],
            ['call', () => { moveTo(treeH(T2), 1.6); costs(T2); roles(T2, true); }],
            ['wait', 2.2],
          ], { loop: false });
          const p = k.pkt({ label: 'broadcast' });
          k.chain([['wait', 3.8], ['move', p, seg('H1', 'D', 'E', 'C'), 3], ['wait', 1]], { loop: false });
        },
      },
    ];

    return S.scene3d(host, {
      title: 'STP：生成樹的立體模型',
      hint: '高度 = 到 root 的路徑成本 · 拖曳旋轉 · 點選交換機看說明',
      view: [0, 32, 60, 0, 9, 2],
      shadowBounds: 40,
      labelScale: 1.6,
      interval: 8000,
      build, steps,
      intro: '<span class="muted">這個模型用高度表示交換機到 root bridge 的路徑成本。逐步播放：先看迴圈造成的廣播風暴，再看 STP 如何選出 root、計算成本、阻斷多餘鏈路，以及鏈路故障後的重新收斂。</span>',
    });
  };
})();
