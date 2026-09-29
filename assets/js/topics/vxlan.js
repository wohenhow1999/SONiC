S.register({
  id: 'vxlan',
  category: 'dc',
  order: 1,
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
    'Symmetric IRB 以每個 VRF 的 L3 VNI 在入口與出口各路由一次；asymmetric IRB 只在入口路由，需要每台 VTEP 都有所有子網。',
    'EVPN multihoming 以 ESI 識別多台 VTEP 共用的 Ethernet Segment，以 Type-1 / Type-4 路由完成 aliasing、快速收斂與 DF 選舉。',
  ],
  html: `
<h2>Overlay 與 underlay</h2>
<p>VXLAN 把二層訊框包在 UDP / IP 裡，讓 overlay 上的主機彷彿在同一個 VLAN，而 underlay 只看到 VTEP 之間的 IP 封包。下面的 3D 模型用實體機櫃與纜線表示 underlay，上方的弧形隧道表示 overlay；逐步播放可以看到訊框在 VTEP 被包進外層封包、穿過 spine、再在對端拆開。</p>
<div id="s3-vxlan"></div>
<p>同一件事的 2D 邏輯圖：</p>
<div id="d-vx3"></div>

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

<h2>對稱與非對稱 IRB</h2>
<p>IRB（Integrated Routing and Bridging）決定跨子網的流量在 overlay 中如何被路由。選擇模式查看兩種做法的差異。</p>
<div id="irb"></div>
<table>
<thead><tr><th></th><th>Symmetric IRB</th><th>Asymmetric IRB</th></tr></thead>
<tbody>
<tr><td>路由位置</td><td>入口 VTEP 與出口 VTEP 各路由一次</td><td>只在入口 VTEP 路由，出口 VTEP 只做橋接</td></tr>
<tr><td>封裝使用的 VNI</td><td>L3 VNI（每個 VRF 一個）</td><td>目的子網的 L2 VNI</td></tr>
<tr><td>內層目的 MAC</td><td>出口 VTEP 的 router MAC（由 EVPN route 的 Router MAC extended community 取得）</td><td>目的主機的 MAC</td></tr>
<tr><td>每台 VTEP 需要的 VLAN / VNI</td><td>只需本地有的子網，加上 L3 VNI</td><td>必須設定所有可能通訊的子網</td></tr>
<tr><td>ARP / MAC 規模</td><td>只需本地主機，遠端以 /32 主機路由表示</td><td>需要所有遠端主機的 ARP 與 MAC</td></tr>
<tr><td>SONiC 中的表示</td><td><code>VRF|Vrf1 vni</code>、<code>ROUTE_TABLE:Vrf1:… vni / router_mac</code></td><td>各 VLAN 的 VNI 對應與 anycast gateway</td></tr>
</tbody></table>

<h2>ARP / ND 抑制</h2>
<p>EVPN Type-2 路由已經攜帶 MAC 與 IP 的對應。啟用 neighbor suppression 後，VTEP 收到主機的 ARP 請求時，若已從 EVPN 學到目標，就直接在本地代答，不把 ARP 廣播送進 overlay，大幅減少 BUM 流量。</p>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface Vlan 100
sonic(config-if-Vlan100)# neigh-suppress</pre>

<h2>EVPN Multihoming</h2>
<p>EVPN multihoming（ESI-LAG）讓一台主機以 LAG 同時連到多台 VTEP，不需要 MCLAG 的 peer link。同一個 Ethernet Segment（以 10 byte 的 ESI 識別）上的 VTEP 透過 BGP 交換資訊：</p>
<table>
<thead><tr><th>EVPN route</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Type-1 Ethernet Auto-Discovery</td><td>per-ES：宣告與此 ES 相連，用於快速收斂（mass withdraw）與 split-horizon 標籤；per-EVI：aliasing，讓遠端 VTEP 把流量分散到所有連到該 ES 的 VTEP</td></tr>
<tr><td>Type-4 Ethernet Segment</td><td>發現同一 ES 的其他 VTEP，作為 DF 選舉的輸入</td></tr>
<tr><td>Designated Forwarder</td><td>每個 VLAN 在每個 ES 上只有 DF 會把 BUM 流量送給主機，避免主機收到重複封包</td></tr>
<tr><td>Split horizon</td><td>從同一個 ES 上的其他 VTEP 來的 BUM 流量不會再送回該 ES（local bias）</td></tr>
</tbody></table>
<h3>DF 選舉（service carving）</h3>
<p>RFC 7432 的預設演算法：把連到同一 ES 的 VTEP 依 IP 位址由小到大排序（序號 0 到 N−1），VLAN V 的 DF 為序號 <code>V mod N</code> 的 VTEP。</p>
<div id="df"></div>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# evpn esi-multihoming
sonic(config-evpn-esi-mh)# startup-delay 300
sonic(config-evpn-esi-mh)# mac-holdtime 1080
sonic(config)# interface PortChannel1
sonic(config-if-po1)# system-mac 00:00:00:0a:00:01
sonic(config-if-po1)# evpn ethernet-segment 00:00:00:00:00:00:00:0a:00:01</pre>

<h2>Multi-site DCI</h2>
<p>多個資料中心各自是獨立的 EVPN fabric，由 border gateway（BGW）相連。BGW 以 <code>fabric-external</code> 鄰居交換 EVPN 路由，並以自己的 external IP 重新作為 next hop（re-origination），使兩個 fabric 的內部 VTEP 不需要互相建立隧道，BUM 與路由規模都被限制在各自 site 內。</p>
<pre><span class="c"># Enterprise SONiC：border gateway</span>
sonic(config)# interface vxlan vtep-1
sonic(config-if-vxlan-vtep-1)# source-ip 192.168.10.1
sonic(config-if-vxlan-vtep-1)# external-ip 10.1.1.1
sonic(config)# router bgp 65001
sonic(config-router-bgp)# neighbor 10.2.2.2
sonic(config-router-bgp-neighbor)# address-family l2vpn evpn
sonic(config-router-bgp-neighbor-af)# fabric-external</pre>

<h2>Enterprise SONiC 設定</h2>
<pre>sonic(config)# interface Loopback 1
sonic(config-if-lo1)# ip address 10.1.0.1/32
sonic(config)# interface vxlan vtep1
sonic(config-if-vtep1)# source-ip Loopback 1
sonic(config-if-vtep1)# map vni 10100 vlan 100
sonic(config-if-vtep1)# map vni 50001 vrf Vrf1                  <span class="c"># L3 VNI（symmetric IRB）</span>
sonic(config)# ip anycast-mac-address 00:00:5e:00:01:01
sonic(config)# ip vrf Vrf1
sonic(config)# interface Vlan 100
sonic(config-if-Vlan100)# ip vrf forwarding Vrf1
sonic(config-if-Vlan100)# ip anycast-address 192.168.100.254/24  <span class="c"># 每台 leaf 相同的閘道</span>
sonic(config-if-Vlan100)# neigh-suppress
sonic(config)# router bgp 65101
sonic(config-router-bgp)# peer-group SPINE
sonic(config-router-bgp-pg)# address-family l2vpn evpn
sonic(config-router-bgp-pg-af)# activate
sonic(config-router-bgp)# address-family l2vpn evpn
sonic(config-router-bgp-af)# advertise-all-vni
sonic(config)# router bgp 65101 vrf Vrf1
sonic(config-router-bgp)# address-family l2vpn evpn
sonic(config-router-bgp-af)# advertise ipv4 unicast                <span class="c"># 以 Type-5 通告 VRF 路由</span>
sonic# show evpn vni detail
sonic# show bgp l2vpn evpn summary
sonic# show vxlan tunnel</pre>

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
    S.scenes.fabric(root.querySelector('#s3-vxlan'), 'vxlan');
    S.diagram(root.querySelector('#d-vx3'), {
      title: 'VXLAN overlay 疊加在 IP underlay 之上',
      w: 1000, h: 520, layerGap: 190, view3d: 'iso',
      groups: [
        { x: 20, y: 16, w: 960, h: 210, y3: 80, lv: 1, kind: 'container', label: 'Overlay：VLAN 100 ↔ VNI 10100（EVPN 控制平面）' },
        { x: 20, y: 250, w: 960, h: 250, y3: 20, lv: 0, kind: 'hw', label: 'Underlay：IP fabric（eBGP · ECMP · MTU 9100）' },
      ],
      nodes: [
        { id: 'ha', x: 90, y: 40, w: 150, h: 50, y3: 100, lv: 1, label: 'Host A', sub: '10.10.0.11 · VLAN 100', kind: 'ext', info: '<p>與 Host B 在同一個子網路，認為彼此在同一個 L2 網段。</p>' },
        { id: 'hb', x: 760, y: 40, w: 150, h: 50, y3: 100, lv: 1, label: 'Host B', sub: '10.10.0.22 · VLAN 100', kind: 'ext', info: '<p>位於另一個機櫃，接在 Leaf-2。</p>' },
        { id: 'v1', x: 80, y: 140, w: 170, h: 56, y3: 210, lv: 1, label: 'VTEP-1', sub: '10.1.0.1 · Vlan100 ↔ 10100', kind: 'proc', info: '<p>Leaf-1 上的 VXLAN tunnel endpoint：依 FDB 決定遠端 VTEP，加上 VXLAN / UDP / IP 標頭。</p>' },
        { id: 'v2', x: 750, y: 140, w: 170, h: 56, y3: 210, lv: 1, label: 'VTEP-2', sub: '10.1.0.2 · Vlan100 ↔ 10100', kind: 'proc', info: '<p>收到目的為自己的 UDP 4789 封包後解封裝，依 VNI 找到 VLAN 100。</p>' },
        { id: 's1', x: 330, y: 290, w: 140, h: 50, y3: 60, lv: 0, label: 'Spine-1', sub: 'AS 65100', kind: 'hw', info: '<p>只依外層 IP 轉送，不需要知道 VNI 或主機 MAC。也常作為 EVPN 路由的轉送者。</p>' },
        { id: 's2', x: 540, y: 290, w: 140, h: 50, y3: 60, lv: 0, label: 'Spine-2', sub: 'AS 65100', kind: 'hw', info: '<p>與 Spine-1 形成 ECMP。</p>' },
        { id: 'l1', x: 80, y: 420, w: 170, h: 56, y3: 210, lv: 0, label: 'Leaf-1', sub: 'Loopback 10.1.0.1', kind: 'hw', info: '<p>實體交換機。VTEP-1 是它在 overlay 上的角色，VTEP 位址通常是 loopback。</p>' },
        { id: 'l2', x: 750, y: 420, w: 170, h: 56, y3: 210, lv: 0, label: 'Leaf-2', sub: 'Loopback 10.1.0.2', kind: 'hw', info: '<p>實體交換機，承載 VTEP-2。</p>' },
      ],
      edges: [
        { from: 'ha', to: 'v1', label: '乙太網路訊框', id: 'a1' },
        { from: 'v1', to: 'v2', label: 'VXLAN 隧道 · UDP 4789', id: 'tun', bi: true },
        { from: 'v2', to: 'hb', id: 'b1' },
        { from: 'v1', to: 'l1', dash: true, label: '封裝', id: 'enc' },
        { from: 'l1', to: 's1', id: 'u1' }, { from: 'l1', to: 's2', id: 'u2' },
        { from: 's1', to: 'l2', id: 'u3' }, { from: 's2', to: 'l2', id: 'u4' },
        { from: 'l2', to: 'v2', dash: true, label: '解封裝', id: 'dec' },
      ],
      steps: [
        { title: 'EVPN 學習', text: 'Leaf-2 學到 Host B 的 MAC，以 BGP EVPN Type-2 路由經 spine 通告；Leaf-1 安裝遠端 FDB：00:11:22:33:44:22 → VTEP 10.1.0.2。', nodes: ['v2', 'l2', 's1', 's2', 'l1', 'v1'], edges: ['u3', 'u4', 'u1', 'u2'] },
        { title: '主機送出訊框', text: 'Host A 送出目的為 Host B MAC 的訊框，進入 Leaf-1 的 VLAN 100。', nodes: ['ha', 'v1'], edges: ['a1'] },
        { title: 'VTEP-1 封裝', text: 'FDB 命中遠端 VTEP：加上 VXLAN 標頭（VNI 10100）、外層 UDP（來源 port 由內層 hash 產生）與外層 IP 10.1.0.1 → 10.1.0.2。', nodes: ['v1', 'l1', 'v2'], edges: ['enc', 'tun'] },
        { title: 'Underlay 轉送', text: 'Spine 只看外層 IP，依外層 UDP 來源 port 做 ECMP，不同的內層流量會分散到兩台 spine。', nodes: ['l1', 's1', 's2', 'l2'], edges: ['u1', 'u2', 'u3', 'u4'] },
        { title: 'VTEP-2 解封裝', text: '外層目的 IP 是自己的 VTEP 位址：拆掉外層標頭，依 VNI 10100 找到 VLAN 100，再依內層 MAC 送到 Host B。', nodes: ['l2', 'v2', 'hb'], edges: ['dec', 'b1'] },
      ],
    });

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

    // ---------- IRB ----------
    const irbHost = root.querySelector('#irb');
    const ib = S.el('div', { class: 'w-box' });
    irbHost.appendChild(ib);
    const ibody = S.el('div', { style: 'margin-top:12px' });
    const MODES = [
      { n: 'Symmetric IRB', steps: [
        ['Host A → Leaf1', 'Host A（192.168.100.10，Vlan100）送往 Host B（192.168.200.20，Vlan200），目的 MAC 為 anycast gateway MAC。'],
        ['Leaf1 路由', 'Leaf1 在 Vrf1 中查到 192.168.200.20/32（由 Type-2 或 Type-5 學到），next hop 為 Leaf2 的 VTEP 10.1.0.2。'],
        ['封裝', 'outer IP 10.1.0.1 → 10.1.0.2，VXLAN VNI = <b>50001（L3 VNI）</b>，inner 目的 MAC 改為 <b>Leaf2 的 router MAC</b>。'],
        ['Leaf2 路由', 'Leaf2 解封裝後依 L3 VNI 找到 Vrf1，再路由一次到 Vlan200，inner 目的 MAC 改為 Host B 的 MAC。'],
        ['送達', 'Host B 收到封包。每台 leaf 只需要本地子網與 L3 VNI。'],
      ] },
      { n: 'Asymmetric IRB', steps: [
        ['Host A → Leaf1', 'Host A 送往閘道（anycast gateway MAC）。'],
        ['Leaf1 路由', 'Leaf1 本地也有 Vlan200 的 SVI，直接路由到 Vlan200，並查詢 Host B 的 ARP（由 EVPN Type-2 同步）。'],
        ['封裝', 'outer IP 10.1.0.1 → 10.1.0.2，VXLAN VNI = <b>10200（Vlan200 的 L2 VNI）</b>，inner 目的 MAC 為 <b>Host B 的 MAC</b>。'],
        ['Leaf2 橋接', 'Leaf2 解封裝後只在 Vlan200 中橋接到 Host B，不再路由。'],
        ['送達', 'Host B 收到封包。代價是每台 leaf 都要設定所有子網並保存所有主機的 ARP。'],
      ] },
    ];
    S.seg(ib, MODES.map(m => m.n), i => {
      ibody.innerHTML = `<div class="tbl"><table><thead><tr><th style="width:40px">#</th><th style="width:130px">階段</th><th>處理</th></tr></thead><tbody>${MODES[i].steps.map((st, k) => `<tr><td class="mono">${k + 1}</td><td>${st[0]}</td><td>${st[1]}</td></tr>`).join('')}</tbody></table></div>`;
    });
    ib.appendChild(ibody);

    // ---------- DF 選舉 ----------
    const dfHost = root.querySelector('#df');
    const db = S.el('div', { class: 'w-box' });
    dfHost.appendChild(db);
    const PES = [{ ip: '10.1.0.3', on: true }, { ip: '10.1.0.1', on: true }, { ip: '10.1.0.2', on: false }];
    const vl = S.el('input', { id: 'df-vlans', value: '100,101,102,103,200', size: 22 });
    const dout = S.el('div');
    function dfDraw() {
      const act = PES.filter(p => p.on).map(p => p.ip).sort((a, b) => a.split('.').reduce((x, y) => x * 256 + +y, 0) - b.split('.').reduce((x, y) => x * 256 + +y, 0));
      const vlans = vl.value.split(',').map(x => parseInt(x.trim(), 10)).filter(x => x >= 1 && x <= 4094);
      const row = S.el('div', { class: 'row' }, S.el('label', { class: 'field', for: 'df-vlans' }, 'VLAN 清單', vl), ...PES.map(p => S.el('button', { class: 'btn sm' + (p.on ? ' on' : ''), style: 'align-self:flex-end', onclick: () => { p.on = !p.on; dfDraw(); } }, S.el('span', { class: 'dot ' + (p.on ? 'up' : 'down') }), `VTEP ${p.ip}`)));
      dout.innerHTML = act.length ? `<div class="log" style="margin-top:10px">排序後：${act.map((ip, i) => `<code>${i}: ${ip}</code>`).join(' ')}（N = ${act.length}）</div><div class="tbl" style="margin-top:8px"><table><thead><tr><th>VLAN</th><th>V mod N</th><th>DF</th></tr></thead><tbody>${vlans.map(v => `<tr><td class="mono">${v}</td><td class="mono">${v % act.length}</td><td class="mono">${act[v % act.length]}</td></tr>`).join('')}</tbody></table></div>` : '<div class="log" style="margin-top:10px">沒有可用的 VTEP。</div>';
      db.innerHTML = ''; db.appendChild(row); db.appendChild(dout);
    }
    vl.addEventListener('change', dfDraw);
    dfDraw();
  },
  related: ['vlan', 'routing', 'neighbor', 'ref-configdb'],
  refs: [
    ['VXLAN HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/vxlan/Vxlan_hld.md'],
    ['EVPN VXLAN HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/vxlan/EVPN/EVPN_VXLAN_HLD.md'],
    ['RFC 7348 (VXLAN) / RFC 7432 (EVPN)', 'https://www.rfc-editor.org/rfc/rfc7348'],
  ],
});
