S.register({
  id: 'pac',
  category: 'sec',
  order: 3,
  title: '802.1X、MAB 與校園接入',
  en: 'Port Access Control (802.1X / MAB), PoE & LLDP-MED',
  summary: 'Port Access Control（PAC）讓接入 port 在用戶端通過認證前不轉送資料。交換機扮演 802.1X authenticator，把用戶端的 EAPOL 轉成 RADIUS 送往伺服器；不支援 802.1X 的設備以 MAC 位址進行 MAB。認證結果可以帶回 VLAN 與 ACL。本章也涵蓋校園接入常見的 PoE 供電與 LLDP-MED 語音 VLAN。',
  meta: [
    ['角色', ['Supplicant（用戶端）', 'Authenticator（交換機）', 'Authentication server（RADIUS）']],
    ['協定', ['IEEE 802.1X-2004 / EAPOL（EtherType 0x888E，目的 01:80:C2:00:00:03）', 'EAP-TLS、PEAP、EAP-MD5', 'RADIUS（RFC 3579 EAP over RADIUS）、CoA / Disconnect（RFC 5176）']],
    ['RADIUS 屬性', ['Tunnel-Private-Group-ID（VLAN）', 'Filter-Id（ACL 名稱）', 'Downloadable ACL', 'Session-Timeout']],
    ['規模（UG460）', ['每 port 48 個用戶端', '每台 512 個用戶端', '每用戶端 60 條 ACL 規則']],
    ['其他', ['PoE：IEEE 802.3af / at / bt', 'LLDP-MED Network Policy TLV']],
  ],
  tags: ['802.1X', 'dot1x', 'EAPOL', 'EAP', 'MAB', 'PAC', 'RADIUS', 'dynamic VLAN', 'DACL', 'guest VLAN', 'unauthenticated VLAN', 'host mode', 'multi-auth', 'multi-domain', 'CoA', 'PoE', 'LLDP-MED', 'voice VLAN', 'campus'],
  keypoints: [
    '交換機只是中繼：EAP 的內容由用戶端與 RADIUS 伺服器協商，交換機把 EAPOL 與 RADIUS 互相封裝，並依最終的 Access-Accept / Reject 決定 port 的狀態。',
    '認證以 MAC 為單位：通過後把該用戶端的 MAC 加入授權清單，未認證的 MAC 仍被丟棄（除了 EAPOL 本身與設定的 WoL VLAN）。',
    'MAB 用設備的 MAC 位址當作帳號密碼，適合印表機、攝影機等不支援 802.1X 的設備；安全性低於 802.1X，通常搭配受限的 VLAN 或 ACL。',
    'Host mode 決定一個 port 上可以有多少用戶端、各自是否需要認證：single-host、multi-host、multi-domain（一台語音 + 一台資料）、multi-auth（預設，每個 MAC 各自認證）。',
    '認證失敗的去處：802.1X 用戶端認證失敗可放入 unauthenticated VLAN；沒有回應 EAPOL 的設備可放入 guest VLAN。RADIUS 指定的 VLAN 必須已在交換機上建立。',
  ],
  html: `
<h2>認證流程</h2>
<div id="d-pac"></div>

<h2>Host mode 與特殊 VLAN</h2>
<p>一個接入 port 經由小型 hub 接了 IP 電話、兩台 PC 與一台印表機。切換 host mode 與設定，看每台設備的結果。設備依表格順序上線。</p>
<div id="hm"></div>

<h2>授權屬性</h2>
<table>
<thead><tr><th>項目</th><th>來源</th><th>作用</th></tr></thead>
<tbody>
<tr><td>Dynamic VLAN</td><td>RADIUS Tunnel-Type=VLAN、Tunnel-Medium-Type=802、Tunnel-Private-Group-ID</td><td>把用戶端放入指定 VLAN；VLAN 需事先建立</td></tr>
<tr><td>Dynamic ACL</td><td>Filter-Id 指定交換機上已存在的 ACL 名稱</td><td>對該用戶端套用 ACL</td></tr>
<tr><td>Downloadable ACL</td><td>RADIUS 回傳 ACL 內容</td><td>ACL 定義集中在伺服器；規則以用戶端的來源 MAC / IP 限定範圍</td></tr>
<tr><td>Redirect ACL / URL</td><td>RADIUS 屬性</td><td>把 HTTP 流量導向入口網頁（例如裝置註冊或修補）</td></tr>
<tr><td>Session-Timeout</td><td>RADIUS</td><td>重新認證的間隔</td></tr>
<tr><td>CoA / Disconnect</td><td>伺服器主動送到交換機（Dynamic Authorization Server）</td><td>在不中斷連線下變更授權，或踢除用戶端</td></tr>
</tbody></table>

<h2>其他 PAC 行為</h2>
<table>
<thead><tr><th>設定</th><th>說明</th></tr></thead>
<tbody>
<tr><td><code>authentication port-control auto | force-authorized | force-unauthorized</code></td><td>auto 才會進行認證；force-authorized 等同沒有 PAC</td></tr>
<tr><td><code>authentication order dot1x mab</code></td><td>先嘗試 802.1X，逾時沒有回應再改用 MAB</td></tr>
<tr><td><code>authentication priority</code></td><td>已用低優先方法（例如 MAB）通過的用戶端，若之後送出高優先方法（802.1X）的封包，改以高優先方法重新認證</td></tr>
<tr><td><code>authentication open</code></td><td>Open Authentication：認證完成前也允許流量通過</td></tr>
<tr><td><code>authentication monitor</code></td><td>監測模式：認證失敗也放行，用於導入前評估</td></tr>
<tr><td><code>authentication allow vlan</code></td><td>在未認證狀態也允許 Wake-on-LAN magic packet 的 VLAN</td></tr>
<tr><td><code>dot1x timeout tx-period</code>、<code>dot1x max-req</code></td><td>送出 EAP-Request/Identity 的間隔與次數，決定多久判定「沒有 802.1X」</td></tr>
</tbody></table>

<h2>PoE 供電</h2>
<table>
<thead><tr><th>標準</th><th>類型</th><th>PSE 每 port 輸出</th><th>PD 可用</th><th>Class</th></tr></thead>
<tbody>
<tr><td>802.3af</td><td>Type 1</td><td>15.4 W</td><td>12.95 W</td><td>0–3</td></tr>
<tr><td>802.3at（PoE+）</td><td>Type 2</td><td>30 W</td><td>25.5 W</td><td>4</td></tr>
<tr><td>802.3bt</td><td>Type 3</td><td>60 W</td><td>51 W</td><td>5–6</td></tr>
<tr><td>802.3bt</td><td>Type 4</td><td>90 W</td><td>71.3 W</td><td>7–8</td></tr>
</tbody></table>
<p>電源預算不足時，依 port priority（critical &gt; high &gt; low）決定誰先供電；class 模式依等級上限保留功率，dynamic 模式依實際耗電計算，能接更多設備但需預留餘裕。</p>
<div id="poe"></div>

<h2>LLDP-MED 與語音 VLAN</h2>
<p>IP 電話透過 LLDP-MED 的 Network Policy TLV 取得語音 VLAN ID 與 CoS / DSCP，之後以 tagged 語音流量送出，PC 則以 untagged 流量走資料 VLAN。語音流量的優先權需搭配 QoS map 與排程器（例如 DSCP 46 → TC 5 → strict priority 佇列）。</p>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC：802.1X + MAB</span>
sonic(config)# radius-server host 10.0.0.20 key ****** vrf mgmt
sonic(config)# dot1x system-auth-control
sonic(config)# interface Eth1/10
sonic(config-if-Eth1/10)# switchport access Vlan 100
sonic(config-if-Eth1/10)# dot1x pae authenticator
sonic(config-if-Eth1/10)# mab
sonic(config-if-Eth1/10)# authentication order dot1x mab
sonic(config-if-Eth1/10)# authentication host-mode multi-auth
sonic(config-if-Eth1/10)# authentication port-control auto
sonic(config-if-Eth1/10)# authentication event no-response action authorize vlan 900
sonic(config-if-Eth1/10)# authentication event fail action authorize vlan 901
sonic(config-if-Eth1/10)# authentication periodic
sonic(config-if-Eth1/10)# authentication timer reauthenticate server
sonic# show authentication clients all
sonic# show dot1x
sonic# show mab

<span class="c"># PoE 與語音 VLAN</span>
sonic(config)# poe power management dynamic
sonic(config)# interface Eth1/10
sonic(config-if-Eth1/10)# poe priority high
sonic(config)# network-policy profile 1
sonic(config-network-policy)# voice vlan 200 cos 5 dscp 46
sonic(config)# interface Eth1/10
sonic(config-if-Eth1/10)# network-policy 1
sonic# show poe port info all</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-pac'), {
      title: '802.1X 認證與授權下發',
      w: 1000, h: 360,
      groups: [{ x: 250, y: 20, w: 450, h: 320, label: '交換機（authenticator）' }],
      nodes: [
        { id: 'sup', x: 20, y: 110, w: 170, h: 60, label: 'Supplicant', sub: 'PC · 電話 · 印表機', kind: 'ext', info: '<p>支援 802.1X 的用戶端送出 EAPOL；不支援的設備只會送一般流量，由交換機以其 MAC 進行 MAB。</p>' },
        { id: 'port', x: 280, y: 110, w: 150, h: 60, label: '接入 port', sub: 'EAPOL trap', kind: 'hw', info: '<p>未授權的 port 只把 EAPOL（EtherType 0x888E）送到 CPU，其他流量丟棄。</p>' },
        { id: 'auth', x: 500, y: 60, w: 170, h: 56, label: 'Authenticator', sub: 'EAPOL ↔ RADIUS', kind: 'proc', info: '<p>802.1X 狀態機：送出 EAP-Request/Identity，把用戶端的 EAP 封裝進 RADIUS Access-Request，並把伺服器的 Access-Challenge 轉回 EAPOL。</p>' },
        { id: 'pac', x: 500, y: 170, w: 170, h: 56, label: 'PAC 管理', sub: '用戶端狀態 · host mode', kind: 'proc', info: '<p>管理每個 MAC 的認證狀態、host mode、special VLAN，並把授權結果寫入資料庫。</p>' },
        { id: 'orch', x: 500, y: 270, w: 170, h: 50, label: 'orchagent', sub: 'FDB · VLAN · ACL', kind: 'proc', info: '<p>把授權結果轉成硬體設定：允許該 MAC 通過、加入指定 VLAN、套用 dynamic ACL。</p>' },
        { id: 'asic', x: 280, y: 270, w: 150, h: 50, label: 'ASIC', kind: 'hw' },
        { id: 'rad', x: 780, y: 110, w: 190, h: 60, label: 'RADIUS', sub: 'ISE · FreeRADIUS', kind: 'ext', info: '<p>執行 EAP 方法（EAP-TLS、PEAP 等），回傳 Access-Accept 與 VLAN / ACL 屬性，或 Access-Reject。</p>' },
      ],
      edges: [
        { from: 'sup', to: 'port', label: 'EAPOL', id: 'e1', bi: true },
        { from: 'port', to: 'auth', id: 'e2', bi: true },
        { from: 'auth', to: 'rad', label: 'Access-Request\nChallenge', id: 'e3', bi: true, lx: 735, ly: 72 },
        { from: 'rad', to: 'auth', dash: true, id: 'e4', label: 'Accept + VLAN / ACL', via: [[875, 200], [700, 200]], lx: 800, ly: 216 },
        { from: 'auth', to: 'pac', id: 'e5' },
        { from: 'pac', to: 'orch', id: 'e6' },
        { from: 'orch', to: 'asic', label: 'SAI', id: 'e7' },
      ],
      steps: [
        { title: '偵測到用戶端', text: 'port 上線或收到新的來源 MAC。未授權狀態下只有 EAPOL 會被送到 CPU。', nodes: ['sup', 'port'], edges: ['e1'] },
        { title: 'EAP 身分', text: '交換機送出 EAP-Request/Identity，用戶端回覆 EAP-Response/Identity（使用者名稱）。', nodes: ['sup', 'port', 'auth'], edges: ['e1', 'e2'] },
        { title: 'EAP 方法交換', text: '交換機把 EAP 封裝在 RADIUS Access-Request 中；伺服器以 Access-Challenge 回應，雙方完成 TLS 等交換。交換機不解讀 EAP 內容。', nodes: ['auth', 'rad'], edges: ['e3'] },
        { title: '授權', text: '伺服器回傳 Access-Accept 與 VLAN、ACL 等屬性；交換機送出 EAP-Success 給用戶端。', nodes: ['rad', 'auth', 'pac'], edges: ['e4', 'e5'] },
        { title: '寫入硬體', text: '允許該 MAC 通過、放入指定 VLAN、套用 ACL。之後依 Session-Timeout 定期重新認證。', nodes: ['pac', 'orch', 'asic', 'port'], edges: ['e6', 'e7'] },
      ],
    });

    // ---------- Host mode ----------
    const host = root.querySelector('#hm');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const MODES = ['single-host', 'multi-host', 'multi-domain', 'multi-auth'];
    const P = { mode: 3, mab: true, guest: true, unauth: true, pc2ok: false };
    const sh = S.el('span');
    box.appendChild(S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, 'host mode'), sh));
    const tg = S.el('div', { class: 'row', style: 'margin-top:8px' }, S.el('span', { class: 'w-label' }, '設定'));
    const tgl = (k, l) => { const b = S.el('button', { class: 'btn sm' + (P[k] ? ' on' : ''), onclick: () => { P[k] = !P[k]; b.classList.toggle('on', P[k]); draw(); } }, l); tg.appendChild(b); };
    tgl('mab', 'MAB（order dot1x mab）');
    tgl('guest', 'guest VLAN 900');
    tgl('unauth', 'unauthenticated VLAN 901');
    tgl('pc2ok', 'PC-2 密碼正確');
    box.appendChild(tg);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);
    const DEV = [
      { n: 'IP 電話', mac: '00:1b:4f:10:00:01', dom: 'voice', dot1x: true, ok: () => true, vlan: '200（voice）' },
      { n: 'PC-1', mac: '3c:ec:ef:20:00:02', dom: 'data', dot1x: true, ok: () => true, vlan: '110（RADIUS 指派）' },
      { n: 'PC-2', mac: '3c:ec:ef:20:00:03', dom: 'data', dot1x: true, ok: () => P.pc2ok, vlan: '110（RADIUS 指派）' },
      { n: '印表機', mac: '00:80:77:30:00:04', dom: 'data', dot1x: false, ok: () => true, vlan: '120（MAB，RADIUS 指派）' },
    ];
    S.seg(sh, MODES, i => { P.mode = i; draw(); }, P.mode);
    function indiv(d) {
      if (d.dot1x) {
        if (d.ok()) return { st: 'g', res: '授權', method: '802.1X', vlan: d.vlan };
        if (P.unauth) return { st: 'y', res: '授權（受限）', method: '802.1X 失敗', vlan: '901（unauthenticated）' };
        return { st: 'r', res: '未授權', method: '802.1X 失敗', vlan: '—' };
      }
      if (P.mab) return { st: 'g', res: '授權', method: 'EAPOL 逾時 → MAB', vlan: d.vlan };
      if (P.guest) return { st: 'y', res: '授權（受限）', method: 'EAPOL 逾時', vlan: '900（guest）' };
      return { st: 'r', res: '未授權', method: 'EAPOL 逾時', vlan: '—' };
    }
    function draw() {
      const mode = MODES[P.mode];
      let first = null, dataUsed = false, voiceUsed = false;
      const rows = DEV.map(d => {
        let r = indiv(d);
        let note = '';
        if (mode === 'single-host') {
          if (first) { r = { st: 'r', res: '拒絕', method: '—', vlan: '—' }; note = `single-host 只允許一個用戶端（已由 ${first} 佔用）`; }
          else if (r.st !== 'r') first = d.n;
        } else if (mode === 'multi-host') {
          if (first) { r = { st: 'g', res: '放行', method: '不需認證', vlan: 'port 的 VLAN' }; note = `第一個通過認證的 ${first} 開放了整個 port`; }
          else if (r.st === 'g') first = d.n;
        } else if (mode === 'multi-domain') {
          if (d.dom === 'voice') { if (voiceUsed) { r = { st: 'r', res: '拒絕', method: '—', vlan: '—' }; note = 'voice domain 已有用戶端'; } else if (r.st !== 'r') voiceUsed = true; }
          else if (dataUsed) { r = { st: 'r', res: '拒絕', method: '—', vlan: '—' }; note = 'data domain 只允許一個用戶端'; }
          else if (r.st !== 'r') dataUsed = true;
        }
        return { d, r, note };
      });
      const t = `<table><thead><tr><th>設備</th><th>MAC</th><th>方法</th><th>結果</th><th>VLAN</th><th>說明</th></tr></thead><tbody>${rows.map(({ d, r, note }) => `<tr><td>${d.n}</td><td><code>${d.mac}</code></td><td>${r.method}</td><td><span class="badge ${r.st}">${r.res}</span></td><td>${r.vlan}</td><td class="muted" style="font-size:12.5px">${note}</td></tr>`).join('')}</tbody></table>`;
      const desc = {
        'single-host': '只有一個用戶端可以認證與通行，適合一 port 一台設備的環境。',
        'multi-host': '第一個用戶端認證通過後，port 對所有 MAC 開放。安全性最低，適合 port 後接不支援 802.1X 的小型交換機且可信任的情況。',
        'multi-domain': '允許一台語音設備與一台資料設備，各自認證。適合「電話 + 後方一台 PC」。',
        'multi-auth': '每個 MAC 各自認證與授權（預設），可以有一台語音設備與多台資料設備，最多 48 個用戶端。',
      }[mode];
      out.innerHTML = `<div class="tbl">${t}</div><div class="log" style="margin-top:10px">${desc}</div>`;
    }
    draw();

    // ---------- PoE 預算 ----------
    const ph = root.querySelector('#poe');
    const pbox = S.el('div', { class: 'w-box' });
    ph.appendChild(pbox);
    const PD = [
      { p: 'Eth1/1', d: 'Wi-Fi 6E AP', cls: 6, use: 38, pri: 'critical' },
      { p: 'Eth1/2', d: 'Wi-Fi 6 AP', cls: 4, use: 21, pri: 'high' },
      { p: 'Eth1/3', d: 'PTZ 攝影機', cls: 8, use: 55, pri: 'high' },
      { p: 'Eth1/4', d: 'IP 電話', cls: 2, use: 4.5, pri: 'high' },
      { p: 'Eth1/5', d: 'IP 電話', cls: 2, use: 4.5, pri: 'low' },
      { p: 'Eth1/6', d: '數位看板', cls: 7, use: 48, pri: 'low' },
      { p: 'Eth1/7', d: '門禁讀卡機', cls: 3, use: 9, pri: 'critical' },
      { p: 'Eth1/8', d: '固定攝影機', cls: 3, use: 7, pri: 'low' },
    ];
    const CLS_W = { 0: 15.4, 1: 4, 2: 7, 3: 15.4, 4: 30, 5: 45, 6: 60, 7: 75, 8: 90 };
    const Q = { budget: 200, mode: 0 };
    const top = S.el('div', { class: 'row' });
    const inp = S.el('input', { type: 'number', value: Q.budget, min: 0, style: 'width:90px' });
    inp.addEventListener('input', () => { Q.budget = Math.max(0, +inp.value || 0); pdraw(); });
    top.appendChild(S.el('label', { class: 'field' }, '電源預算 (W)', inp));
    const ms = S.el('span');
    top.appendChild(S.el('div', { class: 'field' }, '功率管理', ms));
    pbox.appendChild(top);
    const pout = S.el('div', { style: 'margin-top:12px' });
    pbox.appendChild(pout);
    S.seg(ms, ['class', 'dynamic'], i => { Q.mode = i; pdraw(); }, 0);
    function pdraw() {
      const PR = { critical: 0, high: 1, low: 2 };
      const order = PD.map((x, i) => ({ ...x, i })).sort((a, b) => PR[a.pri] - PR[b.pri] || a.i - b.i);
      let left = Q.budget;
      const on = {};
      order.forEach(x => { const need = Q.mode === 0 ? CLS_W[x.cls] : x.use; if (need <= left) { left -= need; on[x.p] = need; } });
      const used = Q.budget - left;
      pout.innerHTML = `<div class="tbl"><table><thead><tr><th>Port</th><th>設備</th><th>Class</th><th>實際耗電</th><th>priority</th><th>分配</th><th>狀態</th></tr></thead><tbody>${PD.map(x => `<tr><td><code>${x.p}</code></td><td>${x.d}</td><td>${x.cls}</td><td>${x.use} W</td><td>${x.pri}</td><td>${on[x.p] != null ? on[x.p] + ' W' : '—'}</td><td><span class="badge ${on[x.p] != null ? 'g' : 'r'}">${on[x.p] != null ? '供電' : '預算不足'}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="log" style="margin-top:10px">已分配 ${used.toFixed(1)} W / ${Q.budget} W。${Q.mode === 0 ? 'class 模式依等級上限保留（例如 class 8 保留 90 W），即使設備實際只用 55 W。' : 'dynamic 模式依實際量測的耗電分配，可以供電給更多設備；設備耗電突然上升時，低 priority 的 port 可能被斷電。'}</div>`;
    }
    pdraw();
  },
  searchText: 'EAPOL 0x888E EAP-Request Identity Access-Accept Access-Challenge Tunnel-Private-Group-ID Filter-Id downloadable ACL authentication host-mode single-host multi-host multi-domain multi-auth guest VLAN unauthenticated VLAN MAB PoE 802.3af 802.3at 802.3bt LLDP-MED network-policy voice vlan',
  related: ['aaa', 'pki', 'vlan', 'acl', 'lldp', 'l2-ext'],
  refs: [['IEEE 802.1X', 'https://standards.ieee.org/ieee/802.1X/7345/'], ['RFC 3580 IEEE 802.1X RADIUS Usage Guidelines', 'https://www.rfc-editor.org/rfc/rfc3580'], ['RFC 5176 Dynamic Authorization Extensions to RADIUS', 'https://www.rfc-editor.org/rfc/rfc5176'], ['Enterprise SONiC User Guide UG460：Ch.9', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
