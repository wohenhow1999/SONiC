/* gNMI 與 TLS / PKI 立體模型：
   左側是 gNMI 收集器，右側是 SONiC 交換機（gnmi 容器、translib、Redis、ASIC），
   上方是 CA。憑證以實體卡片表示，在 CA、交換機與收集器之間傳遞；私鑰留在原地。
   握手完成後出現加密通道，Subscribe / Set 都在通道內進行。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.gnmi = function (host) {
    let k, V, THREE;
    const P = {};
    const persist = {};           // 常駐物件（依步驟顯示或隱藏）

    // 憑證卡片：直立的卡片，上緣色帶代表簽發者，右下角是 CA 的封印
    function card(parent, o) {
      const g = new THREE.Group();
      k.box(3.6, 2.4, 0.2, { color: '#f4f6f8', parent: g, round: 0.12, rough: 0.6 });
      k.box(3.6, 0.55, 0.24, { token: o.token || '--k-file', parent: g, y: 0.93, round: 0.1 });
      const seal = k.cyl(0.38, 0.12, { color: '#caa233', metal: 0.5, rough: 0.35, parent: g, x: 1.1, y: -0.62, z: 0.14 });
      seal.rotation.x = Math.PI / 2;
      k.label(o.title, { parent: g, y: 1.35, sub: o.sub, token: o.token || '--k-file', size: 0.46 });
      (parent || k.scene).add(g);
      return g;
    }
    function keyIcon(x, y, z, label) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 10, 24), k.mat('#caa233', { metal: 0.6, rough: 0.3 }));
      g.add(ring);
      k.box(1.6, 0.26, 0.26, { color: '#caa233', metal: 0.6, rough: 0.3, parent: g, x: 1.3, round: 0.05 });
      k.box(0.26, 0.5, 0.26, { color: '#caa233', metal: 0.6, rough: 0.3, parent: g, x: 1.9, y: -0.3, round: 0.05 });
      g.position.set(x, y, z);
      k.scene.add(g);
      k.label(label, { x: x + 0.8, y: y + 0.8, z, size: 0.4, bg: false, color: '--muted' });
      return g;
    }
    // 暫時顯示的註解（步驟切換時自動移除）
    const note = (text, pos, color, sub) => { const l = k.label(text, { x: pos.x, y: pos.y, z: pos.z, sub, token: color || '--good', color: color || '--good', size: 0.55 }); l.visible = false; k.temp(l); return l; };

    function build(kit) {
      k = kit; V = k.V; THREE = k.THREE;
      toCl = V(-29, 7, 6); toSrv = V(15, 6.6, 9);
      k.box(92, 0.4, 52, { color: '#9aa3ae', y: -0.2, round: 0, rough: 0.95 });

      // ---------- CA ----------
      const ca = new THREE.Group();
      k.cyl(4, 1.4, { color: '#2b3139', parent: ca, metal: 0.3, rough: 0.5 });
      k.cyl(3.2, 2.2, { token: '--warn', mix: 0.35, parent: ca, y: 1.6 });
      const sealBig = k.cyl(1.2, 0.3, { color: '#caa233', metal: 0.6, rough: 0.3, parent: ca, y: 2.9 });
      ca.position.set(0, 20, -14);
      k.scene.add(ca);
      k.reg('ca', ca, { title: 'CA（憑證機構）', where: '信任的來源', kind: 'ext', info: '<p>企業內部的憑證機構（例如公司的 PKI 或 HashiCorp Vault）。它用自己的私鑰在憑證上簽章；任何人只要持有 CA 的根憑證，就能驗證那張憑證是不是 CA 簽的、內容有沒有被竄改。</p>' });
      k.label('Corp Root CA', { x: 0, y: 24.4, z: -14, sub: '在憑證上簽章 · 大家都信任它', token: '--warn', size: 0.8 });
      // 從 CA 垂下的虛線，表示信任關係
      P.ca = V(0, 20.5, -11);

      // ---------- 收集器（gNMI client） ----------
      const cl = new THREE.Group();
      k.box(9, 1, 6, { color: '#6b7280', parent: cl, y: 2.5, round: 0.3 });
      k.box(7.5, 5, 0.5, { color: '#111827', parent: cl, y: 6.2, z: -1.5, round: 0.3 });
      k.box(0.6, 2, 0.6, { color: '#6b7280', parent: cl, y: 3.8, z: -1.5, round: 0.1 });
      for (let i = 0; i < 4; i++) k.box(0.9 + i * 0.4, 0.25 + i * 0.5, 0.1, { token: '--good', emissive: '#16a34a', ei: 0.4, parent: cl, x: -2.5 + i * 1.5, y: 4.6 + (0.25 + i * 0.5) / 2, z: -1.2, round: 0, shadow: false });
      cl.position.set(-32, 0, 2);
      k.scene.add(cl);
      k.reg('client', cl, { title: 'gNMI 收集器（client）', where: 'gnmic · Telegraf · 監控 / 自動化平台', kind: 'ext', info: '<p>向交換機發起 gRPC 連線，送出 Get / Set / Subscribe。它必須信任簽發交換機憑證的 CA（trust store），啟用 mTLS 時自己也要有 client 憑證。</p>' });
      k.label('gNMI 收集器', { x: -32, y: 9.6, z: 0.5, sub: 'gnmic · Telegraf · 自動化平台', token: '--k-ext', size: 0.75 });
      P.cl = V(-27.5, 5.5, 2);

      // ---------- SONiC 交換機 ----------
      k.box(26, 2.4, 20, { color: '#2b3139', x: 24, y: 1.2, z: 2, metal: 0.3, rough: 0.5 });
      for (let i = 0; i < 10; i++) k.box(1.4, 0.3, 0.15, { color: '#22c55e', emissive: '#22c55e', ei: 0.9, x: 14.5 + i * 2.1, y: 1.6, z: 12.05, shadow: false, round: 0 });
      k.label('SONiC 交換機 · sw1.example.com', { x: 24, y: 0.4, z: 13.4, size: 0.62, bg: false, color: '--muted' });
      const cont = k.glass(14, 6, 9, { token: '--k-container', opacity: 0.08, x: 18, y: 5.4, z: 0 });
      k.reg('gnmi-c', cont, { title: 'gnmi 容器', where: 'Docker 容器', kind: 'container', info: '<p>執行 gNMI / gNOI 伺服器（Enterprise 預設 TCP 8080，社群版常見 50051）。TLS 所用的伺服器憑證、私鑰與 trust store 由 security profile（社群版為 CONFIG_DB 的 GNMI|certs）指定。</p>' });
      k.label('gnmi 容器', { x: 18, y: 8.9, z: 0, sub: 'gNMI / gNOI · TCP 8080', token: '--k-container', size: 0.6 });
      const gs = k.box(5, 1.8, 3.6, { token: '--k-proc', mix: 0.35, x: 14.8, y: 3.4, z: 0 });
      k.reg('gs', gs, { title: 'gNMI server', where: 'gnmi 容器', kind: 'proc', info: '<p>終止 TLS、驗證使用者（密碼、JWT 或 client 憑證），再依 RBAC 決定能做什麼。YANG 路徑交給 translib，資料庫路徑直接讀 Redis。</p>' });
      k.label('gNMI server', { x: 14.8, y: 4.5, z: 0, size: 0.45 });
      const tl = k.box(5, 1.8, 3.6, { token: '--k-proc', mix: 0.35, x: 21.2, y: 3.4, z: 0 });
      k.reg('tl', tl, { title: 'translib', where: 'gnmi / mgmt-framework', kind: 'proc', info: '<p>把 OpenConfig / SONiC YANG 路徑轉成 Redis 的表與欄位，寫入前以 CVL 驗證。REST 與 CLI 也共用它，所以三種介面的結果一致。</p>' });
      k.label('translib', { x: 21.2, y: 4.5, z: 0, size: 0.45 });
      P.gs = V(12.6, 4, 1); P.gsTop = V(14.8, 4.4, 0); P.tl = V(21.2, 4.4, 0);
      const dbs = [['COUNTERS_DB', 4.4], ['STATE_DB', 6.4], ['CONFIG_DB', 8.4]];
      dbs.forEach(([n, y]) => {
        const d = k.cyl(2.4, 1.4, { token: '--k-db', mix: 0.2, x: 31, y, z: -2 });
        k.reg(n, d, { title: n, where: 'Redis', kind: 'db', info: `<p>${{ COUNTERS_DB: '介面計數器，syncd 定期從 ASIC 讀回。SAMPLE 訂閱最常讀這裡。', STATE_DB: '運作狀態，例如 port 的 oper_status。ON_CHANGE 訂閱在這裡的值改變時立即推送。', CONFIG_DB: '設定。gNMI Set 寫入這裡，再由 orchagent 下發到晶片。' }[n]}</p>` });
        k.label(n, { x: 33.8, y, z: -2, anchor: 'left', size: 0.42, token: '--k-db' });
        P[n] = V(28.4, y, -1.4);
      });
      const asic = k.box(6, 1, 6, { color: '#23272e', x: 28, y: 2.9, z: 7.5, rough: 0.6 });
      k.reg('asic', asic, { title: 'ASIC', where: '交換晶片', kind: 'hw', info: '<p>實際轉發封包的晶片；計數器與 port 狀態從這裡產生。</p>' });
      k.label('ASIC', { x: 28, y: 3.7, z: 7.5, size: 0.45, token: '--k-hw' });
      P.asic = V(28, 3.8, 7.5);

      // ---------- 憑證與私鑰（常駐） ----------
      persist.srvCert = card(null, { title: '伺服器憑證', sub: 'CN / SAN = sw1.example.com', token: '--k-file' });
      persist.srvCert.position.set(15, 4.6, 12.6);
      persist.srvTS = card(null, { title: 'trust store', sub: 'Corp Root CA（驗 client 用）', token: '--warn' });
      persist.srvTS.position.set(21, 4.6, 12.6);
      persist.cliTS = card(null, { title: 'trust store', sub: 'Corp Root CA', token: '--warn' });
      persist.cliTS.position.set(-37, 2.6, 7.5);
      persist.cliCert = card(null, { title: 'client 憑證', sub: 'CN = admin', token: '--k-ext' });
      persist.cliCert.position.set(-32.5, 2.6, 7.5);
      k.reg('srvCert', persist.srvCert, { title: '伺服器憑證', where: '交換機', kind: 'file', info: '<p>證明「我就是 sw1.example.com」。內容包含公鑰、名稱（CN / SAN）、有效期與 CA 的簽章。可以公開給任何人看。</p>' });
      k.reg('cliTS', persist.cliTS, { title: '收集器的 trust store', where: '收集器', kind: 'file', info: '<p>收集器信任的 CA 清單。只要交換機的憑證是清單中的 CA 簽的，就接受。gnmic 以 <code>--tls-ca</code> 指定。</p>' });
      k.reg('srvTS', persist.srvTS, { title: '交換機的 trust store', where: 'security profile', kind: 'file', info: '<p>交換機用來驗證 client 憑證的 CA 清單（mTLS）。在 Enterprise SONiC 以 <code>crypto trust-store</code> 建立，並綁到 security profile。</p>' });
      k.reg('cliCert', persist.cliCert, { title: 'client 憑證', where: '收集器', kind: 'file', info: '<p>收集器的身分證明。gNMI 以憑證的 CN 作為使用者名稱，再套用該使用者的 RBAC 角色。</p>' });
      keyIcon(24.5, 3.1, 12.4, '交換機私鑰：永遠不離開交換機');
      keyIcon(-28, 3, 7.5, 'client 私鑰');

      // 網路與加密通道
      k.wire(k.poly(P.cl, V(-10, 5.5, 3), P.gs), { color: '#8b94a3', radius: 0.14 });
      persist.tunnel = k.wire(k.poly(P.cl, V(-10, 5.5, 3), P.gs), { token: '--good', radius: 1.5, opacity: 0.22 });
      persist.tunnel.renderOrder = 2;
      persist.tunLab = k.label('TLS 1.3 加密通道', { x: -9, y: 8.6, z: 3, sub: '外人只看得到密文', token: '--good', color: '--good', size: 0.7 });

      // 攻擊者
      const att = new THREE.Group();
      k.box(3, 4.2, 2.4, { token: '--bad', mix: 0.35, parent: att, y: 2.1 });
      k.cyl(1.2, 1.4, { token: '--bad', mix: 0.35, parent: att, y: 5 });
      att.position.set(-8, 0, 17);
      k.scene.add(att);
      k.reg('att', att, { title: '攻擊者', where: '同一段網路上', kind: 'ext', info: '<p>可能側錄封包，或冒充交換機（中間人攻擊）。TLS 讓他看不懂內容，憑證驗證讓他冒充不成。</p>' });
      k.label('攻擊者', { x: -8, y: 6.4, z: 17, sub: '側錄 · 冒充', token: '--bad', size: 0.6 });
      P.att = V(-8, 4, 15.5);
      state({});
    }

    function state(o) {
      persist.srvCert.visible = o.srv !== false;
      persist.cliCert.visible = o.cli !== false;
      persist.tunnel.visible = persist.tunLab.visible = !!o.tun;
    }
    function reset() { state({}); }
    let toCl, toSrv;
    const flyCard = (from, to, o) => { const g = card(null, o); g.visible = false; k.temp(g); return ['move', g, k.path(from, from.clone().lerp(to, 0.5).add(V(0, 6, 0)), to), 2, true]; };

    const steps = [
      {
        title: '三個角色', text: '左邊是 gNMI 收集器（例如 gnmic、Telegraf 或自動化平台），右邊是 SONiC 交換機上的 gNMI server，上方是公司的 CA。兩端都事先放好一份「trust store」：寫著「我信任 Corp Root CA 簽的憑證」。',
        view: [0, 42, 88, -2, 8, 0], hl: ['client', 'gs', 'ca'],
        enter() { state({ srv: false, cli: false }); },
      },
      {
        title: 'CA 簽發伺服器憑證', text: '交換機自己產生一對金鑰，把公鑰與名稱（sw1.example.com）做成 CSR 送給 CA。CA 驗證後簽章，發回伺服器憑證。私鑰從頭到尾沒有離開交換機；client 憑證也是用同樣的流程發給收集器。',
        view: [8, 34, 70, 4, 11, 0], hl: ['ca', 'srvCert'],
        enter() {
          state({ srv: false, cli: false });
          const csr = k.pkt({ token: '--k-file', label: 'CSR：公鑰 + sw1.example.com', size: 0.6 });
          k.chain([
            ['call', () => { persist.srvCert.visible = false; persist.cliCert.visible = false; }],
            ['move', csr, k.path(V(17, 5, 12), V(8, 16, 0), P.ca), 1.8],
            ['call', () => k.flash('ca', 1.2)],
            ['wait', 0.6],
            flyCard(P.ca, V(15, 4.6, 12.6), { title: '伺服器憑證', sub: 'CA 已簽章', token: '--k-file' }),
            ['call', () => { persist.srvCert.visible = true; }],
            flyCard(P.ca, V(-32.5, 2.6, 7.5), { title: 'client 憑證', sub: 'CN = admin', token: '--k-ext' }),
            ['call', () => { persist.cliCert.visible = true; }],
            ['wait', 1.2],
          ]);
        },
      },
      {
        title: 'ClientHello：開始 TLS 握手', text: '收集器連到交換機的 TCP 8080，送出 ClientHello：「我支援 TLS 1.3，這些加密套件都可以，這是我的金鑰交換參數」。此時還沒有任何加密。',
        view: [-8, 30, 70, -8, 6, 2], hl: ['client', 'gs'],
        enter() { state({}); const p = k.pkt({ label: 'ClientHello · TLS 1.3', size: 0.65 }); k.chain([['move', p, k.poly(P.cl, V(-10, 5.5, 3), P.gs), 2.2], ['wait', 1]]); },
      },
      {
        title: '交換機出示憑證，收集器驗證', text: '交換機回傳伺服器憑證，並用私鑰簽一段握手資料證明「這張憑證真的是我的」。收集器檢查三件事：簽章是不是 trust store 裡的 CA 簽的、憑證是否在有效期內、憑證上的名稱是否等於我要連的 sw1.example.com。三項都通過才繼續。',
        view: [-24, 24, 50, -26, 6, 4], hl: ['client', 'cliTS'],
        enter() {
          state({});
          const ok = note('驗證通過', V(-24, 13.5, 9), '--good', '簽章 ✓ · 有效期 ✓ · 名稱 ✓');
          k.chain([
            flyCard(V(15, 4.6, 12.6), toCl, { title: '伺服器憑證', sub: 'sw1.example.com', token: '--k-file' }),
            ['call', () => { k.flash('cliTS', 1.2); ok.visible = true; }],
            ['wait', 2.4],
            ['call', () => { ok.visible = false; }],
          ]);
        },
      },
      {
        title: 'mTLS：收集器也出示憑證', text: '啟用雙向驗證（mTLS）時，交換機會要求收集器也出示憑證，並用自己的 trust store 驗證。通過後，gNMI 以憑證的 CN（admin）當作使用者名稱，套用 admin 的 RBAC 權限——不需要在程式裡寫密碼。',
        view: [12, 24, 54, 16, 6, 6], hl: ['srvTS', 'gs'],
        enter() {
          state({});
          const ok = note('CN = admin → 使用者 admin', V(18, 13, 10), '--good', '套用 RBAC 角色');
          k.chain([
            flyCard(V(-32.5, 2.6, 7.5), toSrv, { title: 'client 憑證', sub: 'CN = admin', token: '--k-ext' }),
            ['call', () => { k.flash('srvTS', 1.2); ok.visible = true; }],
            ['wait', 2.4],
            ['call', () => { ok.visible = false; }],
          ]);
        },
      },
      {
        title: '交換金鑰，建立加密通道', text: '雙方以 ECDHE 各自送出一半的金鑰材料，在兩端各自算出同一把對稱的會談金鑰（這把金鑰從未在網路上傳送）。之後所有資料都以 AES-GCM 加密並防竄改，形成一條加密通道。',
        view: [-4, 32, 70, -6, 6, 2], hl: ['client', 'gs'],
        enter() {
          state({});
          const a = k.pkt({ token: '--k-proc', label: 'key share', size: 0.6 }), b = k.pkt({ token: '--k-proc', label: 'key share', size: 0.6 });
          k.chain([
            ['call', () => state({})],
            ['par', [['move', a, k.poly(P.cl, V(-10, 5.5, 3), P.gs), 1.8], ['move', b, k.poly(P.gs, V(-10, 5.5, 3), P.cl), 1.8]]],
            ['call', () => { state({ tun: true }); persist.tunnel.scale.set(1, 1, 1); }],
            ['wait', 2.4],
          ]);
        },
      },
      {
        title: 'Subscribe（SAMPLE）：定期推送計數器', text: '收集器在通道內送出 SubscribeRequest：「每 10 秒給我所有介面的計數器」。gNMI server 之後就定期讀 COUNTERS_DB，自動推送給收集器；收集器不必一直來問。',
        view: [0, 34, 76, 2, 6, 0], hl: ['gs', 'COUNTERS_DB'],
        enter() {
          state({ tun: true });
          const req = k.pkt({ label: 'Subscribe · SAMPLE 10s', size: 0.65 });
          const acts = [['move', req, k.poly(P.cl, V(-10, 5.5, 3), P.gs), 1.8]];
          for (let i = 0; i < 3; i++) {
            const r = k.pkt({ token: '--k-db', size: 0.5 }), u = k.pkt({ token: '--good', label: 'Update · in-octets', size: 0.6 });
            acts.push(['move', r, k.path(P.gsTop, V(24, 8, -1), P.COUNTERS_DB), 0.9], ['move', u, k.poly(P.gs, V(-10, 5.5, 3), P.cl), 1.5], ['wait', 0.5]);
          }
          k.chain(acts);
        },
      },
      {
        title: 'Subscribe（ON_CHANGE）：狀態一變就推送', text: '某個 port 斷線：ASIC 回報後 STATE_DB 的 oper_status 變成 down，gNMI server 立刻推送一則 Update。不用等下一次輪詢，監控平台通常一秒內就收到告警。',
        view: [10, 30, 66, 10, 5, 2], hl: ['asic', 'STATE_DB', 'gs'],
        enter() {
          state({ tun: true });
          const e = k.pkt({ token: '--bad', label: 'Ethernet8 down', size: 0.6 }), u = k.pkt({ token: '--bad', label: 'Update · oper-status DOWN', size: 0.65 });
          k.chain([
            ['wait', 0.4],
            ['move', e, k.path(P.asic, V(30, 7, 3), P.STATE_DB), 1.2],
            ['call', () => k.flash('STATE_DB')],
            ['move', u, k.path(P.STATE_DB, V(20, 7, 0), P.gs, V(-10, 5.5, 3), P.cl), 2.2],
            ['wait', 1.2],
          ]);
        },
      },
      {
        title: 'Set：安全地改設定', text: '自動化平台送出 SetRequest（把 Ethernet0 的 MTU 改成 9100）。gNMI server 先確認這個使用者的角色有寫入權限，再交給 translib 驗證並寫入 CONFIG_DB；同一個 SetRequest 裡的多筆變更是全有或全無。',
        view: [6, 30, 66, 10, 6, 0], hl: ['gs', 'tl', 'CONFIG_DB'],
        enter() {
          state({ tun: true });
          const s = k.pkt({ label: 'SetRequest · mtu 9100', size: 0.65 }), w = k.pkt({ token: '--k-db', size: 0.5 }), r = k.pkt({ token: '--good', label: 'SetResponse OK', size: 0.6 });
          const rb = note('RBAC：admin 可寫入', V(15, 11, 4), '--good');
          k.chain([
            ['move', s, k.poly(P.cl, V(-10, 5.5, 3), P.gs), 1.8],
            ['call', () => { rb.visible = true; k.flash('gs'); }],
            ['wait', 0.8],
            ['move', w, k.path(P.gsTop, P.tl, V(26, 10, -1), P.CONFIG_DB), 1.4],
            ['call', () => { rb.visible = false; k.flash('CONFIG_DB'); }],
            ['move', r, k.poly(P.gs, V(-10, 5.5, 3), P.cl), 1.6],
            ['wait', 1],
          ]);
        },
      },
      {
        title: '為什麼需要這些：竊聽與冒充', text: '攻擊者側錄網路，只能看到加密後的亂碼（TLS）。他改成冒充交換機，送出一張自己做的憑證——收集器發現簽發者不在 trust store，名稱也對不上，立刻中止連線（憑證驗證）。',
        view: [-14, 28, 66, -14, 5, 8], hl: ['att', 'cliTS'],
        enter() {
          state({ tun: true });
          k.stream(k.poly(P.gs, V(-10, 5.5, 3), P.cl), { token: '--good', every: 0.5, speed: 16, size: 0.45 });
          const gib = note('3f9a e1c7 8b02 …', V(-8, 9.2, 15), '--bad', '只看得到密文');
          const rej = note('驗證失敗，中止連線', V(-24, 13.5, 9), '--bad', '簽發者不在 trust store · 名稱不符');
          k.chain([
            ['call', () => { gib.visible = true; rej.visible = false; }],
            ['wait', 2.2],
            ['call', () => { gib.visible = false; }],
            flyCard(P.att, toCl, { title: '偽造的憑證', sub: 'CN = sw1.example.com', token: '--bad' }),
            ['call', () => { rej.visible = true; k.flash('att'); }],
            ['wait', 2.4],
          ]);
        },
      },
    ];

    return S.scene3d(host, {
      title: 'gNMI 與 TLS：從憑證到串流遙測',
      hint: '拖曳旋轉 · 點選憑證、CA、元件看說明 · 逐步播放',
      view: [0, 42, 88, -2, 8, 0],
      shadowBounds: 50,
      labelScale: 2.1,
      interval: 8500,
      build, reset, steps,
      intro: '<span class="muted">上方是 CA，左邊是 gNMI 收集器，右邊是 SONiC 交換機；卡片是憑證、金色鑰匙是私鑰（永遠留在原地）。逐步播放：CA 簽發憑證 → TLS 握手與雙向驗證 → 建立加密通道 → Subscribe 與 Set → 攻擊者為什麼沒辦法竊聽或冒充。</span>',
    });
  };
})();
