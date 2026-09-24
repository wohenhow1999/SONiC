S.register({
  id: 'mgmt-api',
  category: 'ops',
  order: 8,
  title: 'REST、RESTCONF 與 gNMI',
  en: 'Northbound APIs: REST / RESTCONF, gNMI, gNOI & Streaming Telemetry',
  summary: '除了 CLI，SONiC 以兩種程式化介面對外：mgmt-framework 容器的 REST / RESTCONF 伺服器，以及 gnmi（telemetry）容器的 gNMI / gNOI 伺服器。兩者都經由 translib 以 YANG 模型（OpenConfig 與 SONiC YANG）讀寫資料庫，gNMI 另外可以直接以資料庫路徑讀取 Redis，並以 Subscribe 串流遙測資料。本章說明認證方式、路徑結構、訂閱模式與實際呼叫範例。',
  meta: [
    ['容器', ['mgmt-framework（rest_server）', 'gnmi / telemetry（telemetry、dialout_client）']],
    ['埠', ['REST：TCP 443', 'gNMI：Enterprise 預設 TCP 8080，社群版常見 50051 / 8080']],
    ['認證', ['password（HTTP Basic / gRPC metadata）', 'JWT（預設有效 3600 秒）', '用戶端憑證（mTLS）']],
    ['規格', ['RFC 8040 RESTCONF', 'RFC 8072 YANG Patch', 'gNMI 0.7 / 0.8', 'gNOI']],
  ],
  tags: ['REST', 'RESTCONF', 'gNMI', 'gNOI', 'telemetry', 'streaming telemetry', 'Subscribe', 'SAMPLE', 'ON_CHANGE', 'POLL', 'ONCE', 'TARGET_DEFINED', 'JWT', 'OpenConfig', 'YANG', 'dial-out', 'gnmi_cli', 'curl'],
  keypoints: [
    'REST 與 gNMI 共用 translib：同一個 OpenConfig 路徑在 CLI、REST、gNMI 得到相同的結果，也經過同一套 CVL 驗證與 RBAC。',
    'gNMI 除了 YANG 路徑，還可以用 target 指定資料庫（例如 COUNTERS_DB），直接以「表/key/欄位」讀取 Redis，這是社群版遙測最常用的方式。',
    'Subscribe 有三種模式：ONCE（取一次）、POLL（由用戶端觸發）、STREAM；STREAM 又分 SAMPLE（固定週期）、ON_CHANGE（值改變才送）、TARGET_DEFINED（由伺服器依路徑決定）。',
    '計數器這類持續變化的值適合 SAMPLE；狀態類（oper-status、BGP 狀態）適合 ON_CHANGE。對不支援 ON_CHANGE 的路徑訂閱會被拒絕。',
    'Enterprise SONiC 對 SAMPLE 間隔有下限（min-sample-interval，預設 15 秒，許多路徑為 20 秒），太短的要求會被拒絕。',
  ],
  html: `
<h2>架構</h2>
<div id="d-api"></div>

<h2>認證</h2>
<table>
<thead><tr><th>方式</th><th>REST</th><th>gNMI</th><th>說明</th></tr></thead>
<tbody>
<tr><td>password</td><td>HTTP <code>Authorization: Basic</code></td><td>gRPC metadata 的 username / password</td><td>經由 PAM，因此也適用 TACACS+、RADIUS、LDAP 使用者</td></tr>
<tr><td>JWT</td><td><code>POST /authenticate</code> 取得 token，之後以 <code>Authorization: Bearer</code> 帶入；<code>POST /refresh</code> 更新</td><td>以 gNOI 的認證 RPC 取得 token</td><td>避免每次請求都經過 AAA；token 預設 3600 秒有效，只能在到期前的更新窗口內換發</td></tr>
<tr><td>cert</td><td>用戶端 TLS 憑證</td><td>用戶端 TLS 憑證，CN 為使用者名稱</td><td>需在 security profile 中設定 trust store，見 <a href="#/pki">憑證與 PKI</a></td></tr>
</tbody></table>
<p>預設啟用 password 與 jwt，以 <code>ip rest authentication</code> / <code>ip telemetry authentication</code> 變更。</p>

<h2>路徑與操作</h2>
<table>
<thead><tr><th>操作</th><th>RESTCONF</th><th>gNMI</th></tr></thead>
<tbody>
<tr><td>讀取</td><td><code>GET /restconf/data/&lt;path&gt;</code>，可加 <code>?content=config|nonconfig</code>、<code>depth=</code></td><td><code>Get</code>，type = CONFIG / STATE / OPERATIONAL / ALL</td></tr>
<tr><td>合併更新</td><td><code>PATCH</code></td><td><code>Set</code> update</td></tr>
<tr><td>整體取代</td><td><code>PUT</code></td><td><code>Set</code> replace</td></tr>
<tr><td>建立</td><td><code>POST</code>（父節點下新增子節點）</td><td><code>Set</code> update</td></tr>
<tr><td>刪除</td><td><code>DELETE</code></td><td><code>Set</code> delete</td></tr>
<tr><td>多筆原子變更</td><td>YANG Patch（<code>Content-Type: application/yang-patch+json</code>）</td><td>同一個 <code>SetRequest</code> 內的多個操作</td></tr>
<tr><td>RPC / 動作</td><td><code>POST /restconf/operations/&lt;rpc&gt;</code></td><td>gNOI 服務（System.Reboot、Cert、File…）</td></tr>
<tr><td>串流</td><td>—</td><td><code>Subscribe</code></td></tr>
</tbody></table>
<p>路徑中的 list key 在 RESTCONF 以 <code>=</code> 表示並需 URL 編碼（<code>interface=Eth1%2F1</code>），在 gNMI 以方括號表示（<code>interface[name=Eth1/1]</code>）。</p>

<h2>gNMI Subscribe 模式</h2>
<p>60 秒內，介面 Eth1/1 在第 8 秒 down、第 9 秒 up（一次 flap），第 37 秒再次 down；in-octets 每秒都在增加。選擇訂閱模式，看伺服器在何時送出通知。</p>
<div id="sub"></div>

<h2>Dial-in 與 dial-out</h2>
<table>
<thead><tr><th>模式</th><th>連線方向</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Dial-in</td><td>收集器連到交換機的 gNMI 伺服器並 Subscribe</td><td>最常見；收集器（gnmic、Telegraf、OpenConfig collector）管理訂閱</td></tr>
<tr><td>Dial-out</td><td>交換機的 dialout_client 主動連到收集器並推送</td><td>收集器在防火牆內、交換機無法被連入時；社群版以 CONFIG_DB 的 <code>TELEMETRY_CLIENT</code> 表設定目的地與路徑</td></tr>
</tbody></table>

<h2>範例</h2>
<div id="ex"></div>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# ip rest port 443
sonic(config)# ip rest vrf mgmt
sonic(config)# ip rest authentication password,jwt,cert
sonic(config)# ip rest security-profile mgmt
sonic(config)# ip rest request-limit 10
sonic(config)# ip telemetry port 8080
sonic(config)# ip telemetry vrf mgmt
sonic(config)# ip telemetry authentication password,jwt,cert
sonic(config)# ip telemetry min-sample-interval 15
sonic# show ip rest
sonic# show ip telemetry

<span class="c"># 社群版（CONFIG_DB）</span>
sonic-db-cli CONFIG_DB hset "GNMI|gnmi" port 50051 client_auth true log_level 2
sonic-db-cli CONFIG_DB hset "RESTAPI|config" client_auth password,jwt
sudo systemctl restart gnmi</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-api'), {
      title: '北向介面到資料庫的路徑',
      w: 1000, h: 400,
      groups: [{ x: 250, y: 20, w: 250, h: 150, label: 'mgmt-framework 容器' }, { x: 250, y: 200, w: 250, h: 180, label: 'gnmi 容器' }],
      nodes: [
        { id: 'rc', x: 20, y: 70, w: 170, h: 56, label: 'REST 用戶端', sub: 'curl · Ansible · 程式', kind: 'ext' },
        { id: 'gc', x: 20, y: 250, w: 170, h: 56, label: 'gNMI 收集器', sub: 'gnmic · Telegraf', kind: 'ext' },
        { id: 'rest', x: 280, y: 70, w: 190, h: 56, label: 'rest_server', sub: 'HTTPS 443', kind: 'proc', info: '<p>RESTCONF（RFC 8040）與 SONiC 自訂 REST；處理認證、JWT，將請求交給 translib。</p>' },
        { id: 'gs', x: 280, y: 230, w: 190, h: 56, label: 'gNMI server', sub: 'gRPC · TLS', kind: 'proc', info: '<p>處理 Capabilities / Get / Set / Subscribe 與 gNOI。依路徑的 origin / target 決定走 translib 還是直接讀資料庫。</p>' },
        { id: 'dc', x: 280, y: 310, w: 190, h: 50, label: 'dialout_client', kind: 'proc', info: '<p>主動連到收集器推送資料（dial-out）。</p>' },
        { id: 'tl', x: 560, y: 150, w: 180, h: 60, label: 'translib', sub: 'YANG ↔ Redis · CVL', kind: 'proc', info: '<p>把 OpenConfig / SONiC YANG 路徑轉成資料庫的表與欄位，寫入前由 CVL 驗證，並套用 RBAC。</p>' },
        { id: 'db', x: 800, y: 150, w: 170, h: 60, label: 'Redis', sub: 'CONFIG · STATE · COUNTERS', kind: 'db', info: '<p>設定寫入 CONFIG_DB；狀態、計數器由 STATE_DB、COUNTERS_DB 讀出。</p>' },
      ],
      edges: [
        { from: 'rc', to: 'rest', label: 'HTTPS', id: 'e1' },
        { from: 'gc', to: 'gs', label: 'gRPC', id: 'e2', bi: true },
        { from: 'rest', to: 'tl', id: 'e3' },
        { from: 'gs', to: 'tl', label: 'YANG 路徑', id: 'e4' },
        { from: 'gs', to: 'db', dash: true, label: 'DB 路徑（target=COUNTERS_DB…）', id: 'e5', via: [[640, 258], [885, 258]], lx: 700, ly: 274 },
        { from: 'tl', to: 'db', id: 'e6', bi: true },
        { from: 'dc', to: 'gc', dash: true, label: '推送', id: 'e7', via: [[105, 335]] },
      ],
      steps: [
        { title: 'REST 請求', text: 'rest_server 完成 TLS 與認證後，把 RESTCONF 路徑交給 translib。', nodes: ['rc', 'rest', 'tl', 'db'], edges: ['e1', 'e3', 'e6'] },
        { title: 'gNMI 以 YANG 路徑', text: 'OpenConfig 路徑與 REST 相同，經 translib 轉換並驗證。', nodes: ['gc', 'gs', 'tl', 'db'], edges: ['e2', 'e4', 'e6'] },
        { title: 'gNMI 以資料庫路徑', text: '以 target 指定 COUNTERS_DB 等資料庫時，直接以「表/key」讀 Redis，常用於高頻遙測。', nodes: ['gc', 'gs', 'db'], edges: ['e2', 'e5'] },
        { title: 'Dial-out', text: 'dialout_client 依設定主動連線到收集器並推送訂閱的路徑。', nodes: ['dc', 'gc'], edges: ['e7'] },
      ],
    });

    // ---------- Subscribe 模擬 ----------
    const host = root.querySelector('#sub');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const MODES = ['ONCE', 'POLL', 'STREAM · SAMPLE', 'STREAM · ON_CHANGE', 'STREAM · TARGET_DEFINED'];
    const P = { mode: 2, interval: 20, suppress: false, heartbeat: 0, min: 15 };
    const sh = S.el('span');
    box.appendChild(S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, '模式'), sh));
    const fr = S.el('div', { class: 'row', style: 'margin-top:10px;align-items:flex-end' });
    const num = (k, label) => { const i = S.el('input', { type: 'number', value: P[k], min: 0, style: 'width:90px' }); i.addEventListener('input', () => { P[k] = Math.max(0, +i.value || 0); draw(); }); fr.appendChild(S.el('label', { class: 'field' }, label, i)); };
    num('interval', 'sample_interval (秒)');
    num('heartbeat', 'heartbeat_interval (秒，0 = 無)');
    const sb = S.el('button', { class: 'btn sm', onclick: () => { P.suppress = !P.suppress; sb.classList.toggle('on', P.suppress); draw(); } }, 'suppress_redundant');
    fr.appendChild(sb);
    box.appendChild(fr);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);

    const T = 60;
    const OPER = [[8, 'DOWN'], [9, 'UP'], [37, 'DOWN']];
    S.seg(sh, MODES, i => { P.mode = i; draw(); }, P.mode);
    function sim() {
      const res = { oper: [], oct: [], notes: [], err: null };
      const mode = MODES[P.mode];
      const sampleAt = (lane, changes) => {
        const step = P.interval || P.min;
        const val = t => { let v = 'UP'; changes.forEach(([c, l]) => { if (c <= t) v = l; }); return v; };
        let last = 0;
        for (let t = 0; t <= T; t += step) {
          const changed = lane === 'oct' ? true : val(t) !== val(last);
          const hb = P.heartbeat && t > 0 && (t % P.heartbeat === 0);
          if (t === 0 || !P.suppress || changed || hb) res[lane].push([t, t === 0 ? 'sync' : (!P.suppress || changed) ? 'upd' : 'hb']);
          last = t;
        }
      };
      if (mode === 'ONCE') {
        res.oper.push([0, 'sync']); res.oct.push([0, 'sync']);
        res.notes.push('送出所有路徑目前的值與 sync_response 後，伺服器關閉串流。');
        return res;
      }
      if (mode === 'POLL') {
        [0, 15, 30, 45].forEach(t => { res.oper.push([t, t ? 'upd' : 'sync']); res.oct.push([t, t ? 'upd' : 'sync']); });
        res.notes.push('第 0 秒回傳初始值與 sync_response；之後每當用戶端送出 Poll 訊息（這裡假設第 15、30、45 秒），伺服器回傳一次完整的目前值。第 8–9 秒的 flap 完全看不到。');
        return res;
      }
      if (P.mode === 2 || P.mode === 4) {
        if (P.interval && P.interval < P.min) { res.err = `sample_interval ${P.interval} 秒小於 min-sample-interval ${P.min} 秒，SubscribeRequest 被拒絕（InvalidArgument）。`; return res; }
      }
      if (mode === 'STREAM · SAMPLE') {
        sampleAt('oper', OPER); sampleAt('oct', []);
        res.notes.push(`${P.interval ? '' : 'sample_interval 為 0，由伺服器使用最小間隔。'}每 ${P.interval || P.min} 秒取樣一次。第 8 秒 down、第 9 秒 up 發生在兩次取樣之間，取樣只看到 UP，這次 flap 完全遺失。`);
        if (P.suppress) res.notes.push('suppress_redundant：值沒變的 leaf 不送；oper-status 只在實際改變後的下一次取樣送出' + (P.heartbeat ? `，另外每 ${P.heartbeat} 秒以 heartbeat 強制送一次。` : '。'));
        return res;
      }
      if (mode === 'STREAM · ON_CHANGE') {
        res.oper.push([0, 'sync']);
        OPER.forEach(([t]) => res.oper.push([t, 'upd']));
        if (P.heartbeat) for (let t = P.heartbeat; t <= T; t += P.heartbeat) res.oper.push([t, 'hb']);
        res.octErr = 'in-octets 不支援 ON_CHANGE，對此路徑的訂閱會被拒絕';
        res.notes.push('每次 oper-status 改變都立即送出（第 8、9、37 秒），flap 完整可見。計數器持續變化，不適合也不支援 ON_CHANGE。');
        return res;
      }
      res.oper.push([0, 'sync']); OPER.forEach(([t]) => res.oper.push([t, 'upd']));
      const iv = Math.max(P.interval || P.min, P.min);
      for (let t = 0; t <= T; t += iv) res.oct.push([t, t ? 'upd' : 'sync']);
      res.notes.push(`TARGET_DEFINED 由伺服器依路徑決定：oper-status 以 ON_CHANGE 送出，in-octets 以 SAMPLE（每 ${iv} 秒）送出。訂閱整個介面容器時常用這個模式。`);
      return res;
    }
    function draw() {
      const r = sim();
      const x = t => 110 + t * 10;
      const lane = (y, label, marks, events, err) => {
        let s = `<text x="10" y="${y + 4}" font-size="12" fill="var(--text)" font-weight="600">${label}</text><line x1="${x(0)}" y1="${y}" x2="${x(T)}" y2="${y}" stroke="var(--border-strong)" stroke-width="1"/>`;
        events.forEach(([t, l], i) => { const lo = i > 0 && t - events[i - 1][0] < 4; s += `<line x1="${x(t)}" y1="${y - 14}" x2="${x(t)}" y2="${y + 14}" stroke="var(--faint)" stroke-dasharray="2 2"/><text x="${x(t) + 3}" y="${lo ? y + 24 : y - 16}" font-size="10" font-family="var(--mono)" fill="var(--muted)">${l}</text>`; });
        if (err) return s + `<text x="${x(2)}" y="${y + 20}" font-size="11" fill="var(--bad)">${err}</text>`;
        marks.forEach(([t, k]) => {
          const c = k === 'hb' ? 'var(--warn)' : 'var(--accent)';
          s += k === 'sync' ? `<rect x="${x(t) - 5}" y="${y - 5}" width="10" height="10" fill="${c}"/>` : `<circle cx="${x(t)}" cy="${y}" r="5" fill="${c}"/>`;
        });
        return s;
      };
      let svg = `<svg viewBox="0 0 730 150" style="width:100%;min-width:560px;display:block">`;
      for (let t = 0; t <= T; t += 10) svg += `<text x="${x(t)}" y="140" text-anchor="middle" font-size="10" font-family="var(--mono)" fill="var(--faint)">${t}s</text>`;
      if (r.err) svg += `<text x="${x(0)}" y="70" font-size="12" fill="var(--bad)">${r.err}</text>`;
      else {
        svg += lane(45, 'oper-status', r.oper, OPER, null);
        svg += lane(105, 'in-octets', r.oct, [], r.octErr);
      }
      svg += '</svg>';
      const n = r.oper.length + r.oct.length;
      out.innerHTML = `<div class="dg-canvas" style="border:1px solid var(--border);border-radius:6px;padding:8px 0">${svg}</div>
        <div class="row" style="margin:8px 0;font-size:12.5px;color:var(--muted)"><span><svg width="10" height="10"><rect width="10" height="10" fill="var(--accent)"/></svg> 初始值 + sync_response</span><span><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="var(--accent)"/></svg> update</span><span><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="var(--warn)"/></svg> heartbeat</span><span>虛線：實際狀態變化</span>${r.err ? '' : `<span class="badge n">共 ${n} 則通知</span>`}</div>
        <div class="log">${r.err ? `<div>${r.err}</div>` : r.notes.map(t => `<div>${t}</div>`).join('')}</div>`;
    }
    draw();

    S.tabs(root.querySelector('#ex'), [
      { label: 'REST：密碼', html: `<pre>curl -k -u admin:****** \\
  -H "accept: application/yang-data+json" \\
  "https://10.0.0.1/restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/state"</pre>` },
      { label: 'REST：JWT', html: `<pre><span class="c"># 取得 token</span>
curl -k -X POST https://10.0.0.1/authenticate -d '{"username":"admin","password":"******"}'
<span class="c"># {"access_token":"eyJhbGciOi...","token_type":"Bearer","expires_in":3600}</span>

<span class="c"># 以 token 修改 MTU</span>
curl -k -X PATCH -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/yang-data+json" \\
  "https://10.0.0.1/restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/config/mtu" \\
  -d '{"openconfig-interfaces:mtu": 9100}'</pre>` },
      { label: 'REST：YANG Patch', html: `<pre>curl -k -u admin:****** -X PATCH \\
  -H "Content-Type: application/yang-patch+json" \\
  "https://10.0.0.1/restconf/data/sonic-vlan:sonic-vlan" -d '{
  "ietf-yang-patch:yang-patch": {
    "patch-id": "add-vlan-300",
    "edit": [
      { "edit-id": "1", "operation": "create", "target": "/VLAN/VLAN_LIST=Vlan300",
        "value": { "sonic-vlan:VLAN_LIST": [ { "name": "Vlan300", "vlanid": 300 } ] } }
    ]
  }
}'</pre><p class="muted" style="font-size:13px">YANG Patch 的所有 edit 在同一個交易內套用，任何一筆失敗整批都不生效。</p>` },
      { label: 'gNMI：Get / Set', html: `<pre><span class="c"># gnmic（開源用戶端）</span>
gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify \\
  get --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/oper-status"

gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify \\
  set --update-path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/config/mtu" --update-value 9100

<span class="c"># 交換機上的測試工具</span>
gnmi_get -xpath /openconfig-system:system/state -target_addr 127.0.0.1:8080 -insecure -username admin -password ******</pre>` },
      { label: 'gNMI：Subscribe', html: `<pre><span class="c"># OpenConfig 路徑，ON_CHANGE</span>
gnmic -a 10.0.0.1:8080 -u admin -p ****** --skip-verify subscribe \\
  --path "/openconfig-interfaces:interfaces/interface[name=Eth1/1]/state/oper-status" \\
  --stream-mode on_change

<span class="c"># 直接讀 COUNTERS_DB（社群版常用），每 20 秒</span>
gnmic -a 10.0.0.1:50051 -u admin -p ****** --skip-verify --target COUNTERS_DB subscribe \\
  --path "COUNTERS/Ethernet0" --stream-mode sample --sample-interval 20s</pre>` },
    ]);
  },
  searchText: 'restconf yang-data+json yang-patch authenticate refresh Bearer token gnmic gnmi_get gnmi_set gnmi_cli gnoi_client Capabilities Get Set Subscribe sync_response heartbeat suppress_redundant sample_interval min-sample-interval dialout TELEMETRY_CLIENT ip rest ip telemetry',
  related: ['mgmt-framework', 'pki', 'aaa', 'counters', 'redis-db'],
  refs: [['RFC 8040 RESTCONF', 'https://www.rfc-editor.org/rfc/rfc8040'], ['RFC 8072 YANG Patch', 'https://www.rfc-editor.org/rfc/rfc8072'], ['gNMI 規格', 'https://github.com/openconfig/reference/blob/master/rpc/gnmi/gnmi-specification.md'], ['sonic-gnmi', 'https://github.com/sonic-net/sonic-gnmi'], ['Enterprise SONiC User Guide UG460：Ch.21–23', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
