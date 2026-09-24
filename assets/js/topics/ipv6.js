S.register({
  id: 'ipv6',
  category: 'l3',
  order: 2.5,
  title: 'IPv6、Neighbor Discovery 與 SLAAC',
  en: 'IPv6 Addressing, Neighbor Discovery, Router Advertisement & SLAAC',
  summary: 'IPv6 以 Neighbor Discovery（ICMPv6）取代 ARP，並以 Router Advertisement 讓主機自動取得前綴與預設閘道。SONiC 中 IPv6 鄰居與 IPv4 一樣由核心學習、經 neighsyncd 寫入 APPL_DB，再由 NeighOrch 下發到硬體；RA 由 radvd 送出。本章說明位址類型、EUI-64 介面 ID、NDP 訊息、DAD，以及硬體路由表對 IPv6 前綴的特殊考量。',
  meta: [
    ['程序', ['Linux 核心 NDP', 'neighsyncd → NeighOrch', 'radvd（radv 容器）', 'FRR zebra / bgpd']],
    ['APPL_DB', ['NEIGH_TABLE（family IPv6）', 'ROUTE_TABLE', 'INTF_TABLE']],
    ['協定', ['ICMPv6 RS 133 / RA 134 / NS 135 / NA 136 / Redirect 137', 'RFC 4861 NDP', 'RFC 4862 SLAAC', 'RFC 4291 位址架構']],
    ['Enterprise', ['ipv6 enable / address autoconfig / eui-64', 'ipv6 nd ra-*', 'ipv6 nd dad', 'SRv6 uSID']],
  ],
  tags: ['IPv6', 'NDP', 'Neighbor Discovery', 'ICMPv6', 'NS', 'NA', 'RS', 'RA', 'SLAAC', 'EUI-64', 'link-local', 'DAD', 'solicited-node', 'radvd', 'DHCPv6', 'SRv6', 'ND proxy'],
  keypoints: [
    '每個啟用 IPv6 的介面都有 fe80::/64 link-local 位址；路由協定（OSPFv3、BGP unnumbered）與 RA 的來源都使用 link-local。',
    'NS 送往 solicited-node 多播位址 ff02::1:ffXX:XXXX（取目標位址後 24 bits），只有後 24 bits 相同的主機會處理，比 ARP 廣播更有效率。',
    'SLAAC：主機從 RA 取得 /64 前綴，自行產生介面 ID；RA 的 M / O 旗標告訴主機是否另外使用 DHCPv6 取得位址或其他參數。',
    '每個新位址在使用前先做 DAD（送出以自己為目標的 NS）；收到回應代表重複，位址不會啟用。',
    '硬體路由表通常把 IPv6 前綴分成 ≤ /64 與 > /64 兩類，長前綴佔用較多資源；大量 IPv6 路由時需要調整 route-scale 設定。',
  ],
  html: `
<h2>架構</h2>
<div id="d-v6"></div>

<h2>位址類型</h2>
<table>
<thead><tr><th>類型</th><th>前綴</th><th>範圍</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Global unicast（GUA）</td><td>2000::/3</td><td>全域</td><td>公用位址</td></tr>
<tr><td>Unique local（ULA）</td><td>fc00::/7（實際使用 fd00::/8）</td><td>組織內</td><td>內部網路，不在網際網路路由</td></tr>
<tr><td>Link-local</td><td>fe80::/10</td><td>鏈路</td><td>NDP、路由協定鄰接、RA 來源；不會被轉送</td></tr>
<tr><td>Multicast</td><td>ff00::/8</td><td>依 scope</td><td>ff02::1 所有節點、ff02::2 所有路由器、ff02::1:ff00:0/104 solicited-node</td></tr>
<tr><td>Loopback / 未指定</td><td>::1 / ::</td><td>—</td><td>:: 用於 DAD 時的來源位址</td></tr>
</tbody></table>

<h2>EUI-64、solicited-node 與多播 MAC</h2>
<p>輸入介面 MAC 與前綴，逐步產生介面 ID、link-local 位址、SLAAC 位址，以及 NS 使用的 solicited-node 多播位址與其對應的乙太網路多播 MAC。</p>
<div id="eui"></div>

<h2>NDP 訊息</h2>
<table>
<thead><tr><th>訊息</th><th>類型</th><th>來源 → 目的</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Router Solicitation</td><td>133</td><td>主機 → ff02::2</td><td>開機時請路由器立即送 RA</td></tr>
<tr><td>Router Advertisement</td><td>134</td><td>路由器 link-local → ff02::1</td><td>前綴、MTU、預設路由存活時間、M / O 旗標</td></tr>
<tr><td>Neighbor Solicitation</td><td>135</td><td>→ solicited-node 或單播</td><td>位址解析、鄰居可達性確認、DAD</td></tr>
<tr><td>Neighbor Advertisement</td><td>136</td><td>→ 請求者或 ff02::1</td><td>回覆 MAC；R 旗標表示是路由器，O 旗標表示覆寫快取</td></tr>
<tr><td>Redirect</td><td>137</td><td>路由器 → 主機</td><td>告知更好的下一跳</td></tr>
</tbody></table>
<p>鄰居快取的狀態依序為 INCOMPLETE → REACHABLE → STALE → DELAY → PROBE。SONiC 中核心學到的鄰居由 neighsyncd 寫入 <code>APPL_DB NEIGH_TABLE</code>，NeighOrch 再建立 SAI NEIGHBOR_ENTRY 與 NEXT_HOP，與 <a href="#/neighbor">IPv4 ARP</a> 的流程相同。</p>

<h2>RA 旗標與位址取得方式</h2>
<table>
<thead><tr><th>RA 設定</th><th>主機行為</th></tr></thead>
<tbody>
<tr><td>前綴 A 旗標 = 1，M = 0，O = 0</td><td>只用 SLAAC；DNS 由 RA 的 RDNSS 選項提供</td></tr>
<tr><td>A = 1，O = 1</td><td>SLAAC 取得位址，stateless DHCPv6 取得 DNS 等參數</td></tr>
<tr><td>M = 1（通常 A = 0）</td><td>以 stateful DHCPv6 取得位址；交換機上以 DHCPv6 relay 轉送</td></tr>
<tr><td>Router lifetime = 0</td><td>不把此路由器當作預設閘道（只公告前綴）</td></tr>
</tbody></table>

<h2>DAD 與 ND proxy</h2>
<ul>
<li>DAD：以 <code>::</code> 為來源，向目標位址的 solicited-node 位址送 NS。等待期間位址為 tentative 狀態。<code>ipv6 nd dad disable-ipv6-on-dad-failure</code> 可在衝突時停用介面的 IPv6。</li>
<li>ND proxy：交換機代替其他主機回覆 NA，常見於 EVPN 的 neighbor suppression 與私有 VLAN，見 <a href="#/ip-services">IP 服務</a> 與 <a href="#/vxlan">VXLAN / EVPN</a>。</li>
</ul>

<h2>SRv6（Enterprise）</h2>
<p>Segment Routing over IPv6 以 IPv6 位址作為 segment ID（SID），封包的轉送路徑由來源節點寫入。Enterprise SONiC 支援 uSID（micro-SID，F3216 格式）：在交換機上定義 locator 前綴，並以 static SID 設定行為（例如 <code>un</code>），decap 時可選 DSCP 的 pipe 或 uniform 模式。</p>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config interface ip add Ethernet0 2001:db8:0:1::1/64
sudo config interface ipv6 enable use-link-local-only Ethernet4
show ipv6 interfaces
show ndp
ip -6 neigh show

<span class="c"># Enterprise SONiC</span>
sonic(config)# interface Eth1/8
sonic(config-if-Eth1/8)# ipv6 enable
sonic(config-if-Eth1/8)# ipv6 address 2001:db8:0:1::1/64
sonic(config-if-Eth1/8)# ipv6 address 2001:db8:0:2::/64 eui-64
sonic(config-if-Eth1/8)# ipv6 nd dad enable
sonic(config)# interface Vlan100
sonic(config-if-Vlan100)# ipv6 nd ra-interval msec 60000
sonic# show ipv6 nd ra-interfaces
sonic(config)# segment-routing
sonic(config-sr)# srv6
sonic(config-srv6)# locator L1
sonic(config-srv6-loc)# prefix fcbb:bbbb:1::/48
sonic(config-srv6-loc)# format usid-f3216</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-v6'), {
      title: 'RA 與 IPv6 鄰居學習',
      w: 1000, h: 340,
      nodes: [
        { id: 'host', x: 20, y: 60, w: 140, h: 56, label: '主機', sub: 'SLAAC · DHCPv6', kind: 'ext', info: '<p>收到 RA 後以前綴自行產生位址，或依 M / O 旗標改用 DHCPv6。</p>' },
        { id: 'asic', x: 260, y: 60, w: 150, h: 56, label: 'ASIC', sub: 'trap ICMPv6 ND', kind: 'hw', info: '<p>NS / NA / RS / RA 由 CoPP 規則 trap 到 CPU（neighbor_discovery、router advertisement 等 trap）。</p>' },
        { id: 'kern', x: 480, y: 60, w: 180, h: 56, label: 'Linux 核心', sub: 'NDP 鄰居快取', kind: 'kernel', info: '<p>處理 NS / NA、DAD，並維護鄰居狀態；變更以 netlink 通知。</p>' },
        { id: 'radvd', x: 480, y: 200, w: 180, h: 56, label: 'radvd', sub: 'radv 容器', kind: 'proc', info: '<p>依介面的 IPv6 前綴定期送出 RA，並回應 RS。</p>' },
        { id: 'ns', x: 720, y: 60, w: 160, h: 56, label: 'neighsyncd', sub: '(swss)', kind: 'proc', info: '<p>把核心的 IPv6 鄰居寫入 APPL_DB NEIGH_TABLE。</p>' },
        { id: 'no', x: 720, y: 200, w: 160, h: 56, label: 'NeighOrch', sub: '(orchagent)', kind: 'proc', info: '<p>建立 SAI NEIGHBOR_ENTRY 與 NEXT_HOP，讓路由可以指向此鄰居。</p>' },
      ],
      edges: [
        { from: 'host', to: 'asic', label: 'NS / NA / RS', id: 'e1', bi: true },
        { from: 'asic', to: 'kern', label: 'trap', id: 'e2' },
        { from: 'kern', to: 'ns', label: 'netlink', id: 'e3' },
        { from: 'ns', to: 'no', label: 'APPL_DB', id: 'e4' },
        { from: 'no', to: 'asic', label: 'SAI', id: 'e5', via: [[800, 300], [335, 300]] },
        { from: 'radvd', to: 'host', dash: true, label: 'RA（前綴 · M/O 旗標）', id: 'e6', via: [[90, 228]] },
      ],
      steps: [
        { title: 'Router Advertisement', text: 'radvd 定期或在收到 RS 時送出 RA，主機取得前綴與預設閘道。', nodes: ['radvd', 'host'], edges: ['e6'] },
        { title: '位址解析', text: 'NS / NA 被 trap 到 CPU，由核心更新鄰居快取。', nodes: ['host', 'asic', 'kern'], edges: ['e1', 'e2'] },
        { title: '寫入硬體', text: 'neighsyncd 把鄰居同步到 APPL_DB，NeighOrch 建立 SAI 鄰居與 next hop。', nodes: ['kern', 'ns', 'no', 'asic'], edges: ['e3', 'e4', 'e5'] },
      ],
    });

    const host = root.querySelector('#eui');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { mac: '3c:2c:30:12:34:56', prefix: '2001:db8:0:100::/64', addr: '' };
    const g = S.el('div', { class: 'grid c3' });
    [['mac', '介面 MAC'], ['prefix', '/64 前綴（取自 RA）']].forEach(([k, l]) => {
      const inp = S.el('input', { type: 'text', value: P[k], spellcheck: 'false' });
      inp.addEventListener('input', () => { P[k] = inp.value.trim(); draw(); });
      g.appendChild(S.el('label', { class: 'field' }, l, inp));
    });
    box.appendChild(g);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);
    const hex2 = n => n.toString(16).padStart(2, '0');
    function expand(p) {
      const a = p.split('/')[0].toLowerCase();
      if (!/^[0-9a-f:]+$/.test(a) || (a.match(/::/g) || []).length > 1) return null;
      let [h, t] = a.split('::');
      let hs = h ? h.split(':') : [], ts = t != null && t !== '' ? t.split(':') : [];
      if (t == null && hs.length !== 8) return null;
      const fill = 8 - hs.length - ts.length;
      if (fill < 0) return null;
      const g = hs.concat(Array(t == null ? 0 : fill).fill('0'), ts);
      if (g.length !== 8 || g.some(x => x.length > 4 || x === '')) return null;
      return g.map(x => parseInt(x, 16));
    }
    const fmt = g => {
      const s = g.map(x => x.toString(16));
      let best = [-1, 0];
      for (let i = 0; i < 8;) { if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > best[1] && j - i > 1) best = [i, j - i]; i = j; } else i++; }
      if (best[0] < 0) return s.join(':');
      return s.slice(0, best[0]).join(':') + '::' + s.slice(best[0] + best[1]).join(':');
    };
    function draw() {
      const m = P.mac.toLowerCase().replace(/[-.]/g, ':');
      const b = m.split(':').length === 6 ? m.split(':').map(x => parseInt(x, 16)) : (m.replace(/:/g, '').length === 12 ? m.replace(/:/g, '').match(/../g).map(x => parseInt(x, 16)) : null);
      const pre = expand(P.prefix);
      if (!b || b.some(isNaN) || !pre) { out.innerHTML = '<div class="log">請輸入有效的 MAC（例如 3c:2c:30:12:34:56）與 IPv6 前綴。</div>'; return; }
      const flipped = b[0] ^ 0x02;
      const eui = [flipped, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
      const iid = [0, 2, 4, 6].map(i => (eui[i] << 8) | eui[i + 1]);
      const ll = fmt([0xfe80, 0, 0, 0].concat(iid));
      const gua = fmt(pre.slice(0, 4).concat(iid));
      const last24 = [b[3], b[4], b[5]];
      const sn = fmt([0xff02, 0, 0, 0, 0, 1, 0xff00 | last24[0], (last24[1] << 8) | last24[2]]);
      const mmac = ['33', '33', 'ff'].concat(last24.map(hex2)).join(':');
      const bits = n => n.toString(2).padStart(8, '0');
      out.innerHTML = `<table><thead><tr><th>步驟</th><th>結果</th><th>說明</th></tr></thead><tbody>
        <tr><td>1. 拆開 MAC</td><td><code>${b.slice(0, 3).map(hex2).join(':')} | ${b.slice(3).map(hex2).join(':')}</code></td><td>OUI（前 24 bits）與設備部分</td></tr>
        <tr><td>2. 中間插入 FFFE</td><td><code>${b.slice(0, 3).map(hex2).join('')}<b>fffe</b>${b.slice(3).map(hex2).join('')}</code></td><td>48 bits 擴充為 64 bits</td></tr>
        <tr><td>3. 反轉 U/L bit</td><td><code>${bits(b[0])} → ${bits(flipped)}</code></td><td>第一個 byte 的第 7 bit（0x02）；${hex2(b[0])} → ${hex2(flipped)}</td></tr>
        <tr><td>介面 ID</td><td><code>${iid.map(x => x.toString(16)).join(':')}</code></td><td>modified EUI-64</td></tr>
        <tr><td>Link-local</td><td><code>${ll}</code></td><td>fe80::/64 + 介面 ID</td></tr>
        <tr><td>SLAAC 位址</td><td><code>${gua}</code></td><td>RA 前綴 + 介面 ID（主機常改用隱私位址，RFC 8981）</td></tr>
        <tr><td>Solicited-node</td><td><code>${sn}</code></td><td>ff02::1:ff + 位址後 24 bits；NS 與 DAD 送往此位址</td></tr>
        <tr><td>多播 MAC</td><td><code>${mmac}</code></td><td>33:33 + 多播位址後 32 bits；NIC 只接收自己加入的群組</td></tr>
      </tbody></table>`;
    }
    draw();
  },
  searchText: 'fe80 link-local ff02::1 ff02::2 solicited-node 33:33 EUI-64 FFFE U/L bit Router Advertisement Router Solicitation Neighbor Solicitation Neighbor Advertisement DAD tentative SLAAC DHCPv6 M flag O flag RDNSS radvd neighsyncd NEIGH_TABLE use-link-local-only SRv6 uSID locator',
  related: ['neighbor', 'ip-services', 'routing', 'bgp', 'vxlan'],
  refs: [['RFC 4291 IPv6 Addressing Architecture', 'https://www.rfc-editor.org/rfc/rfc4291'], ['RFC 4861 Neighbor Discovery', 'https://www.rfc-editor.org/rfc/rfc4861'], ['RFC 4862 SLAAC', 'https://www.rfc-editor.org/rfc/rfc4862'], ['Enterprise SONiC User Guide UG460：§10.2–10.3', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
