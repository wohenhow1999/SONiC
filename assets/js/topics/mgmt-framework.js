(function () {
  const PATHS = [
    {
      n: '介面 MTU',
      cli: 'sonic(config)# interface Eth1/1\nsonic(config-if-Eth1/1)# mtu 9100',
      rest: 'PATCH /restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/config/mtu\n{ "openconfig-interfaces:mtu": 9100 }',
      yang: 'openconfig-interfaces:interfaces/interface[name=Eth1/1]/config/mtu',
      db: 'CONFIG_DB  PORT|Ethernet0\n  mtu = "9100"',
      note: 'standard 命名模式下，translib 先依 PORT 表的 alias 欄位把 Eth1/1 換回原生名稱 Ethernet0，再寫入 CONFIG_DB。之後由 portmgrd 與 PortsOrch 套用。',
    },
    {
      n: 'Trunk VLAN',
      cli: 'sonic(config)# interface Eth1/1\nsonic(config-if-Eth1/1)# switchport trunk allowed Vlan 100',
      rest: 'PATCH /restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F1/openconfig-if-ethernet:ethernet/openconfig-vlan:switched-vlan/config\n{ "openconfig-vlan:config": { "interface-mode": "TRUNK", "trunk-vlans": [100] } }',
      yang: 'openconfig-interfaces:…/ethernet/switched-vlan/config/trunk-vlans',
      db: 'CONFIG_DB  VLAN_MEMBER|Vlan100|Ethernet0\n  tagging_mode = "tagged"',
      note: 'OpenConfig 以「介面的 trunk-vlans 清單」表達，SONiC 以「每個 VLAN 成員一筆 key」表達；兩者的對應由 transformer 的 subtree callback 處理。CVL 會檢查 Vlan100 是否存在（leafref）。',
    },
    {
      n: 'BGP 鄰居',
      cli: 'sonic(config)# router bgp 65100\nsonic(config-router-bgp)# neighbor 10.0.0.1\nsonic(config-router-bgp-neighbor)# remote-as 65200',
      rest: 'PATCH /restconf/data/openconfig-network-instance:network-instances/network-instance=default/protocols/protocol=BGP,bgp/bgp/neighbors/neighbor=10.0.0.1/config\n{ "openconfig-network-instance:config": { "neighbor-address": "10.0.0.1", "peer-as": 65200 } }',
      yang: 'openconfig-network-instance:…/protocols/protocol[BGP]/bgp/neighbors/neighbor/config/peer-as',
      db: 'CONFIG_DB  BGP_NEIGHBOR|default|10.0.0.1\n  asn = "65200"',
      note: 'Management Framework 模式下，BGP 相關表（BGP_GLOBALS、BGP_NEIGHBOR、BGP_NEIGHBOR_AF…）由 frrcfgd 訂閱並以 vtysh 套用到 FRR，取代社群預設的 bgpcfgd。',
    },
    {
      n: '靜態路由',
      cli: 'sonic(config)# ip route 10.10.0.0/16 10.0.0.1',
      rest: 'PATCH /restconf/data/openconfig-network-instance:network-instances/network-instance=default/protocols/protocol=STATIC,static/static-routes\n{ … "prefix": "10.10.0.0/16", "next-hops": { … "next-hop": "10.0.0.1" } }',
      yang: 'openconfig-network-instance:…/protocols/protocol[STATIC]/static-routes/static',
      db: 'CONFIG_DB  STATIC_ROUTE|default|10.10.0.0/16\n  nexthop = "10.0.0.1"',
      note: 'frrcfgd 把 STATIC_ROUTE 轉成 FRR staticd 的 ip route 設定；路由之後照一般流程經 zebra → fpmsyncd → APPL_DB → RouteOrch。',
    },
    {
      n: 'ACL 規則',
      cli: 'sonic(config)# ip access-list ACL1\nsonic(config-ipv4-acl)# seq 10 deny ip host 10.0.0.2 any',
      rest: 'PATCH /restconf/data/openconfig-acl:acl/acl-sets/acl-set=ACL1,ACL_IPV4/acl-entries\n{ … "sequence-id": 10, "ipv4": { "config": { "source-address": "10.0.0.2/32" } }, "actions": { "config": { "forwarding-action": "DROP" } } }',
      yang: 'openconfig-acl:acl/acl-sets/acl-set/acl-entries/acl-entry',
      db: 'CONFIG_DB  ACL_RULE|ACL1_ACL_IPV4|RULE_10\n  PRIORITY = "65525"\n  SRC_IP = "10.0.0.2/32"\n  PACKET_ACTION = "DROP"',
      note: 'OpenConfig 的 sequence-id（小者優先）會被轉成 SONiC 的 PRIORITY（大者優先）。表名加上 _ACL_IPV4 後綴以區分型別；這類命名轉換都寫在 transformer 中。',
    },
  ];

  S.register({
    id: 'mgmt-framework',
    category: 'core',
    order: 4,
    title: 'Management Framework',
    en: 'Management Framework, REST & gNMI',
    summary: 'Management Framework 以 YANG 模型為中心，提供統一的 CLI（Klish / sonic-cli）、REST（RESTCONF）與 gNMI 介面。請求經 translib 轉換、CVL 驗證後寫入 CONFIG_DB，再由既有的 SONiC 元件套用。Enterprise SONiC 以它作為唯一建議的設定方式。',
    meta: [
      ['容器', ['mgmt-framework', 'gnmi / telemetry']],
      ['程序', ['rest_server', 'klish (sonic-cli)', 'gnmi_server', 'frrcfgd']],
      ['核心元件', ['translib', 'transformer', 'CVL (Config Validation Library)', 'libyang']],
      ['資料模型', ['OpenConfig YANG', 'SONiC YANG (sonic-*.yang)', 'IETF YANG', '*-annot.yang (transformer 註解)']],
      ['原始碼', '<code>sonic-mgmt-framework</code>、<code>sonic-mgmt-common</code>（translib、CVL、transformer）'],
    ],
    tags: ['Management Framework', 'Klish', 'sonic-cli', 'REST', 'RESTCONF', 'gNMI', 'OpenConfig', 'YANG', 'translib', 'CVL', 'transformer', 'frrcfgd', 'interface naming', 'configuration session'],
    keypoints: [
      'CLI、REST、gNMI 三種北向介面共用同一套 translib；CLI 指令實際上是透過 REST 呼叫完成。',
      'transformer 依 annotation 把 OpenConfig / IETF 路徑對應到 SONiC 的 Redis 表與欄位；無法一對一對應的部分由 Go callback（xfmr）處理。',
      'CVL 以 SONiC YANG 驗證語法、範圍、leafref 與 must 條件，驗證通過才寫入 CONFIG_DB。',
      'DEVICE_METADATA 的 frr_mgmt_framework_config=true 時，由 frrcfgd 取代 bgpcfgd 將 CONFIG_DB 路由設定轉成 FRR 設定。',
      '在 Enterprise SONiC 中，用 Click CLI 或 vtysh 所做的設定不會反映在 Management Framework 的 running-config 中。',
    ],
    html: `
<h2>三種設定模型</h2>
<p>SONiC 的設定入口原本分散在三個地方，各自有不同的語法與存檔方式。Management Framework 的目標是把它們收斂成一個以 YANG 為中心的入口。</p>
<table>
<thead><tr><th>模型</th><th>入口</th><th>寫入位置</th><th>存檔方式</th><th>適用</th></tr></thead>
<tbody>
<tr><td>Linux shell</td><td><code>ip</code>、<code>useradd</code>…</td><td>kernel / 檔案</td><td>多半不持久</td><td>除錯、臨時操作</td></tr>
<tr><td>Click CLI（社群版）</td><td><code>sudo config …</code> / <code>show …</code></td><td>CONFIG_DB</td><td><code>config save</code> → config_db.json</td><td>社群版 SONiC 的主要介面</td></tr>
<tr><td>FRR shell</td><td><code>vtysh</code></td><td>FRR daemon</td><td>依 routing config mode 而定</td><td>路由協定</td></tr>
<tr><td>Management Framework</td><td><code>sonic-cli</code>、REST、gNMI</td><td>CONFIG_DB（經 CVL 驗證）</td><td><code>write memory</code> → config_db.json</td><td>Enterprise SONiC 的建議介面</td></tr>
</tbody></table>
<div class="callout warn"><div class="ct">混用的風險</div><p>Enterprise SONiC 的 Management Framework CLI 與 Click CLI 已不同步：用 Click 或 vtysh 做的變更不會出現在 <code>show running-configuration</code>，也可能被 Management Framework 的設定覆蓋。同一台設備應只使用一種設定入口。</p></div>

<h2>內部架構</h2>
<div id="d-mf"></div>

<h2>路徑對應範例</h2>
<p>選擇一個設定項目，比較同一個意圖在 CLI、REST、YANG 與 CONFIG_DB 中的樣子。</p>
<div id="paths"></div>

<h2>FRR 設定模式與 frrcfgd</h2>
<p>路由協定的設定如何進入 FRR，由 <code>DEVICE_METADATA|localhost</code> 的兩個欄位決定：</p>
<table>
<thead><tr><th>設定</th><th>負責程序</th><th>FRR 設定來源</th><th>說明</th></tr></thead>
<tbody>
<tr><td>社群預設</td><td>bgpcfgd</td><td>CONFIG_DB（BGP_NEIGHBOR、STATIC_ROUTE…）+ Jinja2 範本</td><td>只支援社群定義的少數表，進階 FRR 設定需用 vtysh</td></tr>
<tr><td><code>frr_mgmt_framework_config: "true"</code></td><td>frrcfgd</td><td>CONFIG_DB 的完整路由表集合（BGP_GLOBALS、BGP_NEIGHBOR_AF、ROUTE_MAP、PREFIX_SET、OSPFV2_*…）</td><td>Management Framework 所需；Enterprise SONiC 稱為 separated 模式</td></tr>
<tr><td><code>docker_routing_config_mode: "split"</code></td><td>—</td><td>各 daemon 自己的設定檔（bgpd.conf、zebra.conf…）</td><td>以 vtysh 維護，需自行保存</td></tr>
<tr><td><code>docker_routing_config_mode: "unified"</code></td><td>—</td><td>單一 frr.conf</td><td>以 vtysh 維護</td></tr>
</tbody></table>

<h2>介面命名模式</h2>
<p>SONiC 內部永遠使用原生名稱（<code>Ethernet0</code>、<code>Ethernet4</code>…，數字是第一條 SerDes lane 的索引）。Management Framework 可以在呈現層改用面板位置命名，對應關係存在 <code>PORT|EthernetN</code> 的 <code>alias</code> 欄位。</p>
<table>
<thead><tr><th>模式</th><th>範例</th><th>說明</th></tr></thead>
<tbody>
<tr><td>native</td><td><code>Ethernet0</code>、<code>Ethernet4</code></td><td>預設。與 CONFIG_DB、kernel netdev 名稱一致</td></tr>
<tr><td>standard</td><td><code>Eth1/1</code>、<code>Eth1/2/4</code></td><td>slot/port[/breakout port]，對應面板標示</td></tr>
<tr><td>standard extended</td><td><code>Eth1/1/1</code></td><td>非 breakout 的 port 也帶第三段，名稱長度一致</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface-naming standard
sonic# show interface-naming
<span class="c"># REST 請求中 "/" 需編碼為 %2F</span>
curl -k -u admin:… "https://&lt;ip&gt;/restconf/data/openconfig-interfaces:interfaces/interface=Eth1%2F2%2F4"</pre>

<h2>Configuration session</h2>
<p>一般的 <code>configure terminal</code> 會立即修改 running config。<code>configure session</code> 則把變更寫到候選設定（candidate），確認後再一次 commit，並可設定逾時自動回滾。</p>
<pre>sonic# configure session
% Started new session
sonic(config-s)# interface Vlan 10
sonic(config-s-if-Vlan10)# mtu 6745
sonic(config-s-if-Vlan10)# exit
sonic(config-s)# end
sonic# show session-config diff
sonic# configure session
sonic(config-s)# commit timeout-rollback 300     <span class="c"># 300 秒內未 confirm 就回滾</span>
sonic(config-s)# commit confirm</pre>
<ul>
<li>同一時間只允許一個 session；session 進行中，其他 CLI / REST / gNMI 的設定請求會被拒絕。</li>
<li>commit 會產生 checkpoint，可用於之後的回滾。</li>
<li>部分設定（使用者管理、interface naming、scale profile…）不支援 session 模式。</li>
<li>重開機或 REST server 重啟會使未 commit 的 session 失效。</li>
</ul>

<h2>REST 與 gNMI</h2>
<table>
<thead><tr><th></th><th>REST (RESTCONF)</th><th>gNMI</th></tr></thead>
<tbody>
<tr><td>傳輸</td><td>HTTPS，<code>/restconf/data/&lt;yang path&gt;</code></td><td>gRPC over TLS</td></tr>
<tr><td>操作</td><td>GET、POST、PUT、PATCH、DELETE、YANG PATCH</td><td>Get、Set、Subscribe（ONCE / POLL / STREAM：SAMPLE、ON_CHANGE）</td></tr>
<tr><td>認證</td><td>密碼、JWT token、用戶端憑證</td><td>密碼、JWT、用戶端憑證</td></tr>
<tr><td>資料來源</td><td>translib（OpenConfig / SONiC YANG）</td><td>translib，或直接以 DB 路徑存取 Redis（<code>target=COUNTERS_DB</code>）</td></tr>
<tr><td>其他</td><td>Swagger UI 可瀏覽 API</td><td>gNOI：reboot、image install、檔案傳輸等操作型 RPC</td></tr>
</tbody></table>
<pre><span class="c"># REST：取得 JWT 後讀取介面</span>
curl -k -X POST https://&lt;ip&gt;/authenticate -d '{"username":"admin","password":"…"}'
curl -k -H "Authorization: Bearer &lt;token&gt;" \\
  "https://&lt;ip&gt;/restconf/data/openconfig-interfaces:interfaces/interface=Ethernet0/state"
<span class="c"># gNMI：以 SAMPLE 模式訂閱計數器</span>
gnmic -a &lt;ip&gt;:8080 -u admin -p … --skip-verify subscribe \\
  --path "/openconfig-interfaces:interfaces/interface[name=Ethernet0]/state/counters" \\
  --mode stream --stream-mode sample --sample-interval 10s</pre>
`,
    mount(root) {
      S.diagram(root.querySelector('#d-mf'), {
        title: 'Management Framework 的請求路徑',
        w: 1000, h: 560,
        groups: [{ x: 16, y: 136, w: 640, h: 250, label: 'mgmt-framework 容器' }],
        nodes: [
          { id: 'cli', x: 36, y: 30, w: 170, h: 56, label: 'sonic-cli', sub: 'Klish', kind: 'cli', info: '<p>Klish 框架的 CLI。指令樹以 XML 定義，每個指令對應一個 <b>actioner</b>（Python 腳本），actioner 組出 REST 請求送給本機 REST server；show 指令的輸出以 Jinja2 範本呈現。</p>' },
          { id: 'rc', x: 256, y: 30, w: 170, h: 56, label: 'REST client', sub: 'curl / Ansible', kind: 'ext', info: '<p>外部自動化系統透過 HTTPS RESTCONF 存取。</p>' },
          { id: 'gc', x: 476, y: 30, w: 170, h: 56, label: 'gNMI client', sub: 'gnmic / collector', kind: 'ext', info: '<p>Get / Set / Subscribe。串流遙測常用 SAMPLE 或 ON_CHANGE 訂閱。</p>' },
          { id: 'act', x: 36, y: 170, w: 170, h: 56, label: 'actioner', sub: 'Python → REST', kind: 'proc', info: '<p>把 CLI 參數轉成 REST 呼叫。因此 CLI 能做的事，REST 都能做。</p>' },
          { id: 'rest', x: 256, y: 170, w: 170, h: 56, label: 'rest_server', sub: 'Go · RESTCONF', kind: 'proc', info: '<p>處理認證（AAA / RBAC），解析 YANG 路徑後呼叫 translib。</p>' },
          { id: 'gnmi', x: 700, y: 170, w: 180, h: 56, label: 'gnmi_server', sub: 'gnmi 容器', kind: 'proc', info: '<p>gNMI 請求同樣經過 translib；也可用「DB 路徑」模式直接讀 Redis，常用於高頻率計數器串流。</p>' },
          { id: 'tl', x: 36, y: 290, w: 370, h: 70, label: 'translib', sub: 'app modules · transformer（YANG → Redis 表）', kind: 'proc', info: '<p>translib 依請求路徑選擇 app module。多數功能使用通用的 <b>transformer</b>：依 <code>*-annot.yang</code> 中的註解（table-name、key-transformer、field-transformer、subtree-transformer）把 OpenConfig 節點對應到 SONiC 表與欄位。寫入時以 Redis transaction 一次提交多筆 key。</p>' },
          { id: 'cvl', x: 466, y: 290, w: 174, h: 70, label: 'CVL', sub: 'libyang + SONiC YANG', kind: 'proc', info: '<p>Config Validation Library：依 <code>sonic-*.yang</code> 檢查型別與範圍、leafref（被參照的物件必須存在）、must / when 條件，以及平台相依的限制。驗證失敗時整筆請求被拒絕，CONFIG_DB 不會被部分寫入。</p>' },
          { id: 'db', x: 36, y: 420, w: 604, h: 50, label: 'Redis：CONFIG_DB（寫入）· APPL_DB / STATE_DB / COUNTERS_DB（讀取狀態）', kind: 'db', info: '<p>設定寫入 CONFIG_DB；show 與 GET 的 operational 資料來自 APPL_DB、STATE_DB、COUNTERS_DB。</p>' },
          { id: 'frr', x: 36, y: 500, w: 190, h: 50, label: 'frrcfgd → FRR', kind: 'proc', info: '<p>訂閱 CONFIG_DB 路由相關表，產生 vtysh 指令套用到 bgpd、ospfd、staticd…</p>' },
          { id: 'sw', x: 246, y: 500, w: 190, h: 50, label: '*mgrd / orchagent', kind: 'proc', info: '<p>與社群版相同：訂閱 CONFIG_DB 並下發到 kernel 與 ASIC。</p>' },
          { id: 'host', x: 456, y: 500, w: 184, h: 50, label: 'hostcfgd 等', kind: 'proc', info: '<p>AAA、NTP、syslog 等主機服務設定。</p>' },
        ],
        edges: [
          { from: 'cli', to: 'act', id: 'e1' },
          { from: 'act', to: 'rest', label: 'HTTP', id: 'e2' },
          { from: 'rc', to: 'rest', label: 'HTTPS', id: 'e3' },
          { from: 'gc', to: 'gnmi', label: 'gRPC', id: 'e4' },
          { from: 'rest', to: 'tl', id: 'e5' },
          { from: 'gnmi', to: 'tl', id: 'e6', via: [[790, 262], [360, 262]] },
          { from: 'tl', to: 'cvl', label: '驗證', bi: true, id: 'e7' },
          { from: 'tl', to: 'db', label: '寫入 / 讀取', id: 'e8' },
          { from: 'db', to: 'frr', id: 'e9' },
          { from: 'db', to: 'sw', id: 'e10' },
          { from: 'db', to: 'host', id: 'e11' },
        ],
        steps: [
          { title: 'CLI 指令', text: '使用者輸入 <code>mtu 9100</code>；Klish 找到對應的 actioner。', nodes: ['cli', 'act'], edges: ['e1'] },
          { title: '轉成 REST 請求', text: 'actioner 送出 <code>PATCH …/interface=Eth1%2F1/config/mtu</code> 給本機 rest_server；rest_server 驗證使用者角色是否有寫入權限。', nodes: ['act', 'rest'], edges: ['e2'] },
          { title: 'translib 轉換', text: 'transformer 依註解把 OpenConfig 路徑對應到 <code>PORT|Ethernet0</code> 的 <code>mtu</code> 欄位（並把 Eth1/1 換成 Ethernet0）。', nodes: ['rest', 'tl'], edges: ['e5'] },
          { title: 'CVL 驗證', text: 'CVL 以 sonic-port.yang 檢查 MTU 範圍與其他限制。', nodes: ['tl', 'cvl'], edges: ['e7'] },
          { title: '寫入 CONFIG_DB', text: '驗證通過後以 transaction 寫入 CONFIG_DB。', nodes: ['tl', 'db'], edges: ['e8'] },
          { title: '既有元件套用', text: 'portmgrd、PortsOrch 等照一般流程套用；若是路由設定，則由 frrcfgd 轉給 FRR。', nodes: ['db', 'frr', 'sw', 'host'], edges: ['e9', 'e10', 'e11'] },
        ],
      });

      const host = root.querySelector('#paths');
      const box = S.el('div', { class: 'w-box' });
      host.appendChild(box);
      const body = S.el('div', { style: 'margin-top:12px;display:grid;gap:10px' });
      S.seg(box, PATHS.map(p => p.n), i => {
        const p = PATHS[i];
        body.innerHTML = [['Management Framework CLI', p.cli], ['REST', p.rest], ['YANG 路徑', p.yang], ['CONFIG_DB 結果', p.db]]
          .map(([l, v]) => `<div><div class="w-label">${l}</div><pre style="margin:4px 0 0">${S.esc(v)}</pre></div>`).join('') + `<div class="log">${p.note}</div>`;
      });
      box.appendChild(body);
    },
    searchText: PATHS.map(p => [p.n, p.cli, p.rest, p.yang, p.db, p.note].join(' ')).join(' '),
    related: ['config', 'redis-db', 'routing', 'ztp', 'counters'],
    refs: [
      ['Management Framework HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/mgmt/Management%20Framework.md'],
      ['sonic-mgmt-common（translib / CVL）', 'https://github.com/sonic-net/sonic-mgmt-common'],
      ['Enterprise SONiC User Guide UG460：Ch.2–3、§5.6、§5.11、Ch.21–23', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic'],
    ],
  });
})();
