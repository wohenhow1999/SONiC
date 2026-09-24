(function () {
  const CASES = [
    {
      n: 'Port oper down',
      steps: [
        ['確認設定', 'show interfaces status Ethernet0', 'Admin 是否為 up；speed、FEC 是否與對端一致。'],
        ['確認光模組', 'show interfaces transceiver presence Ethernet0\nshow interfaces transceiver eeprom --dom Ethernet0', '模組是否存在、廠商型號、收發光功率是否在範圍內（STATE_DB TRANSCEIVER_*）。'],
        ['比對 DB', 'sonic-db-cli APPL_DB hgetall PORT_TABLE:Ethernet0\nsonic-db-cli STATE_DB hgetall "PORT_TABLE|Ethernet0"', 'APPL_DB 的 admin_status / oper_status 與 STATE_DB 的 netdev_oper_status 是否一致。'],
        ['確認 SAI 屬性', 'sonic-db-cli ASIC_DB hgetall "ASIC_STATE:SAI_OBJECT_TYPE_PORT:<oid>"', '以 COUNTERS_PORT_NAME_MAP 找到 OID，確認 ADMIN_STATE、SPEED、FEC_MODE 已下發。'],
        ['查看 log', 'sudo grep -i "Ethernet0" /var/log/syslog | tail -50', '尋找 port_state_change、xcvrd CMIS 狀態、auto-negotiation 相關訊息。'],
      ],
    },
    {
      n: '路由未寫入硬體',
      steps: [
        ['FRR 是否有路由', 'vtysh -c "show ip route 192.168.0.0/24"', '有「*」表示已被選為 FIB 路由；沒有則是協定或 next hop 問題。'],
        ['APPL_DB', 'sonic-db-cli APPL_DB hgetall "ROUTE_TABLE:192.168.0.0/24"', '沒有：fpmsyncd 或 FPM 連線問題（檢查 bgp 容器 log）。'],
        ['next hop 解析', 'show arp | grep <nexthop>\nsonic-db-cli APPL_DB keys "NEIGH_TABLE:*<nexthop>"', 'RouteOrch 需要 next hop 已解析；缺鄰居會讓路由停在 m_toSync。'],
        ['ASIC_DB', 'sonic-db-cli ASIC_DB keys "*ROUTE_ENTRY*192.168.0.0/24*"', '沒有：orchagent 未處理；有：往下檢查 syncd。'],
        ['一致性檢查', 'sudo route_check.py\nsudo tail -n 50 /var/log/swss/sairedis.rec | grep ROUTE_ENTRY', 'route_check.py 會列出 APPL_DB 與 ASIC_DB 不一致的路由；sairedis.rec 可確認 create 是否已送出與回應狀態。'],
        ['資源', 'crm show resources ipv4 route\ncrm show resources nexthop group', '硬體表滿時 SAI 回傳 TABLE_FULL，syslog 中會有 CRM threshold 或 SAI 錯誤。'],
      ],
    },
    {
      n: 'BGP 鄰居無法建立',
      steps: [
        ['狀態', 'show ip bgp summary\nvtysh -c "show bgp neighbors 10.0.0.1"', '查看 State（Idle / Active / Connect）與最後錯誤訊息。'],
        ['L3 連通', 'ping -c 3 10.0.0.1\nshow ip interfaces', '介面 oper up、IP 正確、ARP 可解析。'],
        ['設定來源', 'sonic-db-cli CONFIG_DB hgetall "BGP_NEIGHBOR|10.0.0.1"\nvtysh -c "show running-config"', 'CONFIG_DB 與 FRR running config 是否一致（bgpcfgd 是否已套用）。'],
        ['控制封包', 'show copp configuration\nsudo tcpdump -i Ethernet0 -nn port 179', '確認 TCP 179 封包有被 trap 到 CPU；CoPP 或 ACL 可能擋住。'],
        ['控制平面 ACL', 'sudo iptables -L -n | head -50', 'caclmgrd 產生的規則是否允許 BGP。'],
      ],
    },
    {
      n: 'VLAN 內無法互通',
      steps: [
        ['設定', 'show vlan brief', '成員 port 與 tagged / untagged 是否正確。'],
        ['kernel', 'bridge vlan show\nip -d link show Vlan100', 'vlanmgrd 是否已在 Bridge 上建立 vid 與成員。'],
        ['APPL / STATE', 'sonic-db-cli APPL_DB keys "VLAN_MEMBER_TABLE:Vlan100:*"\nsonic-db-cli STATE_DB keys "VLAN_MEMBER_TABLE|Vlan100|*"', '確認每個成員都已同步。'],
        ['ASIC', 'sonic-db-cli ASIC_DB keys "*VLAN_MEMBER*"', 'VLAN_MEMBER 與 BRIDGE_PORT 是否建立。'],
        ['MAC 學習', 'show mac -v 100', '是否學到兩端 MAC；若只學到一端，檢查另一端 port 或 STP / 外部設備。'],
      ],
    },
    {
      n: '容器反覆重啟',
      steps: [
        ['服務狀態', 'systemctl status swss\nsudo journalctl -u swss --since "10 min ago"', '找出退出原因與重啟次數。'],
        ['程序狀態', 'docker exec swss supervisorctl status\nshow system-health detail', '哪個 critical process 退出（supervisor-proc-exit-listener 會觸發容器重啟）。'],
        ['core dump', 'ls -l /var/core/', '程序崩潰時會產生 core 檔，可用於回報問題。'],
        ['日誌', 'sudo grep -E "ERR|exit|terminated" /var/log/syslog | tail -80', 'orchagent 在 SAI 建立失敗時會主動 abort，syslog 會記錄對應的 SAI status。'],
        ['收集資料', 'sudo show techsupport --since "30 min ago"', '產生 /var/dump/sonic_dump_*.tar.gz，內含所有 DB、log、設定與 core。'],
      ],
    },
    {
      n: 'CPU 使用率高',
      steps: [
        ['程序', 'top -o %CPU\nshow processes cpu --verbose | head -30', '找出耗用 CPU 的程序（常見：orchagent 大量路由變動、snmp、bgpd）。'],
        ['CPU 封包', 'show interfaces counters\nsudo tcpdump -i any -c 200 -nn', '判斷是否有大量封包被 trap 到 CPU。'],
        ['CoPP 計數', 'sonic-db-cli COUNTERS_DB keys "COUNTERS_TRAP*"\nshow copp configuration', '檢查各 trap group 的 policer 是否大量丟棄。'],
        ['路由震盪', 'vtysh -c "show ip bgp summary"', 'Up/Down 時間很短、MsgRcvd 快速增加代表鄰居或路由不穩定。'],
      ],
    },
    {
      n: '封包丟棄',
      steps: [
        ['分類計數', 'show interfaces counters -a\nshow interfaces counters errors', '先區分 RX_ERR（CRC、symbol：實體層問題）、RX_DRP（入口丟棄）、TX_DRP（出口壅塞）。'],
        ['佇列與緩衝', 'show queue counters Ethernet0\nshow priority-group drop counters\nshow queue watermark unicast', '出口佇列丟棄代表壅塞；watermark 接近上限表示緩衝不足或微突發。'],
        ['丟棄原因', 'show dropcounters capabilities\nsudo config dropcounters install DEBUG_0 PORT_INGRESS_DROPS L3_EGRESS_LINK_DOWN,IP_HEADER_ERROR\nshow dropcounters counts', 'debug counter 依 SAI drop reason 分類入口 / 出口丟棄（ACL、TTL、路由不存在、SMAC=DMAC…）。'],
        ['CPU 路徑', 'show copp configuration\nsonic-db-cli COUNTERS_DB keys "COUNTERS_TRAP*"', 'CoPP policer 丟棄的是送往 CPU 的控制封包，會影響協定與 ARP。'],
        ['ACL', 'aclshow -a', '確認是否有 DROP 規則命中。'],
      ],
    },
    {
      n: '硬體表已滿',
      steps: [
        ['資源用量', 'crm show resources all\ncrm show summary', '檢查 ipv4 route、nexthop group、neighbor、fdb、acl entry 等的 used / available。'],
        ['告警', 'sudo grep -i "crm\\|TABLE_FULL\\|SAI_STATUS_INSUFFICIENT" /var/log/syslog | tail', 'CRM 超過門檻會記錄 warning；SAI 建立失敗會出現 insufficient resources。'],
        ['受影響的路由', 'sudo route_check.py', '列出在 APPL_DB 但未下到 ASIC 的路由。'],
        ['調整', 'sudo config crm thresholds ipv4 route high 85\n# 或調整路由彙總、減少 ECMP 群組、選擇較大的 scale profile', '從設計面降低表項需求；Enterprise 可切換 L2 / L3 switch profile 重新分配硬體表。'],
      ],
    },
  ];

  S.register({
    id: 'troubleshooting',
    category: 'ops',
    order: 12,
    title: '故障排除方法',
    en: 'Troubleshooting Methodology',
    summary: 'SONiC 的問題多半可以用「沿著資料流逐層比對」定位：CONFIG_DB → kernel → APPL_DB → ASIC_DB → SAI/SDK。本章整理分層檢查方法、各層對應工具，以及常見症狀的檢查順序。',
    meta: [
      ['資料收集', ['show techsupport', 'generate_dump', '/var/dump/']],
      ['記錄檔', ['/var/log/syslog', '/var/log/swss/sairedis.rec', '/var/log/swss/swss.rec', '/var/core/']],
      ['一致性工具', ['route_check.py', 'dump state', 'show system-health', 'monit summary']],
      ['動態 log', ['swssloglevel -l DEBUG -c orchagent', 'swssloglevel -l SAI_LOG_LEVEL_INFO -s -c SAI_API_PORT']],
    ],
    tags: ['troubleshooting', 'debug', 'techsupport', 'route_check', 'sairedis.rec', 'dump state', 'system-health', 'core'],
    keypoints: [
      '每一層都有對應的資料可查：CONFIG_DB（意圖）、kernel（ip / bridge）、APPL_DB（期望）、ASIC_DB（SAI 物件）、sairedis.rec（實際呼叫）。',
      '資料停在哪一層，就檢查負責把它往下送的元件：*mgrd、orchagent 或 syncd。',
      'dump state 可一次列出某個物件在所有 DB 中的相關 key，是跨層比對的捷徑。',
      '回報問題前先收集 show techsupport，內含所有 DB、log、設定與 core dump。',
    ],
    html: `
<h2>分層定位</h2>
<p>點選每一層，查看該層的檢查指令與負責把資料送往下一層的元件。</p>
<div id="d-ts"></div>

<h2>常見症狀檢查順序</h2>
<div id="cases"></div>

<h2>封包丟棄分析</h2>
<p>丟棄可能發生在實體層、入口管線、出口佇列或送往 CPU 的路徑。依計數器的位置判斷原因：</p>
<table>
<thead><tr><th>觀察位置</th><th>代表</th><th>進一步檢查</th></tr></thead>
<tbody>
<tr><td>RX_ERR（CRC / FCS）</td><td>實體層錯誤：光模組、線材、FEC 不一致</td><td><code>show interfaces transceiver eeprom --dom</code>、FEC 設定、對端錯誤計數</td></tr>
<tr><td>RX_DRP</td><td>入口管線丟棄：ACL、路由查無、TTL 1、VLAN 不允許、STP discarding</td><td>debug drop counter（drop reason）</td></tr>
<tr><td>PG / 入口緩衝丟棄</td><td>入口共享緩衝用盡（lossy PG）</td><td>priority-group watermark、buffer profile</td></tr>
<tr><td>TX_DRP / queue drop</td><td>出口壅塞、WRED 丟棄</td><td>queue counters、queue watermark、微突發</td></tr>
<tr><td>CoPP / trap 計數</td><td>送往 CPU 的封包超過 policer</td><td>CoPP 設定、是否有異常大量控制封包</td></tr>
</tbody></table>
<pre><span class="c"># 社群版 debug drop counter（CONFIG_DB DEBUG_COUNTER / DEBUG_COUNTER_DROP_REASON）</span>
show dropcounters capabilities
sudo config dropcounters install DEBUG_0 PORT_INGRESS_DROPS SMAC_EQUALS_DMAC,TTL,ACL_ANY -d "ingress drops"
show dropcounters counts
<span class="c"># Enterprise SONiC</span>
sonic(config)# dropcounters DROP_L3
sonic(config-dropcounters-DROP_L3)# type PORT_INGRESS_DROPS
sonic(config-dropcounters-DROP_L3)# add-reason IP_HEADER_ERROR
sonic(config-dropcounters-DROP_L3)# mirror ERSPAN1              <span class="c"># 把被丟棄的封包鏡像出去分析</span>
sonic# show dropcounters capabilities</pre>

<h2>硬體資源（CRM）</h2>
<p>CrmOrch 定期向 SAI 查詢各硬體表的已用與可用數量，寫入 COUNTERS_DB 的 <code>CRM:STATS</code>，超過門檻時記錄告警。</p>
<pre><span class="c"># 社群版</span>
crm show resources all
crm show thresholds all
sudo config crm polling interval 60
<span class="c"># Enterprise SONiC</span>
sonic# show crm summary
sonic# show crm resources all
sonic(config)# crm threshold all type percentage</pre>
<div class="callout"><div class="ct">路由下發失敗的處理</div><p>SAI 建立物件失敗（例如表滿）時，早期的 orchagent 會直接中止以避免狀態不一致；較新版本以 response channel 把結果回報給上游，並可設定重試。Enterprise SONiC 提供 <code>error-retry</code> 設定控制失敗路由的重試行為。</p></div>

<h2>緩衝區水位與壅塞</h2>
<p>微突發（microburst）持續時間通常以微秒計，平均速率計數器看不出來；watermark 記錄一段期間內緩衝使用的最高值，是判斷微突發的主要依據。</p>
<pre>show priority-group watermark shared
show priority-group watermark headroom
show queue watermark unicast
show buffer_pool watermark
sonic-clear queue watermark unicast
<span class="c"># Enterprise SONiC：超過門檻時產生事件</span>
sonic(config-if-Eth1/2)# threshold queue 1 unicast 10
sonic(config-if-Eth1/2)# threshold priority-group 3 shared 20</pre>

<h2>光模組與鏈路診斷</h2>
<pre><span class="c"># 社群版</span>
show interfaces transceiver presence
show interfaces transceiver eeprom --dom Ethernet0
show interfaces transceiver error-status
show interfaces counters errors
<span class="c"># Enterprise SONiC</span>
sonic# show interface transceiver dom
sonic# show interface status err-disabled
sonic# test cable-diagnostics Eth 1/1</pre>
<table>
<thead><tr><th>徵狀</th><th>常見原因</th></tr></thead>
<tbody>
<tr><td>link down，對端 up</td><td>FEC、速率、auto-negotiation 設定不一致；光模組不相容</td></tr>
<tr><td>CRC 持續增加</td><td>光功率不足、髒污或彎折的光纖、DAC 過長</td></tr>
<tr><td>鏈路頻繁翻動</td><td>光功率接近門檻、PCS 錯誤；可用 link-error-disable 隔離</td></tr>
<tr><td>port err-disabled</td><td>BPDU guard、UDLD、link flap、port security 觸發；查看原因後以 errdisable recovery 或手動恢復</td></tr>
</tbody></table>

<h2>跨層比對工具</h2>
<table class="wrap">
<thead><tr><th>工具</th><th>用途</th><th>範例</th></tr></thead>
<tbody>
<tr><td><code>dump state</code></td><td>列出某物件在 CONFIG_DB、APPL_DB、ASIC_DB、STATE_DB 中的所有相關 key，並解出 VID/RID</td><td><code>dump state port Ethernet0</code>、<code>dump state route 10.1.0.0/24</code></td></tr>
<tr><td><code>route_check.py</code></td><td>比對 APPL_DB 與 ASIC_DB（以及 kernel）的路由是否一致</td><td><code>sudo route_check.py</code></td></tr>
<tr><td><code>show system-health</code></td><td>由 system-health 服務彙整 critical process、服務與硬體狀態</td><td><code>show system-health detail</code></td></tr>
<tr><td><code>sonic-db-dump</code></td><td>將整個 DB 匯出為 JSON，方便 diff</td><td><code>sonic-db-dump -n APPL_DB -y</code></td></tr>
<tr><td><code>sairedis.rec</code></td><td>重建 orchagent 送往 SAI 的所有呼叫與時間順序</td><td><code>grep -c "|c|" /var/log/swss/sairedis.rec</code></td></tr>
<tr><td><code>swssloglevel</code></td><td>動態調整 swss 程序或 SAI API 的 log 等級</td><td><code>swssloglevel -l INFO -c orchagent</code></td></tr>
<tr><td><code>show techsupport</code></td><td>收集完整除錯資料</td><td><code>show techsupport --since "1 hour ago"</code></td></tr>
</tbody></table>
`,
    mount(root) {
      S.diagram(root.querySelector('#d-ts'), {
        title: '沿資料流逐層檢查',
        w: 1000, h: 380,
        nodes: [
          { id: 'cfg', x: 20, y: 40, w: 170, h: 60, label: 'CONFIG_DB', sub: '意圖', kind: 'db', info: '<p>設定是否正確寫入？</p><pre>sonic-db-cli CONFIG_DB keys "VLAN*"\nshow runningconfiguration all</pre><p>若不在：檢查 CLI 輸出錯誤或 config_db.json。</p>' },
          { id: 'mgrd', x: 230, y: 40, w: 170, h: 60, label: '*mgrd', sub: 'cfgmgr', kind: 'proc', info: '<p>負責 CONFIG_DB → kernel / APPL_DB。</p><pre>docker exec swss supervisorctl status\ngrep vlanmgrd /var/log/syslog</pre>' },
          { id: 'kern', x: 440, y: 40, w: 170, h: 60, label: 'Linux kernel', sub: 'ip / bridge / team', kind: 'kernel', info: '<p>kernel 端是否已建立？</p><pre>ip -br link\nip addr show Vlan100\nbridge vlan show\nip neigh show</pre>' },
          { id: 'appl', x: 650, y: 40, w: 170, h: 60, label: 'APPL_DB', sub: '期望狀態', kind: 'db', info: '<p>APPL_DB 是否有對應 key？</p><pre>sonic-db-cli APPL_DB keys "*Vlan100*"\ntail /var/log/swss/swss.rec</pre>' },
          { id: 'orch', x: 650, y: 170, w: 170, h: 60, label: 'orchagent', kind: 'proc', info: '<p>負責 APPL_DB → ASIC_DB。相依物件缺少時任務會留在 m_toSync。</p><pre>grep orchagent /var/log/syslog | tail\nswssloglevel -l DEBUG -c orchagent</pre>' },
          { id: 'asicdb', x: 440, y: 170, w: 170, h: 60, label: 'ASIC_DB', sub: 'SAI 物件', kind: 'db', info: '<p>SAI 物件是否存在？</p><pre>sonic-db-cli ASIC_DB keys "*VLAN*"\ndump state vlan Vlan100</pre>' },
          { id: 'rec', x: 230, y: 170, w: 170, h: 60, label: 'sairedis.rec', sub: 'SAI 呼叫紀錄', kind: 'file', info: '<p>create / set / remove 是否已送出；get 回應狀態。</p><pre>grep VLAN /var/log/swss/sairedis.rec | tail</pre>' },
          { id: 'syncd', x: 20, y: 170, w: 170, h: 60, label: 'syncd / SAI', kind: 'proc', info: '<p>syncd 是否回報 SAI 錯誤？</p><pre>grep syncd /var/log/syslog | grep -i err\nswssloglevel -l SAI_LOG_LEVEL_INFO -s -c SAI_API_VLAN</pre>' },
          { id: 'hw', x: 20, y: 300, w: 170, h: 60, label: 'SDK / ASIC', kind: 'hw', info: '<p>廠商提供的診斷工具，例如 Broadcom 的 <code>bcmcmd</code>（<code>bcmcmd "l2 show"</code>）或 NVIDIA 的 SDK dump。需要熟悉平台才能判讀。</p>' },
        ],
        edges: [
          { from: 'cfg', to: 'mgrd', id: 'e1' }, { from: 'mgrd', to: 'kern', id: 'e2' }, { from: 'kern', to: 'appl', id: 'e3' },
          { from: 'appl', to: 'orch', id: 'e4' }, { from: 'orch', to: 'asicdb', id: 'e5' }, { from: 'asicdb', to: 'rec', id: 'e6' },
          { from: 'rec', to: 'syncd', id: 'e7' }, { from: 'syncd', to: 'hw', id: 'e8' },
        ],
        steps: [
          { title: '設定是否存在', text: '先確認 CONFIG_DB 有正確的 key。這一層有問題通常是 CLI 參數錯誤或載入了舊的 config_db.json。', nodes: ['cfg'], edges: [] },
          { title: 'kernel 端', text: '*mgrd 是否已在 kernel 建立對應介面或 bridge 設定；多數 *mgrd 會等 STATE_DB 顯示相依物件就緒才動作。', nodes: ['cfg', 'mgrd', 'kern'], edges: ['e1', 'e2'] },
          { title: 'APPL_DB', text: 'APPL_DB 有 key 代表 *mgrd / *syncd 已完成工作，接下來看 orchagent。', nodes: ['kern', 'appl'], edges: ['e3'] },
          { title: 'orchagent 與 ASIC_DB', text: 'APPL_DB 有、ASIC_DB 沒有：orchagent 未處理，多半是相依物件缺少（查 syslog 與 DEBUG log）。', nodes: ['appl', 'orch', 'asicdb'], edges: ['e4', 'e5'] },
          { title: 'SAI 呼叫與結果', text: 'ASIC_DB 有物件但行為不對：從 sairedis.rec 確認呼叫與屬性，再查 syncd 的 SAI 錯誤，最後才進入廠商 SDK 層。', nodes: ['asicdb', 'rec', 'syncd', 'hw'], edges: ['e6', 'e7', 'e8'] },
        ],
      });

      const host = root.querySelector('#cases');
      const box = S.el('div', { class: 'w-box' });
      host.appendChild(box);
      const body = S.el('div', { style: 'margin-top:12px' });
      S.seg(box, CASES.map(c => c.n), i => {
        body.innerHTML = `<table class="wrap" style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr><th style="width:36px">#</th><th style="width:120px">檢查項目</th><th>指令</th><th>判讀</th></tr></thead><tbody>${CASES[i].steps.map((s, k) => `<tr><td class="mono">${k + 1}</td><td>${s[0]}</td><td><pre style="margin:0;padding:8px 10px;font-size:12px">${S.esc(s[1])}</pre></td><td>${S.esc(s[2])}</td></tr>`).join('')}</tbody></table>`;
        const t = body.querySelector('table');
        const w = S.el('div', { class: 'tbl' }); t.parentNode.insertBefore(w, t); w.appendChild(t);
      });
      box.appendChild(body);
    },
    searchText: CASES.map(c => c.n + ' ' + c.steps.map(s => s.join(' ')).join(' ')).join(' '),
    related: ['redis-db', 'swss', 'syncd-sai', 'ref-cli', 'ref-files'],
    refs: [['SONiC Troubleshooting Guide（Wiki）', 'https://github.com/sonic-net/SONiC/wiki'], ['dump utility HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/Dump-Utility.md']],
  });
})();
