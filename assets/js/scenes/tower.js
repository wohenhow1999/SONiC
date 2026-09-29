/* SONiC 系統立體模型：硬體在最下層，Linux kernel 在其上，
   Redis 資料庫塔位於中央，各 Docker 容器環繞著它。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.tower = function (host) {
    let V, P = {}, discY = {}, vlan;
    const DB_C = { x: 0, z: -3 }, DB_R = 5.2;
    const DBS = [
      ['ASIC_DB', 'db 1 · SAI 物件（orchagent → syncd）'],
      ['COUNTERS_DB', 'db 2 · 硬體計數器'],
      ['STATE_DB', 'db 6 · 運作狀態'],
      ['APPL_DB', 'db 0 · 期望狀態'],
      ['CONFIG_DB', 'db 4 · 使用者設定'],
    ];
    const CONT = [
      { id: 'bgp', name: 'bgp 容器', sub: 'FRR', x: -22, z: 9, w: 12, procs: [['bgpd', 'BGP 協定'], ['zebra', 'RIB'], ['fpmsyncd', '路由 → APPL_DB']], info: '<p>FRR 路由套件。bgpd 與鄰居交換路由，zebra 選出最佳路由並安裝到 kernel，同時透過 FPM 交給 SONiC 的 fpmsyncd。</p>' },
      { id: 'swss', name: 'swss 容器', sub: 'Switch State Service', x: 22, z: 9, w: 12, procs: [['orchagent', 'APPL → ASIC_DB'], ['vlanmgrd', 'CONFIG → kernel'], ['portsyncd', 'port 狀態']], info: '<p>SONiC 的核心：*mgrd 把設定套到 kernel，*syncd 把 kernel 狀態同步到 Redis，orchagent 把期望狀態轉成 SAI 物件。</p>' },
      { id: 'syncd', name: 'syncd 容器', sub: '廠商 SAI', x: 0, z: 12, w: 9, procs: [['syncd', 'sairedis → libsai']], info: '<p>唯一直接操作交換晶片的容器：讀取 ASIC_DB，呼叫廠商的 libsai，經 PCIe 驅動寫入 ASIC。</p>' },
      { id: 'teamd', name: 'teamd 容器', sub: 'LACP', x: -23, z: -11, w: 10, procs: [['teamd', 'LACP'], ['teamsyncd', 'LAG 狀態']], info: '<p>PortChannel 的 LACP 協商與成員狀態。</p>' },
      { id: 'lldp', name: 'lldp 容器', sub: '鄰居探索', x: -9, z: -16, w: 9, procs: [['lldpd', 'LLDP']], info: '<p>LLDP 鄰居資訊，結果寫入 APPL_DB 供 SNMP、CLI 查詢。</p>' },
      { id: 'mgmt', name: 'mgmt-framework · gnmi', sub: '北向介面', x: 9, z: -16, w: 10, procs: [['REST', 'KLISH / RESTCONF'], ['gNMI', 'telemetry']], info: '<p>程式化管理介面，經 translib 讀寫 Redis。</p>' },
      { id: 'pmon', name: 'pmon 容器', sub: '平台監控', x: 23, z: -11, w: 10, procs: [['xcvrd', '光模組'], ['psud', '電源']], info: '<p>讀取硬體感測器，把光模組、電源、風扇與溫度狀態寫入 STATE_DB。</p>' },
    ];
    const PORTS = 12;
    const portX = i => -22 + i * 4;

    // 資料庫圓盤邊緣上，朝向某一點的位置
    const disc = (name, toward) => {
      const y = discY[name];
      const d = V(toward.x - DB_C.x, 0, toward.z - DB_C.z).normalize();
      return V(DB_C.x + d.x * (DB_R + 0.3), y, DB_C.z + d.z * (DB_R + 0.3));
    };

    return S.scene3d(host, {
      title: 'SONiC 系統立體模型',
      hint: '拖曳旋轉 · 點選元件看說明 · 逐步播放時相機會移到相關位置',
      view: [40, 36, 50, 0, 10, 1],
      shadowBounds: 45,
      labelScale: 1.6,
      build(k) {
        V = k.V;
        // ---------- 硬體層 ----------
        const board = k.box(66, 1.2, 46, { color: '#1f4d3b', y: 0.6, round: 0.4, rough: 0.9 });
        k.reg('board', board, { title: '主機板', where: '硬體', kind: 'hw', info: '<p>交換機主機板：交換晶片（ASIC）、CPU 模組與前面板 port 之間以 PCIe 與高速 SerDes 連接。</p>' });
        const asic = new k.THREE.Group();
        k.box(12, 1.6, 12, { color: '#23272e', parent: asic, y: 0, rough: 0.6 });
        k.box(9, 0.35, 9, { color: '#aeb6c0', metal: 0.6, rough: 0.35, parent: asic, y: 0.95 });
        asic.position.set(6, 2.0, 5);
        k.scene.add(asic);
        k.reg('asic', asic, { title: '交換晶片（ASIC）', where: '硬體', kind: 'hw', info: '<p>以硬體線速完成解析、查表（FDB、LPM 路由、ACL）、排隊與排程。它不理解設定檔，只接受 SAI 驅動寫入的表格內容。</p>' });
        k.label('ASIC', { x: 6, y: 3.6, z: 5, sub: '交換晶片 · 轉發管線', token: '--k-hw', size: 0.8 });
        const cpu = new k.THREE.Group();
        k.box(6.5, 1.2, 6.5, { color: '#23272e', parent: cpu });
        k.box(4.6, 0.3, 4.6, { color: '#aeb6c0', metal: 0.6, rough: 0.35, parent: cpu, y: 0.75 });
        cpu.position.set(-19, 1.8, 6);
        k.scene.add(cpu);
        k.reg('cpu', cpu, { title: 'CPU', where: '硬體', kind: 'hw', info: '<p>執行 Linux 與所有容器（控制平面）。只處理被 ASIC trap 上來的封包（BGP、LACP、ARP…），一般資料流量不經過 CPU。</p>' });
        k.label('CPU', { x: -19, y: 3.0, z: 6, sub: 'x86 · 控制平面', token: '--k-hw', size: 0.7 });
        k.wire(k.poly(V(-15.6, 1.3, 6), V(-0.2, 1.3, 5)), { color: '#caa233', radius: 0.16 });
        k.wire(k.poly(V(-15.6, 1.3, 6.8), V(-0.2, 1.3, 5.8)), { color: '#caa233', radius: 0.16 });
        k.label('PCIe', { x: -8, y: 1.5, z: 7.6, size: 0.6, bg: false, color: '--muted' });
        const ports = new k.THREE.Group();
        for (let i = 0; i < PORTS; i++) {
          k.box(3, 1.7, 3, { color: '#b9c0c9', metal: 0.45, rough: 0.4, parent: ports, x: portX(i), y: 2.05, z: 20.8, round: 0.2 });
          k.box(0.55, 0.22, 0.55, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, parent: ports, x: portX(i) + 0.9, y: 3.0, z: 21.9, shadow: false, round: 0 });
          if (i % 3 === 0) k.wire(k.path(V(portX(i), 1.3, 19.2), V((portX(i) + 6) / 2, 1.3, 13), V(6 + (i - 5.5) * 0.6, 1.3, 11.2)), { color: '#caa233', radius: 0.1 });
        }
        k.scene.add(ports);
        k.reg('ports', ports, { title: '前面板 port', where: '硬體', kind: 'hw', info: '<p>每個 port 以 SerDes 直接連到 ASIC。封包進出都在這裡；在 Linux 中對應 Ethernet0、Ethernet4… 等 netdev。</p>' });
        k.label('前面板 port', { x: 0, y: 3.4, z: 24, sub: 'Ethernet0 … Ethernet44', token: '--k-hw', size: 0.65 });
        P.port = i => V(portX(i), 2.6, 21);
        P.asic = V(6, 3.2, 5);
        P.cpu = V(-19, 2.6, 6);

        // ---------- Linux kernel ----------
        const kern = k.glass(62, 0.4, 42, { token: '--k-kernel', opacity: 0.05, floorOpacity: 0.12, y: 7 });
        k.reg('kernel', kern, { title: 'Linux kernel', where: '主機', kind: 'kernel', info: '<p>每個前面板 port 在 kernel 中都有對應的 netdev（由 ASIC 廠商驅動建立）。控制平面封包經由它們收送；kernel 的路由表、鄰居表、bridge 與 ASIC 的狀態保持一致。</p>' });
        k.label('Linux Kernel', { x: -26, y: 7.6, z: 12, sub: 'netdev · 路由表 · 鄰居表 · bridge', token: '--k-kernel', size: 0.7 });
        for (let i = 0; i < PORTS; i += 2) k.cyl(0.55, 1.2, { token: '--k-kernel', x: portX(i), y: 7.8, z: 16 });
        k.label('Ethernet0', { x: portX(0), y: 8.6, z: 16, size: 0.4 });
        const rt = k.box(8, 0.6, 5, { token: '--k-kernel', mix: 0.3, x: -15, y: 7.5, z: 1 });
        k.reg('rt', rt, { title: '路由表 / 鄰居表', where: 'Linux kernel', kind: 'kernel', info: '<p>zebra 把路由裝進 kernel，neighsyncd 從 kernel 讀取鄰居。這讓 CPU 本身也能正確收送控制封包。</p>' });
        k.label('路由 / 鄰居表', { x: -15, y: 8.0, z: 1, size: 0.45 });
        vlan = k.cyl(0.9, 1.4, { token: '--accent', x: -5, y: 7.9, z: 16 });
        vlan.visible = false;
        k.reg('vlan', vlan, { title: 'Vlan100（bridge）', where: 'Linux kernel', kind: 'kernel', info: '<p>vlanmgrd 依 CONFIG_DB 在 kernel 建立的 Vlan100 bridge 介面。</p>' });
        P.kern = i => V(portX(i), 8.4, 16);
        P.vlan = V(-5, 8.6, 16);
        P.rt = V(-15, 7.9, 1);

        // ---------- Redis 資料庫塔 ----------
        const dbGlass = k.glass(14, 11, 14, { token: '--k-container', opacity: 0.05, x: DB_C.x, y: 16.5, z: DB_C.z });
        k.reg('database', dbGlass, { title: 'database 容器（Redis）', where: '容器', kind: 'container', info: '<p>整個系統唯一的狀態中樞。各容器之間不直接呼叫彼此，而是讀寫 Redis：一方寫入、另一方訂閱變更。越上層的資料庫越接近使用者的意圖，越下層越接近硬體。</p>' });
        k.label('database 容器 · Redis', { x: DB_C.x, y: 22.3, z: DB_C.z, token: '--k-container', size: 0.65 });
        k.cyl(1.1, 9.5, { token: '--k-db', mix: 0.5, x: DB_C.x, y: 16.1, z: DB_C.z });
        DBS.forEach(([name, sub], i) => {
          const y = 12.4 + i * 1.85;
          discY[name] = y;
          const d = k.cyl(DB_R, 1.25, { token: '--k-db', mix: 0.12 + i * 0.1, x: DB_C.x, y, z: DB_C.z, seg: 48 });
          k.reg('db-' + name, d, { title: name, where: 'Redis', kind: 'db', info: `<p>${sub}</p>` });
          k.label(name, { x: DB_C.x + DB_R * 0.72, y: y - 0.1, z: DB_C.z + DB_R * 0.75, anchor: 'left', token: '--k-db', size: 0.5 });
        });

        // ---------- 容器 ----------
        CONT.forEach(c => {
          const d = c.id === 'syncd' ? 7 : 8;
          const g = k.glass(c.w, 6, d, { token: '--k-container', opacity: 0.08, x: c.x, y: 14, z: c.z });
          k.reg('c-' + c.id, g, { title: c.name, where: 'Docker 容器', kind: 'container', info: c.info });
          k.label(c.name, { x: c.x, y: 17.3, z: c.z, sub: c.sub, token: '--k-container', size: 0.62 });
          const n = c.procs.length, span = c.w - 2;
          c.procs.forEach(([pn, ps], j) => {
            const px = n === 1 ? c.x : c.x - span / 2 + (span / (n - 1)) * j * (n > 1 ? 1 : 0);
            const bw = n === 1 ? 4 : Math.min(3.4, span / n - 0.3);
            const pos = { x: n === 1 ? c.x : c.x - span / 2 + bw / 2 + (span - bw) / (n - 1) * j, z: c.z };
            const b = k.box(bw, 1.8, 3, { token: '--k-proc', mix: 0.35, x: pos.x, y: 12.0, z: pos.z });
            k.reg(pn, b, { title: pn, where: c.name, kind: 'proc', info: `<p>${ps}。</p>` });
            k.label(pn, { x: pos.x, y: 13.05, z: pos.z, size: 0.46 });
            P[pn] = V(pos.x, 12.4, pos.z);
          });
        });

        // ---------- 使用者 ----------
        const term = new k.THREE.Group();
        k.box(13, 5.5, 0.5, { color: '#0f141b', parent: term, round: 0.3 });
        k.box(0.8, 3, 0.8, { color: '#6b7280', parent: term, y: -4, round: 0.2 });
        term.position.set(0, 28, 16);
        k.scene.add(term);
        k.reg('cli', term, { title: 'CLI / REST / gNMI', where: '使用者', kind: 'cli', info: '<p>使用者與自動化工具的入口。所有設定最後都寫入 CONFIG_DB；所有 show 指令則從 Redis 讀取。</p>' });
        k.label('admin@sonic', { x: 0, y: 28.6, z: 16.4, anchor: 'center', sub: '$ config vlan add 100', fill: '#0f141b', color: '--good', size: 0.55, bg: true });
        P.cli = V(0, 25.5, 16);
      },
      reset() { if (vlan) { vlan.visible = false; vlan.scale.set(1, 1, 1); } },
      steps: [
        {
          title: '使用者寫入 CONFIG_DB',
          text: '<code>config vlan add 100</code> 只做一件事：把 <code>VLAN|Vlan100</code> 寫進 CONFIG_DB（塔頂）。此時硬體還沒有任何變化。',
          view: [14, 38, 54, 0, 18, 2], hl: ['cli', 'db-CONFIG_DB'],
          enter(k) { const p = k.pkt({ label: 'VLAN|Vlan100' }); k.chain([['move', p, k.arc(P.cli, disc('CONFIG_DB', P.cli), 3), 1.6], ['call', () => k.flash('db-CONFIG_DB')], ['wait', 0.6]]); },
        },
        {
          title: 'vlanmgrd 套用到 kernel，寫入 APPL_DB',
          text: 'swss 容器中的 vlanmgrd 訂閱 CONFIG_DB 的變更：在 Linux kernel 建立 Vlan100 bridge，並把結果寫入 APPL_DB。',
          view: [46, 32, 50, 10, 11, 4], hl: ['vlanmgrd', 'db-CONFIG_DB', 'db-APPL_DB', 'vlan'],
          enter(k) {
            const p = k.pkt(), a = k.pkt(), b = k.pkt();
            k.chain([
              ['call', () => { vlan.visible = false; }],
              ['move', p, k.arc(disc('CONFIG_DB', P.vlanmgrd), P.vlanmgrd, 2), 1.3],
              ['call', () => k.flash('vlanmgrd')],
              ['par', [['move', a, k.arc(P.vlanmgrd, P.vlan, 3), 1.5], ['move', b, k.arc(P.vlanmgrd, disc('APPL_DB', P.vlanmgrd), 2), 1.5]]],
              ['call', () => { vlan.visible = true; vlan.scale.set(1, 0.01, 1); k.tween(0.6, u => vlan.scale.set(1, Math.max(0.01, u), 1)); k.flash('db-APPL_DB'); }],
              ['wait', 1],
            ]);
          },
        },
        {
          title: '控制封包經 ASIC 上送 CPU',
          text: '鄰居送來的 BGP 封包從 Ethernet0 進入 ASIC。ASIC 依 CoPP 規則把它 trap 給 CPU，經 PCIe 到達 kernel 的 Ethernet0 netdev，再交給 bgp 容器中的 bgpd。',
          view: [-46, 26, 52, -10, 6, 8], hl: ['ports', 'asic', 'cpu', 'bgpd'],
          enter(k) {
            const p = k.pkt({ token: '--warn', label: 'BGP UPDATE' });
            k.chain([
              ['move', p, k.poly(P.port(0).clone().add(V(0, 0, 5)), P.port(0)), 0.6, true],
              ['move', p, k.arc(P.port(0), P.asic, 1.5), 1.1, true],
              ['call', () => k.flash('asic')],
              ['move', p, k.poly(P.asic, V(-0.2, 1.6, 5.4), V(-15.6, 1.6, 6.4), P.cpu), 1.3, true],
              ['call', () => k.flash('cpu')],
              ['move', p, k.arc(P.cpu, P.kern(0), 2), 1.0, true],
              ['move', p, k.arc(P.kern(0), P.bgpd, 1.5), 1.1],
              ['call', () => k.flash('bgpd')],
              ['wait', 0.6],
            ]);
          },
        },
        {
          title: 'BGP 路由寫入 kernel 與 APPL_DB',
          text: 'bgpd 把路由交給 zebra；zebra 一方面安裝到 kernel 路由表，一方面透過 FPM 交給 fpmsyncd，由它寫入 APPL_DB 的 ROUTE_TABLE。',
          view: [-48, 34, 46, -10, 12, 2], hl: ['bgpd', 'zebra', 'fpmsyncd', 'rt', 'db-APPL_DB'],
          enter(k) {
            const a = k.pkt(), b = k.pkt(), c = k.pkt();
            k.chain([
              ['move', a, k.arc(P.bgpd, P.zebra, 1.2), 0.8],
              ['call', () => k.flash('zebra')],
              ['par', [['move', b, k.arc(P.zebra, P.rt, 2), 1.3], ['move', c, k.arc(P.zebra, P.fpmsyncd, 1.2), 0.8]]],
              ['call', () => { k.flash('rt'); k.flash('fpmsyncd'); }],
              ['move', c, k.arc(P.fpmsyncd, disc('APPL_DB', P.fpmsyncd), 2.5), 1.3],
              ['call', () => k.flash('db-APPL_DB')],
              ['wait', 0.8],
            ]);
          },
        },
        {
          title: 'orchagent 轉成 SAI 物件',
          text: 'orchagent 訂閱 APPL_DB，處理相依關係（路由的 next hop 需要鄰居、鄰居需要介面），把結果轉成 SAI 物件寫入塔底的 ASIC_DB。',
          view: [48, 32, 40, 8, 13, 0], hl: ['orchagent', 'db-APPL_DB', 'db-ASIC_DB'],
          enter(k) {
            const a = k.pkt(), b = k.pkt({ label: 'SAI_OBJECT_TYPE_ROUTE_ENTRY' });
            k.chain([
              ['move', a, k.arc(disc('APPL_DB', P.orchagent), P.orchagent, 2), 1.2],
              ['call', () => k.flash('orchagent')],
              ['move', b, k.arc(P.orchagent, disc('ASIC_DB', P.orchagent), 1.5), 1.4],
              ['call', () => k.flash('db-ASIC_DB')],
              ['wait', 0.8],
            ]);
          },
        },
        {
          title: 'syncd 寫入交換晶片',
          text: 'syncd 讀取 ASIC_DB，呼叫廠商的 libsai，經 PCIe 驅動寫入 ASIC 的表格。到這一步，這條路由才真正生效。',
          view: [32, 26, 50, 3, 8, 5], hl: ['syncd', 'db-ASIC_DB', 'asic'],
          enter(k) {
            const a = k.pkt(), b = k.pkt({ label: 'SAI API' });
            k.chain([
              ['move', a, k.arc(disc('ASIC_DB', P.syncd), P.syncd, 1.5), 1.2],
              ['call', () => k.flash('syncd')],
              ['move', b, k.path(P.syncd, V(3, 8, 8), P.asic), 1.5],
              ['call', () => k.flash('asic', 1.4)],
              ['wait', 1],
            ]);
          },
        },
        {
          title: '資料平面：ASIC 直接轉發',
          text: '一般流量由 ASIC 以線速在 port 之間轉發，完全不經過 CPU、kernel 或任何容器。控制平面只負責把「表格」寫進晶片。',
          view: [0, 20, 54, 0, 3, 10], hl: ['asic', 'ports'],
          enter(k) {
            k.stream(k.path(P.port(2).clone().add(V(0, 0, 4)), P.port(2), V(2, 3, 9), P.asic, V(8, 3, 9), P.port(8), P.port(8).clone().add(V(0, 0, 4))), { speed: 16, every: 0.35, size: 0.4 });
            k.stream(k.path(P.port(10).clone().add(V(0, 0, 4)), P.port(10), V(10, 3, 9), P.asic, V(2, 3, 9), P.port(4), P.port(4).clone().add(V(0, 0, 4))), { speed: 16, every: 0.4, size: 0.4, token: '--good' });
          },
        },
        {
          title: '狀態與計數器回報',
          text: 'syncd 週期讀取晶片計數器寫入 COUNTERS_DB，pmon 把光模組與電源狀態寫入 STATE_DB。<code>show interfaces counters</code> 等指令都是從 Redis 讀出，不會直接詢問硬體。',
          view: [26, 36, 54, 2, 13, 2], hl: ['syncd', 'xcvrd', 'db-COUNTERS_DB', 'db-STATE_DB', 'cli'],
          enter(k) {
            const a = k.pkt({ token: '--good' }), b = k.pkt({ token: '--good' }), c = k.pkt({ token: '--good' }), d = k.pkt({ token: '--good' });
            k.chain([
              ['move', a, k.path(P.asic, V(3, 8, 8), P.syncd), 1.2],
              ['par', [['move', b, k.arc(P.syncd, disc('COUNTERS_DB', P.syncd), 1.5), 1.2], ['move', c, k.arc(P.xcvrd, disc('STATE_DB', P.xcvrd), 2), 1.4]]],
              ['call', () => { k.flash('db-COUNTERS_DB'); k.flash('db-STATE_DB'); }],
              ['move', d, k.arc(disc('COUNTERS_DB', P.cli), P.cli, 3), 1.4],
              ['call', () => k.flash('cli')],
              ['wait', 0.8],
            ]);
          },
        },
      ],
    });
  };
})();
