/* Multicast 分送樹立體模型：來源在最上方，資料往下沿著樹流向接收端；
   封包在分岔的路由器 / 交換機上複製，沒有接收端的分支不會收到流量。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.mcast = function (host) {
    let k, V, THREE;
    const N = {
      S: { x: 4, y: 31, z: -12, t: 'src', name: 'Source', sub: '10.9.0.5 · 串流伺服器' },
      R1: { x: 4, y: 24, z: -12, t: 'rtr', name: 'R1', sub: 'FHR · DR' },
      RP: { x: -16, y: 19, z: -6, t: 'rtr', name: 'RP', sub: 'Rendezvous Point' },
      R2: { x: -16, y: 12, z: 3, t: 'rtr', name: 'R2', sub: 'LHR' },
      R3: { x: 15, y: 12, z: 3, t: 'rtr', name: 'R3', sub: 'LHR' },
      L1: { x: -24, y: 5.5, z: 13, t: 'sw', name: 'L1', sub: 'IGMP snooping' },
      L2: { x: -8, y: 5.5, z: 13, t: 'sw', name: 'L2', sub: 'IGMP snooping' },
      L3: { x: 7, y: 5.5, z: 13, t: 'sw', name: 'L3', sub: 'IGMP snooping' },
      L4: { x: 23, y: 5.5, z: 13, t: 'sw', name: 'L4', sub: 'IGMP snooping' },
    };
    const RX = { h11: ['L1', -3.5, true], h12: ['L1', 3.5, false], h21: ['L2', -3.5, false], h22: ['L2', 3.5, false], h31: ['L3', -3.5, true], h32: ['L3', 3.5, true], h41: ['L4', -3.5, true], h42: ['L4', 3.5, false] };
    const LINKS = [['S', 'R1'], ['R1', 'RP'], ['R1', 'R3'], ['RP', 'R2'], ['RP', 'R3'], ['R2', 'L1'], ['R2', 'L2'], ['R3', 'L3'], ['R3', 'L4']];
    Object.entries(RX).forEach(([h, [sw]]) => LINKS.push([sw, h]));
    const links = {};
    let mats, snoopLab;
    const pos = id => { const n = N[id]; if (n) return V(n.x, n.y, n.z); const [sw, dx] = RX[id]; return V(N[sw].x + dx, 1.6, N[sw].z + 9); };

    function build(kit) {
      k = kit; V = k.V; THREE = k.THREE;
      mats = {
        line: k.mat('--faint', { rough: 0.5 }), tree: k.mat('--accent', { rough: 0.4 }), spt: k.mat('--good', { rough: 0.4 }),
        dim: k.mat('--faint', { rough: 0.5, opacity: 0.25 }), member: k.mat('--k-proc', { rough: 0.4 }),
      };
      k.box(66, 0.4, 56, { color: '#9aa3ae', y: -0.2, round: 0, rough: 0.95 });
      Object.entries(N).forEach(([id, n]) => {
        const g = new THREE.Group();
        if (n.t === 'rtr') {
          k.cyl(2.8, 1.8, { color: '#2b3139', parent: g, metal: 0.3, rough: 0.5 });
          k.cyl(2.85, 0.25, { token: id === 'RP' ? '--warn' : '--k-hw', parent: g, y: 0.6 });
        } else if (n.t === 'sw') {
          k.box(6.5, 1.4, 4.5, { color: '#2b3139', parent: g, metal: 0.3, rough: 0.5 });
          for (let i = 0; i < 5; i++) k.box(0.45, 0.22, 0.1, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, parent: g, x: -2.2 + i * 1.1, y: 0.3, z: 2.3, shadow: false, round: 0 });
        } else {
          k.box(4.5, 3.2, 3.5, { token: '--k-ext', mix: 0.25, parent: g });
        }
        g.position.copy(pos(id));
        k.scene.add(g);
        k.label(n.name, { parent: g, y: n.t === 'src' ? 1.8 : 1.2, sub: n.sub, token: id === 'RP' ? '--warn' : n.t === 'src' ? '--k-ext' : '--k-hw', size: 0.62 });
        const info = {
          S: '來源主機，送往群組 239.1.1.1。它不需要知道有哪些接收端。',
          R1: 'First-hop router：來源所在網段的 DR。收到群播後，以 PIM Register（單播封裝）交給 RP。',
          RP: 'Rendezvous Point：來源與接收端的會合點。接收端先加入以 RP 為根的共享樹 (*,G)。',
          R2: 'Last-hop router：從 IGMP 得知下方有接收端，向 RP 送 PIM (*,G) Join。',
          R3: 'Last-hop router。收到流量後可切換到最短路徑樹 (S,G)，直接從 R1 取得資料。',
        }[id] || 'L2 交換機：以 IGMP snooping 監聽 Join / Leave，只把群播送到有接收端的 port。';
        k.reg(id, g, { title: n.name, where: n.sub, kind: n.t === 'src' ? 'ext' : 'hw', info: `<p>${info}</p>` });
      });
      Object.entries(RX).forEach(([h, [sw, dx, on]]) => {
        const g = new THREE.Group();
        k.box(2.6, 2.2, 2, { token: on ? '--k-ext' : '--faint', mix: on ? 0.2 : 0.4, parent: g, y: 0 });
        k.label(on ? '接收端' : '未加入', { parent: g, y: 1.3, size: 0.42, bg: false, color: on ? '--k-ext' : '--muted' });
        g.position.copy(pos(h));
        k.scene.add(g);
        k.reg(h, g, { title: on ? '接收端（已加入 239.1.1.1）' : '未加入群組的主機', kind: 'ext', info: on ? '<p>以 IGMP Membership Report 加入群組 239.1.1.1。</p>' : '<p>沒有加入群組。啟用 IGMP snooping 時，交換機不會把群播送到這個 port。</p>' });
      });
      LINKS.forEach(([a, b]) => { links[`${a}-${b}`] = k.wire(k.poly(pos(a), pos(b)), { mat: mats.line, radius: 0.2 }); });
      snoopLab = k.label('', { x: 0, y: 1, z: 27, size: 0.8, token: '--warn', anchor: 'center' });
      snoopLab.visible = false;
    }

    const L = id => links[id] || links[id.split('-').reverse().join('-')];
    function paint(tree, extra) {
      Object.values(links).forEach(m => { m.material = mats.line; });
      (tree || []).forEach(id => { L(id).material = mats.tree; });
      Object.entries(extra || {}).forEach(([id, m]) => { L(id).material = mats[m]; });
    }
    const SHARED = ['R1-RP', 'RP-R2', 'RP-R3', 'R2-L1', 'R3-L3', 'R3-L4', 'L1-h11', 'L3-h31', 'L3-h32', 'L4-h41'];
    // 沿路徑逐跳移動：每跳時間相同，重疊的副本在共用路段上看起來是同一個，到分岔點才分開
    const hops = (p, ids, per) => ids.slice(0, -1).map((id, i) => ['move', p, k.poly(pos(id), pos(ids[i + 1])), per || 0.8, i < ids.length - 2]);
    const send = (paths, o) => paths.forEach(ids => { const p = k.pkt(Object.assign({ size: 0.65 }, o)); k.chain([...hops(p, ids), ['wait', 0.8]]); });
    function setSnoop(text) { if (!text) { snoopLab.visible = false; return; } const n = k.label(text, { size: 0.8, token: '--warn', anchor: 'center' }); snoopLab.material.map = n.material.map; snoopLab.material.needsUpdate = true; snoopLab.scale.copy(n.scale); k.scene.remove(n); snoopLab.visible = true; }

    const steps = [
      {
        title: '角色', text: '來源在最上方；R1 是來源端的 first-hop router，RP 是會合點，R2、R3 是接收端的 last-hop router，最下層是啟用 IGMP snooping 的 L2 交換機與主機。有顏色的主機已加入群組 239.1.1.1，灰色的沒有。',
        view: [0, 30, 84, 0, 14, 4],
        enter() { paint(); setSnoop(); },
      },
      {
        title: 'IGMP：主機加入群組', text: '接收端送出 IGMP Membership Report。交換機以 IGMP snooping 記下哪個 port 有接收端，並把報告轉給 last-hop router；R2、R3 因此知道下方有 239.1.1.1 的接收端。',
        view: [0, 20, 66, 0, 5, 10], hl: ['L1', 'L3', 'L4', 'R2', 'R3'],
        enter() {
          paint([], { 'L1-h11': 'member', 'L3-h31': 'member', 'L3-h32': 'member', 'L4-h41': 'member' }); setSnoop();
          send([['h11', 'L1', 'R2'], ['h31', 'L3', 'R3'], ['h32', 'L3', 'R3'], ['h41', 'L4', 'R3']], { token: '--k-proc', label: 'IGMP Report', size: 0.55 });
        },
      },
      {
        title: 'PIM Join：建立以 RP 為根的共享樹', text: 'R2、R3 向 RP 逐跳送出 PIM (*,G) Join，沿途路由器建立轉送狀態，形成以 RP 為根的共享樹（藍）。L2 下方沒有接收端，R2 不會把那個分支加入樹中。',
        view: [-6, 30, 72, -4, 14, 0], hl: ['RP', 'R2', 'R3'],
        enter() {
          paint(['RP-R2', 'RP-R3', 'R2-L1', 'R3-L3', 'R3-L4', 'L1-h11', 'L3-h31', 'L3-h32', 'L4-h41']); setSnoop();
          send([['R2', 'RP'], ['R3', 'RP']], { token: '--k-proc', label: 'PIM (*,G) Join', size: 0.55 });
        },
      },
      {
        title: '資料沿共享樹送下，在分岔處複製', text: '來源的流量先由 R1 以 Register 送到 RP，再從 RP 沿共享樹往下。封包只在分岔點複製：RP 複製給 R2、R3，R3 再複製給 L3、L4，L3 再複製給兩台接收端。每條鏈路上只有一份，這就是群播比多次單播省頻寬的原因。',
        view: [0, 30, 86, 0, 14, 4], hl: ['S', 'R1', 'RP'],
        enter() {
          paint(SHARED.concat(['S-R1'])); setSnoop();
          send([['S', 'R1', 'RP', 'R2', 'L1', 'h11'], ['S', 'R1', 'RP', 'R3', 'L3', 'h31'], ['S', 'R1', 'RP', 'R3', 'L3', 'h32'], ['S', 'R1', 'RP', 'R3', 'L4', 'h41']]);
        },
      },
      {
        title: 'IGMP snooping 的作用', text: '先看未啟用 snooping：L1、L4 把群播當成未知目的，flood 到所有 port，沒加入的主機也收到（紅）。啟用 snooping 後，交換機只送到曾送出 IGMP Report 的 port。',
        view: [0, 24, 76, 0, 5, 10], hl: ['L1', 'L4'],
        enter() {
          paint(SHARED.concat(['S-R1'])); setSnoop('未啟用 IGMP snooping：flood 到所有 port');
          const f = bad => k.pkt({ size: 0.6, token: bad ? '--bad' : '--accent' });
          const a = f(), b = f(true), c = f(), d = f(true), a2 = f(), c2 = f();
          k.chain([
            ['par', [['move', a, k.poly(pos('R2'), pos('L1')), 0.8, true], ['move', b, k.poly(pos('R2'), pos('L1')), 0.8, true], ['move', c, k.poly(pos('R3'), pos('L4')), 0.8, true], ['move', d, k.poly(pos('R3'), pos('L4')), 0.8, true]]],
            ['par', [['move', a, k.poly(pos('L1'), pos('h11')), 0.8], ['move', b, k.poly(pos('L1'), pos('h12')), 0.8], ['move', c, k.poly(pos('L4'), pos('h41')), 0.8], ['move', d, k.poly(pos('L4'), pos('h42')), 0.8]]],
            ['wait', 0.8],
            ['call', () => setSnoop('啟用 IGMP snooping：只送到接收端的 port')],
            ['par', [['move', a2, k.poly(pos('R2'), pos('L1')), 0.8, true], ['move', c2, k.poly(pos('R3'), pos('L4')), 0.8, true]]],
            ['par', [['move', a2, k.poly(pos('L1'), pos('h11')), 0.8], ['move', c2, k.poly(pos('L4'), pos('h41')), 0.8]]],
            ['wait', 1],
            ['call', () => setSnoop('未啟用 IGMP snooping：flood 到所有 port')],
          ]);
        },
      },
      {
        title: '切換到最短路徑樹（SPT）', text: 'R3 收到第一批資料後，得知來源位址，直接向 R1 送出 PIM (S,G) Join，建立最短路徑樹（綠）。之後 R3 下方的流量改走 R1 → R3，不再繞經 RP；R3 並向 RP 送 prune，RP-R3 分支不再使用（淡）。',
        view: [14, 30, 80, 4, 15, 0], hl: ['R1', 'R3'],
        enter() {
          paint(['R1-RP', 'RP-R2', 'R2-L1', 'L1-h11', 'R3-L3', 'R3-L4', 'L3-h31', 'L3-h32', 'L4-h41', 'S-R1'], { 'R1-R3': 'spt', 'RP-R3': 'dim' }); setSnoop();
          const j = k.pkt({ token: '--good', label: 'PIM (S,G) Join', size: 0.55 });
          k.chain([...hops(j, ['R3', 'R1']), ['wait', 5]]);
          [['S', 'R1', 'R3', 'L3', 'h31'], ['S', 'R1', 'R3', 'L3', 'h32'], ['S', 'R1', 'R3', 'L4', 'h41'], ['S', 'R1', 'RP', 'R2', 'L1', 'h11']].forEach(ids => {
            const p = k.pkt({ size: 0.65, token: ids.includes('RP') ? '--accent' : '--good' });
            k.chain([['wait', 1.2], ...hops(p, ids), ['wait', 0.5]]);
          });
        },
      },
      {
        title: '離開群組', text: 'L3 下方的一台主機送出 IGMP Leave。L3 送出特定群組查詢，確認該 port 已沒有其他接收端後，停止往那個 port 轉送；另一台接收端不受影響。若某台 LHR 下方的接收端全部離開，它會向上游 prune，整個分支從樹上移除。',
        view: [8, 16, 58, 7, 4, 12], hl: ['L3'],
        enter() {
          paint(['S-R1', 'R3-L3', 'L3-h31'], { 'R1-R3': 'spt', 'L3-h32': 'dim' }); setSnoop();
          const lv = k.pkt({ token: '--warn', label: 'IGMP Leave', size: 0.55 });
          k.chain([...hops(lv, ['h32', 'L3']), ['wait', 4]]);
          const p = k.pkt({ size: 0.65, token: '--good' });
          k.chain([['wait', 1.2], ...hops(p, ['R1', 'R3', 'L3', 'h31']), ['wait', 0.6]]);
        },
      },
    ];

    return S.scene3d(host, {
      title: 'Multicast 分送樹',
      hint: '上方是來源、下方是接收端 · 拖曳旋轉 · 點選設備看說明',
      view: [0, 30, 84, 0, 14, 4],
      shadowBounds: 40,
      labelScale: 2,
      interval: 8000,
      build, steps,
      intro: '<span class="muted">高度代表離來源的遠近：來源在最上方，資料往下流向接收端。逐步播放 IGMP 加入、PIM 建立共享樹、資料在分岔處複製、IGMP snooping 的效果、切換到最短路徑樹，以及離開群組。</span>',
    });
  };
})();
