S.register({
  id: 'ecmp',
  category: 'l3',
  order: 5.5,
  title: 'ECMP Hash、UCMP 與 Adaptive Routing',
  en: 'ECMP Hashing, Polarization, UCMP & Adaptive Routing and Switching',
  summary: 'ECMP 讓同一個前綴的流量分散到多個下一跳，分散的品質取決於 hash 欄位、演算法與 seed。本章說明硬體 hash 的設定、多層 Clos 中的 hash polarization、成員增減時的 resilient hashing、依鏈路頻寬分配權重的 UCMP，以及依即時負載選路的 ARS（Adaptive Routing and Switching）。',
  meta: [
    ['SAI', ['NEXT_HOP_GROUP / NEXT_HOP_GROUP_MEMBER（weight）', 'SWITCH_ATTR_ECMP_DEFAULT_HASH_*', 'HASH_ATTR_NATIVE_HASH_FIELD_LIST', 'ARS / ARS_PROFILE']],
    ['CONFIG_DB（社群版）', ['SWITCH_HASH|GLOBAL（ecmp_hash、lag_hash、*_hash_algorithm）']],
    ['Enterprise CLI', ['ip load-share hash …', 'bestpath bandwidth', 'set extcommunity bandwidth', 'ars profile / port-profile / object']],
    ['相關 RFC / 草案', ['RFC 2992 ECMP 分析', 'draft-ietf-idr-link-bandwidth']],
  ],
  tags: ['ECMP', 'hash', 'load balancing', 'polarization', 'hash seed', 'symmetric hash', 'resilient hashing', 'UCMP', 'link bandwidth', 'weighted ECMP', 'ARS', 'adaptive routing', 'flowlet', 'next hop group', 'RoCE QPN'],
  keypoints: [
    'ECMP 以「流」為單位分散：同一個五元組永遠 hash 到同一個成員，避免亂序；因此少數大流（elephant flow）仍可能讓某條鏈路過載。',
    '多層網路若每一層使用相同的 hash 演算法與 seed，上一層已依 hash 值分群的流量到下一層會再得到相同結果，只用到部分鏈路，這就是 hash polarization；不同層使用不同 seed 或 offset 可避免。',
    'symmetric hash 讓來回方向（交換來源與目的）得到相同結果，適用於需要看到雙向流量的防火牆或負載平衡器。',
    'UCMP 依權重分配：BGP 可以用 link-bandwidth extended community 攜帶下游頻寬，交換機依比例設定 NEXT_HOP_GROUP_MEMBER 的 weight。',
    'ARS 在 flowlet（流中的間隔）邊界依各 port 的即時負載重新選路，可以改善大流造成的不均，但需要 ASIC 支援。',
  ],
  html: `
<h2>架構</h2>
<div id="d-ecmp"></div>

<h2>Hash 欄位與演算法</h2>
<table>
<thead><tr><th>項目</th><th>選項</th><th>說明</th></tr></thead>
<tbody>
<tr><td>IPv4 欄位</td><td>src-ip、dst-ip、ip-proto、l4-src-port、l4-dst-port</td><td>預設通常是五元組</td></tr>
<tr><td>IPv6 欄位</td><td>src-ip、dst-ip、next-header、l4 ports（部分平台含 flow label）</td><td></td></tr>
<tr><td>其他</td><td>ingress-port、inner header（VXLAN 內層）、UDF</td><td>UDF 可取封包任意位移的欄位，例如 RoCE 的 QPN</td></tr>
<tr><td>演算法</td><td>CRC、XOR、CRC_32LO / 32HI、CRC_CCITT、JENKINS_HASH…</td><td>依平台而定</td></tr>
<tr><td>seed / offset</td><td>數值</td><td>改變 hash 結果以避免 polarization；offset 選擇 hash 輸出的哪一段 bits</td></tr>
<tr><td>symmetric</td><td>on / off</td><td>來回方向得到相同成員</td></tr>
</tbody></table>
<p>RoCEv2 流量的五元組幾乎相同（UDP 目的 port 固定 4791，來源 port 變化有限），加入 QPN（queue pair number）可讓不同 QP 分散到不同鏈路，見 <a href="#/roce">RoCE</a>。</p>

<h2>Hash polarization</h2>
<p>Leaf 有兩條上聯到 Spine-A、Spine-B，每台 Spine 各有兩條鏈路到上一層。256 條流先在 leaf hash 一次，再在 spine hash 一次。比較兩層使用相同或不同 seed 時，spine 上聯的使用情形。</p>
<div id="pol"></div>

<h2>成員變動與 resilient hashing</h2>
<p>一般 ECMP 以「hash mod 成員數」選擇成員，成員數改變時大部分流量會換路徑，TCP 可能亂序、有狀態的服務（負載平衡器、防火牆）會斷線。Resilient hashing 使用固定大小的 bucket 表，成員失效時只把它的 bucket 分給其他成員，其餘流量不動。互動示範見 <a href="#/routing">路由架構</a> 的 ECMP 一節。</p>

<h2>UCMP：依頻寬加權</h2>
<p>三台 spine 到目的地的可用頻寬不同。以 BGP link-bandwidth 攜帶頻寬後，leaf 依比例設定權重。硬體的 next hop group 成員數有限，權重會被正規化到可用的成員數。</p>
<div id="ucmp"></div>

<h2>ARS（Adaptive Routing and Switching）</h2>
<table>
<thead><tr><th>元素</th><th>說明</th></tr></thead>
<tbody>
<tr><td>Flowlet</td><td>同一條流中，封包間隔超過 idle time 的片段。在 flowlet 邊界換路徑不會造成亂序（前一段已送達）</td></tr>
<tr><td>Port quality</td><td>依過去負載、未來負載（佇列深度）與目前負載計算，各有權重與上下限；可用 EWMA 平滑</td></tr>
<tr><td>ARS profile</td><td>全域的取樣間隔、演算法與品質參數</td></tr>
<tr><td>ARS port profile</td><td>套用到 port，設定負載比例因子與權重</td></tr>
<tr><td>ARS object</td><td>由 route-map 的 <code>set ars-object</code> 指定哪些路由使用 ARS</td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># 社群版（202311 之後，視平台支援）</span>
sudo config switch-hash global ecmp-hash SRC_IP DST_IP IP_PROTOCOL L4_SRC_PORT L4_DST_PORT
sudo config switch-hash global ecmp-hash-algorithm CRC
show switch-hash global

<span class="c"># Enterprise SONiC：hash</span>
sonic(config)# ip load-share hash ipv4 ipv4-src-ip
sonic(config)# ip load-share hash ipv4 ipv4-dst-ip
sonic(config)# ip load-share hash ipv4 symmetric
sonic(config)# ip load-share hash seed 12
sonic(config)# ip load-share hash offset flow-based
sonic(config)# ip load-share hash algorithm JENKINS_HASH_LO
sonic(config)# ip load-share hash roce qpn
sonic# show ip load-share

<span class="c"># Enterprise SONiC：UCMP</span>
sonic(config)# route-map SET-BW permit 10
sonic(config-route-map)# set extcommunity bandwidth num-multipaths
sonic(config)# router bgp 65101
sonic(config-router-bgp)# bestpath bandwidth skip-missing
sonic(config)# ip route 10.200.0.0/16 10.1.1.1 weight 2

<span class="c"># Enterprise SONiC：ARS</span>
sonic(config)# ars profile default
sonic(config-ars-profile-default)# algo EWMA
sonic(config)# ars port-profile uplink
sonic(config-ars-port-profile)# enable
sonic(config)# interface Eth1/49
sonic(config-if-Eth1/49)# ars bind uplink
sonic(config)# ars object gpu-fabric
sonic(config)# route-map ARS-MAP permit 10
sonic(config-route-map)# set ars-object gpu-fabric
sonic(config)# ip protocol any route-map ARS-MAP</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-ecmp'), {
      title: 'ECMP 路由到硬體 next hop group',
      w: 1000, h: 330,
      nodes: [
        { id: 'bgp', x: 20, y: 40, w: 150, h: 56, label: 'bgpd', sub: 'multipath · link-bw', kind: 'proc', info: '<p>多條等價路徑（maximum-paths）；UCMP 時以 link-bandwidth extended community 計算權重。</p>' },
        { id: 'zebra', x: 210, y: 40, w: 150, h: 56, label: 'zebra', sub: 'nexthop group', kind: 'proc', info: '<p>選出最佳路由與其 next hop 集合（含權重），交給 fpmsyncd。</p>' },
        { id: 'fpm', x: 400, y: 40, w: 140, h: 56, label: 'fpmsyncd', kind: 'proc' },
        { id: 'ro', x: 640, y: 40, w: 150, h: 56, label: 'RouteOrch', sub: 'NhgOrch', kind: 'proc', info: '<p>相同的 next hop 集合共用一個 NEXT_HOP_GROUP；成員的 weight 屬性實作 UCMP。group 數量受 CRM 的 nexthop_group 資源限制。</p>' },
        { id: 'hash', x: 830, y: 40, w: 150, h: 56, label: 'SwitchOrch', sub: 'hash 欄位 · 演算法', kind: 'proc', info: '<p>社群版由 SWITCH_HASH 表設定 SAI 的 ECMP / LAG hash 物件。</p>' },
        { id: 'asic', x: 360, y: 210, w: 300, h: 80, label: 'ASIC', sub: 'LPM → NHG → hash → member', kind: 'hw', info: '<p>查到路由後得到 NHG，依封包欄位計算 hash，選出成員（或 ARS 依負載選擇），再查鄰居 MAC 送出。</p>' },
      ],
      edges: [
        { from: 'bgp', to: 'zebra', id: 'e1' }, { from: 'zebra', to: 'fpm', id: 'e2' },
        { from: 'fpm', to: 'ro', label: 'ROUTE_TABLE', id: 'e3' },
        { from: 'ro', to: 'asic', label: 'NEXT_HOP_GROUP', id: 'e4' },
        { from: 'hash', to: 'asic', label: 'hash 設定', id: 'e5', dash: true },
      ],
      steps: [
        { title: '多路徑路由', text: 'bgpd 選出多條路徑，zebra 形成 next hop 集合，經 fpmsyncd 寫入 APPL_DB。', nodes: ['bgp', 'zebra', 'fpm'], edges: ['e1', 'e2'] },
        { title: 'Next hop group', text: 'RouteOrch 建立或重用 NEXT_HOP_GROUP，路由指向該 group。', nodes: ['fpm', 'ro', 'asic'], edges: ['e3', 'e4'] },
        { title: 'Hash', text: '硬體依設定的欄位、演算法與 seed 計算 hash，在 group 成員中選擇。', nodes: ['hash', 'asic'], edges: ['e5'] },
      ],
    });

    // ---------- Polarization ----------
    const host = root.querySelector('#pol');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { mode: 0 };
    const sh = S.el('span');
    box.appendChild(S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, 'Spine 的 hash'), sh));
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);
    const flows = [];
    let r = 12345;
    const rnd = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0);
    for (let i = 0; i < 256; i++) flows.push(`10.1.${rnd() % 256}.${rnd() % 256}|10.9.${rnd() % 256}.${rnd() % 256}|6|${1024 + rnd() % 60000}|${[80, 443, 8080, 5201][rnd() % 4]}`);
    const H = (seed, s) => { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };
    S.seg(sh, ['與 leaf 相同 seed', '不同 seed', '相同 seed，不同 offset'], i => { P.mode = i; draw(); }, 0);
    function draw() {
      const cnt = { A: [0, 0], B: [0, 0] };
      flows.forEach(f => {
        const h1 = H(7, f);
        const sp = h1 % 2 === 0 ? 'A' : 'B';
        const h2 = P.mode === 1 ? H(99, f) : H(7, f);
        const pick = P.mode === 2 ? (h2 >>> 8) % 2 : h2 % 2;
        cnt[sp][pick]++;
      });
      const bar = (n) => `<div class="meter" style="height:10px;margin-top:4px"><i style="width:${Math.min(100, n / 128 * 100)}%"></i></div>`;
      const cell = (sp, i) => `<div><div class="pl">Spine-${sp} 上聯 ${i + 1}</div><div class="pv">${cnt[sp][i]} 條流</div>${bar(cnt[sp][i])}</div>`;
      const pol = cnt.A.includes(0) || cnt.B.includes(0);
      out.innerHTML = `<div class="pipe"><div><div class="pl">Leaf → Spine-A</div><div class="pv">${cnt.A[0] + cnt.A[1]} 條流</div></div><div><div class="pl">Leaf → Spine-B</div><div class="pv">${cnt.B[0] + cnt.B[1]} 條流</div></div></div>
        <div class="pipe">${cell('A', 0)}${cell('A', 1)}${cell('B', 0)}${cell('B', 1)}</div>
        <div class="log">${pol ? 'Spine-A 收到的全是 leaf 上「hash 為偶數」的流，用同樣的函式再算一次仍是偶數，所以全部擠到同一條上聯，另一條閒置。這就是 polarization：可用頻寬只剩一半。' : P.mode === 1 ? 'Spine 使用不同 seed，hash 結果與 leaf 的選擇無關，兩條上聯大致平均。' : '相同 seed，但 spine 取 hash 輸出的另一段 bits（offset），結果與 leaf 所用的最低 bit 無關，流量恢復平均。'}</div>`;
    }
    draw();

    // ---------- UCMP ----------
    const uh = root.querySelector('#ucmp');
    const ubox = S.el('div', { class: 'w-box' });
    uh.appendChild(ubox);
    const U = { a: 400, b: 200, c: 100, max: 16 };
    const g = S.el('div', { class: 'grid c3' });
    [['a', 'Spine-1 頻寬 (Gbps)'], ['b', 'Spine-2 頻寬 (Gbps)'], ['c', 'Spine-3 頻寬 (Gbps)'], ['max', 'NHG 可用成員數']].forEach(([k, l]) => {
      const inp = S.el('input', { type: 'number', value: U[k], min: 1 });
      inp.addEventListener('input', () => { U[k] = Math.max(1, +inp.value || 1); udraw(); });
      g.appendChild(S.el('label', { class: 'field' }, l, inp));
    });
    ubox.appendChild(g);
    const uo = S.el('div', { style: 'margin-top:12px' });
    ubox.appendChild(uo);
    function udraw() {
      const bw = [U.a, U.b, U.c], tot = bw.reduce((x, y) => x + y, 0);
      let w = bw.map(b => Math.max(1, Math.floor(b / tot * U.max)));
      let left = U.max - w.reduce((x, y) => x + y, 0);
      const rem = bw.map((b, i) => [b / tot * U.max - w[i], i]).sort((x, y) => y[0] - x[0]);
      for (let k = 0; left > 0 && k < rem.length; k++, left--) w[rem[k][1]]++;
      const wt = w.reduce((x, y) => x + y, 0);
      uo.innerHTML = `<div class="tbl"><table><thead><tr><th>下一跳</th><th>頻寬</th><th>理想比例</th><th>成員數（weight）</th><th>實際比例</th><th>ECMP 平均分配</th></tr></thead><tbody>${bw.map((b, i) => `<tr><td>Spine-${i + 1}</td><td>${b} G</td><td>${(b / tot * 100).toFixed(1)}%</td><td>${w[i]}</td><td>${(w[i] / wt * 100).toFixed(1)}%</td><td>${(100 / 3).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>
        <div class="log">若以 ECMP 平均分配，Spine-3 會承受 ${(100 / 3).toFixed(1)}% 的流量，但只有 ${(U.c / tot * 100).toFixed(1)}% 的頻寬，${U.c / tot < 1 / 3 ? '在總流量達到 ' + (U.c * 3) + ' Gbps 時就會壅塞。' : '仍在容量內。'} UCMP 以 ${U.max} 個成員近似頻寬比例，成員數越多越精確，但會消耗更多硬體資源。</div>`;
    }
    udraw();
  },
  searchText: 'ip load-share hash seed offset symmetric algorithm CRC XOR JENKINS polarization resilient hashing UCMP link bandwidth extcommunity bestpath bandwidth weight NEXT_HOP_GROUP_MEMBER ARS flowlet EWMA ars profile port-profile ars object SWITCH_HASH ecmp_hash QPN UDF',
  related: ['routing', 'bgp', 'design', 'roce', 'lag'],
  refs: [['RFC 2992 Analysis of an Equal-Cost Multi-Path Algorithm', 'https://www.rfc-editor.org/rfc/rfc2992'], ['draft-ietf-bess-ebgp-dmz（link bandwidth）', 'https://datatracker.ietf.org/doc/draft-ietf-bess-ebgp-dmz/'], ['SONiC Generic Hash HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/hash/hash-design.md'], ['Enterprise SONiC User Guide UG460：§10.16、Ch.11', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
