(function () {
  const FSM = {
    Idle: { Start: ['Connect', '啟動 ConnectRetry 計時器並主動發起 TCP 179 連線'] },
    Connect: { 'TCP 建立成功': ['OpenSent', '送出 OPEN（ASN、hold time、router ID、capabilities）'], 'TCP 連線失敗': ['Active', '等待 ConnectRetry 逾時，同時接受對端發起的連線'], 'ConnectRetry 逾時': ['Connect', '重新嘗試 TCP 連線'] },
    Active: { 'ConnectRetry 逾時': ['Connect', '重新主動連線'], 'TCP 建立成功': ['OpenSent', '對端連入成功，送出 OPEN'] },
    OpenSent: { '收到正確 OPEN': ['OpenConfirm', 'ASN、BGP ID、hold time 檢查通過，送出 KEEPALIVE；協商後的 hold time 取兩端較小值'], '收到錯誤 OPEN': ['Idle', '例如 remote-as 不符或 router ID 衝突，送出 NOTIFICATION（OPEN Message Error）'], 'TCP 連線失敗': ['Active', '連線中斷'], 'Hold timer 逾時': ['Idle', '送出 NOTIFICATION（Hold Timer Expired）'] },
    OpenConfirm: { '收到 KEEPALIVE': ['Established', 'session 建立，開始交換 UPDATE'], '收到 NOTIFICATION': ['Idle', '對端拒絕'], 'Hold timer 逾時': ['Idle', '送出 NOTIFICATION'] },
    Established: { '收到 UPDATE': ['Established', '處理 NLRI 與路徑屬性，重設 hold timer'], '收到 KEEPALIVE': ['Established', '重設 hold timer'], 'Hold timer 逾時': ['Idle', '送出 NOTIFICATION，撤除從此鄰居學到的所有路由'], '收到 NOTIFICATION': ['Idle', '撤除路由'], 'TCP 連線失敗': ['Idle', '撤除路由（若雙方支援 Graceful Restart，則在 restart time 內保留為 stale）'] },
  };
  const STATES = ['Idle', 'Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Established'];
  const EVENTS = ['Start', 'TCP 建立成功', 'TCP 連線失敗', 'ConnectRetry 逾時', '收到正確 OPEN', '收到錯誤 OPEN', '收到 KEEPALIVE', '收到 UPDATE', '收到 NOTIFICATION', 'Hold timer 逾時'];

  S.register({
    id: 'bgp',
    category: 'l3',
    order: 3,
    title: 'BGP',
    en: 'Border Gateway Protocol',
    summary: 'BGP 是資料中心 fabric 與 EVPN 的核心協定。本章說明 session 狀態機、路徑屬性與最佳路徑選擇、iBGP / eBGP、route reflector、peer group、unnumbered BGP、ECMP 與 graceful restart，以及 SONiC 如何以 bgpcfgd 或 frrcfgd 把 CONFIG_DB 轉成 FRR 設定。',
    meta: [
      ['容器', ['bgp']],
      ['程序', ['bgpd', 'zebra', 'bgpcfgd 或 frrcfgd', 'bgpmon', 'fpmsyncd']],
      ['CONFIG_DB（社群）', ['BGP_NEIGHBOR', 'BGP_PEER_RANGE', 'BGP_MONITORS', 'BGP_ALLOWED_PREFIXES', 'BGP_DEVICE_GLOBAL']],
      ['CONFIG_DB（frrcfgd）', ['BGP_GLOBALS', 'BGP_GLOBALS_AF', 'BGP_NEIGHBOR', 'BGP_NEIGHBOR_AF', 'BGP_PEER_GROUP', 'BGP_PEER_GROUP_AF', 'ROUTE_REDISTRIBUTE']],
      ['STATE_DB', ['NEIGH_STATE_TABLE', 'BGP_STATE_TABLE']],
      ['協定', ['TCP 179', 'RFC 4271', 'RFC 4760 (MP-BGP)', 'RFC 5549 / 8950 (extended next hop)', 'RFC 7938 (BGP in DC)']],
    ],
    tags: ['BGP', 'eBGP', 'iBGP', 'FSM', 'best path', 'route reflector', 'peer group', 'unnumbered', 'multipath', 'graceful restart', 'bgpcfgd', 'frrcfgd', 'bgpmon', 'AutoASN', 'TSA'],
    keypoints: [
      'BGP session 依 Idle → Connect / Active → OpenSent → OpenConfirm → Established 建立；hold time 預設 180 秒、keepalive 60 秒（SONiC 資料中心範本常設為 3 / 1 秒搭配 BFD，或 9 / 3 秒）。',
      '最佳路徑依序比較 weight、local preference、AS path 長度、origin、MED、eBGP 優於 iBGP、到 next hop 的 IGP 成本、router ID、鄰居位址。',
      'maximum-paths 允許多條在前述比較中「平手」的路徑同時安裝，形成 ECMP；不同 AS path 的路徑需搭配 bestpath as-path multipath-relax。',
      'Unnumbered BGP 以 IPv6 link-local 位址建立 session，並以 RFC 5549 用 IPv6 next hop 承載 IPv4 路由，不需要替每條鏈路規劃 IP。',
      'SONiC 預設由 bgpcfgd 讀取少數 CONFIG_DB 表並套用範本；Management Framework 模式下改由 frrcfgd 支援完整的 BGP 設定模型。',
    ],
    html: `
<h2>協定基礎</h2>
<h3>訊息類型</h3>
<table>
<thead><tr><th>類型</th><th>用途</th></tr></thead>
<tbody>
<tr><td>OPEN</td><td>建立 session：版本、My AS、Hold Time、BGP Identifier（router ID）、capabilities（MP-BGP、4-byte ASN、route refresh、graceful restart、add-path、extended next hop）</td></tr>
<tr><td>UPDATE</td><td>通告（NLRI + 路徑屬性）或撤除（withdrawn routes）路由；IPv6、EVPN 等使用 MP_REACH_NLRI / MP_UNREACH_NLRI 屬性</td></tr>
<tr><td>KEEPALIVE</td><td>維持 session，週期約為 hold time 的 1/3</td></tr>
<tr><td>NOTIFICATION</td><td>錯誤通知，送出後關閉 session</td></tr>
<tr><td>ROUTE-REFRESH</td><td>要求對端重送路由，常用於修改 inbound policy 之後（<code>clear bgp … soft in</code>）</td></tr>
</tbody></table>

<h3>Session 狀態機</h3>
<p>依序觸發事件，觀察 BGP FSM 的狀態轉換。<code>show bgp summary</code> 中的 State 欄位即為目前狀態，長期停在 Active 通常代表 TCP 無法建立。</p>
<div id="fsm"></div>

<h3>iBGP 與 eBGP</h3>
<table>
<thead><tr><th></th><th>eBGP</th><th>iBGP</th></tr></thead>
<tbody>
<tr><td>鄰居</td><td>不同 AS，通常直連（TTL 1；loopback 對接需 <code>ebgp-multihop</code>）</td><td>同一 AS，可跨多跳</td></tr>
<tr><td>AS path</td><td>送出時加上自己的 ASN</td><td>不修改</td></tr>
<tr><td>next hop</td><td>改成自己的位址</td><td>預設不修改（常用 <code>next-hop-self</code>）</td></tr>
<tr><td>防迴圈</td><td>收到 AS path 含自己 ASN 的路由即丟棄（<code>allowas-in</code> 可放寬）</td><td>從 iBGP 學到的路由不再轉送給其他 iBGP 鄰居，需 full mesh 或 route reflector</td></tr>
<tr><td>預設 distance</td><td>20</td><td>200</td></tr>
</tbody></table>

<h2>路徑屬性與最佳路徑選擇</h2>
<table>
<thead><tr><th>屬性</th><th>類別</th><th>說明</th></tr></thead>
<tbody>
<tr><td>ORIGIN</td><td>well-known mandatory</td><td>IGP（i）、EGP（e）、INCOMPLETE（?，例如 redistribute）</td></tr>
<tr><td>AS_PATH</td><td>well-known mandatory</td><td>經過的 AS 序列，越短越優先；可用 <code>set as-path prepend</code> 加長以影響入方向流量</td></tr>
<tr><td>NEXT_HOP</td><td>well-known mandatory</td><td>下一跳；必須在 RIB 中可解析，否則路由不可用（next-hop tracking）</td></tr>
<tr><td>LOCAL_PREF</td><td>well-known discretionary</td><td>只在 AS 內傳遞，越大越優先（預設 100），用於控制出方向</td></tr>
<tr><td>MED</td><td>optional non-transitive</td><td>建議鄰居 AS 如何進入本 AS，越小越優先；預設只比較來自同一鄰居 AS 的路徑</td></tr>
<tr><td>COMMUNITY / EXT / LARGE</td><td>optional transitive</td><td>路由標籤，供政策比對；EVPN 的 route target 屬於 extended community</td></tr>
<tr><td>weight</td><td>FRR 本地</td><td>不傳遞，只影響本機，最先比較</td></tr>
</tbody></table>
<p>下方有三條到 <code>192.168.0.0/24</code> 的候選路徑。修改屬性，觀察 FRR 依序比較時在哪一步決定勝負，以及哪些路徑可加入 ECMP。</p>
<div id="bp"></div>

<h2>擴展與部署功能</h2>
<table>
<thead><tr><th>功能</th><th>用途</th><th>Enterprise SONiC 指令</th></tr></thead>
<tbody>
<tr><td>Peer group</td><td>多個鄰居共用設定（remote-as、timer、policy、address family）</td><td><code>peer-group SPINE</code>、<code>neighbor 10.0.0.1</code> → <code>peer-group SPINE</code></td></tr>
<tr><td>Route reflector</td><td>避免 iBGP full mesh；RR 把 client 的路由反射給其他 client，並加上 ORIGINATOR_ID、CLUSTER_LIST 防迴圈</td><td><code>route-reflector-client</code>（neighbor AF 模式）</td></tr>
<tr><td>Unnumbered</td><td>以 IPv6 link-local 在介面上建立 session，RA 用來發現對端；IPv4 路由使用 IPv6 next hop</td><td><code>neighbor interface Eth1/1</code>、<code>remote-as external</code>、<code>capability extended-nexthop</code></td></tr>
<tr><td>Dynamic neighbor</td><td>接受某個網段內任意位址的連線（社群版 <code>BGP_PEER_RANGE</code>）</td><td><code>listen range</code></td></tr>
<tr><td>Multipath</td><td>多條等價路徑同時安裝，對應到 SAI NEXT_HOP_GROUP</td><td><code>maximum-paths 32</code>、<code>bestpath as-path multipath-relax</code></td></tr>
<tr><td>Graceful restart</td><td>控制平面重啟時鄰居保留路由（warm reboot 依賴此功能）</td><td><code>graceful-restart enable</code>、<code>restart-time</code>、<code>stalepath-time</code></td></tr>
<tr><td>BFD</td><td>毫秒級偵測鄰居失效，比 hold timer 快</td><td><code>bfd</code>（neighbor 模式）</td></tr>
<tr><td>allowas-in</td><td>接受 AS path 中含自己 ASN 的路由（例如多個 leaf 共用 ASN）</td><td><code>allowas-in [count | origin]</code></td></tr>
<tr><td>Attached host routes</td><td>把 ARP / ND 學到的主機轉為 /32、/128 路由並通告（Enterprise）</td><td>見 UG460 §10.6.9</td></tr>
<tr><td>AutoASN</td><td>依系統 MAC 以 SHA-256 雜湊得出 leaf 的私有 4-byte ASN，spine 使用固定 ASN（Enterprise）</td><td>見 UG460 §10.5.4</td></tr>
<tr><td>Fast Link Failover</td><td>鏈路失效時由硬體直接切換到其他 ECMP 路徑，不必等控制平面（Enterprise，AI fabric）</td><td>見 UG460 §10.6.10</td></tr>
<tr><td>Traffic shift (TSA)</td><td>以 route-map 讓整台設備的路由失去吸引力，維護前把流量導走（社群 <code>BGP_DEVICE_GLOBAL|STATE tsa_enabled</code>）</td><td><code>sudo TSA</code> / <code>TSB</code> / <code>TSC</code></td></tr>
</tbody></table>

<h2>在 SONiC 中的實作</h2>
<div id="d-bgp"></div>
<table>
<thead><tr><th></th><th>bgpcfgd（社群預設）</th><th>frrcfgd（Management Framework）</th></tr></thead>
<tbody>
<tr><td>啟用條件</td><td>預設</td><td><code>DEVICE_METADATA|localhost frr_mgmt_framework_config = true</code></td></tr>
<tr><td>設定模型</td><td>少數表：BGP_NEIGHBOR、BGP_PEER_RANGE、BGP_MONITORS、BGP_ALLOWED_PREFIXES、STATIC_ROUTE…，搭配 Jinja2 範本（peer 類型：general、dynamic、monitors…）</td><td>完整模型：BGP_GLOBALS(_AF)、BGP_NEIGHBOR(_AF)、BGP_PEER_GROUP(_AF)、ROUTE_MAP、PREFIX_SET、COMMUNITY_SET、AS_PATH_SET、ROUTE_REDISTRIBUTE…</td></tr>
<tr><td>進階設定</td><td>需在 vtysh 手動設定（split / unified 模式保存）</td><td>全部經 CONFIG_DB</td></tr>
<tr><td>套用方式</td><td>vtysh 指令</td><td>vtysh 指令</td></tr>
</tbody></table>
<pre><span class="c"># 社群版 CONFIG_DB</span>
"BGP_NEIGHBOR": {
  "10.0.0.1": { "asn": "65200", "name": "spine01", "local_addr": "10.0.0.0",
                "holdtime": "9", "keepalive": "3", "admin_status": "up" }
}
<span class="c"># frrcfgd 模式（key 含 VRF）</span>
"BGP_GLOBALS":      { "default": { "local_asn": "65100", "router_id": "10.1.0.1" } },
"BGP_NEIGHBOR":     { "default|10.0.0.1": { "asn": "65200", "admin_status": "up" } },
"BGP_NEIGHBOR_AF":  { "default|10.0.0.1|ipv4_unicast": { "admin_status": "true", "route_map_in": ["FROM_SPINE"] } }</pre>

<h2>設定範例</h2>
<pre><span class="c"># Enterprise SONiC：leaf 以 unnumbered eBGP 連 spine，使用 peer group 與 multipath</span>
sonic(config)# interface Loopback 0
sonic(config-if-lo0)# ip address 10.1.0.1/32
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# ipv6 enable
sonic(config)# router bgp 65101
sonic(config-router-bgp)# router-id 10.1.0.1
sonic(config-router-bgp)# bestpath as-path multipath-relax
sonic(config-router-bgp)# peer-group SPINE
sonic(config-router-bgp-pg)# remote-as external
sonic(config-router-bgp-pg)# timers 3 9
sonic(config-router-bgp-pg)# bfd
sonic(config-router-bgp-pg)# capability extended-nexthop
sonic(config-router-bgp-pg)# address-family ipv4 unicast
sonic(config-router-bgp-pg-af)# activate
sonic(config-router-bgp)# neighbor interface Eth1/1
sonic(config-router-bgp-neighbor)# peer-group SPINE
sonic(config-router-bgp)# address-family ipv4 unicast
sonic(config-router-bgp-af)# redistribute connected route-map LOOPBACKS
sonic(config-router-bgp-af)# maximum-paths 32

<span class="c"># 查看</span>
sonic# show bgp ipv4 unicast summary
sonic# show bgp ipv4 unicast 192.168.0.0/24
sonic# show bgp ipv4 unicast neighbors 10.0.0.1 advertised-routes
<span class="c"># 社群版</span>
show ip bgp summary
vtysh -c "show bgp ipv4 unicast 192.168.0.0/24 bestpath"</pre>
`,
    mount(root) {
      // ---------- FSM ----------
      const fh = root.querySelector('#fsm');
      const fbox = S.el('div', { class: 'w-box' });
      fh.appendChild(fbox);
      let cur = 'Idle';
      const log = [];
      function fdraw() {
        fbox.innerHTML = '';
        const strip = S.el('div', { class: 'pipe' });
        STATES.forEach(s => strip.appendChild(S.el('div', { style: s === cur ? 'background:var(--accent-soft)' : '' }, S.el('div', { class: 'pl' }, s === cur ? '目前狀態' : ''), S.el('div', { class: 'pv', style: s === cur ? 'color:var(--accent-ink)' : 'color:var(--faint)' }, s))));
        fbox.appendChild(strip);
        const row = S.el('div', { class: 'row' });
        EVENTS.forEach(ev => {
          const t = FSM[cur][ev];
          row.appendChild(S.el('button', { class: 'btn sm', disabled: !t, onclick: () => { log.unshift(`<b>${cur}</b> — ${ev} → <b>${t[0]}</b>：${t[1]}`); cur = t[0]; fdraw(); } }, ev));
        });
        row.appendChild(S.el('button', { class: 'btn sm', onclick: () => { cur = 'Idle'; log.length = 0; fdraw(); } }, '重設'));
        fbox.appendChild(row);
        fbox.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html: log.length ? log.map(l => `<div>${l}</div>`).join('') : '<span class="muted">灰色按鈕表示該事件在目前狀態下不適用。建議順序：Start → TCP 建立成功 → 收到正確 OPEN → 收到 KEEPALIVE。</span>' }));
      }
      fdraw();

      // ---------- Best path ----------
      const bh = root.querySelector('#bp');
      const bbox = S.el('div', { class: 'w-box' });
      bh.appendChild(bbox);
      const P = [
        { name: 'P1', nh: '10.0.0.1', weight: 0, lp: 100, aspath: '65200 65300', origin: 'i', med: 0, src: 'eBGP', igp: 0, rid: '10.2.0.1' },
        { name: 'P2', nh: '10.0.0.3', weight: 0, lp: 100, aspath: '65201 65300', origin: 'i', med: 0, src: 'eBGP', igp: 0, rid: '10.2.0.2' },
        { name: 'P3', nh: '10.1.0.9', weight: 0, lp: 100, aspath: '65300', origin: 'i', med: 0, src: 'iBGP', igp: 20, rid: '10.1.0.9' },
      ];
      let relax = true, maxPaths = 32;
      const ORI = { i: 0, e: 1, '?': 2 };
      const ip2n = s => s.split('.').reduce((a, b) => a * 256 + (+b), 0);
      const aslen = p => p.aspath.trim() ? p.aspath.trim().split(/\s+/).length : 0;
      const firstAs = p => p.aspath.trim().split(/\s+/)[0] || '';
      // 回傳 [勝者 -1/1/0, 決定步驟]；-1 表示 a 較佳
      const STEPS = [
        ['Weight（大者優先）', (a, b) => b.weight - a.weight],
        ['Local preference（大者優先）', (a, b) => b.lp - a.lp],
        ['AS path 長度（短者優先）', (a, b) => aslen(a) - aslen(b)],
        ['Origin（IGP < EGP < incomplete）', (a, b) => ORI[a.origin] - ORI[b.origin]],
        ['MED（小者優先，僅同一鄰居 AS）', (a, b) => (firstAs(a) === firstAs(b) ? a.med - b.med : 0)],
        ['eBGP 優於 iBGP', (a, b) => (a.src === b.src ? 0 : a.src === 'eBGP' ? -1 : 1)],
        ['到 next hop 的 IGP 成本（小者優先）', (a, b) => a.igp - b.igp],
        ['Router ID（小者優先）', (a, b) => ip2n(a.rid) - ip2n(b.rid)],
        ['鄰居位址（小者優先）', (a, b) => ip2n(a.nh) - ip2n(b.nh)],
      ];
      const MP_LAST = 6; // 前 7 步（index 0–6）相同才可成為 multipath
      function cmp(a, b) {
        for (let i = 0; i < STEPS.length; i++) { const d = STEPS[i][1](a, b); if (d) return [d, i]; }
        return [0, -1];
      }
      function bdraw() {
        bbox.innerHTML = '';
        const fields = [['weight', 'Weight', 'n'], ['lp', 'Local pref', 'n'], ['aspath', 'AS path', 't'], ['origin', 'Origin', ['i', 'e', '?']], ['med', 'MED', 'n'], ['src', '來源', ['eBGP', 'iBGP']], ['igp', 'IGP 成本', 'n'], ['rid', 'Router ID', 't']];
        const t = S.el('table');
        const thead = S.el('thead', null, S.el('tr', null, S.el('th', null, '屬性'), ...P.map(p => S.el('th', null, `${p.name} · via ${p.nh}`))));
        const tb = S.el('tbody');
        fields.forEach(([k, lbl, typ]) => {
          const tr = S.el('tr', null, S.el('td', null, lbl));
          P.forEach((p, i) => {
            let inp;
            if (Array.isArray(typ)) { inp = S.el('select', { id: `bp-${k}-${i}` }, ...typ.map(o => S.el('option', { value: o, selected: p[k] === o }, o))); }
            else inp = S.el('input', { id: `bp-${k}-${i}`, value: p[k], size: typ === 't' ? 12 : 5 });
            inp.addEventListener('change', () => { p[k] = typ === 'n' ? (parseInt(inp.value, 10) || 0) : inp.value; bdraw(); });
            tr.appendChild(S.el('td', null, S.el('span', { class: 'field' }, inp)));
          });
          tb.appendChild(tr);
        });
        t.appendChild(thead); t.appendChild(tb);
        const tw = S.el('div', { class: 'tbl' }); tw.appendChild(t);
        bbox.appendChild(tw);
        const opts = S.el('div', { class: 'row', style: 'margin-top:8px' },
          S.el('button', { class: 'btn sm' + (relax ? ' on' : ''), onclick: () => { relax = !relax; bdraw(); } }, 'bestpath as-path multipath-relax'),
          S.el('span', { class: 'muted', style: 'font-size:12.5px' }, 'maximum-paths'),
          ...[1, 2, 32].map(n => S.el('button', { class: 'btn sm' + (maxPaths === n ? ' on' : ''), onclick: () => { maxPaths = n; bdraw(); } }, String(n))));
        bbox.appendChild(opts);
        // 找最佳路徑
        let best = P[0], why = [];
        P.slice(1).forEach(p => { const [d, i] = cmp(p, best); if (d < 0) { why.push(`${p.name} 勝過 ${best.name}：${i >= 0 ? STEPS[i][0] : '完全相同'}`); best = p; } else why.push(`${best.name} 勝過 ${p.name}：${i >= 0 ? STEPS[i][0] : '完全相同'}`); });
        // multipath
        const mp = P.filter(p => {
          if (p === best) return true;
          for (let i = 0; i <= MP_LAST; i++) {
            if (i === 2 && !relax) { if (p.aspath.trim() !== best.aspath.trim()) return false; }
            if (STEPS[i][1](p, best)) return false;
          }
          return true;
        }).slice(0, maxPaths);
        bbox.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html:
          `<div><b>最佳路徑：${best.name}</b>（via ${best.nh}）</div>` + why.map(w => `<div>${w}</div>`).join('') +
          `<div><b>安裝到 RIB 的路徑：</b>${mp.map(p => p.name).join('、')}${mp.length > 1 ? ` — ${mp.length} 條 ECMP，RouteOrch 會建立 NEXT_HOP_GROUP` : '（單一路徑）'}${!relax && P.some(p => p !== best && p.aspath.trim() !== best.aspath.trim()) ? '。未開啟 multipath-relax 時，AS path 內容必須完全相同才能成為 multipath。' : ''}</div>` }));
      }
      bdraw();

      S.diagram(root.querySelector('#d-bgp'), {
        title: 'BGP 在 SONiC 中的元件',
        w: 1000, h: 400,
        groups: [{ x: 250, y: 16, w: 500, h: 250, label: 'bgp 容器' }],
        nodes: [
          { id: 'cfg', x: 20, y: 50, w: 190, h: 60, label: 'CONFIG_DB', sub: 'BGP_* / ROUTE_MAP …', kind: 'db', info: '<p>BGP 設定的唯一來源（Management Framework 或 config_db.json）。</p>' },
          { id: 'cfgd', x: 280, y: 50, w: 190, h: 60, label: 'bgpcfgd / frrcfgd', kind: 'proc', info: '<p>訂閱 CONFIG_DB，把變更轉成 vtysh 指令。bgpcfgd 內部依表分成多個 manager（BGPPeerMgr、BGPAllowListMgr、StaticRouteMgr、DeviceGlobalCfgMgr…）。</p>' },
          { id: 'bgpd', x: 530, y: 50, w: 190, h: 60, label: 'bgpd', kind: 'proc', info: '<p>維護每個鄰居的 FSM、Adj-RIB-In / Loc-RIB / Adj-RIB-Out，執行 policy 與最佳路徑選擇。</p>' },
          { id: 'peer', x: 800, y: 50, w: 180, h: 60, label: 'BGP 鄰居', sub: 'TCP 179', kind: 'ext', info: '<p>BGP 封包由 CoPP 的 bgp trap 送到 CPU（高優先權佇列）。</p>' },
          { id: 'zebra', x: 530, y: 180, w: 190, h: 60, label: 'zebra', sub: 'RIB / next-hop tracking', kind: 'proc', info: '<p>選出各協定的最佳路由；同時提供 next-hop tracking，讓 bgpd 知道 next hop 是否可達。</p>' },
          { id: 'mon', x: 280, y: 180, w: 190, h: 60, label: 'bgpmon', kind: 'proc', info: '<p>定期查詢 bgpd，把每個鄰居的狀態寫入 STATE_DB <code>NEIGH_STATE_TABLE</code>，供 SNMP 與監控使用。</p>' },
          { id: 'st', x: 20, y: 180, w: 190, h: 60, label: 'STATE_DB', sub: 'NEIGH_STATE_TABLE', kind: 'db', info: '<p>例如 <code>NEIGH_STATE_TABLE|10.0.0.1 state=Established</code>。</p>' },
          { id: 'fpm', x: 530, y: 310, w: 190, h: 60, label: 'fpmsyncd → APPL_DB', sub: 'ROUTE_TABLE', kind: 'proc', info: '<p>之後的路徑見「路由架構與 FRR」章：RouteOrch 下發 ROUTE_ENTRY 與 NEXT_HOP_GROUP。</p>' },
        ],
        edges: [
          { from: 'cfg', to: 'cfgd', id: 'e1' },
          { from: 'cfgd', to: 'bgpd', label: 'vtysh', id: 'e2' },
          { from: 'bgpd', to: 'peer', bi: true, label: 'OPEN / UPDATE', id: 'e3' },
          { from: 'bgpd', to: 'zebra', bi: true, id: 'e4' },
          { from: 'bgpd', to: 'mon', dash: true, id: 'e5' },
          { from: 'mon', to: 'st', id: 'e6' },
          { from: 'zebra', to: 'fpm', label: 'FPM', id: 'e7' },
        ],
        steps: [
          { title: '設定', text: 'CONFIG_DB 的 BGP 表由 bgpcfgd 或 frrcfgd 轉成 FRR 設定。', nodes: ['cfg', 'cfgd', 'bgpd'], edges: ['e1', 'e2'] },
          { title: '建立 session 並交換路由', text: 'bgpd 與鄰居完成 FSM 後交換 UPDATE，套用 inbound policy 並選出最佳路徑。', nodes: ['bgpd', 'peer'], edges: ['e3'] },
          { title: '安裝到 RIB', text: 'bgpd 把最佳路徑（或 multipath）交給 zebra；zebra 回報 next hop 可達性。', nodes: ['bgpd', 'zebra'], edges: ['e4'] },
          { title: '下發', text: 'zebra 經 FPM 交給 fpmsyncd，寫入 APPL_DB ROUTE_TABLE。', nodes: ['zebra', 'fpm'], edges: ['e7'] },
          { title: '狀態監控', text: 'bgpmon 把鄰居狀態寫入 STATE_DB。', nodes: ['bgpd', 'mon', 'st'], edges: ['e5', 'e6'] },
        ],
      });
    },
    related: ['routing', 'routing-policy', 'vrf', 'vxlan', 'protection', 'design'],
    refs: [['RFC 4271 BGP-4', 'https://www.rfc-editor.org/rfc/rfc4271'], ['RFC 7938 Use of BGP for Routing in Large-Scale Data Centers', 'https://www.rfc-editor.org/rfc/rfc7938'], ['FRR BGP 文件', 'https://docs.frrouting.org/en/latest/bgp.html'], ['Enterprise SONiC User Guide UG460：§10.5–10.6', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
  });
})();
