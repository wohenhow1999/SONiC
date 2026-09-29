/* 資料中心 fabric 實體模型：機櫃頂端是 leaf（ToR），後排機櫃頂端是 spine，
   纜線經由上方走線。variant：'clos' | 'vxlan' | 'mclag' */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.fabric = function (host, variant) {
    const LX = [-24, -8, 8, 24], SX = [-21, -7, 7, 21];
    const LZ = 10, SZ = -12, TOP = 11.8;
    const nS = variant === 'mclag' ? 2 : 4;
    let V, k0;
    const cables = {};        // id → { mesh, curve, rev }
    const sw = {};            // id → { body }
    let onMat, downMat;
    const P = {};

    function build(k) {
      k0 = k; V = k.V;
      onMat = k.mat('--accent', { emissive: '#000', rough: 0.4 });
      downMat = k.mat('--bad', { rough: 0.5 });
      k.box(84, 0.4, 50, { color: '#9aa3ae', y: -0.2, round: 0, rough: 0.95, mix: 0 }).receiveShadow = true;

      const rack = (x, z, label) => {
        const g = new k.THREE.Group();
        k.glass(7.4, 11, 7.4, { token: '--k-kernel', opacity: 0.06, floorOpacity: 0.5, parent: g, y: 5.5 });
        for (let i = 0; i < 5; i++) {
          k.box(6.6, 1.3, 6.4, { color: '#4b5563', parent: g, y: 1.3 + i * 1.9, rough: 0.6 });
          k.box(0.35, 0.2, 0.2, { color: '#60a5fa', emissive: '#60a5fa', ei: 0.8, parent: g, x: 2.6, y: 1.3 + i * 1.9, z: 3.25, shadow: false, round: 0 });
        }
        g.position.set(x, 0, z);
        k.scene.add(g);
        if (label) k.label(label, { x, y: 0.4, z: z + 4.6, size: 0.55, bg: false, color: '--muted' });
        return g;
      };
      const switchModel = (id, x, z, name, sub, token) => {
        const g = new k.THREE.Group();
        const body = k.box(8.2, 1.6, 6.8, { color: '#2b3139', parent: g, metal: 0.3, rough: 0.5 });
        k.box(8.2, 1.6, 0.25, { color: '#3b434d', parent: g, z: 3.45, round: 0 });
        for (let i = 0; i < 8; i++) k.box(0.5, 0.25, 0.1, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, parent: g, x: -3.2 + i * 0.9, y: 0.35, z: 3.6, shadow: false, round: 0 });
        g.position.set(x, TOP, z);
        k.scene.add(g);
        sw[id] = { body, base: body.material };
        k.reg(id, g, { title: name, where: sub, kind: 'hw', info: `<p>${name}：${sub}。</p>` });
        k.label(name, { x, y: TOP + 1.2, z, sub, token: token || '--k-hw', size: 0.7 });
      };
      // 纜線：從 leaf 上方拉到走線高度，再下到 spine
      const cable = (id, a, b, h) => {
        const c = new k.THREE.CubicBezierCurve3(a, V(a.x, h, a.z - 2), V(b.x, h, b.z + 2), b);
        const mesh = k.wire(c, { color: '#8b94a3', radius: 0.12, seg: 40 });
        cables[id] = { mesh, curve: c, rev: new k.THREE.CubicBezierCurve3(b, c.v2, c.v1, a), base: mesh.material };
      };
      const shortCable = (id, pts) => {
        const c = k.poly(...pts);
        const mesh = k.wire(c, { color: '#8b94a3', radius: 0.12 });
        cables[id] = { mesh, curve: c, rev: k.poly(...pts.slice().reverse()), base: mesh.material };
      };

      // spine 列
      for (let s = 0; s < nS; s++) {
        const x = nS === 2 ? [-10, 10][s] : SX[s];
        rack(x, SZ, s === 0 ? 'spine 機櫃' : null);
        switchModel('S' + (s + 1), x, SZ, 'Spine ' + (s + 1), 'AS 65100', '--k-hw');
        P['S' + (s + 1)] = V(x, TOP + 0.9, SZ + 2.8);
      }
      // leaf 列（機櫃頂端的 ToR）
      const leafSub = i => variant === 'vxlan' ? `VTEP 10.1.0.${i + 1}` : variant === 'mclag' && i < 2 ? `MCLAG peer ${i + 1}` : `AS 651${String(i + 1).padStart(2, '0')}`;
      LX.forEach((x, i) => {
        rack(x, LZ, i === 0 ? '伺服器機櫃' : null);
        switchModel('L' + (i + 1), x, LZ, 'Leaf ' + (i + 1), leafSub(i), i < 2 && variant === 'mclag' ? '--k-proc' : '--k-hw');
        P['L' + (i + 1)] = V(x, TOP + 0.9, LZ - 2.8);
        P['L' + (i + 1) + 'f'] = V(x + 3, TOP, LZ + 3.5);
      });
      for (let i = 0; i < 4; i++) for (let s = 0; s < nS; s++) cable(`L${i + 1}-S${s + 1}`, P['L' + (i + 1)], P['S' + (s + 1)], 19 + s * 0.6);
      // 伺服器到 leaf（機櫃前方）
      const srv = (r, i) => V(LX[r] + 3, 1.3 + i * 1.9, LZ + 3.4);
      P.srv = srv;
      LX.forEach((x, r) => shortCable(`H${r + 1}`, [srv(r, 3), V(x + 3.4, 1.3 + 3 * 1.9, LZ + 4.2), V(x + 3.4, TOP, LZ + 4.2), P['L' + (r + 1) + 'f']]));
      const host = (id, r, name, sub) => {
        const b = k.box(6.7, 1.35, 6.5, { token: '--k-ext', mix: 0.35, x: LX[r], y: 1.3 + 3 * 1.9, z: LZ });
        k.reg(id, b, { title: name, where: sub, kind: 'ext', info: `<p>${name}：${sub}。</p>` });
        k.label(name, { x: LX[r] + 5.5, y: 1.3 + 3 * 1.9, z: LZ + 3.6, anchor: 'left', sub, token: '--k-ext', size: 0.55 });
      };
      if (variant === 'clos') { host('ha', 0, 'Server A', '10.10.1.11'); host('hb', 3, 'Server B', '10.10.4.22'); }
      if (variant === 'vxlan') { host('ha', 0, 'Host A', '10.10.0.11 · VLAN 100'); host('hb', 3, 'Host B', '10.10.0.22 · VLAN 100'); }
      if (variant === 'mclag') {
        host('ha', 0, 'Host A', 'PortChannel10（LACP）');
        host('hc', 1, 'Host C', 'orphan port');
        shortCable('HA2', [srv(0, 3).clone().add(V(0, 0.2, 0.6)), V(LX[0] + 3.8, 7, LZ + 5), V(LX[1] + 3.2, 11.2, LZ + 5), P.L2f]);
        shortCable('PL', [V(LX[0] + 4.1, TOP, LZ + 1), V(-16, TOP + 0.4, LZ + 1), V(LX[1] - 4.1, TOP, LZ + 1)]);
        k.label('peer link', { x: -16, y: TOP + 1.2, z: LZ + 1, size: 0.5, token: '--k-proc' });
        shortCable('KA', [V(LX[0], TOP - 0.8, LZ - 3.4), V(-16, TOP - 2.2, LZ - 4), V(LX[1], TOP - 0.8, LZ - 3.4)]);
        k.label('keepalive', { x: -16, y: TOP - 3, z: LZ - 4, size: 0.42, bg: false, color: '--muted' });
      }
      if (variant === 'vxlan') {
        // overlay：VTEP 之間的邏輯隧道，浮在實體纜線上方
        const t = new k.THREE.QuadraticBezierCurve3(V(LX[0], TOP + 2.4, LZ), V(0, 34, LZ - 2), V(LX[3], TOP + 2.4, LZ));
        const tube = k.wire(t, { token: '--k-proc', radius: 1.1, opacity: 0.18, seg: 64 });
        tube.renderOrder = 2;
        k.wire(t, { token: '--k-proc', radius: 0.12, opacity: 0.8, seg: 64 });
        k.label('VXLAN 隧道 · VNI 10100', { x: 0, y: 29.6, z: LZ - 1.5, token: '--k-proc', size: 0.7, sub: 'overlay：邏輯上 Host A 與 B 在同一個 L2 網段' });
        P.tunnel = t;
      }
    }

    function setCable(id, state) {
      const c = cables[id]; if (!c) return;
      c.mesh.material = state === 'on' ? onMat : state === 'down' ? downMat : c.base;
    }
    function reset() {
      Object.keys(cables).forEach(id => setCable(id, null));
      Object.values(sw).forEach(s => { s.body.material = s.base; });
    }
    const cur = id => cables[id].curve, rev = id => cables[id].rev;
    // 伺服器→leaf→spine→leaf→伺服器 的完整路徑
    const E2E = (k, s, pkt, from, to) => [
      ['move', pkt, rev('H' + from), 0.9, true],
      ['move', pkt, cur(`L${from}-S${s}`), 1.1, true],
      ['move', pkt, rev(`L${to}-S${s}`), 1.1, true],
      ['move', pkt, cur('H' + to), 0.9],
    ];

    const STEPS = {
      clos: [
        { title: '機櫃與 ToR', text: '每個伺服器機櫃頂端是一台 leaf（Top of Rack）交換機，後排機櫃頂端是 spine。每台 leaf 都以纜線連到每一台 spine，所以任兩台 leaf 之間都只隔一台 spine。', view: [0, 36, 58, 0, 9, 0], hl: ['L1', 'L2', 'L3', 'L4'] },
        {
          title: '東西向流量：兩跳到達', text: 'Server A 送往 Server B：先到機櫃頂端的 Leaf 1，Leaf 1 依雜湊選一台 spine，spine 再送到 Leaf 4。無論兩台伺服器在哪個機櫃，路徑長度都相同。',
          view: [-10, 30, 56, 0, 10, 2], hl: ['ha', 'L1', 'S2', 'L4', 'hb'],
          enter(k) { ['H1', 'L1-S2', 'L4-S2', 'H4'].forEach(c => setCable(c, 'on')); const p = k.pkt({ label: 'A → B' }); k.chain(E2E(k, 2, p, 1, 4)); },
        },
        {
          title: 'ECMP：流量分散到所有 spine', text: 'Leaf 1 對 Server B 所在的前綴有 4 條等價路徑。每條流依五元組雜湊選一台 spine，不同的流（不同顏色）走不同的 spine，同一條流永遠走同一條路以避免亂序。',
          view: [0, 40, 48, 0, 13, -2], hl: ['L1', 'S1', 'S2', 'S3', 'S4', 'L4'],
          enter(k) {
            const col = ['--accent', '--good', '--warn', '--k-hw'];
            [1, 2, 3, 4].forEach(s => { setCable(`L1-S${s}`, 'on'); setCable(`L4-S${s}`, 'on'); });
            [1, 2, 3, 4].forEach((s, i) => { const p = k.pkt({ token: col[i], size: 0.6 }); k.chain([['wait', i * 0.35], ['move', p, cur(`L1-S${s}`), 1.2, true], ['move', p, rev(`L4-S${s}`), 1.2]]); });
          },
        },
        {
          title: 'Spine 故障', text: 'Spine 1 故障：BFD 在數百毫秒內偵測，BGP 撤除經過它的路徑，orchagent 把它移出 NEXT_HOP_GROUP。流量改由其餘 3 台 spine 承載，只損失 1/4 的容量。',
          view: [-20, 38, 50, -6, 12, -4], hl: ['S2', 'S3', 'S4'],
          enter(k) {
            sw.S1.body.material = downMat;
            [1, 2, 3, 4].forEach(l => setCable(`L${l}-S1`, 'down'));
            [2, 3, 4].forEach(s => { setCable(`L1-S${s}`, 'on'); setCable(`L4-S${s}`, 'on'); });
            [2, 3, 4].forEach((s, i) => { const p = k.pkt({ size: 0.6 }); k.chain([['wait', i * 0.4], ['move', p, cur(`L1-S${s}`), 1.2, true], ['move', p, rev(`L4-S${s}`), 1.2]]); });
          },
        },
      ],
      vxlan: [
        { title: 'Underlay 與 overlay', text: '實體纜線構成 IP underlay（eBGP、ECMP）。上方浮著的是 overlay：Leaf 1 與 Leaf 4 上的 VTEP 之間的 VXLAN 隧道，讓分屬兩個機櫃的 Host A 與 Host B 如同在同一個 VLAN。', view: [0, 34, 60, 0, 14, 0], hl: ['L1', 'L4'] },
        {
          title: 'Host A 送出訊框', text: 'Host A 送出目的為 Host B MAC 的一般乙太網路訊框（橘色）。它完全不知道 VXLAN 的存在。',
          view: [-30, 18, 40, -20, 8, 8], hl: ['ha', 'L1'],
          enter(k) { setCable('H1', 'on'); const f = frame(k); k.chain([['move', f, rev('H1'), 1.4, true], ['wait', 1.5]]); },
        },
        {
          title: 'VTEP-1 封裝', text: 'Leaf 1 查 FDB：目的 MAC 位於遠端 VTEP 10.1.0.4。它在原訊框外加上 VXLAN 標頭（VNI 10100）、UDP（目的 port 4789）與外層 IP 10.1.0.1 → 10.1.0.4（藍色外殼）。',
          view: [-30, 20, 36, -24, 13, 6], hl: ['L1'],
          enter(k) {
            const f = frame(k, true); f.position.copy(P.L1f); f.visible = true;
            k.chain([['call', () => { f.userData.shell.scale.setScalar(0.01); f.userData.tag.visible = false; }], ['wait', 0.4], ['call', () => k.tween(1, u => f.userData.shell.scale.setScalar(Math.max(0.01, u)), () => { f.userData.tag.visible = true; })], ['wait', 2.4]]);
          },
        },
        {
          title: 'Underlay 轉送', text: 'Spine 只看外層 IP 10.1.0.4，依外層 UDP 來源 port 做 ECMP 雜湊。它不需要知道 VNI，也看不到 Host A、B 的 MAC。實體路徑（纜線）與邏輯路徑（上方的隧道）同時顯示。',
          view: [0, 46, 66, 0, 12, -2], hl: ['L1', 'S3', 'L4'],
          enter(k) {
            ['L1-S3', 'L4-S3'].forEach(c => setCable(c, 'on'));
            const f = frame(k, true); f.userData.tag.visible = true;
            const g = k.pkt({ token: '--k-proc', size: 0.5 });
            k.chain([['move', f, cur('L1-S3'), 1.6, true], ['move', f, rev('L4-S3'), 1.6]]);
            k.chain([['move', g, P.tunnel, 3.2]]);
          },
        },
        {
          title: 'VTEP-2 解封裝', text: '外層目的 IP 是 Leaf 4 自己的 VTEP 位址：拆掉外層標頭，依 VNI 10100 找到 VLAN 100，再依內層 MAC 把原本的訊框送給 Host B。',
          view: [30, 20, 38, 24, 9, 8], hl: ['L4', 'hb'],
          enter(k) {
            setCable('H4', 'on');
            const f = frame(k, true); f.position.copy(P.L4f); f.visible = true; f.userData.tag.visible = true;
            k.chain([['wait', 0.5], ['call', () => { f.userData.tag.visible = false; k.tween(0.8, u => f.userData.shell.scale.setScalar(Math.max(0.01, 1 - u))); }], ['wait', 0.9], ['move', f, cur('H4'), 1.4, true], ['wait', 1.2], ['call', () => { f.visible = false; f.userData.shell.scale.setScalar(1); }]]);
          },
        },
      ],
      mclag: [
        { title: '兩台 peer，一個邏輯交換機', text: 'Leaf 1 與 Leaf 2 組成 MCLAG。Host A 的兩條纜線分別接到兩台 leaf；兩台以相同的 LACP system MAC 回應，Host A 看到的是一台交換機、一個 PortChannel。', view: [-14, 32, 54, -12, 9, 4], hl: ['L1', 'L2', 'ha'], enter() { setCable('H1', 'on'); setCable('HA2', 'on'); } },
        {
          title: 'ICCP 同步', text: '兩台 peer 經 peer link 建立 ICCP session，同步 MAC、ARP 與成員狀態；keepalive 走另一條路徑，用來分辨「對方故障」與「peer link 斷線」。',
          view: [-16, 22, 34, -16, 11, 8], hl: ['L1', 'L2'],
          enter(k) { setCable('PL', 'on'); setCable('KA', 'on'); const a = k.pkt({ size: 0.5 }), b = k.pkt({ size: 0.5, token: '--good' }); k.chain([['move', a, cur('PL'), 1], ['move', b, cables.PL.rev, 1]]); },
        },
        {
          title: '南北向流量', text: 'Host A 依 LACP 雜湊選一條成員鏈路；收到的 peer 直接以 L3 送往 spine，不經 peer link。',
          view: [-12, 30, 46, -10, 12, 0], hl: ['ha', 'L1', 'S1'],
          enter(k) { ['H1', 'L1-S1'].forEach(c => setCable(c, 'on')); const p = k.pkt(); k.chain([['move', p, rev('H1'), 0.9, true], ['move', p, cur('L1-S1'), 1.3]]); },
        },
        {
          title: '成員鏈路失效', text: 'Leaf 2 到 Host A 的纜線斷線。Host C（只接在 Leaf 2）送往 Host A 的流量改經 peer link 到 Leaf 1，再送到 Host A；LACP 讓 Host A 只使用剩下的那條鏈路。',
          view: [-14, 30, 52, -12, 9, 5], hl: ['hc', 'L2', 'L1', 'ha'],
          enter(k) {
            setCable('HA2', 'down'); ['H2', 'PL', 'H1'].forEach(c => setCable(c, 'on'));
            const p = k.pkt({ token: '--warn', label: 'C → A' });
            k.chain([['move', p, rev('H2'), 1, true], ['move', p, cables.PL.rev, 0.9, true], ['move', p, cur('H1'), 1]]);
          },
        },
      ],
    }[variant];

    // VXLAN：內層訊框（橘）＋可展開的外層外殼（藍）
    function frame(k, withShell) {
      const g = new k.THREE.Group();
      k.box(1.1, 1.1, 1.1, { token: '--k-ext', emissive: '#000', parent: g, round: 0.15 });
      const shell = k.box(2.4, 2.4, 2.4, { token: '--k-proc', opacity: 0.35, parent: g, round: 0.4 });
      shell.visible = !!withShell;
      const tag = k.label('VXLAN | UDP 4789 | IP 10.1.0.1→10.1.0.4', { parent: g, y: 1.6, size: 0.42, token: '--k-proc' });
      tag.visible = false;
      g.userData.shell = shell; g.userData.tag = tag;
      g.visible = false;
      k.scene.add(g); k.temp(g);
      return g;
    }

    const titles = { clos: 'Spine-leaf fabric 實體模型', vxlan: 'VXLAN 封裝：overlay 與 underlay', mclag: 'MCLAG 實體模型' };
    return S.scene3d(host, {
      title: titles[variant],
      view: variant === 'mclag' ? [-6, 40, 56, -8, 9, 0] : [0, 50, 66, 0, 9, -2],
      shadowBounds: 50,
      labelScale: 1.8,
      build, reset, steps: STEPS,
    });
  };
})();
