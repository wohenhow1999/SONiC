/* gNMI 協定堆疊立體模型：左右兩座塔是收集器與交換機的協定分層
   （gNMI → Protobuf → gRPC → HTTP/2 → TLS → TCP）。一則 gNMI 訊息從左塔往下，
   每經過一層就換一種形態或多包一層；經 TCP 連線到右塔後再逐層拆開。 */
(function () {
  S.scenes = S.scenes || {};

  S.scenes.grpc = function (host) {
    let k, V, THREE;
    const LAYERS = [
      { id: 'gnmi', name: 'gNMI', sub: '操作：Get · Set · Subscribe', token: '--k-ext' },
      { id: 'pb', name: 'Protobuf', sub: '把訊息編成緊湊的位元組', token: '--k-db' },
      { id: 'grpc', name: 'gRPC', sub: '呼叫哪個方法 · 長度前綴', token: '--warn' },
      { id: 'h2', name: 'HTTP/2', sub: 'stream · frame · 多工', token: '--k-proc' },
      { id: 'tls', name: 'TLS 1.3', sub: '加密 · 驗證身分', token: '--good' },
      { id: 'tcp', name: 'TCP / IP', sub: '可靠、依序的位元組流', token: '--k-hw' },
    ];
    const LY = [17, 14.2, 11.4, 8.6, 5.8, 3];
    const XL = -22, XR = 22, ZF = 6.8;
    let msg;                               // 會隨層級改變外型的訊息
    const P = {};

    function build(kit) {
      k = kit; V = k.V; THREE = k.THREE;
      k.box(80, 0.4, 40, { color: '#9aa3ae', y: -0.2, round: 0, rough: 0.95 });
      const tower = (x, side) => {
        LAYERS.forEach((L, i) => {
          const b = k.box(14, 1.4, 10, { token: L.token, mix: 0.55, x, y: LY[i], z: 0, round: 0.35 });
          k.reg(`${side}-${L.id}`, b, { title: `${L.name}（${side === 'L' ? '收集器' : '交換機'}端）`, where: L.sub, kind: 'proc', info: `<p>${INFO[L.id]}</p>` });
          if (side === 'L') k.label(L.name, { x: x - 7.6, y: LY[i], z: 3, anchor: 'right', sub: L.sub, token: L.token, size: 0.62 });
          else k.label(L.name, { x: x + 7.6, y: LY[i], z: 3, anchor: 'left', token: L.token, size: 0.55 });
        });
        for (let i = 0; i < LAYERS.length - 1; i++) k.cyl(0.25, LY[i] - LY[i + 1], { token: '--border-strong', x: x - 6, y: (LY[i] + LY[i + 1]) / 2, z: -4, shadow: false });
      };
      tower(XL, 'L'); tower(XR, 'R');
      k.label('gNMI 收集器', { x: XL, y: 20, z: 0, sub: 'gnmic · Telegraf', token: '--k-ext', size: 0.8 });
      k.label('SONiC 交換機', { x: XR, y: 20, z: 0, sub: 'gnmi 容器', token: '--k-hw', size: 0.8 });
      // TCP 連線：一條管線
      P.pipe = k.path(V(XL + 7, LY[5], 0), V(XR - 7, LY[5], 0));
      k.wire(P.pipe, { token: '--k-hw', radius: 1.6, opacity: 0.18 }).renderOrder = 2;
      k.wire(P.pipe, { token: '--k-hw', radius: 0.12 });
      k.label('一條 TCP 連線（TLS 加密）', { x: 0, y: LY[5] + 2.6, z: 0, sub: '所有 RPC 共用', token: '--k-hw', size: 0.6 });

      // ---------- 會變形的訊息 ----------
      msg = new THREE.Group();
      const card = new THREE.Group();
      k.box(6.4, 2.6, 0.3, { color: '#f4f6f8', parent: card, round: 0.12 });
      k.label('SubscribeRequest', { parent: card, y: 1.55, sub: 'path=/interfaces/…/counters · SAMPLE · 10s', token: '--k-ext', size: 0.5 });
      const bytes = new THREE.Group();
      for (let i = 0; i < 12; i++) k.box(0.46, 0.46, 0.46, { token: '--k-db', parent: bytes, x: -2.2 + i * 0.5, round: 0.05, shadow: false });
      const bLab = k.label('0a 1c 12 0a 69 6e 74 65 …', { parent: bytes, y: 0.55, sub: 'Protobuf：42 bytes（同內容的 JSON 約 120 bytes）', token: '--k-db', size: 0.46 });
      const hdr = new THREE.Group();
      for (let i = 0; i < 5; i++) k.box(0.46, 0.46, 0.46, { token: '--warn', parent: hdr, x: -5.2 + i * 0.5, round: 0.05, shadow: false });
      k.label('00 | 00 00 00 2a', { parent: hdr, x: -4.2, y: -0.9, sub: '壓縮旗標 · 長度 42', token: '--warn', size: 0.42 });
      const frame = new THREE.Group();
      k.box(8.6, 1.4, 1.4, { token: '--k-proc', opacity: 0.28, parent: frame, x: -1.3, round: 0.2 });
      k.label('DATA frame · stream 1', { parent: frame, x: -1.3, y: 0.95, token: '--k-proc', size: 0.46 });
      const heads = new THREE.Group();
      k.box(4, 0.9, 0.9, { token: '--k-proc', mix: 0.3, parent: heads, round: 0.15 });
      k.label('HEADERS · stream 1', { parent: heads, y: 0.6, sub: ':path /gnmi.gNMI/Subscribe', token: '--k-proc', size: 0.42 });
      heads.position.set(-7.8, 0, 0);
      const tls = new THREE.Group();
      k.box(13.5, 2, 2, { token: '--good', mix: 0.15, parent: tls, x: -2.4, round: 0.3 });
      k.label('TLS record（加密）', { parent: tls, x: -2.4, y: 1.25, sub: '外人只看得到隨機位元組', token: '--good', size: 0.5 });
      [card, bytes, hdr, frame, heads, tls].forEach(g => msg.add(g));
      msg.userData = { card, bytes, hdr, frame, heads, tls };
      msg.visible = false;
      k.scene.add(msg);
      form(0);
    }
    const INFO = {
      gnmi: 'gNMI 定義要做什麼：Capabilities、Get、Set、Subscribe 四種操作，以及路徑、值、通知的格式。它本身只是一份 .proto 服務定義，不處理傳輸。',
      pb: 'Protocol Buffers：依照 .proto 定義，把訊息的每個欄位編成「欄位編號 + 型別 + 值」的二進位格式。比 JSON 小、解析快，而且有嚴格的型別。',
      grpc: 'gRPC：遠端程序呼叫框架。把「呼叫 gNMI 的 Subscribe 方法」對應成 HTTP/2 請求（:path /gnmi.gNMI/Subscribe），每則訊息前加 5 byte 標頭（是否壓縮 + 長度），並以 grpc-status 回報結果。',
      h2: 'HTTP/2：二進位 frame 格式。一條連線上可以同時有很多 stream（每個 RPC 一個），frame 交錯傳送互不阻塞；標頭以 HPACK 壓縮；有流量控制與 PING。',
      tls: 'TLS 1.3：加密與身分驗證（見上方 gNMI 與 TLS 模型）。握手時以 ALPN 協商出「h2」，確定這條連線跑 HTTP/2。',
      tcp: 'TCP：保證位元組依序、不遺失地送達。gNMI 常見 port：Enterprise 8080、社群版 50051。',
    };
    // 依所在層級決定訊息的外型：0 = 可讀的訊息，1 = Protobuf 位元組，2 = + gRPC 標頭，3 = + HTTP/2 frame，4 = TLS 加密
    function form(level) {
      const u = msg.userData;
      u.card.visible = level === 0;
      u.bytes.visible = level >= 1;
      u.hdr.visible = level >= 2;
      u.frame.visible = u.heads.visible = level >= 3;
      u.tls.visible = level >= 4;
    }
    const at = (x, i) => V(x + 3.2, LY[i] + 0.2, ZF);
    // 左塔往下（封裝），經管線，右塔往上（拆封）
    function journey(pause) {
      const acts = [['call', () => { form(0); }]];
      for (let i = 0; i < 5; i++) {
        acts.push(['move', msg, k.path(at(XL, i), at(XL, i + 1)), 0.7, true]);
        acts.push(['call', () => { form(i + 1 > 4 ? 4 : i + 1); k.flash('L-' + LAYERS[i + 1].id); }]);
        acts.push(['wait', pause]);
      }
      acts.push(['move', msg, k.path(at(XL, 5), V(XL + 7, LY[5] + 0.4, 0), V(XR - 7, LY[5] + 0.4, 0), at(XR, 5)), 2.2, true]);
      for (let i = 5; i > 0; i--) {
        acts.push(['move', msg, k.path(at(XR, i), at(XR, i - 1)), 0.7, true]);
        acts.push(['call', () => { form(i - 2 < 0 ? 0 : i - 2); k.flash('R-' + LAYERS[i - 1].id); }]);
        acts.push(['wait', pause]);
      }
      acts.push(['wait', 1]);
      return acts;
    }
    // 停在某一層展示
    function showAt(i, level, side) {
      return [['call', () => { form(level); msg.position.copy(at(side === 'R' ? XR : XL, i)); msg.visible = true; }], ['wait', 30]];
    }

    const steps = [
      {
        title: '分層與脈絡', text: 'gNMI 只定義「要做什麼」；訊息怎麼編碼交給 Protobuf，怎麼呼叫遠端方法交給 gRPC，怎麼在網路上分段傳送交給 HTTP/2，安全交給 TLS，可靠傳輸交給 TCP。每一層只做一件事，兩端的同一層彼此對話。',
        view: [-4, 30, 84, -2, 10, 0], hl: ['L-gnmi', 'L-pb', 'L-grpc', 'L-h2', 'L-tls', 'L-tcp'],
        enter() { msg.visible = false; },
      },
      {
        title: 'gNMI：一則 SubscribeRequest', text: '收集器要訂閱介面計數器。在 gNMI 這一層，它是一則有結構的訊息：路徑、模式（SAMPLE）、間隔（10 秒）。欄位的名稱與型別都寫在 gnmi.proto 裡。',
        view: [-26, 22, 40, -20, 15, 4], hl: ['L-gnmi'],
        enter(k) { k.chain(showAt(0, 0, 'L'), { loop: false }); },
      },
      {
        title: 'Protobuf：編成位元組', text: 'Protobuf 依 .proto 定義把每個欄位編成「欄位編號 + 型別 + 值」：例如路徑名稱 interfaces 編成 0a 0a 69 6e 74 65 72 66 61 63 65 73（0a = 第 1 號欄位、字串；0a = 長度 10）。不傳欄位名稱，只傳編號，所以比 JSON 小得多。',
        view: [-26, 20, 38, -20, 13, 4], hl: ['L-pb'],
        enter(k) { k.chain(showAt(1, 1, 'L'), { loop: false }); },
      },
      {
        title: 'gRPC：呼叫哪個方法', text: 'gRPC 把「呼叫 gNMI 服務的 Subscribe 方法」對應成 HTTP/2 路徑 /gnmi.gNMI/Subscribe，並在每則 Protobuf 訊息前加 5 byte 標頭：1 byte 是否壓縮 + 4 byte 長度，讓接收端知道一則訊息在哪裡結束。Subscribe 是雙向串流：兩端都可以持續送訊息。',
        view: [-26, 18, 38, -20, 11, 4], hl: ['L-grpc'],
        enter(k) { k.chain(showAt(2, 2, 'L'), { loop: false }); },
      },
      {
        title: 'HTTP/2：HEADERS 與 DATA frame', text: '一個 RPC 對應 HTTP/2 的一個 stream。先送 HEADERS frame（:method POST、:path /gnmi.gNMI/Subscribe、content-type: application/grpc，以及帳密或 token 等 metadata），再以 DATA frame 送出 gRPC 訊息。標頭以 HPACK 壓縮，重複的欄位只送索引。',
        view: [-26, 16, 40, -20, 9, 4], hl: ['L-h2'],
        enter(k) { k.chain(showAt(3, 3, 'L'), { loop: false }); },
      },
      {
        title: 'TLS：加密', text: 'HTTP/2 的 frame 被切成 TLS record 加密。握手時雙方以 ALPN 協商出「h2」，確定這條連線跑 HTTP/2。從這一層往下，外人只看得到隨機的位元組。',
        view: [-26, 14, 40, -20, 7, 4], hl: ['L-tls'],
        enter(k) { k.chain(showAt(4, 4, 'L'), { loop: false }); },
      },
      {
        title: '完整旅程：逐層封裝，再逐層拆開', text: '訊息在收集器端由上往下，每一層加上自己的資訊；經 TCP 送到交換機後由下往上，每一層拆掉自己的部分，最後 gNMI server 拿到的就是原本那則 SubscribeRequest。',
        view: [-4, 28, 82, -2, 9, 2],
        enter(k) { k.chain(journey(0.35)); },
      },
      {
        title: 'HTTP/2 多工：一條連線同時跑多個 RPC', text: '同一條連線上同時有 Subscribe（stream 1）、Get（stream 3）、Set（stream 5）。它們的 frame 交錯傳送，一個大回應不會卡住其他請求；收集器不需要為每個請求再開新連線、重做 TLS 握手。',
        view: [0, 24, 62, 0, 5, 0], hl: ['L-h2', 'R-h2'],
        enter(k) {
          msg.visible = false;
          const fwd = k.path(V(XL + 7, LY[5] + 0.4, 0.6), V(XR - 7, LY[5] + 0.4, 0.6));
          const back = k.path(V(XR - 7, LY[5] - 0.4, -0.6), V(XL + 7, LY[5] - 0.4, -0.6));
          k.stream(fwd, { token: '--k-ext', shape: 'box', every: 1.5, speed: 9, size: 0.7 });
          k.stream(fwd, { token: '--warn', shape: 'box', every: 2.2, speed: 9, size: 0.7 });
          k.stream(back, { token: '--good', shape: 'box', every: 0.9, speed: 10, size: 0.7 });
          k.stream(back, { token: '--k-db', shape: 'box', every: 2.6, speed: 10, size: 0.7 });
          const lg = [['stream 1 · Subscribe 回應', '--good', -7, 8.6], ['stream 3 · Get', '--k-db', 7, 8.6], ['stream 5 · Set', '--warn', -7, 6.4], ['PING / WINDOW_UPDATE', '--k-ext', 7, 6.4]];
          lg.forEach(([t, c, x, y]) => k.temp(k.label(t, { x, y: LY[5] + y, z: 0, token: c, color: c, size: 0.5 })));
        },
      },
      {
        title: '串流回應與結束狀態', text: 'Subscribe 建立後，交換機在同一個 stream 上持續送出回應，stream 不會結束。其他 RPC 結束時，伺服器送出 trailers：grpc-status 0 代表成功；例如 operator 角色送 Set，會收到 7（PERMISSION_DENIED）；未認證是 16（UNAUTHENTICATED）；取樣間隔太短是 3（INVALID_ARGUMENT）。',
        view: [4, 24, 64, 4, 7, 2], hl: ['R-grpc', 'L-grpc'],
        enter(k) {
          msg.visible = false;
          const back = k.path(V(XR - 7, LY[5] + 0.3, 0), V(XL + 7, LY[5] + 0.3, 0));
          k.stream(back, { token: '--good', shape: 'box', every: 1.1, speed: 9, size: 0.7 });
          const t = k.pkt({ token: '--bad', shape: 'box', size: 1, label: 'trailers · grpc-status: 7 PERMISSION_DENIED' });
          k.chain([['wait', 1.5], ['move', t, k.path(V(XR - 7, LY[5] + 1.6, 1.4), V(XL + 7, LY[5] + 1.6, 1.4)), 3.2], ['wait', 1]]);
          k.temp(k.label('Subscribe 回應：同一個 stream 持續送出', { x: 0, y: LY[5] - 2.6, z: 3, token: '--good', color: '--good', size: 0.5 }));
        },
      },
    ];

    return S.scene3d(host, {
      title: 'gNMI 的協定堆疊：Protobuf、gRPC、HTTP/2',
      hint: '左塔是收集器、右塔是交換機 · 拖曳旋轉 · 點選各層看說明',
      view: [-4, 30, 84, -2, 10, 0],
      shadowBounds: 45,
      labelScale: 2.1,
      interval: 7500,
      build, steps,
      reset() { if (msg) { msg.visible = false; form(0); } },
      intro: '<span class="muted">左右兩座塔是收集器與交換機的協定分層，由上而下是 gNMI、Protobuf、gRPC、HTTP/2、TLS、TCP。逐步播放時，同一則 SubscribeRequest 會在每一層換一種形態：可讀的訊息 → 位元組 → 加上 gRPC 標頭 → 裝進 HTTP/2 frame → 加密。</span>',
    });
  };
})();
