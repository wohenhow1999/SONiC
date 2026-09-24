S.register({
  id: 'vxlan',
  category: 'adv',
  order: 2,
  title: 'VXLAN 與 BGP EVPN',
  en: 'VXLAN & BGP EVPN',
  summary: 'SONiC 以 VXLAN 提供跨 L3 underlay 的 L2 延伸與 L3 VRF 隔離，控制平面使用 FRR 的 BGP EVPN。vxlanmgrd 建立 kernel VXLAN 介面，fdbsyncd 同步 EVPN 學到的遠端 MAC 與 VTEP，VxlanOrch 與 FdbOrch 下發 SAI tunnel 物件。',
  meta: [
    ['程序', ['vxlanmgrd', 'fdbsyncd', 'bgpd / zebra (EVPN)', 'orchagent (VxlanOrch, EvpnNvoOrch, FdbOrch)']],
    ['CONFIG_DB', ['VXLAN_TUNNEL', 'VXLAN_TUNNEL_MAP', 'VXLAN_EVPN_NVO', 'VRF (vni)', 'VLAN']],
    ['APPL_DB', ['VXLAN_TUNNEL_TABLE', 'VXLAN_TUNNEL_MAP_TABLE', 'VXLAN_EVPN_NVO_TABLE', 'VXLAN_REMOTE_VNI_TABLE', 'VXLAN_FDB_TABLE']],
    ['SAI 物件', ['TUNNEL', 'TUNNEL_MAP', 'TUNNEL_MAP_ENTRY', 'TUNNEL_TERM_TABLE_ENTRY', 'BRIDGE_PORT (type TUNNEL)']],
    ['工具', ['show vxlan tunnel', 'show vxlan vlanvnimap', 'show vxlan remotevtep', 'show vxlan remotemac all', 'vtysh -c "show evpn vni"']],
  ],
  tags: ['VXLAN', 'EVPN', 'VTEP', 'VNI', 'overlay', 'fdbsyncd', 'vxlanmgrd', 'Type-2', 'Type-3', 'Type-5'],
  keypoints: [
    'VXLAN 以 UDP 4789 封裝原始乙太網路框架，VNI（24 bit）識別 L2 或 L3 區段，封裝額外增加 50 bytes（IPv4 underlay）。',
    'VXLAN_TUNNEL 定義本地 VTEP 來源 IP，VXLAN_TUNNEL_MAP 定義 VLAN↔VNI 對應，VXLAN_EVPN_NVO 指定由 EVPN 控制的 VTEP。',
    'EVPN Type-3（IMET）建立遠端 VTEP 與 BUM 泛洪清單；Type-2 通告 MAC/IP；Type-5 通告 IP prefix（L3 VNI）。',
    'fdbsyncd 從 kernel 讀取 zebra 安裝的遠端 FDB 與 VTEP，寫入 APPL_DB 的 VXLAN_FDB_TABLE 與 VXLAN_REMOTE_VNI_TABLE。',
  ],
  html: `
<h2>元件與資料流</h2>
<p>下圖以「遠端 leaf 上的主機 MAC 經 EVPN Type-2 路由被本地學到」為例，說明控制平面如何把遠端 MAC 下發到 ASIC。</p>
<div id="d-vx"></div>

<h2>設定範例</h2>
<pre>{
  <span class="s">"VXLAN_TUNNEL"</span>:     { <span class="s">"vtep1"</span>: { <span class="s">"src_ip"</span>: <span class="s">"10.1.0.1"</span> } },
  <span class="s">"VXLAN_EVPN_NVO"</span>:   { <span class="s">"nvo1"</span>:  { <span class="s">"source_vtep"</span>: <span class="s">"vtep1"</span> } },
  <span class="s">"VXLAN_TUNNEL_MAP"</span>: { <span class="s">"vtep1|map_10100_Vlan100"</span>: { <span class="s">"vlan"</span>: <span class="s">"Vlan100"</span>, <span class="s">"vni"</span>: <span class="s">"10100"</span> } },
  <span class="s">"VRF"</span>:              { <span class="s">"Vrf1"</span>: { <span class="s">"vni"</span>: <span class="s">"50001"</span> } }
}</pre>
<pre><span class="c"># 等效 CLI</span>
sudo config vxlan add vtep1 10.1.0.1
sudo config vxlan evpn_nvo add nvo1 vtep1
sudo config vxlan map add vtep1 100 10100
<span class="c"># FRR（bgpd）端啟用 EVPN</span>
router bgp 65100
 address-family l2vpn evpn
  neighbor SPINE activate
  advertise-all-vni</pre>

<h2>EVPN 路由類型</h2>
<table>
<thead><tr><th>Type</th><th>名稱</th><th>用途</th><th>在 SONiC 中的結果</th></tr></thead>
<tbody>
<tr><td>2</td><td>MAC/IP Advertisement</td><td>通告主機 MAC（可附 IP）</td><td>kernel bridge FDB 指向遠端 VTEP → fdbsyncd → <code>VXLAN_FDB_TABLE</code> → FdbOrch 建立指向 tunnel 的 FDB</td></tr>
<tr><td>3</td><td>Inclusive Multicast Ethernet Tag</td><td>宣告 VTEP 參與某 VNI，建立 BUM 複製清單</td><td>fdbsyncd → <code>VXLAN_REMOTE_VNI_TABLE:Vlan100:10.1.0.2</code> → 建立 tunnel 與 flood 成員</td></tr>
<tr><td>5</td><td>IP Prefix</td><td>在 L3 VNI 中通告 IP 網段</td><td>zebra 安裝 VRF 路由，fpmsyncd 寫入 <code>ROUTE_TABLE:Vrf1:…</code>（含 vni 與 router_mac），RouteOrch 建立 tunnel next hop</td></tr>
</tbody></table>

<h2>封裝格式與 MTU</h2>
<p>選擇 underlay 類型並輸入 underlay MTU，計算可承載的最大 inner frame 與 inner IP MTU。</p>
<div id="encap"></div>

<h2>除錯</h2>
<pre>show vxlan tunnel
show vxlan vlanvnimap
show vxlan remotevtep
show vxlan remotemac all
vtysh -c "show evpn vni detail"
vtysh -c "show bgp l2vpn evpn route type macip"
bridge fdb show | grep dst           <span class="c"># zebra 安裝的遠端 FDB</span>
sonic-db-cli APPL_DB keys "VXLAN_*"
sonic-db-cli ASIC_DB keys "*TUNNEL*"</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-vx'), {
      title: 'EVPN Type-2：遠端 MAC 的學習與下發',
      w: 1000, h: 440,
      groups: [{ x: 200, y: 16, w: 420, h: 150, label: 'bgp 容器' }],
      nodes: [
        { id: 'rl', x: 20, y: 60, w: 150, h: 60, label: '遠端 leaf', sub: 'VTEP 10.1.0.2', kind: 'ext', info: '<p>遠端 VTEP 學到本地主機 MAC 後，以 BGP EVPN Type-2 路由通告出去（通常經過 spine route reflector）。</p>' },
        { id: 'bgpd', x: 220, y: 60, w: 170, h: 60, label: 'bgpd', sub: 'l2vpn evpn', kind: 'proc', info: '<p>接收 EVPN 路由，依 route target 匯入對應 VNI。</p>' },
        { id: 'zebra', x: 430, y: 60, w: 170, h: 60, label: 'zebra', kind: 'proc', info: '<p>把遠端 MAC 以 <code>bridge fdb add … dev vtep1-100 dst 10.1.0.2</code> 的形式安裝到 kernel；Type-3 則建立 VTEP 的 flood 項目。</p>' },
        { id: 'kern', x: 430, y: 210, w: 170, h: 60, label: 'Linux kernel', sub: 'VXLAN netdev + bridge FDB', kind: 'kernel', info: '<p>vxlanmgrd 為每個 VLAN-VNI 對應建立 VXLAN netdev 並加入 Bridge；zebra 在其上加入遠端 FDB。</p>' },
        { id: 'fs', x: 220, y: 210, w: 170, h: 60, label: 'fdbsyncd', sub: '(bgp 容器)', kind: 'proc', info: '<p>監聽 netlink FDB 事件：遠端 MAC 寫入 <code>VXLAN_FDB_TABLE</code>，遠端 VTEP 寫入 <code>VXLAN_REMOTE_VNI_TABLE</code>；也把本地學到的 MAC 從 STATE_DB 回灌到 kernel，讓 zebra 通告出去。</p>' },
        { id: 'appl', x: 220, y: 340, w: 170, h: 60, label: 'APPL_DB', sub: 'VXLAN_FDB_TABLE', kind: 'db', info: '<p><code>VXLAN_FDB_TABLE:Vlan100:00:11:22:33:44:55</code> → <code>remote_vtep: 10.1.0.2, type: dynamic, vni: 10100</code></p>' },
        { id: 'orch', x: 430, y: 340, w: 170, h: 60, label: 'FdbOrch / VxlanOrch', kind: 'proc', info: '<p>VxlanOrch 依遠端 VTEP 建立 SAI TUNNEL 與 tunnel 型 BRIDGE_PORT；FdbOrch 建立 FDB_ENTRY 指向該 bridge port 與 endpoint IP。</p>' },
        { id: 'asic', x: 660, y: 340, w: 150, h: 60, label: 'ASIC', sub: 'FDB → tunnel', kind: 'hw', info: '<p>往該 MAC 的封包在硬體中加上 VXLAN 標頭，外層目的 IP 為 10.1.0.2。</p>' },
        { id: 'vm', x: 660, y: 210, w: 150, h: 60, label: 'vxlanmgrd', sub: '(swss)', kind: 'proc', info: '<p>讀取 CONFIG_DB VXLAN_TUNNEL / VXLAN_TUNNEL_MAP，建立 kernel VXLAN 介面並寫入 APPL_DB 對應表。</p>' },
        { id: 'cfg', x: 850, y: 210, w: 130, h: 60, label: 'CONFIG_DB', sub: 'VXLAN_*', kind: 'db', info: '<p>VXLAN_TUNNEL、VXLAN_TUNNEL_MAP、VXLAN_EVPN_NVO。</p>' },
      ],
      edges: [
        { from: 'rl', to: 'bgpd', label: 'Type-2', id: 'e1' },
        { from: 'bgpd', to: 'zebra', id: 'e2' },
        { from: 'zebra', to: 'kern', label: 'netlink', id: 'e3' },
        { from: 'kern', to: 'fs', label: 'RTM_NEWNEIGH', id: 'e4' },
        { from: 'fs', to: 'appl', id: 'e5' },
        { from: 'appl', to: 'orch', id: 'e6' },
        { from: 'orch', to: 'asic', label: 'SAI', id: 'e7' },
        { from: 'cfg', to: 'vm', id: 'c1' },
        { from: 'vm', to: 'kern', label: 'VXLAN netdev', id: 'c2' },
      ],
      steps: [
        { title: '前置：建立 VTEP 與 VNI 對應', text: 'vxlanmgrd 讀 CONFIG_DB 的 VXLAN 設定，在 kernel 建立 VXLAN 介面並掛上 Bridge，同時寫入 APPL_DB，VxlanOrch 建立本地 tunnel 物件。', nodes: ['cfg', 'vm', 'kern'], edges: ['c1', 'c2'] },
        { title: '收到 Type-2 路由', text: '遠端 leaf 通告主機 MAC；bgpd 依 route target 匯入 VNI 10100。', nodes: ['rl', 'bgpd'], edges: ['e1'] },
        { title: 'zebra 安裝遠端 FDB', text: 'zebra 在 VXLAN netdev 上安裝 FDB，目的 VTEP 為 10.1.0.2。', nodes: ['bgpd', 'zebra', 'kern'], edges: ['e2', 'e3'] },
        { title: 'fdbsyncd 同步', text: 'fdbsyncd 從 netlink 取得事件，寫入 <code>VXLAN_FDB_TABLE</code>。', nodes: ['kern', 'fs', 'appl'], edges: ['e4', 'e5'] },
        { title: '下發到 ASIC', text: 'FdbOrch 建立指向 tunnel bridge port 的 FDB 項目；封包在硬體完成 VXLAN 封裝。', nodes: ['appl', 'orch', 'asic'], edges: ['e6', 'e7'] },
      ],
    });

    const host = root.querySelector('#encap');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    let v6 = false, tagged = false;
    const mtu = S.el('input', { id: 'vx-mtu', type: 'number', value: 9100, min: 1280, max: 9216, style: 'width:100px' });
    const out = S.el('div');
    const ctl = S.el('div', { class: 'row' }, S.el('label', { class: 'field', for: 'vx-mtu' }, 'Underlay IP MTU', mtu));
    const seg1 = S.el('div'); const seg2 = S.el('div');
    ctl.appendChild(seg1); ctl.appendChild(seg2);
    box.appendChild(ctl); box.appendChild(out);
    S.seg(seg1, ['IPv4 underlay', 'IPv6 underlay'], i => { v6 = i === 1; draw(); });
    S.seg(seg2, ['inner untagged', 'inner 802.1Q'], i => { tagged = i === 1; draw(); });
    function draw() {
      const m = parseInt(mtu.value, 10) || 0;
      const ipH = v6 ? 40 : 20;
      const over = ipH + 8 + 8; // outer IP + UDP + VXLAN
      const innerFrame = m - over;
      const innerL2 = 14 + (tagged ? 4 : 0);
      const innerIp = innerFrame - innerL2;
      const segs = [
        ['Outer Ethernet', '14 B', 'var(--k-kernel)', 1],
        [v6 ? 'Outer IPv6' : 'Outer IPv4', ipH + ' B · src/dst VTEP', 'var(--k-container)', 1.2],
        ['UDP', '8 B · dport 4789', 'var(--k-container)', .8],
        ['VXLAN', '8 B · VNI 10100', 'var(--k-db)', .9],
        ['Inner Ethernet', innerL2 + ' B', 'var(--k-proc)', 1],
        ['Inner payload', 'IP MTU ' + innerIp + ' B', 'var(--k-proc)', 2.2],
      ];
      out.innerHTML = `<div class="hdr">${segs.map(([a, b, c, w]) => `<div style="--hc:${c};--hw:${w}"><b>${a}</b><span>${b}</span></div>`).join('')}</div>
        <div class="log">封裝額外增加 <b>${over + 14}</b> bytes（outer Ethernet 14 + ${v6 ? 'IPv6 40' : 'IPv4 20'} + UDP 8 + VXLAN 8）。在 underlay IP MTU ${m} 下，inner frame 最大 <b>${innerFrame}</b> bytes，inner IP MTU 最大 <b>${innerIp}</b> bytes。${innerIp < 1500 ? '<br><span class="badge r">注意</span> 小於 1500，主機端需要調降 MTU，否則會發生分段或丟包。' : ''}</div>`;
    }
    mtu.addEventListener('input', draw);
    draw();
  },
  related: ['vlan', 'routing', 'neighbor', 'ref-configdb'],
  refs: [
    ['VXLAN HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/vxlan/Vxlan_hld.md'],
    ['EVPN VXLAN HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/vxlan/EVPN/EVPN_VXLAN_HLD.md'],
    ['RFC 7348 (VXLAN) / RFC 7432 (EVPN)', 'https://www.rfc-editor.org/rfc/rfc7348'],
  ],
});
