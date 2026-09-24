S.register({
  id: 'port',
  category: 'net',
  order: 1,
  icon: '🔌',
  title: 'Port 與介面初始化',
  en: 'Port Initialization',
  summary: '從 hwsku 的 port 定義檔，到 CONFIG_DB、SAI port、Linux netdev、鏈路 up——一個前面板埠是如何「誕生」並開始運作的。',
  tags: ['Port', 'portsyncd', 'portmgrd', 'PortsOrch', 'hostif', 'oper_status', 'breakout'],
  features: ['開機初始化動畫', '虛擬交換機終端機'],
  html: `
<h2>一個 Port 的誕生</h2>
<p>開機時，SONiC 必須先讓 <b>ASIC 裡的 port</b> 與 <b>Linux 裡的 netdev</b>（例如 <code>Ethernet0</code>）一一對應起來，其他功能（VLAN、IP、LAG）才有辦法建立在上面。</p>
<div id="d-port"></div>

<h2>Port 的關鍵屬性</h2>
<table>
<thead><tr><th>欄位</th><th>範例</th><th>說明</th></tr></thead>
<tbody>
<tr><td><code>lanes</code></td><td>25,26,27,28</td><td>對應到 ASIC 的 SerDes lane。4 條 lane 組成一個 40G/100G/400G 埠，決定 SAI port 的實體位置</td></tr>
<tr><td><code>alias</code></td><td>fortyGigE0/0、Eth1/1</td><td>面板上的名稱，通常用於 LLDP / 管理系統</td></tr>
<tr><td><code>speed</code></td><td>40000、100000、400000</td><td>速率（Mbps）</td></tr>
<tr><td><code>mtu</code></td><td>9100</td><td>SONiC 預設 9100；寫到 ASIC 時會再加上 L2 標頭（例如 +22）</td></tr>
<tr><td><code>admin_status</code></td><td>up / down</td><td>管理者「希望」開或關（<code>config interface startup/shutdown</code>）</td></tr>
<tr><td><code>oper_status</code></td><td>up / down</td><td>實際鏈路狀態，由 ASIC 回報，只出現在 APPL_DB / STATE_DB</td></tr>
<tr><td><code>fec</code></td><td>rs / fc / none</td><td>前向錯誤修正，兩端必須一致</td></tr>
</tbody></table>
<div class="callout"><div class="ct">🧩 Port 名稱與 lane 的由來</div>
<p>每個 hwsku 目錄（<code>/usr/share/sonic/device/&lt;platform&gt;/&lt;hwsku&gt;/</code>）下有 <code>port_config.ini</code>，或是較新的 <code>platform.json</code> + <code>hwsku.json</code>，定義了每個 port 的名稱、lane、alias、速率。<code>Ethernet</code> 後面的數字通常是「第一條 lane 的索引」，所以 4-lane 埠會是 Ethernet0、Ethernet4、Ethernet8…</p></div>
<div class="callout tip"><div class="ct">✂️ Dynamic Port Breakout</div>
<p>一個 400G 埠可以拆成 4×100G：<code>sudo config interface breakout Ethernet0 4x100G</code>。SONiC 會刪除原 port、建立 Ethernet0/2/4/6 等新 port，並一併處理相依的設定。</p></div>

<h2>動手玩：admin 與 oper 狀態</h2>
<p>這台虛擬交換機的 <b>Ethernet0、4、8、12 有接線</b>，其他埠沒有。試著把 Ethernet8 和 Ethernet16 都 startup，比較它們 oper 狀態的差異，並觀察右邊 APPL_DB / STATE_DB / ASIC_DB 的變化。</p>
<div id="term"></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-port'), {
      title: '開機時 Port 的初始化流程',
      w: 1000, h: 520,
      nodes: [
        { id: 'file', x: 20, y: 30, w: 160, h: 56, label: 'port_config.ini', sub: '或 platform.json', kind: 'file', info: '<p>hwsku 目錄中的 port 定義：名稱、lanes、alias、速率。</p>' },
        { id: 'gen', x: 215, y: 30, w: 160, h: 56, label: 'sonic-cfggen', sub: '首次開機產生設定', kind: 'cli', info: '<p>首次開機時，依 hwsku 的 port 定義產生預設的 <code>config_db.json</code>（含 PORT 表）並載入 CONFIG_DB。之後開機直接載入已存的 config_db.json。</p>' },
        { id: 'cfg', x: 410, y: 30, w: 160, h: 56, label: 'CONFIG_DB', sub: 'PORT|Ethernet0', kind: 'db', info: '<p><code>PORT|Ethernet0</code>：lanes、speed、mtu、admin_status…</p>' },
        { id: 'pm', x: 605, y: 30, w: 160, h: 56, label: 'portmgrd', sub: '(swss)', kind: 'proc', info: '<p>訂閱 CONFIG_DB PORT 表。會<b>等到 STATE_DB 顯示該 netdev 已建立（state=ok）</b>，才用 <code>ip link set</code> 設定 MTU / admin 狀態，並把設定寫進 APPL_DB <code>PORT_TABLE</code>。</p><p class="muted">註：早期版本中「CONFIG_DB → APPL_DB 的 port 設定」由 portsyncd 負責，新版本逐漸移到 portmgrd。</p>' },
        { id: 'appl', x: 800, y: 30, w: 175, h: 56, label: 'APPL_DB', sub: 'PORT_TABLE:Ethernet0', kind: 'db', info: '<p>除了每個 port 以外，還有兩個特殊 key：<code>PortConfigDone</code>（所有 port 設定都已寫入）與 <code>PortInitDone</code>（所有 netdev 都已建立），orchagent 與其他服務會等待它們。</p>' },
        { id: 'ps', x: 215, y: 190, w: 160, h: 56, label: 'portsyncd', sub: '(swss)', kind: 'proc', info: '<p>監聽 Linux netlink（<code>RTM_NEWLINK</code>）。當 <code>Ethernet0</code> netdev 被建立、或 carrier 狀態改變時，更新 <code>STATE_DB PORT_TABLE|Ethernet0</code>（state=ok、netdev_oper_status）。</p>' },
        { id: 'state', x: 410, y: 190, w: 160, h: 56, label: 'STATE_DB', sub: 'PORT_TABLE|Ethernet0', kind: 'db', info: '<p><code>state: ok</code> 表示 kernel 端的 netdev 已就緒，是其他 *mgrd 繼續設定的訊號。</p>' },
        { id: 'orch', x: 800, y: 190, w: 175, h: 56, label: 'orchagent', sub: 'PortsOrch', kind: 'proc', info: '<p>讀 APPL_DB PORT_TABLE：</p><ul><li>依 lanes 找到或建立 SAI port，設定 speed、FEC、MTU、admin</li><li>為每個 port 建立 <b>host interface</b>（<code>SAI_HOSTIF_TYPE_NETDEV</code>），讓驅動在 Linux 產生對應的 netdev</li><li>收到 port 狀態通知時更新 oper_status</li></ul>' },
        { id: 'kern', x: 215, y: 350, w: 355, h: 56, label: 'Linux netdev：Ethernet0', sub: '由廠商驅動（如 knet）建立', kind: 'kernel', info: '<p>這個介面讓 Linux 程式（lldpd、bgpd、teamd）能透過 Ethernet0 收發控制封包。它的 carrier 狀態會跟著實體鏈路走。</p>' },
        { id: 'syncd', x: 800, y: 350, w: 175, h: 56, label: 'syncd + SAI', kind: 'proc', info: '<p>呼叫 <code>create_port</code>、<code>set_port_attribute</code>、<code>create_hostif</code>。</p>' },
        { id: 'asic', x: 800, y: 460, w: 175, h: 48, label: 'ASIC Port / PHY', kind: 'hw', info: '<p>實際的 SerDes 與 MAC，和對端協商鏈路。</p>' },
      ],
      edges: [
        { from: 'file', to: 'gen', id: 'e1' },
        { from: 'gen', to: 'cfg', id: 'e2' },
        { from: 'cfg', to: 'pm', label: '訂閱', id: 'e3' },
        { from: 'pm', to: 'appl', id: 'e4' },
        { from: 'appl', to: 'orch', bi: true, id: 'e5' },
        { from: 'orch', to: 'syncd', label: 'ASIC_DB', id: 'e6', via: [[860, 298]] },
        { from: 'syncd', to: 'asic', id: 'e7' },
        { from: 'syncd', to: 'kern', label: 'create_hostif → netdev', id: 'e8' },
        { from: 'kern', to: 'ps', label: 'netlink', id: 'e9', via: [[295, 318]] },
        { from: 'ps', to: 'state', id: 'e10' },
        { from: 'state', to: 'pm', dash: true, label: '等待就緒', id: 'e11' },
        { from: 'pm', to: 'kern', dash: true, label: 'ip link set mtu/up', id: 'e12', via: [[685, 300]] },
        { from: 'asic', to: 'orch', dash: true, label: '通知', id: 'e13', via: [[965, 484], [965, 218]] },
      ],
      steps: [
        { title: '產生 PORT 設定', text: '首次開機時 sonic-cfggen 依 hwsku 的 <code>port_config.ini</code> / <code>platform.json</code> 產生 PORT 表並載入 CONFIG_DB。', nodes: ['file', 'gen', 'cfg'], edges: ['e1', 'e2'] },
        { title: '寫入 APPL_DB', text: 'port 設定被寫入 APPL_DB <code>PORT_TABLE</code>，全部寫完後加上 <code>PortConfigDone</code>。', nodes: ['cfg', 'pm', 'appl'], edges: ['e3', 'e4'] },
        { title: 'PortsOrch 建立 SAI port 與 hostif', text: 'orchagent 依 lanes 設定 SAI port，並為每個 port 建立 host interface。', nodes: ['appl', 'orch', 'syncd', 'asic'], edges: ['e5', 'e6', 'e7'] },
        { title: '驅動建立 Linux netdev', text: 'SAI 的 <code>create_hostif</code> 讓廠商驅動在 kernel 建出 <code>Ethernet0</code> 介面。', nodes: ['syncd', 'kern'], edges: ['e8'] },
        { title: 'portsyncd 回報就緒', text: 'portsyncd 從 netlink 看到新介面，寫 <code>STATE_DB PORT_TABLE|Ethernet0 state=ok</code>；全部 port 建好後寫 <code>PortInitDone</code>。', nodes: ['kern', 'ps', 'state'], edges: ['e9', 'e10'] },
        { title: 'portmgrd 套用 MTU / admin', text: 'portmgrd 看到 state=ok，才對 kernel 介面設定 MTU 與 admin up，並把 admin_status 寫入 APPL_DB → PortsOrch 設定 SAI admin state。', nodes: ['state', 'pm', 'kern'], edges: ['e11', 'e12'] },
        { title: '鏈路 up！', text: 'PHY 與對端協商成功，SAI 回報 <code>port_state_change</code>。PortsOrch 把 oper_status=up 寫回 APPL_DB / STATE_DB，並把 hostif 的 oper 狀態設為 up，Linux 的 Ethernet0 carrier 也跟著 up。', nodes: ['asic', 'orch', 'appl'], edges: ['e13', 'e5'] },
      ],
    });
    S.terminal(root.querySelector('#term'), {
      filter: 'Ethernet8',
      db: 'APPL_DB',
      chips: [
        'show interfaces status',
        'sudo config interface startup Ethernet8',
        'sudo config interface startup Ethernet16',
        'sudo config interface mtu Ethernet8 1500',
        'sudo config interface shutdown Ethernet8',
        'redis-cli -n 0 hgetall PORT_TABLE:Ethernet8',
        'sonic-db-cli STATE_DB hgetall "PORT_TABLE|Ethernet8"',
        'config interface startup Ethernet8',
      ],
    });
  },
  keypoints: [
    'Port 的定義來自 hwsku 的 port_config.ini / platform.json，首次開機寫入 CONFIG_DB。',
    'PortsOrch 依 lanes 設定 SAI port，並建立 hostif，讓 Linux 出現 Ethernet0 等 netdev。',
    '*mgrd 會等 STATE_DB 顯示 state=ok（netdev 就緒）後，才對 kernel 介面下設定。',
    'admin_status 是「想要」的狀態；oper_status 是 ASIC 回報的「實際」鏈路狀態。',
  ],
  quiz: [
    { q: 'admin up 但 oper down，最可能的原因是？', options: ['CONFIG_DB 沒寫入', '沒有接線、對端關閉或速率/FEC 不一致', 'orchagent 當機', 'Redis 滿了'], answer: 1, explain: 'oper 狀態由實際鏈路決定；接線、對端狀態、速率與 FEC 都會影響。' },
    { q: 'Linux 中的 Ethernet0 介面是怎麼產生的？', options: ['/etc/network/interfaces 設定', 'PortsOrch 透過 SAI 建立 hostif，由廠商驅動產生 netdev', 'portsyncd 用 ip link add 建立', 'teamd 建立'], answer: 1, explain: 'SAI_HOSTIF_TYPE_NETDEV 讓驅動在 kernel 建出對應的網路介面。' },
    { q: 'STATE_DB PORT_TABLE|Ethernet0 的 state=ok 代表什麼？', options: ['鏈路已 up', 'netdev 已在 kernel 中建立完成', '光模組已插入', 'port 已加入 VLAN'], answer: 1, explain: 'state=ok 由 portsyncd 在看到 netdev 建立後寫入。' },
  ],
  related: ['vlan', 'lag', 'pmon', 'swss'],
  refs: [['Port 相關設計文件（SONiC Wiki）', 'https://github.com/sonic-net/SONiC/tree/master/doc'], ['Dynamic Port Breakout 設計', 'https://github.com/sonic-net/SONiC/blob/master/doc/dynamic-port-breakout/sonic-dynamic-port-breakout-HLD.md']],
});
