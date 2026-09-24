S.register({
  id: 'sys-services',
  category: 'ops',
  order: 9,
  title: 'SNMP、Syslog、NTP 與 DNS',
  en: 'System Services: SNMP, Syslog, Audit Log, NTP & DNS',
  summary: '傳統網管仍依賴 SNMP 輪詢、Syslog 集中收集與 NTP 校時。SONiC 的 SNMP 由 snmp 容器內的 net-snmp snmpd 加上以 Python 撰寫的 AgentX 子代理組成，子代理直接從 Redis 讀取資料回應 MIB；Syslog 由每個容器的 rsyslog 轉送到主機，再由主機送往遠端伺服器；NTP 與 DNS 則由 hostcfgd 依 CONFIG_DB 產生設定，通常在 mgmt VRF 中執行。',
  meta: [
    ['容器 / 程序', ['snmp：snmpd、snmp-subagent（sonic-snmpagent）', 'rsyslogd（主機與各容器）', 'ntpd（新版改用 chrony）', 'hostcfgd']],
    ['CONFIG_DB', ['SNMP、SNMP_COMMUNITY、SNMP_USER、SNMP_AGENT_ADDRESS_CONFIG', 'SYSLOG_SERVER、SYSLOG_CONFIG', 'NTP、NTP_SERVER、NTP_KEY', 'DNS_NAMESERVER']],
    ['協定', ['SNMP UDP 161 / trap 162', 'Syslog UDP 514 / TCP 514 / TLS 6514', 'NTP UDP 123', 'DNS UDP / TCP 53']],
    ['日誌檔', ['/var/log/syslog', '/var/log/auth.log', '/var/log/audit/audit.log']],
  ],
  tags: ['SNMP', 'AgentX', 'MIB', 'IF-MIB', 'SNMPv3', 'trap', 'Syslog', 'rsyslog', 'syslog TLS', 'audit log', 'auditd', 'NTP', 'chrony', 'DNS', 'mgmt VRF', 'hostcfgd'],
  keypoints: [
    'SNMP 的資料沒有另外的資料庫：snmp-subagent 在收到請求時讀取 COUNTERS_DB、APPL_DB、STATE_DB，因此 SNMP 與 CLI、gNMI 看到的是同一份資料。',
    '計數器類 OID（ifHCInOctets 等）來自 Flex Counter 週期寫入的 COUNTERS_DB，因此 SNMP 值的更新頻率取決於 counterpoll 間隔。',
    '容器內的程序把 log 送到容器自己的 rsyslog，再經 docker0 橋接（240.127.1.1）轉給主機的 rsyslog；主機統一寫入 /var/log/syslog 並轉送遠端伺服器。',
    'NTP、Syslog、SNMP、TACACS+ 等管理流量通常走 mgmt VRF，需要在各服務上指定 VRF 或 source-interface，否則會以 default VRF 的路由表送出。',
    'Syslog 可以用 TLS 加密（需要 security profile）；稽核相關的事件另外有 audit log 與 auditd，可單獨轉送。',
  ],
  html: `
<h2>架構</h2>
<div id="d-svc"></div>

<h2>SNMP：OID 從哪裡來</h2>
<p>選擇一個 MIB 物件，看 snmp-subagent 從哪個資料庫讀取。</p>
<div id="oid"></div>

<h2>SNMP 版本與安全</h2>
<table>
<thead><tr><th>版本</th><th>身分</th><th>完整性</th><th>加密</th><th>說明</th></tr></thead>
<tbody>
<tr><td>v2c</td><td>community 字串</td><td>—</td><td>—</td><td>明文傳送；以 view 限制可讀範圍，並以 ACL 或 mgmt VRF 限制來源</td></tr>
<tr><td>v3 noAuthNoPriv</td><td>使用者名稱</td><td>—</td><td>—</td><td>只有身分，沒有保護</td></tr>
<tr><td>v3 authNoPriv</td><td>使用者名稱</td><td>HMAC（MD5 / SHA / SHA-2）</td><td>—</td><td>防竄改與重送</td></tr>
<tr><td>v3 authPriv</td><td>使用者名稱</td><td>HMAC</td><td>DES / AES-128</td><td>建議使用</td></tr>
</tbody></table>
<p>Enterprise SONiC 的 SNMP 設定以 VACM 模型組成：<b>view</b>（可見的 OID 子樹）→ <b>group</b>（版本、安全等級與 read / write / notify view）→ <b>community</b> 或 <b>user</b>（歸屬某個 group）。Trap 目的地以 <code>snmp-server host</code> 設定，可選 traps 或 informs（需要確認回覆）。</p>

<h2>Syslog 等級與轉送</h2>
<p>遠端伺服器可以設定只接收某個等級以上的訊息。選擇門檻，看下列 SONiC 常見訊息哪些會送出。</p>
<div id="sev"></div>

<h2>稽核紀錄</h2>
<table>
<thead><tr><th>來源</th><th>內容</th><th>查看 / 轉送</th></tr></thead>
<tbody>
<tr><td>Audit log（Enterprise）</td><td>登入、登出、設定變更、使用者操作等安全事件</td><td><code>show audit-log</code>；<code>logging server … message-type audit</code></td></tr>
<tr><td>auditd</td><td>Linux 核心稽核：檔案存取、系統呼叫、權限變更。有 basic、detail 與自訂規則集</td><td><code>auditd-system rules detail</code>、<code>show auditd-system log</code></td></tr>
<tr><td>TACACS+ accounting</td><td>每條指令</td><td>見 <a href="#/aaa">AAA</a></td></tr>
<tr><td>Event（Enterprise）</td><td>結構化事件與告警</td><td><code>logging server … message-type event</code>；也可經 gNMI 訂閱</td></tr>
</tbody></table>

<h2>NTP</h2>
<table>
<thead><tr><th>項目</th><th>說明</th></tr></thead>
<tbody>
<tr><td>伺服器選擇</td><td>設定多台伺服器，ntpd 依 stratum、延遲與抖動選出最佳來源；<code>prefer</code> 讓某台優先</td></tr>
<tr><td>poll 間隔</td><td><code>minpoll</code> / <code>maxpoll</code> 以 2 的次方秒表示，例如 6 = 64 秒、10 = 1024 秒</td></tr>
<tr><td>認證</td><td>對稱金鑰（MD5 / SHA）：<code>ntp authentication-key</code>、<code>ntp trusted-key</code>、<code>ntp authenticate</code></td></tr>
<tr><td>VRF 與來源介面</td><td><code>ntp vrf mgmt</code>、<code>ntp source-interface</code>；伺服器端的 ACL 通常以來源 IP 判斷</td></tr>
<tr><td>同時作為伺服器</td><td>交換機可以對下游設備提供 NTP</td></tr>
<tr><td>為何重要</td><td>憑證有效期、log 時間戳、計數器比對、BGP / BFD 除錯都依賴正確時間；需要次微秒精度時改用 <a href="#/ptp">PTP</a></td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config snmp community add s3cr3t RO
sudo config snmp location add "DC1 Row3 Rack12"
sudo config snmpagentaddress add 10.0.0.1 -v mgmt
sudo config syslog add 10.100.0.5 --source 10.0.0.1 --vrf mgmt
sudo config ntp add 10.100.0.1
sudo config ntp add 10.100.0.2
show ntp
show runningconfiguration syslog

<span class="c"># Enterprise SONiC：SNMPv3</span>
sonic(config)# snmp-server view all-mib 1 included
sonic(config)# snmp-server group noc v3 priv read all-mib notify all-mib
sonic(config)# snmp-server user nms1 group noc auth sha auth-password ****** priv aes-128 priv-password ******
sonic(config)# snmp-server host 10.100.0.9 user nms1 traps priv
sonic(config)# snmp-server enable trap
sonic(config)# snmp-server location "DC1 Row3 Rack12"
sonic(config)# snmp-server agentaddress 10.0.0.1 interface mgmt

<span class="c"># Enterprise SONiC：Syslog（含 TLS）、NTP、DNS</span>
sonic(config)# logging server 10.100.0.5 source-interface Management 0 vrf mgmt
sonic(config)# logging server 10.100.0.6 message-type audit vrf mgmt
sonic(config)# logging server 10.100.0.7 protocol tls vrf mgmt
sonic(config)# logging security-profile logserver
sonic(config)# ntp server 10.100.0.1 prefer true
sonic(config)# ntp server 10.100.0.2 minpoll 6 maxpoll 10
sonic(config)# ntp source-interface Management 0
sonic(config)# ntp vrf mgmt
sonic(config)# ip name-server 10.100.0.53 vrf mgmt
sonic# show ntp associations
sonic# show logging servers
sonic# show snmp-server</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-svc'), {
      title: 'SNMP、Syslog、NTP 的元件',
      w: 1000, h: 420,
      groups: [{ x: 230, y: 20, w: 300, h: 130, label: 'snmp 容器' }, { x: 230, y: 180, w: 300, h: 110, label: '其他容器（swss、bgp、pmon…）' }],
      nodes: [
        { id: 'nms', x: 20, y: 60, w: 170, h: 56, label: 'NMS', sub: 'SNMP 輪詢 / 收 trap', kind: 'ext' },
        { id: 'snmpd', x: 250, y: 60, w: 120, h: 56, label: 'snmpd', sub: 'net-snmp', kind: 'proc', info: '<p>處理 SNMP 協定、community / USM、VACM。系統類 MIB 由 snmpd 自己回應，其餘經 AgentX 交給子代理。</p>' },
        { id: 'sub', x: 390, y: 60, w: 120, h: 56, label: 'snmp-subagent', sub: 'AgentX', kind: 'proc', info: '<p>sonic-snmpagent：以 Python 實作 IF-MIB、IP-MIB、LLDP-MIB、ENTITY-MIB、Q-BRIDGE-MIB 等，定期把 Redis 資料載入記憶體供查詢。</p>' },
        { id: 'db', x: 600, y: 60, w: 180, h: 56, label: 'Redis', sub: 'COUNTERS · APPL · STATE', kind: 'db' },
        { id: 'app', x: 250, y: 210, w: 120, h: 56, label: '程序', sub: 'orchagent · bgpd', kind: 'proc' },
        { id: 'crs', x: 390, y: 210, w: 120, h: 56, label: 'rsyslogd', sub: '容器內', kind: 'proc', info: '<p>收集容器內程序的 log，轉送到主機。</p>' },
        { id: 'hrs', x: 600, y: 210, w: 180, h: 56, label: 'rsyslogd', sub: '主機 · 240.127.1.1', kind: 'proc', info: '<p>寫入 /var/log/syslog（logrotate 管理），並依 SYSLOG_SERVER 轉送遠端伺服器。</p>' },
        { id: 'slog', x: 820, y: 210, w: 160, h: 56, label: 'Syslog 伺服器', sub: 'UDP/TCP 514 · TLS', kind: 'ext' },
        { id: 'hc', x: 250, y: 330, w: 170, h: 56, label: 'hostcfgd', sub: 'CONFIG_DB → 設定檔', kind: 'proc', info: '<p>依 NTP、SYSLOG、DNS 等表產生 ntp.conf、rsyslog 設定、resolv.conf，並重新載入服務。</p>' },
        { id: 'ntpd', x: 600, y: 330, w: 180, h: 56, label: 'ntpd / chrony', sub: 'mgmt VRF', kind: 'proc' },
        { id: 'ntps', x: 820, y: 330, w: 160, h: 56, label: 'NTP 伺服器', sub: 'UDP 123', kind: 'ext' },
      ],
      edges: [
        { from: 'nms', to: 'snmpd', bi: true, label: 'UDP 161', id: 'e1' },
        { from: 'snmpd', to: 'sub', bi: true, id: 'e2' },
        { from: 'sub', to: 'db', label: '讀取', id: 'e3' },
        { from: 'app', to: 'crs', id: 'e4' }, { from: 'crs', to: 'hrs', id: 'e5' }, { from: 'hrs', to: 'slog', id: 'e6' },
        { from: 'hc', to: 'hrs', dash: true, id: 'e7', via: [[335, 305], [690, 305]] },
        { from: 'hc', to: 'ntpd', dash: true, label: 'ntp.conf', id: 'e8' },
        { from: 'ntpd', to: 'ntps', bi: true, id: 'e9' },
        { from: 'snmpd', to: 'nms', dash: true, label: 'trap 162', id: 'e10', via: [[310, 160], [105, 160]] },
      ],
      steps: [
        { title: 'SNMP 查詢', text: 'snmpd 收到 GET，屬於子代理的 OID 經 AgentX 轉給 snmp-subagent，子代理回應從 Redis 載入的資料。', nodes: ['nms', 'snmpd', 'sub', 'db'], edges: ['e1', 'e2', 'e3'] },
        { title: 'Trap', text: 'link up / down、設定變更、環境告警等事件由 snmpd 以 trap 或 inform 送到 NMS。', nodes: ['snmpd', 'nms'], edges: ['e10'] },
        { title: 'Syslog', text: '容器內的程序寫 log 到容器的 rsyslog，經 docker0 轉到主機 rsyslog，再轉送遠端伺服器。', nodes: ['app', 'crs', 'hrs', 'slog'], edges: ['e4', 'e5', 'e6'] },
        { title: '設定與 NTP', text: 'hostcfgd 依 CONFIG_DB 產生 rsyslog 與 NTP 設定；ntpd 在 mgmt VRF 中與伺服器同步。', nodes: ['hc', 'hrs', 'ntpd', 'ntps'], edges: ['e7', 'e8', 'e9'] },
      ],
    });

    // ---------- OID 對照 ----------
    const OIDS = [
      ['ifOperStatus', '1.3.6.1.2.1.2.2.1.8', 'IF-MIB', 'APPL_DB', 'PORT_TABLE:Ethernet0 → oper_status', '由 portsyncd / orchagent 更新的介面運作狀態。'],
      ['ifHCInOctets', '1.3.6.1.2.1.31.1.1.1.6', 'IF-MIB', 'COUNTERS_DB', 'COUNTERS:oid:0x1000… → SAI_PORT_STAT_IF_IN_OCTETS', '透過 COUNTERS_PORT_NAME_MAP 把 port 名稱對到 SAI OID；值由 Flex Counter 週期更新。'],
      ['ifAlias', '1.3.6.1.2.1.31.1.1.1.18', 'IF-MIB', 'CONFIG_DB', 'PORT|Ethernet0 → description', '介面描述。'],
      ['ifHighSpeed', '1.3.6.1.2.1.31.1.1.1.15', 'IF-MIB', 'APPL_DB', 'PORT_TABLE:Ethernet0 → speed', '單位 Mbps。'],
      ['lldpRemSysName', '1.0.8802.1.1.2.1.4.1.1.9', 'LLDP-MIB', 'APPL_DB', 'LLDP_ENTRY_TABLE:Ethernet0 → lldp_rem_sys_name', '由 lldp 容器的 lldpmgrd / lldp_syncd 寫入。'],
      ['entPhySensorValue', '1.3.6.1.2.1.99.1.1.1.4', 'ENTITY-SENSOR-MIB', 'STATE_DB', 'TEMPERATURE_INFO|… / TRANSCEIVER_DOM_SENSOR|Ethernet0', 'pmon 的 thermalctld、xcvrd 寫入的溫度與光模組 DOM。'],
      ['ipCidrRouteDest', '1.3.6.1.2.1.4.24.4.1.1', 'IP-FORWARD-MIB', 'APPL_DB', 'ROUTE_TABLE:0.0.0.0/0', '預設路由等資訊，來自 fpmsyncd 寫入的路由表。'],
      ['dot1qTpFdbPort', '1.3.6.1.2.1.17.7.1.2.2.1.2', 'Q-BRIDGE-MIB', 'ASIC_DB', 'ASIC_STATE:SAI_OBJECT_TYPE_FDB_ENTRY:…', 'MAC 位址表。'],
      ['cpfcIfRequests', '1.3.6.1.4.1.9.9.813.1.1.1.1', 'CISCO-PFC-EXT-MIB', 'COUNTERS_DB', 'SAI_PORT_STAT_PFC_x_RX_PKTS', 'PFC 計數器。'],
    ];
    const oh = root.querySelector('#oid');
    const obox = S.el('div', { class: 'w-box' });
    oh.appendChild(obox);
    const list = S.el('div', { class: 'row' });
    obox.appendChild(list);
    const od = S.el('div', { style: 'margin-top:12px' });
    obox.appendChild(od);
    let cur = 1;
    function odraw() {
      list.innerHTML = '';
      OIDS.forEach((o, i) => list.appendChild(S.el('button', { class: 'btn sm' + (i === cur ? ' on' : ''), onclick: () => { cur = i; odraw(); } }, o[0])));
      const [n, oid, mib, db, key, note] = OIDS[cur];
      od.innerHTML = `<div class="pipe"><div><div class="pl">MIB</div><div class="pv" style="font-size:14px">${mib}</div></div><div><div class="pl">OID</div><div class="pv mono" style="font-size:13px">${oid}</div></div><div><div class="pl">資料庫</div><div class="pv" style="font-size:14px">${db}</div></div></div>
        <div class="log"><div><code>${key}</code></div><div>${note}</div><div><code>snmpget -v2c -c s3cr3t 10.0.0.1 ${oid}${/^if|^cpfc/.test(n) ? '.1' : ''}</code></div></div>`;
    }
    odraw();

    // ---------- Syslog 等級 ----------
    const SEV = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
    const MSG = [
      [2, 'pmon#psud', 'PSU 2 is not present or has no power'],
      [3, 'swss#orchagent', 'addRoute: Failed to create route 10.8.0.0/16: SAI_STATUS_TABLE_FULL'],
      [4, 'pmon#thermalctld', 'Temperature of CPU crossed high threshold 85 C'],
      [5, 'bgp#bgpd', '%ADJCHANGE: neighbor 10.1.1.1 in vrf default Down Peer closed the session'],
      [5, 'swss#portmgrd', 'Ethernet4 oper status is down'],
      [6, 'sshd', 'Accepted publickey for admin from 10.100.0.20 port 51022'],
      [6, 'swss#orchagent', 'doTask: Set port Ethernet0 mtu to 9100'],
      [7, 'syncd#syncd', 'processFlexCounterEvent: set PORT counter polling interval 1000'],
    ];
    const sh = root.querySelector('#sev');
    const sbox = S.el('div', { class: 'w-box' });
    sh.appendChild(sbox);
    const seg = S.el('span');
    sbox.appendChild(S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, '送出等級 ≤'), seg));
    const sout = S.el('div', { style: 'margin-top:12px' });
    sbox.appendChild(sout);
    S.seg(seg, SEV.map((s, i) => `${i} ${s}`), th => {
      const n = MSG.filter(m => m[0] <= th).length;
      sout.innerHTML = `<div class="tbl"><table><thead><tr><th>等級</th><th>來源</th><th>訊息</th><th>轉送</th></tr></thead><tbody>${MSG.map(([s, src, m]) => `<tr><td><code>${s} ${SEV[s]}</code></td><td><code>${src}</code></td><td style="font-size:13px">${m}</td><td><span class="badge ${s <= th ? 'g' : 'n'}">${s <= th ? '送出' : '只寫本機'}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="muted" style="font-size:12.5px;margin-top:8px">共 ${n} / ${MSG.length} 則送往遠端。數字越小越嚴重；本機 /var/log/syslog 的記錄等級另外由各程序的 log level（例如 <code>swssloglevel</code>）決定。</div>`;
    }, 6);
  },
  searchText: 'snmpd snmp-subagent AgentX sonic-snmpagent IF-MIB LLDP-MIB ENTITY-SENSOR-MIB Q-BRIDGE-MIB snmp-server community view group user host trap inform rsyslog 240.127.1.1 docker0 logging server message-type audit event syslog TLS 6514 ntp server prefer minpoll maxpoll ntp vrf mgmt chrony ip name-server auditd',
  related: ['counters', 'vrf', 'aaa', 'pki', 'ptp', 'troubleshooting'],
  refs: [['sonic-snmpagent', 'https://github.com/sonic-net/sonic-snmpagent'], ['RFC 3414 SNMPv3 USM', 'https://www.rfc-editor.org/rfc/rfc3414'], ['RFC 5425 Syslog over TLS', 'https://www.rfc-editor.org/rfc/rfc5425'], ['RFC 5905 NTPv4', 'https://www.rfc-editor.org/rfc/rfc5905'], ['Enterprise SONiC User Guide UG460：§5.17、§5.21、§5.24、§24.2–24.5', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
