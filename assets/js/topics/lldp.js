S.register({
  id: 'lldp',
  category: 'l2',
  order: 6,
  title: 'LLDP',
  en: 'Link Layer Discovery Protocol',
  summary: 'LLDP（802.1AB）讓相鄰設備互相通告身分與能力。SONiC 在 lldp 容器中執行 lldpd，由 lldpmgrd 依 CONFIG_DB 設定 lldpd，lldp_syncd 定期把鄰居資訊同步到 APPL_DB，供 CLI、SNMP 與 gNMI 使用。',
  meta: [
    ['容器', ['lldp']],
    ['程序', ['lldpd', 'lldpmgrd', 'lldp_syncd']],
    ['CONFIG_DB', ['LLDP|GLOBAL', 'LLDP_PORT', 'DEVICE_NEIGHBOR（期望鄰居）']],
    ['APPL_DB', ['LLDP_ENTRY_TABLE', 'LLDP_LOC_CHASSIS']],
    ['協定', ['EtherType 0x88CC', 'dst MAC 01:80:C2:00:00:0E', 'tx interval 30s', 'TTL 120s']],
  ],
  tags: ['LLDP', 'LLDP-MED', 'TLV', 'lldpd', 'lldp_syncd', 'neighbor discovery', '802.1AB'],
  keypoints: [
    'LLDPDU 由必要 TLV（Chassis ID、Port ID、TTL、End）與選用 TLV（系統名稱、描述、能力、管理位址、802.1 / 802.3 組織 TLV）組成。',
    'LLDP 是單向通告，不做協商；接收端以 TTL 決定資訊何時過期。',
    'lldpmgrd 把 port 的 alias 與 description 設為 lldpd 通告的 Port ID 與描述，因此鄰居看到的是面板名稱。',
    'lldp_syncd 週期性讀取 lldpctl 的 JSON 輸出並寫入 APPL_DB，所以 APPL_DB 的鄰居資訊有數秒延遲。',
  ],
  html: `
<h2>協定原理</h2>
<p>LLDP 以 multicast 位址 <code>01:80:C2:00:00:0E</code>（nearest bridge，不會被交換機轉發）送出，EtherType <code>0x88CC</code>。每個 LLDPDU 由一連串 TLV 組成，每個 TLV 的前 2 bytes 是 7 bit type 加 9 bit length。</p>
<div id="frame"></div>
<table>
<thead><tr><th>Type</th><th>TLV</th><th>必要</th><th>SONiC 通告內容</th></tr></thead>
<tbody>
<tr><td>1</td><td>Chassis ID</td><td>是</td><td>系統 MAC（subtype 4）</td></tr>
<tr><td>2</td><td>Port ID</td><td>是</td><td>port alias，例如 <code>fortyGigE0/0</code> 或 <code>Eth1/1</code>（subtype 7 local）</td></tr>
<tr><td>3</td><td>Time To Live</td><td>是</td><td>tx interval × hold multiplier，預設 30 × 4 = 120 秒</td></tr>
<tr><td>4</td><td>Port Description</td><td>否</td><td>PORT 表的 <code>description</code></td></tr>
<tr><td>5 / 6</td><td>System Name / Description</td><td>否</td><td>hostname / SONiC 版本與平台</td></tr>
<tr><td>7</td><td>System Capabilities</td><td>否</td><td>Bridge、Router</td></tr>
<tr><td>8</td><td>Management Address</td><td>否</td><td>eth0 或 Loopback 位址</td></tr>
<tr><td>127</td><td>組織專屬</td><td>否</td><td>802.1（Port VLAN ID、VLAN name、Link Aggregation）、802.3（MAC/PHY、Max frame size、Power via MDI）、LLDP-MED</td></tr>
</tbody></table>

<h2>在 SONiC 中的實作</h2>
<div id="d-lldp"></div>
<pre><span class="c"># APPL_DB 中的鄰居資訊</span>
$ sonic-db-cli APPL_DB hgetall "LLDP_ENTRY_TABLE:Ethernet0"
{'lldp_rem_chassis_id_subtype': '4', 'lldp_rem_chassis_id': '00:1c:73:aa:bb:cc',
 'lldp_rem_port_id_subtype': '5', 'lldp_rem_port_id': 'Ethernet1',
 'lldp_rem_sys_name': 'spine01', 'lldp_rem_man_addr': '10.3.146.1',
 'lldp_rem_sys_cap_enabled': '28 00', 'lldp_rem_time_mark': '18543'}</pre>
<div class="callout"><div class="ct">DEVICE_NEIGHBOR 與 LLDP</div><p>CONFIG_DB 的 <code>DEVICE_NEIGHBOR</code> 記錄「預期」的鄰居（通常由 minigraph 產生），LLDP 提供「實際」的鄰居。自動化系統常比較兩者來找出接錯線的 port。</p></div>

<h2>設定與查看</h2>
<pre><span class="c"># 社群版</span>
show lldp table
show lldp neighbors Ethernet0
sudo config feature state lldp enabled
docker exec lldp lldpcli show neighbors details
docker exec lldp lldpcli show statistics

<span class="c"># Enterprise SONiC</span>
sonic(config)# lldp enable
sonic(config)# lldp timer 30
sonic(config)# lldp multiplier 4
sonic(config)# lldp tlv-select management-address
sonic(config)# interface Eth1/48
sonic(config-if-Eth1/48)# lldp tlv-select port-vlan-id
sonic(config-if-Eth1/48)# lldp mode receive       <span class="c"># 只收不送</span>
sonic# show lldp table
sonic# show lldp neighbor Eth1/48</pre>
<div class="callout"><div class="ct">LLDP-MED</div><p>LLDP-MED（ANSI/TIA-1057）在 802.1AB 之上加入網路政策（語音 VLAN、優先權）、位置與 PoE 資訊，常用於 IP 電話與校園網路。Enterprise SONiC 預設在所有介面啟用。</p></div>
`,
  mount(root) {
    const TLV = [
      ['Dst MAC', '01:80:C2:00:00:0E', 'var(--k-kernel)', 1.1],
      ['Src MAC', 'port MAC', 'var(--k-kernel)', 1],
      ['EtherType', '0x88CC', 'var(--k-kernel)', .7],
      ['Chassis ID', 'T1', 'var(--k-db)', .9],
      ['Port ID', 'T2', 'var(--k-db)', .9],
      ['TTL', 'T3 · 120', 'var(--k-db)', .7],
      ['Optional TLVs', 'T4–8, 127', 'var(--k-proc)', 1.6],
      ['End', 'T0', 'var(--k-db)', .5],
    ];
    root.querySelector('#frame').innerHTML = `<div class="hdr">${TLV.map(([a, b, c, w]) => `<div style="--hc:${c};--hw:${w}"><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
    S.diagram(root.querySelector('#d-lldp'), {
      title: 'lldp 容器的元件',
      w: 1000, h: 360,
      groups: [{ x: 250, y: 16, w: 500, h: 200, label: 'lldp 容器' }],
      nodes: [
        { id: 'cfg', x: 20, y: 50, w: 180, h: 56, label: 'CONFIG_DB', sub: 'LLDP / PORT', kind: 'db', info: '<p>全域開關、計時器，以及每個 port 的 alias、description、admin 狀態。</p>' },
        { id: 'mgr', x: 280, y: 50, w: 180, h: 56, label: 'lldpmgrd', kind: 'proc', info: '<p>訂閱 CONFIG_DB 與 STATE_DB PORT_TABLE：port netdev 就緒後執行 <code>lldpcli configure ports Ethernet0 lldp portidsubtype local &lt;alias&gt; description &lt;desc&gt;</code>，並處理全域參數。</p>' },
        { id: 'lldpd', x: 540, y: 50, w: 180, h: 56, label: 'lldpd', kind: 'proc', info: '<p>開源的 LLDP daemon，在每個前面板 netdev 與 eth0 上收發 LLDPDU。</p>' },
        { id: 'sync', x: 540, y: 140, w: 180, h: 56, label: 'lldp_syncd', kind: 'proc', info: '<p>週期性執行 <code>lldpctl -f json</code>，解析後更新 APPL_DB 的 LLDP_ENTRY_TABLE（新增、修改、刪除過期鄰居），並寫入 LLDP_LOC_CHASSIS。</p>' },
        { id: 'net', x: 800, y: 50, w: 180, h: 56, label: 'netdev / ASIC', sub: 'trap lldp', kind: 'hw', info: '<p>ASIC 把 LLDP 封包 trap 到 CPU（CoPP queue4_group3）。</p>' },
        { id: 'appl', x: 540, y: 270, w: 180, h: 56, label: 'APPL_DB', sub: 'LLDP_ENTRY_TABLE', kind: 'db', info: '<p>每個 port 一筆鄰居資訊。</p>' },
        { id: 'use', x: 250, y: 270, w: 230, h: 56, label: 'show lldp / SNMP / gNMI', kind: 'cli', info: '<p>SNMP 子代理以 LLDP-MIB 提供；gNMI 可透過 OpenConfig lldp 模型讀取。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'mgr', id: 'e1' },
        { from: 'mgr', to: 'lldpd', label: 'lldpcli', id: 'e2' },
        { from: 'lldpd', to: 'net', bi: true, label: 'LLDPDU', id: 'e3' },
        { from: 'lldpd', to: 'sync', label: 'lldpctl json', id: 'e4' },
        { from: 'sync', to: 'appl', id: 'e5' },
        { from: 'appl', to: 'use', id: 'e6' },
      ],
      steps: [
        { title: '設定 lldpd', text: 'lldpmgrd 依 CONFIG_DB 用 lldpcli 設定每個 port 的 Port ID 與描述。', nodes: ['cfg', 'mgr', 'lldpd'], edges: ['e1', 'e2'] },
        { title: '收發 LLDPDU', text: 'lldpd 每 30 秒送出 LLDPDU，並接收鄰居的 LLDPDU（經 CoPP trap）。', nodes: ['lldpd', 'net'], edges: ['e3'] },
        { title: '同步到 Redis', text: 'lldp_syncd 定期讀取 lldpd 的鄰居表並寫入 APPL_DB。', nodes: ['lldpd', 'sync', 'appl'], edges: ['e4', 'e5'] },
        { title: '對外提供', text: 'show 指令、SNMP LLDP-MIB 與 gNMI 皆讀取 APPL_DB。', nodes: ['appl', 'use'], edges: ['e6'] },
      ],
    });
  },
  related: ['containers', 'copp', 'lag', 'port'],
  refs: [['IEEE 802.1AB', 'https://standards.ieee.org/ieee/802.1AB/6047/'], ['lldpd', 'https://lldpd.github.io/'], ['Enterprise SONiC User Guide UG460：§8.2、§9.3', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
