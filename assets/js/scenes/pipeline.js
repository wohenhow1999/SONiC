/* ASIC 轉發管線立體模型：封包由左側入口 port 進入，依序經過
   Parser → L2（FDB）→ L3（LPM / ECMP）→ ACL（TCAM）→ MMU 佇列 → Egress，
   從右側出口 port 送出；需要 CPU 處理的封包在 ACL 階段被 trap，
   經 CoPP 佇列與 policer 往上送到 CPU。每個階段標示對應的 SAI 物件。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.pipeline = function (host) {
    let V, THREE;
    const Y = 1.2;                      // 晶片表面高度
    const BUS = 5.6;                    // 封包在階段之間移動的高度
    const X = { in: -40, parser: -29, fdb: -17, lpm: -5, acl: 7, mmu: 21, egr: 33, out: 40 };
    const PZ = [-9, -3, 3, 9];          // port 的 z 位置
    const QZ = i => -10.5 + i * 3;      // MMU 佇列 TC0..TC7
    const CPUQ = [{ n: 'BGP', x: 3 }, { n: 'ARP', x: 7 }, { n: 'LLDP', x: 11 }];
    const CPU_Z = -17, CPU_Y = 21;
    const fills = {};                   // 佇列 id → 填充物件
    const P = {};

    // 封包經過某個階段：從上方下探進入方塊頂部再升起
    const through = (x, z, dip) => [V(x - 3.2, BUS, z), V(x, dip || 4.4, z), V(x + 3.2, BUS, z)];

    function build(k) {
      V = k.V; THREE = k.THREE;
      // ---------- 晶片 ----------
      const die = k.box(88, 1.2, 44, { color: '#262b33', y: 0.6, round: 0.5, rough: 0.55, metal: 0.25 });
      k.reg('die', die, { title: '交換晶片（ASIC）', where: '硬體', kind: 'hw', info: '<p>一顆交換晶片內部是固定順序的管線，每個階段在每個時脈處理不同封包，因此能以線速同時處理數十億個封包。各階段的表格內容都由 syncd 透過 SAI 寫入。</p>' });
      k.label('交換晶片內部轉發管線', { x: -30, y: 1.4, z: 20.5, anchor: 'left', sub: '資料平面：每個封包都依序經過這些階段', size: 0.75, bg: false, color: '--muted' });
      // 管線底部的導軌
      k.wire(k.poly(V(X.in + 2, Y + 0.15, 0), V(X.out - 2, Y + 0.15, 0)), { token: '--border-strong', radius: 0.25 });

      // ---------- port ----------
      const portGrp = (side) => {
        const g = new THREE.Group();
        PZ.forEach((z, i) => {
          k.box(3.2, 1.8, 3.2, { color: '#b9c0c9', metal: 0.45, rough: 0.4, parent: g, x: X[side], y: Y + 0.9, z, round: 0.2 });
          k.box(0.5, 0.2, 0.5, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, parent: g, x: X[side] + (side === 'in' ? -1 : 1), y: Y + 1.9, z: z + 1.1, shadow: false, round: 0 });
        });
        k.scene.add(g);
        return g;
      };
      k.reg('pin', portGrp('in'), { title: '入口 port（SerDes / MAC）', where: '管線入口', kind: 'hw', info: '<p>SerDes 把光電訊號轉成位元流，MAC 層切出訊框、檢查 FCS，並記錄入口 port 與時間戳記。</p>' });
      k.reg('pout', portGrp('out'), { title: '出口 port', where: '管線出口', kind: 'hw', info: '<p>排程器從佇列取出封包後，經 MAC 與 SerDes 送出。</p>' });
      k.label('入口 port', { x: X.in, y: Y + 2.6, z: -12.6, sub: 'Ethernet0 … 12', size: 0.62, token: '--k-hw' });
      k.label('出口 port', { x: X.out, y: Y + 2.6, z: -12.6, sub: 'Ethernet16 … 28', size: 0.62, token: '--k-hw' });
      P.pin = z => V(X.in, Y + 1.9, z);
      P.pout = z => V(X.out, Y + 1.9, z);

      // ---------- 各階段 ----------
      const stage = (id, x, w, d, h, title, sub, sai, token, info) => {
        const g = new THREE.Group();
        k.box(w, h, d, { token, mix: 0.45, parent: g, y: Y + h / 2, round: 0.5 });
        g.position.set(x, 0, 0);
        k.scene.add(g);
        k.reg(id, g, { title, where: sai, kind: token === '--k-db' ? 'db' : 'hw', info });
        k.label(title, { x, y: Y + h + 3.2, z: 0, sub, token, size: 0.72 });
        k.label(sai, { x, y: Y + h + 0.3, z: d / 2 + 0.2, anchor: 'center', size: 0.42, bg: false, color: '--muted' });
        return g;
      };
      // 表格：頂面的多列記憶體，查表時亮起其中一列
      const table = (id, x, rows, w, d, token) => {
        for (let i = 0; i < rows; i++) {
          const r = k.box(w - 1.6, 0.25, (d - 2) / rows - 0.25, { token, mix: 0.2, x, y: Y + 3.05, z: -d / 2 + 1 + (d - 2) / rows * (i + 0.5), round: 0, shadow: false });
          k.reg(`${id}-r${i}`, r, { title: id, kind: 'db' });
        }
      };
      stage('parser', X.parser, 7.5, 10, 2.6, 'Parser', '拆解標頭', 'SAI：port / hash 欄位', '--k-hw',
        '<p>依序辨識 Ethernet、VLAN tag、IPv4 / IPv6、TCP / UDP、VXLAN 等標頭，把需要的欄位（MAC、IP、port、DSCP…）抽出成後續階段使用的 metadata。封包本體先存進 buffer，管線處理的是標頭。</p>');
      stage('fdb', X.fdb, 8, 12, 2.6, 'L2 查表', 'FDB · VLAN', 'SAI_OBJECT_TYPE_FDB_ENTRY', '--k-db',
        '<p>以（VLAN, 目的 MAC）查 FDB：命中本機 port 就橋接轉發；目的 MAC 是自己的路由器 MAC（router interface）就交給 L3；查無則在 VLAN 內 flood。同時學習來源 MAC。對應 SONiC 的 FdbOrch。</p>');
      table('fdb', X.fdb, 6, 8, 12, '--k-db');
      stage('lpm', X.lpm, 8, 12, 2.6, 'L3 查表', 'LPM · ECMP', 'SAI ROUTE_ENTRY / NEXT_HOP_GROUP', '--k-db',
        '<p>以目的 IP 做最長前綴比對（LPM），得到 next hop 或 next hop group；若是 group，依五元組雜湊選出一個成員（ECMP）。對應 RouteOrch、NhgOrch。</p>');
      table('lpm', X.lpm, 6, 8, 12, '--k-db');
      stage('acl', X.acl, 8, 12, 2.6, 'ACL', 'TCAM 比對', 'SAI ACL_TABLE / ACL_ENTRY · HOSTIF_TRAP', '--k-cli',
        '<p>TCAM 以所有欄位同時比對所有規則，依優先權取第一筆命中：permit、deny、mirror、改 DSCP 或 trap 給 CPU。CoPP 的 trap 規則也在這裡決定哪些封包要送給 CPU。對應 AclOrch、CoppOrch。</p>');
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) k.box(0.9, 0.3, 1.6, { token: '--k-cli', mix: 0.15, x: X.acl - 2.9 + c * 1.16, y: Y + 3.05, z: -4.6 + r * 2.3, round: 0, shadow: false });
      k.reg('acl-hit', k.box(6.8, 0.36, 1.7, { token: '--good', x: X.acl, y: Y + 3.1, z: 0, round: 0, shadow: false, opacity: 0.3 }), { title: 'ACL 命中', kind: 'cli' });
      // MMU：共用 buffer 與 8 個佇列
      const mmu = new THREE.Group();
      k.box(12, 0.8, 26, { token: '--k-proc', mix: 0.5, parent: mmu, y: Y + 0.4, round: 0.4 });
      mmu.position.set(X.mmu, 0, 0);
      k.scene.add(mmu);
      k.reg('mmu', mmu, { title: 'MMU（buffer 與佇列）', where: 'SAI QUEUE / BUFFER_POOL / SCHEDULER', kind: 'proc', info: '<p>封包依 traffic class 進入出口 port 的 8 個佇列之一，共用晶片的 buffer pool。排程器以 strict priority 或 DWRR 決定下一個送出的佇列。佇列超過門檻時依 WRED 標 ECN 或丟棄，無損佇列則送出 PFC。對應 QosOrch、BufferOrch。</p>' });
      k.label('MMU 佇列', { x: X.mmu, y: Y + 11.6, z: 0, sub: 'buffer · 8 個 TC 佇列 · 排程', token: '--k-proc', size: 0.72 });
      k.label('SAI QUEUE / BUFFER_POOL / SCHEDULER', { x: X.mmu, y: Y + 1.1, z: 13.3, anchor: 'center', size: 0.42, bg: false, color: '--muted' });
      for (let i = 0; i < 8; i++) {
        const z = QZ(i);
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 7, 24, 1, true), k.mat('--k-proc', { opacity: 0.18, side: THREE.DoubleSide }));
        shell.position.set(X.mmu, Y + 0.8 + 3.5, z);
        k.scene.add(shell);
        const fg = new THREE.CylinderGeometry(1, 1, 1, 24); fg.translate(0, 0.5, 0);
        const fill = new THREE.Mesh(fg, k.mat(i === 3 ? '--warn' : '--k-proc', { mix: 0.1 }));
        fill.position.set(X.mmu, Y + 0.8, z);
        fill.scale.y = [0.6, 0.3, 0.2, 0.8, 0.3, 0.5, 0.2, 0.4][i];
        fill.userData.base = fill.scale.y;
        k.scene.add(fill);
        fills[i] = fill;
        k.label('TC' + i, { x: X.mmu + 1.9, y: Y + 1.2, z, anchor: 'left', size: 0.4, bg: false, color: '--muted' });
      }
      // 門檻線（TC3）
      k.wire(k.poly(V(X.mmu - 1.6, Y + 6.2, QZ(3)), V(X.mmu + 1.6, Y + 6.2, QZ(3))), { token: '--bad', radius: 0.08 });
      k.label('WRED / 丟棄門檻', { x: X.mmu - 1.8, y: Y + 6.2, z: QZ(3), anchor: 'left', size: 0.38, bg: false, color: '--bad' });
      P.q = i => V(X.mmu, Y + 8.6, QZ(i));
      stage('egr', X.egr, 7.5, 10, 2.6, 'Egress', '改寫 · 出口 ACL', 'SAI NEXT_HOP / NEIGHBOR_ENTRY', '--k-hw',
        '<p>路由的封包在這裡改寫：目的 MAC 換成 next hop 的 MAC（來自鄰居表）、來源 MAC 換成本機路由器 MAC、TTL 減 1、重算 checksum；也可以加上或移除 VLAN tag、VXLAN 標頭，並執行出口 ACL。</p>');
      // ECMP 扇出：出口改寫後可能送往的 4 個 port
      PZ.forEach((z, i) => k.wire(k.path(V(X.egr + 3.8, Y + 1.6, 0), V(X.egr + 5.5, Y + 1.6, z * 0.6), V(X.out - 1.7, Y + 1.6, z)), { token: '--border-strong', radius: 0.1, opacity: 0.8 }));

      // ---------- CPU 路徑（CoPP） ----------
      const cpuq = new THREE.Group();
      CPUQ.forEach(q => {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4, 20, 1, true), k.mat('--k-cli', { opacity: 0.2, side: THREE.DoubleSide }));
        shell.position.set(q.x, Y + 2, CPU_Z + 4);
        cpuq.add(shell);
        const fg = new THREE.CylinderGeometry(0.78, 0.78, 1, 20); fg.translate(0, 0.5, 0);
        const fill = new THREE.Mesh(fg, k.mat('--k-cli', { mix: 0.15 }));
        fill.position.set(q.x, Y, CPU_Z + 4); fill.scale.y = 0.6; fill.userData.base = 0.6;
        cpuq.add(fill);
        fills['cpu-' + q.n] = fill;
        // policer：佇列上方的環
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.18, 10, 32), k.mat('--k-cli', { rough: 0.3 }));
        ring.rotation.x = Math.PI / 2; ring.position.set(q.x, Y + 5, CPU_Z + 4);
        cpuq.add(ring);
        k.label(q.n, { x: q.x, y: Y + 6, z: CPU_Z + 4, size: 0.46, token: '--k-cli' });
        P['cq' + q.n] = V(q.x, Y + 4.6, CPU_Z + 4);
      });
      k.scene.add(cpuq);
      k.reg('cpuq', cpuq, { title: 'CPU 佇列與 policer（CoPP）', where: 'SAI HOSTIF_TRAP_GROUP / POLICER', kind: 'cli', info: '<p>被 trap 的封包依類型進入不同的 CPU 佇列，每個 trap group 都有 policer（環）限制速率：BGP、LACP 等重要協定有較高優先權；ARP、LLDP 等以 pps 限速，超過的在晶片內就被丟棄，不會拖垮 CPU。對應 CoppOrch 與 <code>copp_cfg.json</code>。</p>' });
      k.label('CoPP：CPU 佇列 + policer', { x: 7, y: Y + 8.2, z: CPU_Z + 4, size: 0.62, token: '--k-cli' });
      const cpu = new THREE.Group();
      k.box(10, 1.4, 7, { color: '#23272e', parent: cpu, round: 0.4 });
      k.box(7, 0.35, 5, { color: '#aeb6c0', metal: 0.6, rough: 0.35, parent: cpu, y: 0.85 });
      cpu.position.set(7, CPU_Y, CPU_Z);
      k.scene.add(cpu);
      k.reg('cpu', cpu, { title: 'CPU · Linux kernel', where: '控制平面', kind: 'kernel', info: '<p>封包經 PCIe 由驅動送進 kernel 的 netdev（例如 Ethernet0），再交給 bgpd、lldpd、teamd 等程序。資料平面的流量完全不經過這裡。</p>' });
      k.label('CPU · Linux kernel', { x: 7, y: CPU_Y + 1.6, z: CPU_Z, sub: 'netdev → bgpd / lldpd / teamd', token: '--k-kernel', size: 0.72 });
      k.wire(k.path(V(7, Y + 7, CPU_Z + 4), V(7, CPU_Y - 4, CPU_Z + 1), V(7, CPU_Y - 0.8, CPU_Z)), { color: '#caa233', radius: 0.35 });
      k.label('PCIe', { x: 8.6, y: 14, z: CPU_Z + 2.4, anchor: 'left', size: 0.45, bg: false, color: '--muted' });
      P.cpu = V(7, CPU_Y - 0.8, CPU_Z);
    }

    function reset() {
      Object.values(fills).forEach(f => { f.scale.y = f.userData.base; });
    }

    // ---------- 路徑 ----------
    const main = z0 => [P.pin(z0), V(X.in + 3, BUS, z0 * 0.5), ...through(X.parser, 0), ...through(X.fdb, 0), ...through(X.lpm, 0), ...through(X.acl, 0)];
    const toQueue = (i) => [V(X.acl + 3.2, BUS, 0), V(X.mmu - 3, BUS + 3, QZ(i) * 0.5), P.q(i)];
    const fromQueue = (i, z1) => [V(X.mmu, Y + 1.5, QZ(i)), V(X.mmu + 5, Y + 3.5, QZ(i) * 0.5), ...through(X.egr, 0), V(X.out - 3, Y + 3, z1 * 0.6), P.pout(z1)];
    const drop = (at) => [at, at.clone().add(V(0.6, 1.2, 0.8)), at.clone().add(V(1.5, -3.8, 2.4))];

    const steps = [
      {
        title: '封包從入口 port 進入',
        text: '封包經 SerDes 與 MAC 進入晶片。封包本體存進 buffer，接下來的每個階段只處理從標頭抽出的欄位。所有封包都走同一條管線，順序固定。',
        view: [-44, 30, 40, -24, 3, 0], hl: ['pin', 'parser'],
        enter(k) { const p = k.pkt({ label: '10.1.1.5 → 10.2.0.9' }); k.chain([['move', p, k.path(P.pin(-3).clone().add(V(-5, 0, 0)), P.pin(-3)), 0.6, true], ['move', p, k.path(P.pin(-3), V(X.in + 4, BUS, -1), ...through(X.parser, 0).slice(0, 2)), 1.4, true], ['wait', 0.8]]); },
      },
      {
        title: 'Parser：拆解標頭',
        text: 'Parser 依序辨識 Ethernet、IPv4、TCP 標頭，把目的 MAC、目的 IP、五元組、DSCP 等欄位抽出成 metadata，交給後面的查表階段。',
        view: [-40, 22, 28, -29, 5, 0], hl: ['parser'],
        enter(k) {
          const parts = [['Ethernet', '--k-hw'], ['IPv4', '--k-db'], ['TCP', '--k-proc']].map(([n, t]) => k.pkt({ token: t, shape: 'box', size: 0.9, label: n, glow: false }));
          k.chain([
            ['par', parts.map((p, i) => ['move', p, k.path(V(X.parser, 4.4, 0), V(X.parser - 2 + i * 2, 8 + i * 0.3, -1 + i), V(X.parser - 3 + i * 3, 9 + i * 1.3, -2 + i * 2)), 1.2, true])],
            ['wait', 1.6],
            ['par', parts.map((p, i) => ['move', p, k.path(V(X.parser - 3 + i * 3, 9 + i * 1.3, -2 + i * 2), V(X.parser + 3.2, BUS, 0)), 1, false])],
            ['wait', 0.6],
          ]);
        },
      },
      {
        title: 'L2 查表：是橋接還是路由',
        text: '以（VLAN, 目的 MAC）查 FDB。這個封包的目的 MAC 是交換機自己的路由器 MAC，代表要做路由，於是交給 L3。若是同一個 VLAN 的其他主機，就在這裡直接決定出口 port（橋接）。',
        view: [-26, 24, 30, -17, 4, 0], hl: ['fdb'],
        enter(k) { const p = k.pkt({ label: 'DMAC = router MAC' }); k.chain([['move', p, k.path(...through(X.fdb, 0)), 1.6, true], ['call', () => k.flash('fdb-r2', 1.2)], ['wait', 1.2]]); },
      },
      {
        title: 'L3 查表：LPM 與 ECMP',
        text: '以目的 IP 10.2.0.9 做最長前綴比對，命中 10.2.0.0/16，指向一個有 4 個成員的 next hop group。依五元組雜湊選出其中一個，決定出口 port 與 next hop。',
        view: [-8, 30, 34, 10, 4, 0], hl: ['lpm', 'egr'],
        enter(k) {
          const p = k.pkt({ label: '10.2.0.0/16 → NHG' });
          k.chain([['move', p, k.path(...through(X.lpm, 0)), 1.5, true], ['call', () => k.flash('lpm-r4', 1.2)], ['wait', 0.8]]);
          [0, 1, 2, 3].forEach(i => { const g = k.pkt({ size: 0.45, token: i === 2 ? '--accent' : '--faint', glow: i === 2 }); k.chain([['wait', 1.6], ['move', g, k.path(V(X.egr + 3.8, Y + 1.6, 0), V(X.egr + 5.5, Y + 1.6, PZ[i] * 0.6), P.pout(PZ[i])), 1.1]]); });
        },
      },
      {
        title: 'ACL：TCAM 同時比對所有規則',
        text: 'TCAM 以封包的所有欄位同時比對每一條規則。第一個封包命中 permit 繼續前進；第二個封包命中 deny（來源 192.0.2.0/24），在晶片內就被丟棄。',
        view: [0, 24, 30, 7, 4, 0], hl: ['acl'],
        enter(k) {
          const a = k.pkt({ label: 'permit' }), b = k.pkt({ token: '--bad', label: 'deny · 192.0.2.8' });
          k.chain([
            ['move', a, k.path(...through(X.acl, 0)), 1.5, false],
            ['call', () => k.flash('acl-hit')],
            ['move', b, k.path(V(X.acl - 3.2, BUS, 0), V(X.acl, 4.4, 0)), 1.0, true],
            ['move', b, k.path(...drop(V(X.acl, 4.4, 0))), 1.0],
            ['wait', 0.6],
          ]);
        },
      },
      {
        title: 'MMU：佇列、排程與壅塞',
        text: '封包依 DSCP 對應的 traffic class 進入出口 port 的佇列。TC3 流量突增：佇列持續升高，超過門檻後 WRED 開始丟棄（或標記 ECN）。排程器依 strict priority / DWRR 從各佇列取出封包送往 egress。',
        view: [8, 30, 34, 21, 5, 0], hl: ['mmu'],
        enter(k) {
          k.chain([
            ['call', () => { fills[3].scale.y = 0.8; }],
            ['call', () => k.tween(3, u => { fills[3].scale.y = 0.8 + u * 4.8; })],
            ['wait', 3.2],
            ['call', () => k.tween(1.6, u => { fills[3].scale.y = 5.6 - u * 1.4; })],
            ['wait', 1.8],
          ]);
          for (let i = 0; i < 6; i++) {
            const p = k.pkt({ size: 0.5, token: '--warn' });
            const late = i >= 3;
            k.chain([['wait', i * 0.55], ['move', p, k.path(...toQueue(3)), 1.1, late], ...(late ? [['move', p, k.path(...drop(P.q(3))), 0.9]] : [])]);
          }
          const out = k.pkt({ size: 0.5 });
          k.chain([['wait', 1.2], ['move', out, k.path(...fromQueue(0, PZ[2])), 2.2]]);
        },
      },
      {
        title: 'Egress：改寫後送出',
        text: 'Egress 把目的 MAC 換成 next hop 的 MAC、來源 MAC 換成本機路由器 MAC、TTL 減 1 並重算 checksum，然後從選定的出口 port 送出。整個過程在晶片內以線速完成，沒有經過 CPU。',
        view: [22, 24, 32, 34, 4, 0], hl: ['egr', 'pout'],
        enter(k) { const p = k.pkt({ label: 'DMAC→NH · TTL−1' }); k.chain([['move', p, k.path(...fromQueue(3, PZ[2])), 2.4, true], ['move', p, k.path(P.pout(PZ[2]), P.pout(PZ[2]).clone().add(V(6, 0, 0))), 0.6], ['wait', 0.6]]); },
      },
      {
        title: 'CoPP：控制封包 trap 給 CPU',
        text: 'BGP 封包在 ACL 階段命中 trap 規則，進入 CPU 佇列，通過 policer 後經 PCIe 送到 CPU。同時有大量 ARP 湧入：ARP 的 policer 只放行設定的速率，其餘在晶片內就被丟棄（紅色），CPU 不受影響。',
        view: [-22, 36, 30, 5, 11, -11], hl: ['acl', 'cpuq', 'cpu'],
        enter(k) {
          const bgp = k.pkt({ token: '--good', label: 'BGP' });
          k.chain([
            ['move', bgp, k.path(...main(-9).slice(-3), V(X.acl + 1, BUS + 1, -6), P.cqBGP), 2, true],
            ['move', bgp, k.path(P.cqBGP, V(7, Y + 7, CPU_Z + 4), V(7, CPU_Y - 4, CPU_Z + 1), P.cpu), 1.6],
            ['call', () => k.flash('cpu')],
            ['wait', 0.6],
          ]);
          for (let i = 0; i < 7; i++) {
            const pass = i % 3 === 0;
            const p = k.pkt({ size: 0.5, token: pass ? '--k-cli' : '--bad', glow: pass });
            k.chain([
              ['wait', 0.3 * i],
              ['move', p, k.path(V(X.acl, BUS, 0), V(X.acl + 0.5, BUS + 1.5, -8), P.cqARP), 1.1, true],
              ...(pass ? [['move', p, k.path(P.cqARP, V(7, Y + 7, CPU_Z + 4), V(7, CPU_Y - 4, CPU_Z + 1), P.cpu), 1.4]] : [['move', p, k.path(...drop(P.cqARP)), 0.8]]),
            ]);
          }
        },
      },
    ];

    return S.scene3d(host, {
      title: 'ASIC 轉發管線',
      hint: '拖曳旋轉 · 點選各階段看說明 · 逐步播放時相機會移到該階段',
      view: [-4, 60, 74, 1, 5, -4],
      shadowBounds: 55,
      labelScale: 1.6,
      interval: 7500,
      build, reset, steps,
      intro: '<span class="muted">由左而右是交換晶片內部的處理順序：Parser → L2 查表 → L3 查表 → ACL → MMU 佇列 → Egress。後方是送往 CPU 的路徑（CoPP）。每個方塊下方標示它在 SAI 中對應的物件，也就是 SONiC 的 orchagent 寫入的東西。按「下一步」逐步播放。</span>',
    });
  };
})();
