S.register({
  id: 'vlan',
  category: 'net',
  order: 3,
  title: 'VLAN 與 L2 橋接',
  en: 'VLAN & Bridging',
  summary: "SONiC 在 Linux 以單一 vlan-aware bridge 表示 L2，在 ASIC 以 VLAN、BRIDGE_PORT、VLAN_MEMBER 物件建立轉發；VLAN 介面加上 IP 後以 ROUTER_INTERFACE 提供 L3 閘道。",
  meta: [["程序", ["vlanmgrd", "intfmgrd", "orchagent (PortsOrch, IntfsOrch)"]], ["資料表", ["CONFIG_DB VLAN / VLAN_MEMBER / VLAN_INTERFACE", "APPL_DB VLAN_TABLE / VLAN_MEMBER_TABLE", "STATE_DB VLAN_TABLE"]], ["SAI 物件", ["VLAN", "BRIDGE_PORT", "VLAN_MEMBER", "ROUTER_INTERFACE"]], ["原始碼", "<code>sonic-swss/cfgmgr/vlanmgr.cpp</code>"]],
  tags: ['VLAN', 'vlanmgrd', 'Bridge', 'SVI', 'tagged', 'untagged', 'VLAN_MEMBER'],
  html: `
<h2>kernel 與 ASIC 兩側的 VLAN 模型</h2>
<p>同一個 VLAN 設定，會同時出現在 <b>Linux kernel</b>（給控制平面程式用）與 <b>ASIC</b>（真正轉發）兩邊。</p>
<div id="d-vlan"></div>

<h2>Tagged 與 Untagged</h2>
<div class="defs">
  <div><b>Untagged（access）</b><p>封包進出時<b>不帶</b> 802.1Q 標籤，這個 VLAN 就是該 port 的 PVID。一個 port 只能 untagged 在一個 VLAN。<br><code>config vlan member add -u 100 Ethernet8</code></p></div>
  <div><b>Tagged（trunk）</b><p>封包帶 VLAN tag，一個 port 可以同時 tagged 在多個 VLAN，常用於交換機之間或接伺服器的 hypervisor。<br><code>config vlan member add 100 Ethernet8</code></p></div>
</div>

<h2>DB 表對照</h2>
<table>
<thead><tr><th>CONFIG_DB</th><th>APPL_DB</th><th>ASIC_DB（SAI 物件）</th></tr></thead>
<tbody>
<tr><td><code>VLAN|Vlan100</code></td><td><code>VLAN_TABLE:Vlan100</code></td><td><code>SAI_OBJECT_TYPE_VLAN</code>（VLAN_ID=100）</td></tr>
<tr><td><code>VLAN_MEMBER|Vlan100|Ethernet8</code></td><td><code>VLAN_MEMBER_TABLE:Vlan100:Ethernet8</code></td><td><code>BRIDGE_PORT</code> + <code>VLAN_MEMBER</code></td></tr>
<tr><td><code>VLAN_INTERFACE|Vlan100|192.168.100.1/24</code></td><td><code>INTF_TABLE:Vlan100:192.168.100.1/24</code></td><td><code>ROUTER_INTERFACE</code>（type VLAN）+ 路由</td></tr>
</tbody></table>
<div class="callout warn"><div class="ct">常見錯誤</div>
<p>已經設了 IP 的 port（routed port）不能再加入 VLAN，會出現 <code>Ethernet0 is a router interface!</code>；同樣地，LAG 成員也不能直接加入 VLAN（要把 PortChannel 加入 VLAN）。在下方終端機試試看。</p></div>

<h2>操作示範：建立 VLAN 與 SVI</h2>
<p>依序點下面的指令，觀察每一步在 Linux（vlanmgrd 下的指令）與 ASIC（建立的 SAI 物件）產生的變化。</p>
<div id="term"></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-vlan'), {
      title: 'VLAN 設定：CONFIG_DB → kernel / ASIC',
      w: 1000, h: 500,
      groups: [
        { x: 250, y: 190, w: 330, h: 290, label: 'Linux kernel', kind: 'kernel' },
        { x: 640, y: 190, w: 340, h: 290, label: 'ASIC（SAI 物件）', kind: 'hw' },
      ],
      nodes: [
        { id: 'cfg', x: 20, y: 40, w: 200, h: 70, label: 'CONFIG_DB', sub: 'VLAN / VLAN_MEMBER\nVLAN_INTERFACE', kind: 'db', info: '<p>三張表：VLAN 本身、成員、以及 VLAN 介面的 IP。</p>' },
        { id: 'vm', x: 280, y: 48, w: 150, h: 56, label: 'vlanmgrd', kind: 'proc', info: '<p>第一次啟動時建立一個名為 <code>Bridge</code> 的 vlan-aware Linux bridge。每新增一個 VLAN：<code>bridge vlan add vid 100 dev Bridge self</code>、建立 <code>Vlan100</code> 介面；加成員時把 port 掛到 Bridge 並設定 vid / pvid。</p>' },
        { id: 'im', x: 450, y: 48, w: 130, h: 56, label: 'intfmgrd', kind: 'proc', info: '<p>處理 VLAN_INTERFACE：在 Vlan100 上 <code>ip address add 192.168.100.1/24</code>，寫 APPL_DB INTF_TABLE。</p>' },
        { id: 'appl', x: 640, y: 48, w: 160, h: 56, label: 'APPL_DB', sub: 'VLAN_TABLE…', kind: 'db', info: '<p>VLAN_TABLE、VLAN_MEMBER_TABLE、INTF_TABLE。</p>' },
        { id: 'orch', x: 830, y: 48, w: 150, h: 56, label: 'PortsOrch\nIntfsOrch', kind: 'proc', info: '<p>PortsOrch 建立 VLAN、Bridge Port、VLAN Member；IntfsOrch 建立 VLAN 型別的 Router Interface。</p>' },
        { id: 'br', x: 270, y: 230, w: 150, h: 56, label: 'Bridge', sub: 'vlan_filtering=1', kind: 'kernel', info: '<p>整台交換機只有一個 Linux bridge，靠 VLAN filtering 區分不同 VLAN。</p>' },
        { id: 'svi', x: 440, y: 230, w: 120, h: 56, label: 'Vlan100', sub: '192.168.100.1/24', kind: 'kernel', info: '<p>VLAN 介面（SVI），讓 CPU 能在這個 VLAN 上收發 IP 封包（例如回應 ARP、DHCP relay）。</p>' },
        { id: 'kp', x: 270, y: 340, w: 150, h: 56, label: 'Ethernet8', sub: 'master Bridge', kind: 'kernel', info: '<p>成員 port 被掛到 Bridge 底下。</p>' },
        { id: 'svlan', x: 660, y: 230, w: 140, h: 56, label: 'VLAN', sub: 'VLAN_ID=100', kind: 'hw', info: '<p><code>SAI_OBJECT_TYPE_VLAN</code></p>' },
        { id: 'sbp', x: 820, y: 230, w: 140, h: 56, label: 'BRIDGE_PORT', sub: 'PORT_ID=Ethernet8', kind: 'hw', info: '<p>把實體 port（或 LAG）包成 .1Q bridge 上的 bridge port，才能加入 VLAN。</p>' },
        { id: 'svm', x: 740, y: 320, w: 160, h: 56, label: 'VLAN_MEMBER', sub: 'UNTAGGED', kind: 'hw', info: '<p>把 bridge port 加入 VLAN，並指定 tagging mode。</p>' },
        { id: 'srif', x: 660, y: 410, w: 300, h: 50, label: 'ROUTER_INTERFACE (type=VLAN)', kind: 'hw', info: '<p>讓這個 VLAN 可以被路由：目的 MAC 是交換機自己的封包會進入 L3 查表。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'vm', id: 'e1' },
        { from: 'cfg', to: 'im', id: 'e1b', via: [[240, 130], [515, 130]] },
        { from: 'vm', to: 'br', label: 'bridge / ip link', id: 'e2' },
        { from: 'vm', to: 'appl', id: 'e3', via: [[355, 26], [720, 26]] },
        { from: 'im', to: 'svi', label: 'ip addr add', id: 'e4' },
        { from: 'im', to: 'appl', id: 'e5' },
        { from: 'appl', to: 'orch', id: 'e6' },
        { from: 'orch', to: 'svlan', id: 'e7', via: [[905, 150], [730, 150]] },
        { from: 'orch', to: 'sbp', id: 'e8' },
        { from: 'sbp', to: 'svm', id: 'e9' },
        { from: 'svlan', to: 'svm', id: 'e10' },
        { from: 'svlan', to: 'srif', id: 'e11', via: [[700, 386]] },
        { from: 'br', to: 'svi', id: 'k1' },
        { from: 'br', to: 'kp', id: 'k2' },
      ],
      steps: [
        { title: 'config vlan add 100', text: 'CLI 寫入 <code>VLAN|Vlan100</code>。vlanmgrd 在 Bridge 上加入 vid 100、建立 Vlan100 介面，寫 APPL_DB <code>VLAN_TABLE:Vlan100</code>。', nodes: ['cfg', 'vm', 'br', 'svi', 'appl'], edges: ['e1', 'e2', 'e3', 'k1'] },
        { title: 'PortsOrch 建立 SAI VLAN', text: 'orchagent 呼叫 <code>create_vlan(VLAN_ID=100)</code>。', nodes: ['appl', 'orch', 'svlan'], edges: ['e6', 'e7'] },
        { title: 'config vlan member add -u 100 Ethernet8', text: 'vlanmgrd 把 Ethernet8 掛到 Bridge、設定 pvid 100 untagged，寫 <code>VLAN_MEMBER_TABLE:Vlan100:Ethernet8</code>。', nodes: ['cfg', 'vm', 'br', 'kp', 'appl'], edges: ['e1', 'e2', 'e3', 'k2'] },
        { title: '建立 Bridge Port 與 VLAN Member', text: 'PortsOrch 先把 Ethernet8 包成 BRIDGE_PORT，再建立 VLAN_MEMBER（UNTAGGED）。', nodes: ['orch', 'sbp', 'svm', 'svlan'], edges: ['e8', 'e9', 'e10'] },
        { title: 'config interface ip add Vlan100 192.168.100.1/24', text: 'intfmgrd 在 Vlan100 設 IP；IntfsOrch 建立 VLAN 型別的 ROUTER_INTERFACE，以及 192.168.100.0/24 subnet 路由與 ip2me 路由。', nodes: ['im', 'svi', 'appl', 'orch', 'srif', 'svlan'], edges: ['e1b', 'e4', 'e5', 'e11'] },
      ],
    });
    S.terminal(root.querySelector('#term'), {
      filter: 'Vlan',
      chips: [
        'sudo config vlan add 100',
        'sudo config interface startup Ethernet8',
        'sudo config vlan member add -u 100 Ethernet8',
        'sudo config vlan member add 100 Ethernet4',
        'sudo config interface ip add Vlan100 192.168.100.1/24',
        'show vlan brief',
        'sudo config vlan member add 100 Ethernet0',
        'sonic-db-cli ASIC_DB keys "*VLAN*"',
        'sudo config vlan del 100',
      ],
    });
  },
  keypoints: [
    'vlanmgrd 在 Linux 用單一 vlan-aware bridge「Bridge」實作所有 VLAN，並為每個 VLAN 建立 VlanX 介面。',
    'ASIC 端需要三種 SAI 物件：VLAN、BRIDGE_PORT、VLAN_MEMBER；加 IP 後再建立 VLAN 型別的 ROUTER_INTERFACE。',
    'untagged 決定 port 的 PVID，一個 port 只能 untagged 於一個 VLAN；tagged 可以有多個。',
    '刪除 VLAN 前要先移除所有成員與 IP。',
  ],
  related: ['neighbor', 'lag', 'port', 'cli-lab'],
  refs: [['SONiC Configuration（VLAN 範例）', 'https://github.com/sonic-net/SONiC/wiki/Configuration']],
});
