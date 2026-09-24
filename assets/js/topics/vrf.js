S.register({
  id: 'vrf',
  category: 'l3',
  order: 2,
  title: 'VRF、L3 介面與子介面',
  en: 'VRF, Routed Interfaces & Subinterfaces',
  summary: 'VRF 讓一台交換機維護多張互相隔離的路由表。SONiC 以 Linux VRF（l3mdev）在 kernel 表示 VRF，以 SAI VIRTUAL_ROUTER 在 ASIC 表示；L3 介面、VLAN 介面、子介面都是綁定到某個 VRF 的 router interface。',
  meta: [
    ['程序', ['vrfmgrd', 'intfmgrd', 'orchagent (VRFOrch, IntfsOrch)', 'zebra (VRF-lite)']],
    ['CONFIG_DB', ['VRF', 'INTERFACE (vrf_name)', 'VLAN_INTERFACE', 'PORTCHANNEL_INTERFACE', 'VLAN_SUB_INTERFACE', 'LOOPBACK_INTERFACE', 'MGMT_VRF_CONFIG']],
    ['APPL_DB', ['VRF_TABLE', 'INTF_TABLE', 'ROUTE_TABLE:<vrf>:<prefix>']],
    ['SAI 物件', ['VIRTUAL_ROUTER', 'ROUTER_INTERFACE (PORT / VLAN / SUB_PORT / LOOPBACK)']],
    ['kernel', ['ip link add Vrf_red type vrf table 1001', 'ip link set Ethernet4 master Vrf_red']],
  ],
  tags: ['VRF', 'VRF-lite', 'l3mdev', 'virtual router', 'router interface', 'RIF', 'subinterface', 'dot1q', 'management VRF', 'IPv6', 'loopback', 'route leaking'],
  keypoints: [
    '每個 VRF 在 kernel 是一個 l3mdev 裝置並對應一個路由表 ID，在 ASIC 是一個 SAI VIRTUAL_ROUTER；default VRF 在開機時就已存在。',
    'L3 介面（port、LAG、VLAN、子介面、loopback）綁定 VRF 後，其 RIF 的 VIRTUAL_ROUTER_ID 指向該 VRF，路由查詢也只在該 VRF 中進行。',
    'APPL_DB 中非 default VRF 的路由 key 含 VRF 名稱，例如 ROUTE_TABLE:Vrf_red:10.0.0.0/24。',
    '子介面以 802.1Q 標籤把一個實體 port 切成多個 L3 介面，SAI 以 SUB_PORT 類型的 RIF 表示。',
    'Management VRF 把 eth0 放進獨立的 mgmt VRF，使管理流量與資料平面路由隔離。',
  ],
  html: `
<h2>VRF 的兩種表示</h2>
<div id="d-vrf"></div>

<h2>VRF 查表模擬</h2>
<p>兩個 VRF 使用重疊的位址空間。選擇封包進入的介面與目的 IP，觀察使用哪一張路由表以及查表結果。</p>
<div id="lookup"></div>

<h2>L3 介面類型</h2>
<table>
<thead><tr><th>類型</th><th>CONFIG_DB</th><th>kernel netdev</th><th>SAI RIF 類型</th></tr></thead>
<tbody>
<tr><td>Routed port</td><td><code>INTERFACE|Ethernet0|10.0.0.0/31</code></td><td><code>Ethernet0</code></td><td><code>SAI_ROUTER_INTERFACE_TYPE_PORT</code></td></tr>
<tr><td>Port channel</td><td><code>PORTCHANNEL_INTERFACE|PortChannel1|…</code></td><td><code>PortChannel1</code>（team）</td><td>PORT（PORT_ID 指向 LAG）</td></tr>
<tr><td>VLAN 介面（SVI）</td><td><code>VLAN_INTERFACE|Vlan100|…</code></td><td><code>Vlan100</code></td><td><code>SAI_ROUTER_INTERFACE_TYPE_VLAN</code></td></tr>
<tr><td>子介面</td><td><code>VLAN_SUB_INTERFACE|Ethernet4.10|…</code></td><td><code>Eth4.10</code>（VLAN netdev）</td><td><code>SAI_ROUTER_INTERFACE_TYPE_SUB_PORT</code> + OUTER_VLAN_ID</td></tr>
<tr><td>Loopback</td><td><code>LOOPBACK_INTERFACE|Loopback0|…</code></td><td><code>Loopback0</code>（dummy）</td><td>不建立 RIF，只加 ip2me /32 路由</td></tr>
</tbody></table>
<div class="callout"><div class="ct">子介面名稱</div><p>Linux netdev 名稱最長 15 個字元，因此 SONiC 在 kernel 中使用縮寫（<code>Ethernet64.100</code> → <code>Eth64.100</code>、<code>PortChannel1.10</code> → <code>Po1.10</code>）。CONFIG_DB 仍可使用完整名稱。</p></div>

<h2>IPv6 位址</h2>
<ul>
<li>介面啟用 IPv6（<code>ipv6 enable</code>）後自動產生 link-local 位址（fe80::/64，由 MAC 以 EUI-64 或隨機方式產生），unnumbered BGP 依賴它建立 session。</li>
<li>全域位址以 <code>INTERFACE|Ethernet0|2001:db8::1/64</code> 設定，IntfsOrch 建立 subnet 路由與 ip2me /128 路由。</li>
<li>鄰居解析使用 NDP（ICMPv6 NS / NA），流程與 ARP 相同：kernel → neighsyncd → NEIGH_TABLE → NeighOrch。</li>
<li>Router Advertisement 由 radv 容器的 radvd 送出，設定來自 CONFIG_DB（VLAN_INTERFACE 的 IPv6 前綴）。</li>
</ul>

<h2>Management VRF</h2>
<p>啟用後，eth0 被移入名為 <code>mgmt</code> 的 VRF。管理服務（SSH、SNMP、NTP、TACACS、syslog）改在 mgmt VRF 中運作，資料平面的 default VRF 路由不會影響管理連線，反之亦然。</p>
<pre><span class="c"># 社群版</span>
sudo config vrf add_vrf_management       <span class="c"># CONFIG_DB MGMT_VRF_CONFIG|vrf_global mgmtVrfEnabled=true</span>
show mgmt-vrf
ip vrf exec mgmt ping 10.250.0.1
<span class="c"># Enterprise SONiC</span>
sonic(config)# ip vrf mgmt
sonic# show ip vrf mgmt</pre>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config vrf add Vrf_red
sudo config interface vrf bind Ethernet4 Vrf_red
sudo config interface ip add Ethernet4 10.0.0.0/31
sudo config subinterface add Ethernet8.10 10
sudo config interface ip add Ethernet8.10 10.0.1.0/31
show vrf
show ip route vrf Vrf_red

<span class="c"># Enterprise SONiC</span>
sonic(config)# ip vrf Vrf_red
sonic(config)# interface Eth1/4
sonic(config-if-Eth1/4)# ip vrf forwarding Vrf_red
sonic(config-if-Eth1/4)# ip address 10.0.0.0/31
sonic(config)# interface Eth1/8.10
sonic(config-subif-Eth1/8.10)# encapsulation dot1q vlan-id 10
sonic(config-subif-Eth1/8.10)# ip vrf forwarding Vrf_red
sonic(config-subif-Eth1/8.10)# ip address 10.0.1.0/31
sonic(config)# ip route vrf Vrf_red 10.10.10.0/24 10.0.0.1
sonic(config)# router bgp 65100 vrf Vrf_red
sonic# show ip vrf
sonic# show ip route vrf Vrf_red</pre>

<h2>VRF 間的路由互通</h2>
<table>
<thead><tr><th>方式</th><th>說明</th></tr></thead>
<tbody>
<tr><td>靜態路由 + nexthop-vrf</td><td><code>ip route vrf Vrf_red 0.0.0.0/0 10.0.0.1 nexthop-vrf default</code>；社群版以 STATIC_ROUTE 的 <code>nexthop-vrf</code> 欄位表示</td></tr>
<tr><td>BGP import vrf</td><td>在 VRF 的 address family 中 <code>import vrf default</code>，搭配 route-map 過濾</td></tr>
<tr><td>EVPN route target</td><td>以 route target 匯入 / 匯出，常見於 L3 VNI 的多租戶環境（見 VXLAN 章）</td></tr>
</tbody></table>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-vrf'), {
      title: 'VRF 的設定與下發',
      w: 1000, h: 380,
      groups: [{ x: 16, y: 170, w: 460, h: 190, label: 'Linux kernel', kind: 'kernel' }, { x: 524, y: 170, w: 460, h: 190, label: 'ASIC（SAI 物件）', kind: 'hw' }],
      nodes: [
        { id: 'cfg', x: 20, y: 40, w: 190, h: 60, label: 'CONFIG_DB', sub: 'VRF / INTERFACE vrf_name', kind: 'db', info: '<p><code>VRF|Vrf_red</code>、<code>INTERFACE|Ethernet4 {vrf_name: Vrf_red}</code>、<code>INTERFACE|Ethernet4|10.0.0.0/31</code>。</p>' },
        { id: 'vm', x: 260, y: 40, w: 150, h: 60, label: 'vrfmgrd', kind: 'proc', info: '<p>為每個 VRF 分配路由表 ID（從 1001 起），執行 <code>ip link add Vrf_red type vrf table 1001</code> 並 up，寫入 APPL_DB <code>VRF_TABLE:Vrf_red</code> 與 STATE_DB 狀態。</p>' },
        { id: 'im', x: 440, y: 40, w: 150, h: 60, label: 'intfmgrd', kind: 'proc', info: '<p>等 VRF 就緒後，把介面加入 VRF（<code>ip link set Ethernet4 master Vrf_red</code>）再設定 IP，並寫入 APPL_DB <code>INTF_TABLE:Ethernet4 {vrf_name}</code>。</p>' },
        { id: 'appl', x: 620, y: 40, w: 150, h: 60, label: 'APPL_DB', sub: 'VRF_TABLE / INTF_TABLE', kind: 'db', info: '<p>orchagent 的輸入。</p>' },
        { id: 'orch', x: 800, y: 40, w: 180, h: 60, label: 'VRFOrch / IntfsOrch', kind: 'proc', info: '<p>VRFOrch 建立 VIRTUAL_ROUTER；IntfsOrch 建立 RIF 並指定 VIRTUAL_ROUTER_ID；RouteOrch 依 ROUTE_TABLE key 中的 VRF 名稱把路由放入對應的 VR。</p>' },
        { id: 'kv', x: 40, y: 210, w: 190, h: 56, label: 'Vrf_red (l3mdev)', sub: 'table 1001', kind: 'kernel', info: '<p>kernel 依 l3mdev 規則把 Vrf_red 成員介面的流量導到 table 1001 查詢。</p>' },
        { id: 'kt', x: 260, y: 210, w: 190, h: 56, label: 'Ethernet4', sub: 'master Vrf_red', kind: 'kernel', info: '<p>成員介面。</p>' },
        { id: 'fr', x: 40, y: 290, w: 410, h: 50, label: 'zebra / bgpd：vrf Vrf_red（VRF-lite）', kind: 'proc', info: '<p>FRR 依 Linux VRF 建立對應的 VRF 實例；<code>router bgp 65100 vrf Vrf_red</code> 的路由經 fpmsyncd 以 <code>ROUTE_TABLE:Vrf_red:prefix</code> 寫入 APPL_DB。</p>' },
        { id: 'svr', x: 544, y: 210, w: 200, h: 56, label: 'VIRTUAL_ROUTER', sub: 'Vrf_red', kind: 'hw', info: '<p><code>SAI_OBJECT_TYPE_VIRTUAL_ROUTER</code>，屬性包含 ADMIN_V4_STATE、ADMIN_V6_STATE、SRC_MAC_ADDRESS。</p>' },
        { id: 'srif', x: 764, y: 210, w: 200, h: 56, label: 'ROUTER_INTERFACE', sub: 'Ethernet4 → VR Vrf_red', kind: 'hw', info: '<p>RIF 的 VIRTUAL_ROUTER_ID 決定封包進來後在哪個 VR 查表。</p>' },
        { id: 'sroute', x: 544, y: 290, w: 420, h: 50, label: 'ROUTE_ENTRY {"dest":…, "vr": Vrf_red 的 OID}', kind: 'hw', info: '<p>路由 key 中的 vr 欄位即 VRF。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'vm', id: 'e1' },
        { from: 'vm', to: 'im', dash: true, label: 'VRF 就緒', id: 'e2' },
        { from: 'vm', to: 'kv', id: 'e3' },
        { from: 'im', to: 'kt', id: 'e4' },
        { from: 'im', to: 'appl', id: 'e5' },
        { from: 'appl', to: 'orch', id: 'e6' },
        { from: 'orch', to: 'svr', id: 'e7' },
        { from: 'orch', to: 'srif', id: 'e8' },
        { from: 'kv', to: 'kt', dash: true, id: 'e9' },
        { from: 'svr', to: 'sroute', dash: true, id: 'e10' },
      ],
      steps: [
        { title: '建立 VRF', text: 'vrfmgrd 在 kernel 建立 l3mdev 裝置並分配路由表 ID，寫入 APPL_DB VRF_TABLE。', nodes: ['cfg', 'vm', 'kv', 'appl'], edges: ['e1', 'e3'] },
        { title: 'SAI virtual router', text: 'VRFOrch 建立 VIRTUAL_ROUTER。', nodes: ['appl', 'orch', 'svr'], edges: ['e6', 'e7'] },
        { title: '綁定介面', text: 'intfmgrd 把 Ethernet4 加入 VRF 並設定 IP；IntfsOrch 建立指向 Vrf_red 的 RIF。', nodes: ['vm', 'im', 'kt', 'appl', 'orch', 'srif'], edges: ['e2', 'e4', 'e5', 'e8'] },
        { title: 'VRF 路由', text: 'FRR 在 VRF 中學到的路由以含 VRF 名稱的 key 寫入 APPL_DB，RouteOrch 放入對應的 VR。', nodes: ['fr', 'svr', 'sroute'], edges: ['e10'] },
      ],
    });

    const host = root.querySelector('#lookup');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const VRF = {
      default: { intfs: ['Ethernet0', 'Ethernet4'], routes: [['0.0.0.0/0', '10.0.0.1 via Ethernet0'], ['10.1.0.0/16', '10.0.0.3 via Ethernet4'], ['10.1.5.0/24', '10.0.0.1 via Ethernet0']] },
      Vrf_red: { intfs: ['Ethernet8', 'Eth12.100'], routes: [['10.1.0.0/16', '172.16.0.1 via Ethernet8'], ['192.168.0.0/16', '172.16.1.1 via Eth12.100']] },
      Vrf_blue: { intfs: ['Ethernet16', 'Vlan200'], routes: [['10.1.0.0/16', 'directly connected Vlan200'], ['0.0.0.0/0', '172.17.0.1 via Ethernet16']] },
    };
    const ALL = Object.entries(VRF).flatMap(([v, d]) => d.intfs.map(i => [i, v]));
    let inIf = 'Ethernet0', dst = '10.1.5.9';
    const ip2n = s => { const p = s.split('.').map(Number); return p.length === 4 && p.every(x => x >= 0 && x < 256) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null; };
    function lpm(vrf, ip) {
      const n = ip2n(ip); if (n == null) return null;
      let best = null;
      VRF[vrf].routes.forEach(([p, nh]) => { const [a, l] = p.split('/'); const m = +l === 0 ? 0 : (0xffffffff << (32 - l)) >>> 0; if (((n & m) >>> 0) === ((ip2n(a) & m) >>> 0) && (!best || +l > best.len)) best = { p, nh, len: +l }; });
      return best;
    }
    function draw() {
      box.innerHTML = '';
      const sel = S.el('select', { id: 'vrf-in' }, ...ALL.map(([i, v]) => S.el('option', { value: i, selected: i === inIf }, `${i}（${v}）`)));
      sel.addEventListener('change', () => { inIf = sel.value; draw(); });
      const inp = S.el('input', { id: 'vrf-dst', value: dst, size: 16 });
      inp.addEventListener('change', () => { dst = inp.value.trim(); draw(); });
      box.appendChild(S.el('div', { class: 'row' }, S.el('label', { class: 'field', for: 'vrf-in' }, '入口介面', sel), S.el('label', { class: 'field', for: 'vrf-dst' }, '目的 IP', inp),
        ...['10.1.5.9', '10.1.99.1', '192.168.3.3', '8.8.8.8'].map(v => S.el('button', { class: 'chip', style: 'align-self:flex-end', onclick: () => { dst = v; draw(); } }, v))));
      const vrf = ALL.find(x => x[0] === inIf)[1];
      const r = lpm(vrf, dst);
      const g = S.el('div', { class: 'grid c3', style: 'margin-top:12px' });
      Object.entries(VRF).forEach(([v, d]) => {
        const on = v === vrf;
        g.appendChild(S.el('div', { class: 'card', style: on ? 'border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)' : 'opacity:.6' },
          S.el('div', { class: 'row', style: 'justify-content:space-between' }, S.el('b', { class: 'mono' }, v), on ? S.el('span', { class: 'badge b' }, '使用此表') : null),
          S.el('div', { class: 'muted', style: 'font-size:12px' }, '成員：' + d.intfs.join('、')),
          S.el('div', { class: 'mono', style: 'font-size:12px;margin-top:6px', html: d.routes.map(([p, nh]) => `<div style="${on && r && r.p === p ? 'color:var(--accent-ink);font-weight:600' : ''}">${p} → ${nh}</div>`).join('') })));
      });
      box.appendChild(g);
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html: ip2n(dst) == null ? '請輸入有效的 IPv4 位址。' : `${inIf} 屬於 <b>${vrf}</b>，因此只在 ${vrf} 的路由表中做最長前綴比對。` + (r ? `命中 <code>${r.p}</code> → ${r.nh}。` : '沒有任何路由符合，封包被丟棄。') + (vrf !== 'default' && lpm('default', dst) ? `（default VRF 雖然有 <code>${lpm('default', dst).p}</code>，但不同 VRF 的路由互不可見。）` : '') }));
    }
    draw();
  },
  related: ['routing', 'bgp', 'vxlan', 'ip-services', 'sys-services', 'aaa'],
  refs: [['SONiC VRF HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/vrf/sonic-vrf-hld.md'], ['Sub-port interface HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/subport/sonic-sub-port-intf-hld.md'], ['Linux VRF 文件', 'https://docs.kernel.org/networking/vrf.html'], ['Enterprise SONiC User Guide UG460：§7.15、§10.1、§10.4', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
