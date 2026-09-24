S.register({
  id: 'ip-services',
  category: 'l3',
  order: 7,
  title: 'DHCP Relay、IP Helper 與 Proxy ARP',
  en: 'DHCP Relay, Snooping, IP Helper & Proxy ARP/ND',
  summary: '閘道常需提供的 IP 服務：把主機的 DHCP 廣播轉送到集中式伺服器（DHCPv4 / v6 relay 與 option 82）、以 DHCP snooping 建立可信任的位址綁定、以 IP helper 轉送其他 UDP 廣播，以及以 Proxy ARP / ND proxy 代答鄰居請求。',
  meta: [
    ['容器', ['dhcp_relay', 'radv']],
    ['程序', ['dhcrelay（每個 VLAN 一個）', 'dhcp6relay', 'dhcpmon', 'radvd']],
    ['CONFIG_DB', ['VLAN dhcp_servers', 'DHCP_RELAY (dhcpv6_servers)', 'VLAN_INTERFACE proxy_arp']],
    ['協定', ['DHCPv4 UDP 67/68', 'DHCPv6 UDP 546/547', 'option 82（relay agent information）', 'DHCPv6 option 18 / 37 / 79']],
    ['CoPP', ['trap dhcp / dhcpv6 / arp / neigh_discovery']],
  ],
  tags: ['DHCP', 'DHCP relay', 'DHCPv6', 'option 82', 'circuit-id', 'link-selection', 'DHCP snooping', 'IP helper', 'proxy ARP', 'ND proxy', 'radvd', 'router advertisement'],
  keypoints: [
    'relay 收到用戶端廣播後填入 giaddr（relay 介面位址），以單播轉送到伺服器；伺服器依 giaddr 選擇位址池並把回覆送回 relay。',
    'option 82 攜帶 circuit-id（入口介面）與 remote-id（relay 識別），link-selection 子選項讓 relay 在 giaddr 與實際子網不同時仍能指定位址池。',
    'SONiC 為每個設定了 DHCP 伺服器的 VLAN 啟動一個 dhcrelay 程序；dhcpmon 監控封包計數以偵測 relay 異常。',
    'DHCP snooping 把 port 分為 trusted / untrusted，丟棄從 untrusted port 來的伺服器訊息，並記錄 IP–MAC–port 綁定。',
    'Proxy ARP 讓閘道代替其他主機回應 ARP，常用於 private VLAN 或 EVPN 的 ARP 抑制場景。',
  ],
  html: `
<h2>DHCP relay 流程</h2>
<p>逐步觀察 DORA（Discover、Offer、Request、Ack）經過 relay 時封包欄位的變化。</p>
<div id="d-dhcp"></div>
<table>
<thead><tr><th>option 82 子選項</th><th>內容</th><th>用途</th></tr></thead>
<tbody>
<tr><td>1 circuit-id</td><td>預設為入口介面（可設定為 %p、%h:%p 等格式）</td><td>伺服器依接取 port 分配固定位址或記錄位置</td></tr>
<tr><td>2 remote-id</td><td>relay 的系統 MAC 或主機名稱</td><td>識別是哪一台 relay</td></tr>
<tr><td>5 link-selection</td><td>用戶端所在子網</td><td>relay 的來源位址（例如 Loopback）與用戶端子網不同時使用</td></tr>
<tr><td>11 server-id override</td><td>relay 位址</td><td>讓用戶端續約也經過 relay</td></tr>
<tr><td>151 VSS</td><td>VRF 名稱</td><td>多 VRF 環境中讓伺服器區分位址空間</td></tr>
</tbody></table>

<h2>在 SONiC 中的實作</h2>
<ul>
<li>CONFIG_DB <code>VLAN|Vlan100</code> 的 <code>dhcp_servers</code> 欄位列出 DHCPv4 伺服器；DHCPv6 使用 <code>DHCP_RELAY|Vlan100 dhcpv6_servers</code>。</li>
<li>dhcp_relay 容器啟動時依 CONFIG_DB 產生 supervisord 設定，每個 VLAN 啟動一個 <code>dhcrelay</code>（ISC）程序，監聽該 VLAN 與上聯介面。</li>
<li>DHCPv6 relay 由 SONiC 自行實作的 <code>dhcp6relay</code> 處理，會加入 interface-id（option 18）、remote-id（37）與 client link-layer address（79）。</li>
<li><code>dhcpmon</code> 統計每個 VLAN 收送的 DHCP 封包數，數量不平衡時寫入 syslog 告警。</li>
<li>DHCP 封包由 CoPP 的 dhcp trap（queue4_group3）送到 CPU。</li>
</ul>
<pre><span class="c"># 社群版</span>
sudo config vlan dhcp_relay add 100 10.20.20.10
sudo config dhcp_relay ipv6 destination add 100 fc02:2000::1
show dhcp_relay ipv4 helper
show dhcp_relay ipv6 counters

<span class="c"># Enterprise SONiC</span>
sonic(config)# interface Vlan 10
sonic(config-if-Vlan10)# ip dhcp-relay 10.20.20.10 10.20.20.11
sonic(config-if-Vlan10)# ip dhcp-relay source-interface Loopback 0
sonic(config-if-Vlan10)# ip dhcp-relay link-select
sonic(config-if-Vlan10)# ip dhcp-relay circuit-id %h:%p
sonic(config-if-Vlan10)# ip dhcp-relay policy-action replace
sonic(config-if-Vlan10)# ipv6 dhcp-relay 2001:db8::10</pre>

<h2>DHCP snooping</h2>
<table>
<thead><tr><th>項目</th><th>行為</th></tr></thead>
<tbody>
<tr><td>trusted port</td><td>接 DHCP 伺服器或上聯，允許 OFFER / ACK</td></tr>
<tr><td>untrusted port</td><td>接用戶端，丟棄來自此 port 的 OFFER / ACK（防止偽造伺服器），可限制速率</td></tr>
<tr><td>binding table</td><td>從 ACK 學到 IP、MAC、VLAN、port、租期，可作為 ARP inspection 與 IP source guard 的依據</td></tr>
<tr><td>與 relay 並用</td><td>同一 VLAN 可同時啟用 snooping 與 relay；MCLAG 環境下兩台 peer 會同步綁定表</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# ip dhcp snooping
sonic(config)# ip dhcp snooping vlan 100
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# ip dhcp snooping trust</pre>

<h2>IP helper（UDP 廣播轉送）</h2>
<p>除了 DHCP，某些服務也依賴廣播尋找伺服器。IP helper 把收到的 UDP 廣播轉成單播送往設定的位址。轉送條件：目的為 255.255.255.255 或該介面的子網廣播位址、TTL ≥ 2、目的 port 在允許清單中、介面設定了 helper address，且全域啟用 UDP 轉送。</p>
<table>
<thead><tr><th>預設轉送的服務</th><th>UDP port</th></tr></thead>
<tbody>
<tr><td>TFTP</td><td>69</td></tr><tr><td>DNS</td><td>53</td></tr><tr><td>Time</td><td>37</td></tr>
<tr><td>NetBIOS Name / Datagram</td><td>137 / 138</td></tr><tr><td>TACACS</td><td>49</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# ip forward-protocol udp enable
sonic(config)# interface Vlan 10
sonic(config-if-Vlan10)# ip helper-address 10.30.0.5
sonic# show ip forward-protocol
sonic# show ip helper-address statistics Vlan10</pre>

<h2>Proxy ARP 與 ND proxy</h2>
<table>
<thead><tr><th>模式</th><th>行為</th><th>場景</th></tr></thead>
<tbody>
<tr><td>all</td><td>對所有目標（包含同一介面上的其他主機）代答 ARP，並以自己的 MAC 回應</td><td>private VLAN、主機間必須經過閘道的隔離網段</td></tr>
<tr><td>remote-only</td><td>只對不在同一介面上的目標代答</td><td>傳統 proxy ARP</td></tr>
</tbody></table>
<p>社群版以 <code>VLAN_INTERFACE|Vlan100 proxy_arp: enabled</code> 設定，intfmgrd 會開啟 kernel 的 <code>proxy_arp</code> 與 <code>proxy_arp_pvlan</code>，並讓 ASIC 不在 VLAN 內泛洪 ARP 請求，改由 CPU 回應。</p>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface Vlan 100
sonic(config-if-Vlan100)# ip proxy-arp enable remote-only
sonic(config-if-Vlan100)# ipv6 nd-proxy enable remote-only</pre>

<h2>IPv6 Router Advertisement</h2>
<p>radv 容器中的 radvd 依 CONFIG_DB 中 VLAN 介面的 IPv6 前綴產生設定，定期送出 RA，讓主機以 SLAAC 或 DHCPv6 取得位址，並得知預設閘道。RA 也被 unnumbered BGP 用來發現鄰居的 link-local 位址。</p>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-dhcp'), {
      title: 'DHCPv4 relay 的 DORA 流程',
      w: 1000, h: 360,
      nodes: [
        { id: 'cl', x: 20, y: 140, w: 170, h: 70, label: 'DHCP 用戶端', sub: 'MAC aa:bb:cc:00:00:01', kind: 'ext', info: '<p>尚未取得位址，以 0.0.0.0 → 255.255.255.255 廣播。</p>' },
        { id: 'asic', x: 260, y: 40, w: 180, h: 56, label: 'ASIC', sub: 'trap dhcp', kind: 'hw', info: '<p>UDP 67 / 68 封包由 CoPP 送到 CPU。</p>' },
        { id: 'relay', x: 260, y: 140, w: 180, h: 70, label: 'dhcrelay', sub: 'Vlan10 · 10.10.0.1', kind: 'proc', info: '<p>dhcp_relay 容器中對應 Vlan10 的程序。</p>' },
        { id: 'net', x: 520, y: 140, w: 180, h: 70, label: '路由網路', sub: 'L3 fabric', kind: 'hw', info: '<p>relay 送出的是一般單播封包，照路由轉發。</p>' },
        { id: 'srv', x: 780, y: 140, w: 200, h: 70, label: 'DHCP 伺服器', sub: '10.20.20.10', kind: 'ext', info: '<p>依 giaddr（或 link-selection）選擇 10.10.0.0/24 的位址池。</p>' },
        { id: 'mon', x: 260, y: 270, w: 180, h: 56, label: 'dhcpmon', kind: 'proc', info: '<p>統計各類 DHCP 封包，偵測 relay 是否正常運作。</p>' },
      ],
      edges: [
        { from: 'cl', to: 'relay', label: 'Discover', id: 'd1' },
        { from: 'asic', to: 'relay', dash: true, id: 'd0' },
        { from: 'relay', to: 'net', label: 'giaddr + opt82', id: 'd2' },
        { from: 'net', to: 'srv', id: 'd3' },
        { from: 'srv', to: 'net', id: 'o1', via: [[880, 250], [610, 250]] },
        { from: 'net', to: 'relay', label: 'Offer → giaddr', id: 'o2', via: [[610, 250], [350, 250]] },
        { from: 'relay', to: 'cl', id: 'o3', via: [[225, 230], [105, 230]] },
        { from: 'relay', to: 'mon', dash: true, id: 'm1' },
      ],
      steps: [
        { title: 'Discover（用戶端 → relay）', text: '用戶端廣播 DHCPDISCOVER（src 0.0.0.0、dst 255.255.255.255、UDP 68 → 67），ASIC trap 到 CPU，交給 Vlan10 的 dhcrelay。', nodes: ['cl', 'asic', 'relay'], edges: ['d1', 'd0'] },
        { title: 'relay 轉送（relay → 伺服器）', text: 'dhcrelay 填入 <code>giaddr = 10.10.0.1</code>、hops + 1，加入 option 82（circuit-id = Vlan10:Ethernet4、remote-id = 系統 MAC），以單播送往 10.20.20.10。', nodes: ['relay', 'net', 'srv'], edges: ['d2', 'd3'] },
        { title: 'Offer（伺服器 → relay）', text: '伺服器從 10.10.0.0/24 的位址池選出位址，回覆送往 giaddr 10.10.0.1（UDP 67）。', nodes: ['srv', 'net', 'relay'], edges: ['o1', 'o2'] },
        { title: 'Offer（relay → 用戶端）', text: 'relay 移除 option 82，依 broadcast flag 以廣播或單播送給用戶端。', nodes: ['relay', 'cl'], edges: ['o3'] },
        { title: 'Request / Ack', text: 'Request 與 Ack 走相同路徑。完成後 dhcpmon 的計數器顯示各類訊息數量一致。', nodes: ['cl', 'relay', 'srv', 'mon'], edges: ['d1', 'd2', 'd3', 'o1', 'o2', 'o3', 'm1'] },
      ],
    });
  },
  related: ['vlan', 'copp', 'mclag', 'neighbor', 'vrf', 'ipv6', 'pac'],
  refs: [['RFC 2131 DHCP', 'https://www.rfc-editor.org/rfc/rfc2131'], ['RFC 3046 Relay Agent Information Option', 'https://www.rfc-editor.org/rfc/rfc3046'], ['SONiC DHCPv6 relay HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/DHCPv6_relay/DHCPv6-relay-agent-High-Level-Design.md'], ['Enterprise SONiC User Guide UG460：§5.25、§10.17、§10.18', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
