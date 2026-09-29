(function () {
  const TYPES = [
    { n: '一般資料流量', trap: '—', group: '—', q: '—', action: '硬體轉發', nodes: ['in', 'pipe', 'fwd'], edges: ['in>pipe', 'pipe>fwd'], text: '目的地不是交換機自己，也沒有命中任何 trap 規則，<b>完全由 ASIC 轉發，CPU 看不到</b>。這是 99.9% 以上流量的路徑。' },
    { n: 'BGP (TCP 179)', trap: 'bgp, bgpv6', group: 'queue4_group1', q: '4', action: 'trap', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'bgpd'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drv', 'drv>nd', 'nd>bgpd'], text: '命中 BGP trap，放進高優先權 CPU 佇列 4，經驅動送到 Linux 的 Ethernet0，再由 kernel TCP stack 交給 bgpd。' },
    { n: 'LACP', trap: 'lacp', group: 'queue4_group1', q: '4', action: 'trap', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'teamd'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drv', 'drv>nd', 'nd>teamd'], text: 'LACPDU（慢速協定，目的 MAC 01:80:C2:00:00:02）被 trap 給 teamd。若 LACP 被丟包，LAG 成員可能被踢出，因此與 BGP 同樣是高優先權。' },
    { n: 'LLDP', trap: 'lldp', group: 'queue4_group3', q: '4', action: 'trap', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'lldpd'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drv', 'drv>nd', 'nd>lldpd'], text: 'LLDP 封包被 trap 給 lldp 容器的 lldpd。' },
    { n: 'ARP', trap: 'arp_req, arp_resp, neigh_discovery', group: 'queue4_group2', q: '4', action: 'copy（複製一份給 CPU）', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'stack', 'fwd'], edges: ['in>pipe', 'pipe>trap', 'pipe>fwd', 'trap>q', 'q>drv', 'drv>nd', 'nd>stack'], text: 'ARP 的動作是 <b>copy</b>：原封包照常在 VLAN 內轉發（廣播），同時複製一份給 CPU，讓 kernel 更新鄰居表。有 policer 限速（例如 600 pps）。' },
    { n: 'DHCP', trap: 'dhcp, dhcpv6', group: 'queue4_group3', q: '4', action: 'trap', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'dhcp'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drv', 'drv>nd', 'nd>dhcp'], text: '伺服器的 DHCP Discover 被 trap 給 dhcp_relay 容器，再轉送到遠端 DHCP server。' },
    { n: 'Ping 交換機 IP', trap: 'ip2me', group: 'queue1_group1', q: '1', action: 'trap', nodes: ['in', 'pipe', 'trap', 'q', 'drv', 'nd', 'stack'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drv', 'drv>nd', 'nd>stack'], text: '目的 IP 是交換機自己（命中 ip2me 路由，指向 CPU port）。放在較低優先權的佇列 1，有較高的速率上限。由 kernel 回應 ICMP echo。' },
    { n: '大量攻擊流量', trap: 'ip2me', group: 'queue1_group1', q: '1', action: '超過 policer → 丟棄', nodes: ['in', 'pipe', 'trap', 'q', 'drop'], edges: ['in>pipe', 'pipe>trap', 'trap>q', 'q>drop'], text: '有人每秒送出數十萬個封包打交換機 IP。<b>CoPP policer</b> 在 ASIC 中限制每個 trap group 的速率，超過的部分直接在硬體丟棄，保護 CPU 不被打爆，BGP 等高優先權流量也不受影響。' },
  ];

  S.register({
    id: 'copp',
    category: 'svc',
    order: 2,
    title: 'CoPP 與 CPU 封包路徑',
    en: 'Control Plane Policing',
    summary: "CoPP 決定哪些封包由 ASIC 送往 CPU、使用哪個佇列與速率上限。設定由 copp_cfg.json 載入 CONFIG_DB，經 coppmgrd 與 CoppOrch 轉為 SAI hostif trap、trap group 與 policer。",
    meta: [["程序", ["coppmgrd", "orchagent (CoppOrch)"]], ["資料表", ["CONFIG_DB COPP_TRAP / COPP_GROUP", "APPL_DB COPP_TABLE"]], ["設定檔", ["/etc/sonic/copp_cfg.json"]], ["SAI 物件", ["HOSTIF_TRAP", "HOSTIF_TRAP_GROUP", "POLICER", "HOSTIF_TABLE_ENTRY"]]],
    tags: ['CoPP', 'trap', 'hostif', 'policer', 'coppmgrd', 'CoppOrch', 'knet'],
    html: `
<h2>晶片內部：管線與 CPU 路徑</h2>
<p>交換晶片內部的轉發管線立體模型。最後一步示範 CoPP：控制封包在 ACL 階段被 trap，經 CPU 佇列與 policer 送往 CPU，超量的 ARP 在晶片內就被丟棄。</p>
<div id="s3-pipe"></div>

<h2>封包路徑</h2>
<div id="sel" style="margin-bottom:6px"></div>
<div id="d-copp"></div>

<h2>預設 CoPP 設定</h2>
<p>預設設定來自 <code>/etc/sonic/copp_cfg.json</code>，載入 CONFIG_DB 的 <code>COPP_TRAP</code> 與 <code>COPP_GROUP</code>。<b>coppmgrd</b> 把它們合併成 APPL_DB <code>COPP_TABLE</code>，再由 <b>CoppOrch</b> 建立 SAI 的 HOSTIF_TRAP、HOSTIF_TRAP_GROUP 與 POLICER。</p>
<div id="tbl"></div>
<p class="muted" style="font-size:14px">（簡化自預設 copp_cfg.json，實際數值依版本與平台而異；可用 <code>show copp configuration</code> 或 <code>sonic-db-cli CONFIG_DB keys "COPP_*"</code> 查看。）</p>

<h2>trap 動作</h2>
<table><thead><tr><th>動作</th><th>意思</th><th>例子</th></tr></thead><tbody>
<tr><td><code>trap</code></td><td>只送給 CPU，不在硬體轉發</td><td>BGP、LACP、LLDP</td></tr>
<tr><td><code>copy</code></td><td>照常轉發，同時複製一份給 CPU</td><td>ARP、NDP</td></tr>
<tr><td><code>drop</code></td><td>直接丟棄</td><td>—</td></tr>
</tbody></table>
<div class="callout"><div class="ct">CPU 封包的注入方式</div><p>每個前面板 port 都有一個 hostif netdev（見「Port 與介面初始化」）。ASIC 把 trap 的封包經 PCIe 送到 CPU，廠商驅動（例如 Broadcom 的 knet）依照封包的來源 port，把它注入對應的 <code>Ethernet0</code> 等介面，Linux 程式就像從一般網卡收到封包一樣。反方向，程式從 Ethernet0 送出的封包也會被驅動交給 ASIC 送出。</p></div>
`,
    mount(root) {
      S.scenes.pipeline(root.querySelector('#s3-pipe'));
      const dg = S.diagram(root.querySelector('#d-copp'), {
        title: '封包在交換機內的路徑',
        hint: '用上方按鈕切換封包種類，或點選節點查看說明',
        noControls: true,
        w: 1000, h: 420,
        nodes: [
          { id: 'in', x: 20, y: 200, w: 130, h: 56, label: '封包進入', sub: 'Ethernet0', kind: 'ext', info: '<p>從前面板 port 進來的封包。</p>' },
          { id: 'pipe', x: 180, y: 200, w: 140, h: 56, label: 'ASIC Pipeline', sub: 'L2 / L3 / ACL 查表', kind: 'hw', info: '<p>硬體依序做 parser、L2 查表、L3 查表、ACL…。在此過程中判斷是否命中 trap。</p>' },
          { id: 'fwd', x: 180, y: 330, w: 140, h: 56, label: '硬體轉發', sub: '→ 出口 port', kind: 'hw', info: '<p>資料平面：直接從出口 port 送出。</p>' },
          { id: 'trap', x: 350, y: 200, w: 130, h: 56, label: 'HOSTIF_TRAP', sub: '比對 trap 類型', kind: 'hw', info: '<p>SAI hostif trap，例如 SAI_HOSTIF_TRAP_TYPE_BGP、LACP、ARP_REQUEST、IP2ME。每個 trap 屬於一個 trap group。</p>' },
          { id: 'q', x: 510, y: 200, w: 150, h: 56, label: 'CPU 佇列 + Policer', sub: 'trap group', kind: 'hw', info: '<p>trap group 決定 CPU 佇列（優先權）與 policer（速率上限，例如 600 pps）。超過就在硬體丟棄。</p>' },
          { id: 'drop', x: 510, y: 330, w: 150, h: 56, label: '丟棄', sub: '超過速率', kind: 'ext', info: '<p>被 policer 丟棄的封包，可在 COUNTERS_DB 的 trap / policer 計數器看到。</p>' },
          { id: 'drv', x: 690, y: 200, w: 120, h: 56, label: '驅動', sub: 'knet / genetlink', kind: 'kernel', info: '<p>廠商 kernel 驅動把封包依來源 port 注入到對應 netdev。</p>' },
          { id: 'nd', x: 840, y: 200, w: 140, h: 56, label: 'Linux netdev', sub: 'Ethernet0', kind: 'kernel', info: '<p>與 port 一一對應的 hostif 介面。</p>' },
          { id: 'bgpd', x: 510, y: 40, w: 100, h: 50, label: 'bgpd', kind: 'proc', info: '<p>bgp 容器。</p>' },
          { id: 'teamd', x: 630, y: 40, w: 100, h: 50, label: 'teamd', kind: 'proc', info: '<p>teamd 容器，LACP。</p>' },
          { id: 'lldpd', x: 750, y: 40, w: 100, h: 50, label: 'lldpd', kind: 'proc', info: '<p>lldp 容器。</p>' },
          { id: 'dhcp', x: 870, y: 40, w: 110, h: 50, label: 'dhcrelay', kind: 'proc', info: '<p>dhcp_relay 容器。</p>' },
          { id: 'stack', x: 840, y: 330, w: 140, h: 56, label: 'Kernel 協定堆疊', sub: 'ARP 表 / ICMP', kind: 'kernel', info: '<p>ARP 與 ICMP 由 Linux kernel 本身處理。</p>' },
        ],
        edges: [
          { from: 'in', to: 'pipe' },
          { from: 'pipe', to: 'fwd' },
          { from: 'pipe', to: 'trap' },
          { from: 'trap', to: 'q' },
          { from: 'q', to: 'drop', dash: true },
          { from: 'q', to: 'drv' },
          { from: 'drv', to: 'nd' },
          { from: 'nd', to: 'bgpd' },
          { from: 'nd', to: 'teamd' },
          { from: 'nd', to: 'lldpd' },
          { from: 'nd', to: 'dhcp' },
          { from: 'nd', to: 'stack' },
        ],
        steps: TYPES.map(t => ({ title: t.n, text: `${t.text}<div class="row" style="margin-top:6px;font-size:13px"><span class="badge b">trap: ${t.trap}</span><span class="badge b">group: ${t.group}</span><span class="badge b">CPU queue: ${t.q}</span><span class="badge ${t.action.includes('丟') ? 'r' : 'g'}">${t.action}</span></div>`, nodes: t.nodes, edges: t.edges })),
      });
      S.seg(root.querySelector('#sel'), TYPES.map(t => t.n), i => dg.go(i));

      root.querySelector('#tbl').innerHTML = `<table><thead><tr><th>COPP_TRAP</th><th>trap_ids</th><th>trap_group</th><th>queue</th><th>動作</th><th>限速 (CIR)</th></tr></thead><tbody>
        <tr><td>bgp</td><td>bgp, bgpv6</td><td>queue4_group1</td><td>4</td><td>trap</td><td>—</td></tr>
        <tr><td>lacp</td><td>lacp</td><td>queue4_group1</td><td>4</td><td>trap</td><td>—</td></tr>
        <tr><td>arp</td><td>arp_req, arp_resp, neigh_discovery</td><td>queue4_group2</td><td>4</td><td>copy</td><td>600 pps</td></tr>
        <tr><td>lldp</td><td>lldp</td><td>queue4_group3</td><td>4</td><td>trap</td><td>—</td></tr>
        <tr><td>dhcp_relay</td><td>dhcp, dhcpv6</td><td>queue4_group3</td><td>4</td><td>trap</td><td>—</td></tr>
        <tr><td>ip2me</td><td>ip2me</td><td>queue1_group1</td><td>1</td><td>trap</td><td>6000 pps</td></tr>
        <tr><td>sflow</td><td>sample_packet</td><td>queue2_group1</td><td>2</td><td>trap（psample）</td><td>1000 pps</td></tr>
        <tr><td>（其他）</td><td>—</td><td>default</td><td>0</td><td>—</td><td>600 pps</td></tr>
      </tbody></table>`;
    },
    keypoints: [
      '大部分封包由 ASIC 直接轉發；只有命中 HOSTIF_TRAP 的控制封包會送到 CPU。',
      'trap group 決定 CPU 佇列優先權與 policer 限速，保護 CPU 不被流量打爆。',
      'copp_cfg.json → CONFIG_DB COPP_TRAP/COPP_GROUP → coppmgrd → APPL_DB COPP_TABLE → CoppOrch → SAI。',
      'ARP 使用 copy：照常轉發並複製一份給 CPU；BGP、LACP 使用 trap。',
      '驅動把封包注入對應的 Linux netdev，讓標準 Linux 程式直接處理控制協定。',
    ],
    related: ['neighbor', 'port', 'acl', 'routing'],
  });
})();
