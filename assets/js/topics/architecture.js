S.register({
  id: 'architecture',
  category: 'intro',
  order: 2,
  title: '系統架構總覽',
  en: 'System Architecture',
  summary: "SONiC 主要元件與其互動關係：協定容器、Redis 狀態資料庫、SWSS、syncd/SAI、Linux kernel 與 ASIC，以及控制、資料與 CPU 封包三種路徑。",
  meta: [["主要容器", ["database", "swss", "syncd", "bgp", "teamd", "lldp", "pmon", "snmp", "gnmi"]], ["核心程序", ["orchagent", "syncd", "fpmsyncd", "vlanmgrd", "portsyncd"]], ["核心資料庫", ["CONFIG_DB", "APPL_DB", "ASIC_DB", "STATE_DB", "COUNTERS_DB"]]],
  tags: ['架構', 'orchagent', 'syncd', 'Redis', 'FRR'],
  html: `
<h2>全系統架構圖</h2>
<p>這是 SONiC 最常被引用的架構觀點。每一個方塊都可以點，看它是誰、在哪個容器、讀寫哪些資料。按「下一步」可以看<b>一條 BGP 學到的路由</b>如何一路寫進交換晶片。</p>
<div id="d-arch"></div>

<h2>分層檢視</h2>
<p>把 SONiC 依職責分成四層：上層的應用容器產生意圖，Redis 作為各層之間唯一的介面，SWSS 與 SYNCD 把意圖轉成 SAI 呼叫，最後寫入交換晶片。切到 3D 可以看到資料如何一層層往下流。</p>
<div id="d-stack"></div>

<h2>三種資料路徑</h2>
<div class="defs">
  <div><b>① 設定 / 控制路徑</b><p>CLI、BGP 等軟體產生「想要的狀態」，經 Redis → SWSS → syncd → SAI 寫進晶片。這是本站大部分主題在講的路徑。</p></div>
  <div><b>② 資料路徑（Data Plane）</b><p>一般使用者流量完全由 ASIC 以硬體轉發，<b>不經過 CPU</b>，也不經過 Linux。</p></div>
  <div><b>③ CPU 封包路徑（Punt / Trap）</b><p>BGP、LACP、LLDP、ARP 等控制封包，會被 ASIC 抓（trap）給 CPU，經 driver 送進 Linux 的 <code>Ethernet0</code> 等介面，讓一般 Linux 程式處理。見「CoPP 與封包路徑」。</p></div>
</div>

<h2>元件分類</h2>
<table>
<thead><tr><th>類型</th><th>資料方向</th><th>例子</th><th>在做什麼</th></tr></thead>
<tbody>
<tr><td><b>*mgrd</b>（manager daemon）</td><td>CONFIG_DB → kernel + APPL_DB</td><td>vlanmgrd、intfmgrd、portmgrd、teammgrd、nbrmgrd、vrfmgrd、buffermgrd、coppmgrd</td><td>把「使用者設定」套用到 Linux kernel，並產生 APPL_DB 項目</td></tr>
<tr><td><b>*syncd</b>（sync daemon）</td><td>kernel / 協定 → APPL_DB / STATE_DB</td><td>portsyncd、neighsyncd、fpmsyncd、teamsyncd、lldp_syncd</td><td>把「系統實際學到的狀態」同步進 Redis</td></tr>
<tr><td><b>orchagent</b></td><td>APPL_DB → ASIC_DB</td><td>PortsOrch、RouteOrch、NeighOrch、AclOrch…</td><td>把高階物件轉成 SAI 物件，處理物件之間的相依關係</td></tr>
<tr><td><b>syncd</b></td><td>ASIC_DB → SAI → ASIC</td><td>syncd（每顆 ASIC 一個）</td><td>呼叫廠商 SAI，並把硬體事件（port 狀態、FDB 學習）回報上去</td></tr>
</tbody></table>
<div class="callout warn"><div class="ct">命名易混淆</div><p><b>syncd</b>（單獨一個，負責 SAI）和 <b>*syncd</b>（portsyncd、neighsyncd 這一類，在 swss 容器）名字很像，但角色完全不同！</p></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-stack'), {
      title: 'SONiC 分層架構與資料流',
      w: 1000, h: 530, layerGap: 100, view3d: 'iso',
      groups: [
        { x: 20, y: 14, w: 960, h: 112, lv: 3, kind: 'container', label: '應用與管理容器' },
        { x: 20, y: 146, w: 960, h: 100, lv: 2, kind: 'db', label: 'Redis（database 容器）' },
        { x: 20, y: 266, w: 960, h: 112, lv: 1, kind: 'proc', label: 'SWSS · SYNCD' },
        { x: 20, y: 398, w: 960, h: 112, lv: 0, kind: 'hw', label: 'Linux Kernel 與交換晶片' },
      ],
      nodes: [
        { id: 'bgp', x: 40, y: 44, w: 170, h: 60, lv: 3, label: 'bgp（FRR）', sub: 'bgpd · zebra', kind: 'container', info: '<p>路由協定。學到的路由經 zebra 同時送進 kernel 與 fpmsyncd。</p>' },
        { id: 'teamd', x: 235, y: 44, w: 150, h: 60, lv: 3, label: 'teamd', sub: 'LACP', kind: 'container', info: '<p>LACP 與 PortChannel 成員狀態。</p>' },
        { id: 'lldp', x: 410, y: 44, w: 150, h: 60, lv: 3, label: 'lldp', sub: 'lldpd · lldp_syncd', kind: 'container', info: '<p>鄰居探索，結果寫入 APPL_DB。</p>' },
        { id: 'mgmt', x: 585, y: 44, w: 190, h: 60, lv: 3, label: '管理介面', sub: 'CLI · REST · gNMI · SNMP', kind: 'cli', info: '<p>使用者與自動化工具的入口：寫入 CONFIG_DB，讀取 STATE_DB 與 COUNTERS_DB。</p>' },
        { id: 'pmon', x: 800, y: 44, w: 160, h: 60, lv: 3, label: 'pmon', sub: 'xcvrd · psud · thermalctld', kind: 'container', info: '<p>平台監控，把光模組、電源、風扇狀態寫入 STATE_DB。</p>' },
        { id: 'cfg', x: 40, y: 170, w: 170, h: 56, lv: 2, label: 'CONFIG_DB', sub: '使用者設定', kind: 'db' },
        { id: 'appl', x: 235, y: 170, w: 170, h: 56, lv: 2, label: 'APPL_DB', sub: '應用產生的期望狀態', kind: 'db' },
        { id: 'state', x: 430, y: 170, w: 160, h: 56, lv: 2, label: 'STATE_DB', sub: '運作狀態', kind: 'db' },
        { id: 'asicdb', x: 615, y: 170, w: 170, h: 56, lv: 2, label: 'ASIC_DB', sub: 'SAI 物件', kind: 'db' },
        { id: 'cnt', x: 810, y: 170, w: 150, h: 56, lv: 2, label: 'COUNTERS_DB', sub: '計數器', kind: 'db' },
        { id: 'fpm', x: 40, y: 294, w: 170, h: 60, lv: 1, label: 'fpmsyncd', sub: '路由 → APPL_DB', kind: 'proc' },
        { id: 'mgrd', x: 235, y: 294, w: 170, h: 60, lv: 1, label: '*mgrd', sub: 'vlanmgrd · intfmgrd…', kind: 'proc', info: '<p>把 CONFIG_DB 的設定套到 kernel（建立 netdev、bridge），並寫入 APPL_DB。</p>' },
        { id: 'orch', x: 430, y: 294, w: 200, h: 60, lv: 1, label: 'orchagent', sub: 'PortsOrch · RouteOrch …', kind: 'proc', info: '<p>讀 APPL_DB，處理相依關係後轉成 SAI 物件寫入 ASIC_DB。</p>' },
        { id: 'syncd', x: 680, y: 294, w: 200, h: 60, lv: 1, label: 'syncd', sub: 'sairedis → libsai', kind: 'proc', info: '<p>讀 ASIC_DB，呼叫廠商 SAI；並定期讀回計數器寫入 COUNTERS_DB。</p>' },
        { id: 'kern', x: 40, y: 426, w: 520, h: 60, lv: 0, label: 'Linux Kernel', sub: 'netdev · 路由表 · 鄰居表 · bridge · team', kind: 'kernel', info: '<p>控制平面的封包收發與 Linux 網路狀態；與 ASIC 的狀態保持一致。</p>' },
        { id: 'asic', x: 620, y: 426, w: 320, h: 60, lv: 0, label: '交換晶片 ASIC', sub: '線速轉發', kind: 'hw' },
      ],
      edges: [
        { from: 'mgmt', to: 'cfg', label: '寫入設定', id: 'c1' },
        { from: 'cfg', to: 'mgrd', id: 'c2' },
        { from: 'mgrd', to: 'appl', id: 'c3' },
        { from: 'mgrd', to: 'kern', label: 'ip / bridge', id: 'c4' },
        { from: 'bgp', to: 'fpm', label: 'FPM', id: 'r1' },
        { from: 'bgp', to: 'kern', dash: true, label: 'zebra → kernel', id: 'r0' },
        { from: 'fpm', to: 'appl', label: 'ROUTE_TABLE', id: 'r2' },
        { from: 'appl', to: 'orch', id: 'o1' },
        { from: 'orch', to: 'asicdb', label: 'SAI 物件', id: 'o2' },
        { from: 'asicdb', to: 'syncd', id: 's1' },
        { from: 'syncd', to: 'asic', label: 'SAI API', id: 's2' },
        { from: 'syncd', to: 'cnt', dash: true, label: 'counters', id: 'k1' },
        { from: 'cnt', to: 'mgmt', dash: true, id: 'k2' },
        { from: 'pmon', to: 'state', dash: true, id: 'p1' },
      ],
      steps: [
        { title: '使用者設定', text: 'CLI、REST 或 gNMI 把設定寫進 CONFIG_DB。這是所有設定的單一來源，也是 config save 儲存的內容。', nodes: ['mgmt', 'cfg'], edges: ['c1'] },
        { title: '管理程序套用', text: '*mgrd 讀取 CONFIG_DB，在 kernel 建立對應的 netdev 或 bridge，並把結果寫入 APPL_DB。', nodes: ['cfg', 'mgrd', 'appl', 'kern'], edges: ['c2', 'c3', 'c4'] },
        { title: '協定學到的狀態', text: 'BGP 學到的路由經 zebra 送進 kernel，同時透過 FPM 交給 fpmsyncd，寫入 APPL_DB 的 ROUTE_TABLE。', nodes: ['bgp', 'fpm', 'appl', 'kern'], edges: ['r1', 'r0', 'r2'] },
        { title: 'orchagent 轉換', text: 'orchagent 從 APPL_DB 取得期望狀態，處理相依關係（例如 next hop 需要鄰居），轉成 SAI 物件寫入 ASIC_DB。', nodes: ['appl', 'orch', 'asicdb'], edges: ['o1', 'o2'] },
        { title: 'syncd 寫入晶片', text: 'syncd 讀取 ASIC_DB，透過廠商的 libsai 設定交換晶片。到這一步封包才開始由硬體轉發。', nodes: ['asicdb', 'syncd', 'asic'], edges: ['s1', 's2'] },
        { title: '狀態與計數器回報', text: 'syncd 週期讀取晶片計數器寫入 COUNTERS_DB，pmon 寫入平台狀態；CLI、SNMP、gNMI 都從這些資料庫讀取。', nodes: ['syncd', 'cnt', 'mgmt', 'pmon', 'state'], edges: ['k1', 'k2', 'p1'] },
      ],
    });

    S.diagram(root.querySelector('#d-arch'), {
      title: 'SONiC 系統架構',
      w: 1000, h: 660,
      groups: [
        { x: 16, y: 14, w: 300, h: 176, label: 'bgp 容器（FRR）' },
        { x: 332, y: 14, w: 200, h: 176, label: 'teamd 容器' },
        { x: 16, y: 318, w: 700, h: 138, label: 'swss 容器' },
        { x: 736, y: 318, w: 248, h: 190, label: 'syncd 容器' },
      ],
      nodes: [
        { id: 'bgpd', x: 34, y: 48, w: 120, h: 44, label: 'bgpd', kind: 'proc', info: '<p>FRR 的 BGP daemon，與鄰居建立 BGP session、交換路由，選出最佳路徑後交給 zebra。</p><p>其設定由 <b>bgpcfgd</b> 依 CONFIG_DB（如 <code>BGP_NEIGHBOR</code>）動態產生。</p>' },
        { id: 'zebra', x: 176, y: 48, w: 120, h: 44, label: 'zebra', kind: 'proc', info: '<p>FRR 的路由管理核心（RIB manager）。收集各協定（BGP、static、connected）的路由，選出最終路由後：</p><ul><li>透過 netlink 寫進 Linux kernel 路由表</li><li>透過 <b>FPM</b>（Forwarding Plane Manager）socket 送給 fpmsyncd</li></ul>' },
        { id: 'fpm', x: 105, y: 128, w: 140, h: 44, label: 'fpmsyncd', kind: 'proc', info: '<p>SONiC 自己寫的程式，跑在 bgp 容器中。監聽 zebra 送來的 FPM 訊息，把路由寫到 <code>APPL_DB</code> 的 <code>ROUTE_TABLE</code>。</p>' },
        { id: 'teamd', x: 350, y: 48, w: 164, h: 44, label: 'teamd / teammgrd', kind: 'proc', info: '<p><b>teammgrd</b> 依 CONFIG_DB 的 PORTCHANNEL 設定，為每個 LAG 啟動一個 <b>teamd</b> 程序（libteam），由它跑 LACP 協定。</p>' },
        { id: 'teamsyncd', x: 350, y: 128, w: 164, h: 44, label: 'teamsyncd', kind: 'proc', info: '<p>監看 teamd 的 LAG 成員狀態，把結果寫進 <code>APPL_DB</code> 的 <code>LAG_TABLE</code> / <code>LAG_MEMBER_TABLE</code>。</p>' },
        { id: 'lldp', x: 548, y: 20, w: 118, h: 48, label: 'lldp', kind: 'container', info: '<p><b>lldpd</b> 收發 LLDP 封包發現鄰居，<b>lldp_syncd</b> 把鄰居資訊寫進 APPL_DB <code>LLDP_ENTRY_TABLE</code>；<code>show lldp table</code> 就是讀這裡。</p>' },
        { id: 'snmp', x: 548, y: 84, w: 118, h: 48, label: 'snmp', kind: 'container', info: '<p>snmpd + SONiC 的 AgentX 子代理（Python），<b>直接讀 Redis</b>（COUNTERS_DB、STATE_DB…）來回答 SNMP 查詢。</p>' },
        { id: 'gnmi', x: 696, y: 20, w: 118, h: 48, label: 'gnmi', kind: 'container', info: '<p>gNMI / Streaming Telemetry 伺服器。可以用 gNMI 路徑直接訂閱 Redis 內容（如 COUNTERS_DB），也支援透過 gNMI 修改設定。</p>' },
        { id: 'pmon', x: 696, y: 84, w: 118, h: 48, label: 'pmon', kind: 'container', info: '<p>Platform Monitor：xcvrd（光模組）、psud（電源）、thermalctld（溫度/風扇）、ledd、syseepromd… 結果寫入 <code>STATE_DB</code>。</p>' },
        { id: 'cli', x: 844, y: 20, w: 136, h: 48, label: 'CLI (config/show)', kind: 'cli', info: '<p>在 host 上執行的 Python click 程式。<code>config</code> 寫 CONFIG_DB，<code>show</code> 讀各個 DB 或呼叫其他工具（vtysh、teamdctl…）。</p>' },
        { id: 'host', x: 844, y: 84, w: 136, h: 48, label: 'host daemons', sub: 'hostcfgd / caclmgrd', kind: 'proc', info: '<p>直接跑在 host（不在容器）的服務，例如 <b>hostcfgd</b>（AAA、NTP 等主機設定）、<b>caclmgrd</b>（把控制平面 ACL 轉成 iptables）。</p>' },
        { id: 'redis', x: 16, y: 226, w: 968, h: 56, label: 'database 容器：Redis — CONFIG_DB · APPL_DB · STATE_DB · ASIC_DB · COUNTERS_DB · FLEX_COUNTER_DB', kind: 'db', info: '<p>整個系統的中樞。所有容器都透過 unix socket / TCP 連到它。每個邏輯 DB 在 redis 裡是不同的 DB 編號（例如 APPL_DB=0、ASIC_DB=1、CONFIG_DB=4、STATE_DB=6）。</p><p>詳見「Redis 資料庫」主題。</p>' },
        { id: 'mgrd', x: 34, y: 352, w: 200, h: 84, label: '*mgrd', sub: 'vlanmgrd / intfmgrd\nportmgrd / nbrmgrd …', kind: 'proc', info: '<p>訂閱 CONFIG_DB。例如 vlanmgrd 看到 <code>VLAN|Vlan100</code> 就在 kernel 建 Vlan100 介面，然後寫 <code>APPL_DB VLAN_TABLE:Vlan100</code>。</p>' },
        { id: 'syncds', x: 252, y: 352, w: 200, h: 84, label: '*syncd', sub: 'portsyncd / neighsyncd', kind: 'proc', info: '<p>監聽 Linux netlink 事件：portsyncd 追蹤 netdev 建立與狀態，neighsyncd 追蹤 ARP/NDP 鄰居，寫進 APPL_DB / STATE_DB。</p>' },
        { id: 'orch', x: 470, y: 352, w: 230, h: 84, label: 'orchagent', sub: 'PortsOrch / RouteOrch\nNeighOrch / AclOrch …', kind: 'proc', info: '<p>SONiC 的大腦。訂閱 APPL_DB（以及少數 CONFIG_DB 表），由許多 <b>Orch</b> 模組處理不同功能，把它們轉成 SAI 物件，透過 <b>sairedis</b> 函式庫寫進 ASIC_DB。</p><p>它也負責相依性：例如路由的 next hop 還沒解析出 MAC 前，路由不會下到 ASIC。</p>' },
        { id: 'syncd', x: 756, y: 352, w: 208, h: 50, label: 'syncd', kind: 'proc', info: '<p>讀取 ASIC_DB 的變化，把 SONiC 的「虛擬 OID（VID）」轉成晶片的「真實 OID（RID）」，呼叫廠商 SAI。也把晶片事件（port up/down、FDB 學習）送回 orchagent。</p>' },
        { id: 'sai', x: 756, y: 438, w: 208, h: 50, label: 'libsai + 廠商 SDK', kind: 'hw', info: '<p>晶片廠商提供的 SAI 實作（<code>libsai.so</code>）與底層 SDK，把標準 SAI 呼叫翻譯成各家晶片的暫存器 / 表格操作。</p>' },
        { id: 'kernel', x: 16, y: 500, w: 700, h: 56, label: 'Linux Kernel：Ethernet0… netdev · Bridge (VLAN) · 路由表 · ARP 表 · team 介面', kind: 'kernel', info: '<p>SONiC 讓 kernel 維護一份「影子」網路狀態：每個前面板埠都有對應的 netdev，VLAN 用 Linux bridge、LAG 用 team driver。這讓標準 Linux 網路程式可直接使用這些介面收發控制封包。</p>' },
        { id: 'asic', x: 756, y: 590, w: 208, h: 50, label: '交換晶片 ASIC', kind: 'hw', info: '<p>以硬體線速轉發封包。一般流量不經 CPU；控制封包則依 CoPP/trap 規則送到 CPU。</p>' },
      ],
      edges: [
        { from: 'bgpd', to: 'zebra', id: 'b-z' },
        { from: 'zebra', to: 'fpm', label: 'FPM', id: 'z-f' },
        { from: 'fpm', to: 'redis', label: 'ROUTE_TABLE', id: 'f-r' },
        { from: 'teamsyncd', to: 'redis', id: 't-r' },
        { from: 'lldp', to: 'redis', id: 'l-r', via: [[681, 44], [681, 206]] },
        { from: 'snmp', to: 'redis', dash: true, id: 's-r' },
        { from: 'gnmi', to: 'redis', dash: true, bi: true, id: 'g-r', via: [[829, 44], [829, 206]] },
        { from: 'pmon', to: 'redis', id: 'p-r' },
        { from: 'cli', to: 'redis', label: 'CONFIG_DB', id: 'c-r', via: [[990, 44], [990, 206]], lx: 930, ly: 206 },
        { from: 'host', to: 'redis', dash: true, id: 'h-r' },
        { from: 'redis', to: 'mgrd', label: 'CONFIG_DB', id: 'r-m' },
        { from: 'syncds', to: 'redis', id: 'sy-r' },
        { from: 'redis', to: 'orch', label: 'APPL_DB', bi: true, id: 'r-o' },
        { from: 'orch', to: 'syncd', label: 'ASIC_DB', id: 'o-s', via: [[728, 377]], lx: 728, ly: 344 },
        { from: 'syncd', to: 'sai', label: 'SAI API', id: 's-sai' },
        { from: 'sai', to: 'asic', id: 'sai-a' },
        { from: 'mgrd', to: 'kernel', label: 'ip / bridge', id: 'm-k' },
        { from: 'kernel', to: 'syncds', label: 'netlink', id: 'k-sy' },
        { from: 'asic', to: 'kernel', label: 'CPU 封包 (trap)', dash: true, id: 'a-k', via: [[600, 615]] },
      ],
      steps: [
        { title: 'BGP 學到路由', text: 'bgpd 從鄰居收到 <code>192.168.0.0/24</code>，經過 BGP 選路後交給 zebra。', nodes: ['bgpd', 'zebra'], edges: ['b-z'] },
        { title: 'zebra 透過 FPM 通知 fpmsyncd', text: 'zebra 把路由裝進 kernel 路由表，同時透過 FPM 通道送給 SONiC 的 <b>fpmsyncd</b>。', nodes: ['zebra', 'fpm'], edges: ['z-f'] },
        { title: '寫入 APPL_DB', text: 'fpmsyncd 寫入 <code>APPL_DB</code> 的 <code>ROUTE_TABLE:192.168.0.0/24</code>，內容包含 nexthop 與出介面。', nodes: ['fpm', 'redis'], edges: ['f-r'] },
        { title: 'orchagent 轉成 SAI 物件', text: 'orchagent 的 <b>RouteOrch</b> 收到通知，找出 next hop 對應的 SAI NEXT_HOP 物件，產生 <code>SAI_OBJECT_TYPE_ROUTE_ENTRY</code> 寫入 <code>ASIC_DB</code>。', nodes: ['redis', 'orch'], edges: ['r-o'] },
        { title: 'syncd 呼叫 SAI', text: 'syncd 從 ASIC_DB 取出請求，呼叫 <code>sai_route_api->create_route_entry()</code>。', nodes: ['orch', 'syncd'], edges: ['o-s'] },
        { title: '晶片開始轉發', text: '廠商 SAI/SDK 把路由寫進 ASIC 的 LPM 表。之後往 192.168.0.0/24 的封包都由硬體直接轉發。', nodes: ['syncd', 'sai', 'asic'], edges: ['s-sai', 'sai-a'] },
      ],
    });
  },
  keypoints: [
    '容器分工：bgp（FRR）、teamd（LACP）、lldp、snmp、gnmi、pmon、swss、syncd、database。',
    '*mgrd 把 CONFIG_DB 套用到 kernel；*syncd 把 kernel/協定狀態同步回 Redis；orchagent 把 APPL_DB 轉成 ASIC_DB。',
    'syncd 是唯一呼叫 SAI 的元件，所以晶片只被一個程序操作。',
    '資料封包由 ASIC 直接轉發；控制封包才會被 trap 到 CPU、進入 Linux。',
  ],
  related: ['overview', 'containers', 'swss', 'syncd-sai', 'routing'],
  refs: [['SONiC Architecture（官方 Wiki）', 'https://github.com/sonic-net/SONiC/wiki/Architecture']],
});
