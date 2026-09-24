(function () {
  const PL = [
    { seq: 5, act: 'deny', pfx: '10.0.0.0/8', ge: 25, le: null },
    { seq: 10, act: 'permit', pfx: '10.0.0.0/8', ge: null, le: 24 },
    { seq: 20, act: 'permit', pfx: '192.168.0.0/16', ge: 24, le: 24 },
  ];
  const RM = [
    { seq: 10, act: 'permit', match: { pl: 'PL_DC', comm: '65000:100' }, set: { lp: 200 } },
    { seq: 20, act: 'permit', match: { pl: 'PL_DC' }, set: { lp: 100, comm: '65100:1 additive' } },
    { seq: 30, act: 'deny', match: { comm: '65000:666' }, set: {} },
  ];

  S.register({
    id: 'routing-policy',
    category: 'l3',
    order: 5,
    title: 'Route-map、Prefix-list 與 PBR',
    en: 'Routing Policy & Policy-Based Routing',
    summary: '路由政策決定哪些路由被接受、通告，以及屬性如何被修改：prefix-list、community-list、as-path-list 用於比對，route-map 組合比對與設定。PBR 則不依目的位址，而依封包欄位把流量導向指定的下一跳，在 SONiC 中以 ACL 的 redirect action 實作。',
    meta: [
      ['程序', ['bgpd / zebra（route-map）', 'frrcfgd', 'orchagent (AclOrch, PbhOrch)']],
      ['CONFIG_DB（frrcfgd）', ['ROUTE_MAP', 'PREFIX_SET', 'PREFIX', 'COMMUNITY_SET', 'EXTENDED_COMMUNITY_SET', 'AS_PATH_SET']],
      ['PBR', ['ACL_TABLE (type PBR / L3)', 'ACL_RULE PACKET_ACTION=REDIRECT:<nh>', 'SAI_ACL_ENTRY_ATTR_ACTION_REDIRECT']],
      ['Enterprise 模型', ['class-map', 'policy-map type forwarding', 'service-policy type forwarding']],
    ],
    tags: ['route-map', 'prefix-list', 'community', 'as-path', 'policy', 'PBR', 'policy-based routing', 'redirect', 'match', 'set', 'ge', 'le'],
    keypoints: [
      'prefix-list 依 seq 由小到大比對，第一個符合的項目決定 permit / deny；ge / le 指定可接受的前綴長度範圍；最後有隱含的 deny。',
      'route-map 由多個 entry 組成：entry 中所有 match 條件都成立才算符合；permit 執行 set 並接受路由，deny 拒絕路由；沒有 entry 符合時隱含 deny。',
      '常見套用點：BGP neighbor 的 in / out、redistribute、network、default-originate、zebra 的 ip protocol（決定是否安裝到 FIB）。',
      '修改 inbound policy 後需 soft reset（route refresh）才會對已收到的路由生效。',
      'PBR 依封包的來源、目的、協定、port 等欄位選擇下一跳，優先於一般路由查詢；下一跳不可達時可設定備援或回到一般路由。',
    ],
    html: `
<h2>比對工具</h2>
<table>
<thead><tr><th>清單</th><th>比對對象</th><th>範例（Enterprise SONiC）</th></tr></thead>
<tbody>
<tr><td>prefix-list</td><td>前綴與長度範圍</td><td><code>ip prefix-list PL_DC seq 10 permit 10.0.0.0/8 le 24</code></td></tr>
<tr><td>community-list</td><td>standard（固定值）或 expanded（regex）community</td><td><code>bgp community-list standard C_GOLD permit 65000:100</code></td></tr>
<tr><td>extcommunity-list</td><td>route target、site of origin</td><td><code>bgp extcommunity-list standard RT permit rt 64545:10 all</code></td></tr>
<tr><td>as-path-list</td><td>AS path 的 regex</td><td><code>bgp as-path-list AS_CUST permit ^65303$</code></td></tr>
</tbody></table>
<p>prefix-list 的長度範圍規則：只寫前綴時需完全相同；<code>ge N</code> 表示長度 ≥ N；<code>le M</code> 表示長度 ≤ M；兩者可同時使用。長度範圍永遠在前綴本身的長度之上檢查，例如 <code>10.0.0.0/8 le 24</code> 接受 /8 到 /24 且落在 10.0.0.0/8 之內的所有前綴。</p>

<h2>Route-map 評估模擬</h2>
<p>下方為一組套用在 SPINE 鄰居 inbound 方向的政策。輸入一條收到的路由，逐步查看 prefix-list 與 route-map 的比對過程與結果。</p>
<div id="rm"></div>

<h2>Route-map 語意</h2>
<table>
<thead><tr><th>元素</th><th>說明</th></tr></thead>
<tbody>
<tr><td><code>permit</code> / <code>deny</code></td><td>entry 符合時接受（並執行 set）或拒絕</td></tr>
<tr><td><code>match …</code></td><td>同一 entry 內多個 match 為 AND；同一 match 指令列出多個值為 OR</td></tr>
<tr><td><code>set …</code></td><td>local-preference、metric（MED）、community（additive）、as-path prepend、next-hop、origin、tag、weight</td></tr>
<tr><td><code>on-match next / goto N</code></td><td>符合後繼續評估後面的 entry（累加 set）</td></tr>
<tr><td><code>call MAP</code></td><td>呼叫另一個 route-map，deny 結果會結束評估</td></tr>
<tr><td>隱含 deny</td><td>所有 entry 都不符合時路由被拒絕；若想放行其餘路由，需在最後加一個不含 match 的 permit entry</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# ip prefix-list PL_DC seq 5 deny 10.0.0.0/8 ge 25
sonic(config)# ip prefix-list PL_DC seq 10 permit 10.0.0.0/8 le 24
sonic(config)# bgp community-list standard C_GOLD permit 65000:100
sonic(config)# route-map FROM_SPINE permit 10
sonic(config-route-map)# match ip address prefix-list PL_DC
sonic(config-route-map)# match community C_GOLD
sonic(config-route-map)# set local-preference 200
sonic(config)# route-map FROM_SPINE permit 20
sonic(config-route-map)# match ip address prefix-list PL_DC
sonic(config)# router bgp 65101
sonic(config-router-bgp)# neighbor interface Eth1/1
sonic(config-router-bgp-neighbor)# address-family ipv4 unicast
sonic(config-router-bgp-neighbor-af)# route-map FROM_SPINE in
sonic# clear bgp ipv4 unicast * soft in</pre>

<h2>Policy-Based Routing</h2>
<p>PBR 在一般路由查詢之前，依封包欄位決定下一跳。常見用途：特定來源網段走防火牆、特定應用走指定上聯、依 DSCP 分流。</p>
<div id="d-pbr"></div>
<pre><span class="c"># Enterprise SONiC：ACL → class-map → policy-map（forwarding）→ 套用到介面</span>
sonic(config)# ip access-list PBR_WEB
sonic(config-ipv4-acl)# seq 10 permit tcp 10.10.0.0/16 any eq 443
sonic(config)# class-map C_WEB match-type acl
sonic(config-class-map)# match access-group ip PBR_WEB
sonic(config)# policy-map P_FWD type forwarding
sonic(config-policy-map)# class C_WEB priority 10
sonic(config-policy-map-flow)# set ip next-hop 172.16.0.1 priority 100
sonic(config-policy-map-flow)# set ip next-hop 172.16.0.5 priority 50     <span class="c"># 備援下一跳</span>
sonic(config)# interface Vlan 10
sonic(config-if-Vlan10)# service-policy type forwarding in P_FWD
sonic# show policy-map P_FWD

<span class="c"># 社群版：以 ACL 的 redirect action 表示</span>
"ACL_TABLE": { "PBR_T": { "type": "L3", "stage": "ingress", "ports": ["Vlan10"] } },
"ACL_RULE":  { "PBR_T|WEB": { "PRIORITY": "100", "SRC_IP": "10.10.0.0/16", "IP_PROTOCOL": "6",
                             "L4_DST_PORT": "443", "PACKET_ACTION": "REDIRECT:172.16.0.1" } }</pre>
`,
    mount(root) {
      const host = root.querySelector('#rm');
      const box = S.el('div', { class: 'w-box' });
      host.appendChild(box);
      box.innerHTML = `<div class="grid c2"><div><div class="w-label">prefix-list PL_DC</div><pre style="margin:4px 0">${PL.map(e => `seq ${e.seq} ${e.act} ${e.pfx}${e.ge ? ' ge ' + e.ge : ''}${e.le ? ' le ' + e.le : ''}`).join('\n')}\n<span class="c">(隱含 deny any)</span></pre></div><div><div class="w-label">route-map FROM_SPINE</div><pre style="margin:4px 0">${RM.map(e => `${e.act} ${e.seq}\n${e.match.pl ? ' match ip address prefix-list ' + e.match.pl + '\n' : ''}${e.match.comm ? ' match community ' + e.match.comm + '\n' : ''}${e.set.lp ? ' set local-preference ' + e.set.lp + '\n' : ''}${e.set.comm ? ' set community ' + e.set.comm + '\n' : ''}`).join('')}<span class="c">(隱含 deny)</span></pre></div></div>`;
      const pfx = S.el('input', { id: 'rm-pfx', value: '10.20.30.0/24', size: 18 });
      const comm = S.el('input', { id: 'rm-comm', value: '65000:100', size: 18 });
      const res = S.el('div');
      const ctl = S.el('div', { class: 'row' }, S.el('label', { class: 'field', for: 'rm-pfx' }, '收到的前綴', pfx), S.el('label', { class: 'field', for: 'rm-comm' }, 'communities（空白分隔）', comm));
      [['10.20.30.0/24', '65000:100'], ['10.20.30.0/24', ''], ['10.20.30.128/25', '65000:100'], ['192.168.5.0/24', ''], ['192.168.0.0/16', ''], ['172.16.0.0/12', '65000:666']].forEach(([p, c]) => ctl.appendChild(S.el('button', { class: 'chip', style: 'align-self:flex-end', onclick: () => { pfx.value = p; comm.value = c; run(); } }, `${p}${c ? ' · ' + c : ''}`)));
      box.appendChild(ctl);
      box.appendChild(res);
      const ip2n = s => s.split('.').reduce((a, b) => a * 256 + (+b), 0);
      function plMatch(p) {
        const [a, l] = p.split('/'); const len = +l;
        const trace = [];
        for (const e of PL) {
          const [ea, el] = e.pfx.split('/'); const elen = +el;
          const m = elen === 0 ? 0 : Math.pow(2, 32) - Math.pow(2, 32 - elen);
          const inRange = Math.floor(ip2n(a) / Math.pow(2, 32 - elen)) === Math.floor(ip2n(ea) / Math.pow(2, 32 - elen)) && len >= elen;
          const lo = e.ge || (e.le ? elen : elen), hi = e.le || (e.ge ? 32 : elen);
          const lenOk = len >= lo && len <= hi;
          void m;
          if (inRange && lenOk) { trace.push(`seq ${e.seq}：符合（前綴在 ${e.pfx} 內，長度 /${len} 在 ${lo}–${hi}）→ <b>${e.act}</b>`); return [e.act === 'permit', trace]; }
          trace.push(`seq ${e.seq}：不符合（${!inRange ? '前綴不在 ' + e.pfx + ' 內' : '長度 /' + len + ' 不在 ' + lo + '–' + hi}）`);
        }
        trace.push('沒有項目符合 → 隱含 <b>deny</b>');
        return [false, trace];
      }
      function run() {
        const p = pfx.value.trim();
        if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(p)) { res.innerHTML = '<div class="log">請輸入 a.b.c.d/len 格式的前綴。</div>'; return; }
        const cs = comm.value.trim().split(/\s+/).filter(Boolean);
        const [plOk, plTrace] = plMatch(p);
        const lines = [];
        let result = null;
        for (const e of RM) {
          const conds = [];
          if (e.match.pl) conds.push([`prefix-list ${e.match.pl}`, plOk]);
          if (e.match.comm) conds.push([`community ${e.match.comm}`, cs.includes(e.match.comm)]);
          const ok = conds.every(c => c[1]);
          lines.push(`${e.act} ${e.seq}：${conds.map(c => `<span class="badge ${c[1] ? 'g' : 'r'}">${c[1] ? '✓' : '✗'} ${c[0]}</span>`).join(' ')} → ${ok ? '<b>符合</b>' : '不符合，繼續下一個 entry'}`);
          if (ok) { result = e; break; }
        }
        let out;
        if (!result) out = '所有 entry 都不符合 → 隱含 deny，<b>路由被拒絕</b>，不進入 BGP 表。';
        else if (result.act === 'deny') out = `entry ${result.seq} 為 deny → <b>路由被拒絕</b>。`;
        else {
          const newComm = result.set.comm ? [...cs, result.set.comm.split(' ')[0]] : cs;
          out = `entry ${result.seq} 為 permit → <b>路由被接受</b>：local-preference = ${result.set.lp || 100}${result.set.comm ? `，community = ${newComm.join(' ')}` : ''}。`;
        }
        res.innerHTML = `<div class="grid c2" style="margin-top:10px"><div class="log"><div class="w-label">prefix-list PL_DC 評估</div>${plTrace.map(t => `<div>${t}</div>`).join('')}</div><div class="log"><div class="w-label">route-map FROM_SPINE 評估</div>${lines.map(t => `<div>${t}</div>`).join('')}</div></div><div class="log" style="margin-top:10px">${out}</div>`;
      }
      pfx.addEventListener('change', run); comm.addEventListener('change', run);
      run();

      S.diagram(root.querySelector('#d-pbr'), {
        title: 'PBR 的設定與硬體實作',
        w: 1000, h: 300,
        nodes: [
          { id: 'cli', x: 20, y: 40, w: 200, h: 60, label: 'ACL / class-map', sub: '選取流量', kind: 'cli', info: '<p>以 ACL 或欄位比對定義要被導向的流量。</p>' },
          { id: 'pm', x: 270, y: 40, w: 200, h: 60, label: 'policy-map (forwarding)', sub: 'set ip next-hop', kind: 'cli', info: '<p>為每個 class 指定一個或多個下一跳（依 priority 選用），可指定 VRF。</p>' },
          { id: 'cfg', x: 520, y: 40, w: 200, h: 60, label: 'CONFIG_DB', sub: 'ACL / POLICY 表', kind: 'db', info: '<p>社群版為 ACL_RULE 的 <code>PACKET_ACTION: REDIRECT:&lt;ip&gt;</code>；Enterprise 另有 class / policy 相關表。</p>' },
          { id: 'orch', x: 770, y: 40, w: 210, h: 60, label: 'AclOrch / PolicyOrch', kind: 'proc', info: '<p>解析下一跳：向 NeighOrch 取得 NEXT_HOP 物件（多個時建立 NEXT_HOP_GROUP），再建立 ACL_ENTRY，action 為 REDIRECT 到該物件。</p>' },
          { id: 'nh', x: 520, y: 190, w: 200, h: 60, label: 'NeighOrch', sub: 'next hop 狀態', kind: 'proc', info: '<p>下一跳的 ARP 失效時通知，ACL 規則會改用備援下一跳，或暫時移除 redirect 讓流量回到一般路由。</p>' },
          { id: 'asic', x: 770, y: 190, w: 210, h: 60, label: 'ASIC ingress ACL', sub: 'redirect → NH / NHG', kind: 'hw', info: '<p>在入口 ACL 階段命中規則的封包直接轉送到指定下一跳，不經 LPM 查詢。</p>' },
        ],
        edges: [
          { from: 'cli', to: 'pm', id: 'e1' }, { from: 'pm', to: 'cfg', id: 'e2' }, { from: 'cfg', to: 'orch', id: 'e3' },
          { from: 'nh', to: 'orch', dash: true, label: 'NH 狀態', id: 'e4' }, { from: 'orch', to: 'asic', label: 'SAI ACL', id: 'e5' },
        ],
      });
    },
    searchText: 'prefix-list route-map community ge le permit deny redirect PBR',
    related: ['bgp', 'ospf', 'acl', 'vrf'],
    refs: [['FRR route-map 文件', 'https://docs.frrouting.org/en/latest/routemap.html'], ['SONiC PBH / PBR 相關 HLD', 'https://github.com/sonic-net/SONiC/tree/master/doc/pbh'], ['Enterprise SONiC User Guide UG460：§10.6.7、§10.10、§10.13', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
  });
})();
