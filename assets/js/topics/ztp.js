S.register({
  id: 'ztp',
  category: 'ops',
  order: 2,
  title: 'Zero Touch Provisioning',
  en: 'Zero Touch Provisioning (ZTP)',
  summary: 'ZTP 讓新交換機在沒有人工介入的情況下，透過 DHCP 取得 ZTP JSON 或腳本的位置，依序完成韌體安裝、設定下載、腳本執行與連線檢查。沒有 startup config 時自動啟動。',
  meta: [
    ['服務', ['ztp.service', 'sonic-ztp']],
    ['DHCP 選項', ['v4 option 67 (ztp_json_url)', 'v6 option 59 (boot-file-url)', 'option 239 (provisioning script)', 'v4 option 61 / 77、v6 option 15（用戶端識別）']],
    ['檔案', ['/host/ztp/ztp_data.json', '/var/log/ztp.log', '/usr/lib/ztp/plugins/']],
    ['指令', ['show ztp status', 'sudo config ztp enable | disable | run', 'sonic(config)# ztp enable']],
    ['原始碼', '<code>sonic-ztp</code>'],
  ],
  tags: ['ZTP', 'DHCP', 'option 67', 'option 239', 'provisioning', 'ztp.json', 'plugin'],
  keypoints: [
    '開機時若沒有 /etc/sonic/config_db.json，ZTP 會在管理口與所有前面板 port 上啟動 DHCP 探索。',
    '第一個收到有效 DHCP offer 的介面決定 ZTP 來源；option 67 與 option 239 同時存在時以 JSON（option 67）為準。',
    'ztp.json 由多個 section 組成，每個 section 由一個 plugin 處理（firmware、configdb-json、connectivity-check、自訂腳本…），建議以數字前綴控制順序。',
    '每個 section 都有狀態（SUCCESS / FAILED / IN-PROGRESS），可設定失敗時是否繼續、成功後是否重開機。',
    '人工設定並存檔後，應停用 ZTP，避免下次開機又進入 provisioning。',
  ],
  html: `
<h2>運作流程</h2>
<div id="d-ztp"></div>

<h2>DHCP 選項</h2>
<table>
<thead><tr><th>選項</th><th>方向</th><th>內容</th></tr></thead>
<tbody>
<tr><td>DHCPv4 67 / DHCPv6 59</td><td>server → switch</td><td>ZTP JSON 檔的 URL（HTTP、HTTPS、TFTP、FTP 等）</td></tr>
<tr><td>DHCP 239</td><td>server → switch</td><td>自訂 provisioning 腳本的 URL（僅在沒有 67 時使用）</td></tr>
<tr><td>DHCPv4 61</td><td>switch → server</td><td>client identifier，格式為 <code>SONiC##&lt;product name&gt;##&lt;serial&gt;</code>，取自系統 EEPROM（TLV 0x21、0x23）</td></tr>
<tr><td>DHCPv4 77 / DHCPv6 15</td><td>switch → server</td><td>user class：<code>SONiC-ZTP</code>，可讓 DHCP server 只對 ZTP 請求回應特定選項</td></tr>
</tbody></table>
<pre><span class="c"># ISC dhcpd 範例：依 client identifier 給不同的 ZTP 檔</span>
option ztp-json-url code 67 = text;
host leaf01 {
  option dhcp-client-identifier "SONiC##7712-32X-O-AC-F##771232X1941045";
  fixed-address 192.168.1.101;
  option ztp-json-url "http://192.168.1.1/ztp/leaf01.json";
}</pre>

<h2>ZTP JSON 結構</h2>
<p>最外層必須是 <code>ztp</code> 物件，其中每個子物件是一個 section。section 名稱的後綴決定使用哪個 plugin（例如 <code>01-firmware</code> 使用 firmware plugin）。</p>
<div id="json"></div>
<table>
<thead><tr><th>Section / plugin</th><th>用途</th><th>常用欄位</th></tr></thead>
<tbody>
<tr><td><code>firmware</code></td><td>安裝指定映像並可設為預設</td><td><code>install.url</code>、<code>install.set-default</code>、<code>reboot-on-success</code></td></tr>
<tr><td><code>configdb-json</code></td><td>下載 config_db.json 並載入</td><td><code>url</code>、<code>dynamic-url</code>（依 hostname / serial 組出 URL）、<code>clear-config</code></td></tr>
<tr><td><code>connectivity-check</code></td><td>完成後 ping 指定主機驗證連線</td><td><code>ping-hosts</code>、<code>retry-count</code></td></tr>
<tr><td><code>snmp</code></td><td>設定 SNMP community 等</td><td><code>community-ro</code>、<code>snmp-location</code></td></tr>
<tr><td><code>plugin</code>（自訂）</td><td>下載並執行任意腳本</td><td><code>plugin.url</code>、<code>plugin.shell</code>、<code>args</code></td></tr>
<tr><td>通用欄位</td><td>控制每個 section 的行為</td><td><code>ignore-result</code>、<code>halt-on-failure</code>、<code>reboot-on-success</code>、<code>reboot-on-failure</code>、<code>timestamp</code></td></tr>
</tbody></table>

<h2>操作與狀態</h2>
<pre><span class="c"># 社群版 Click CLI</span>
show ztp status
sudo config ztp disable -y
sudo config ztp run -y          <span class="c"># 重新執行 ZTP（會清除現有設定）</span>
<span class="c"># Enterprise SONiC</span>
sonic# show ztp-status
sonic(config)# no ztp enable     <span class="c"># 中止進行中的 ZTP，載入出廠預設設定</span>
sonic(config)# ztp enable        <span class="c"># 重新啟用，下次開機生效</span></pre>
<pre>ZTP Admin Mode   : True
ZTP Service      : Inactive
ZTP Status       : SUCCESS
ZTP Source       : dhcp-opt67 (eth0)
Runtime          : 05m 31s
01-firmware
    Status       : SUCCESS
02-configdb-json
    Status       : SUCCESS
03-connectivity-check
    Status       : SUCCESS</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-ztp'), {
      title: 'ZTP 從開機到完成',
      w: 1000, h: 400,
      nodes: [
        { id: 'boot', x: 20, y: 40, w: 170, h: 60, label: '開機', sub: '無 config_db.json', kind: 'kernel', info: '<p>全新安裝（ONIE install）或出廠狀態，沒有 startup config。ztp.service 啟動並建立暫時設定：所有 port admin up、以 untagged 方式運作。</p>' },
        { id: 'dhcp', x: 240, y: 40, w: 170, h: 60, label: 'DHCP 探索', sub: 'eth0 + 前面板 port', kind: 'proc', info: '<p>在所有介面上同時執行 DHCPv4 / DHCPv6，並送出 option 61 / 77 識別自己。第一個收到含 option 67 / 59 / 239 的 offer 決定來源介面。</p>' },
        { id: 'srv', x: 460, y: 40, w: 170, h: 60, label: 'DHCP server', kind: 'ext', info: '<p>回覆 IP 與 ZTP JSON（或腳本）的 URL。</p>' },
        { id: 'dl', x: 680, y: 40, w: 170, h: 60, label: '下載 ztp.json', sub: 'HTTP / TFTP', kind: 'file', info: '<p>存成 <code>/host/ztp/ztp_data.json</code>，重開機後從上次的 section 繼續。</p>' },
        { id: 'fw', x: 20, y: 200, w: 170, h: 60, label: '01-firmware', sub: 'sonic-installer', kind: 'proc', info: '<p>下載映像、安裝並設為預設；<code>reboot-on-success</code> 時重開機，開機後 ZTP 從下一個 section 繼續。</p>' },
        { id: 'cfg', x: 240, y: 200, w: 170, h: 60, label: '02-configdb-json', sub: 'config reload', kind: 'proc', info: '<p>下載對應此設備的 config_db.json（可依 hostname 或 serial 動態組 URL），寫入 /etc/sonic 並 reload。</p>' },
        { id: 'sc', x: 460, y: 200, w: 170, h: 60, label: '03-plugin', sub: '自訂腳本', kind: 'proc', info: '<p>執行額外的安裝或設定腳本，例如部署監控容器、註冊到管理系統。</p>' },
        { id: 'cc', x: 680, y: 200, w: 170, h: 60, label: '04-connectivity-check', sub: 'ping-hosts', kind: 'proc', info: '<p>驗證設定後能連到指定主機。</p>' },
        { id: 'done', x: 350, y: 320, w: 300, h: 56, label: 'ZTP SUCCESS · ztp.service 停止', kind: 'ext', info: '<p>所有 section 完成後服務停止；<code>show ztp status</code> 可看到每個 section 的結果與耗時。</p>' },
      ],
      edges: [
        { from: 'boot', to: 'dhcp', id: 'e1' },
        { from: 'dhcp', to: 'srv', label: 'opt 61/77', bi: true, id: 'e2' },
        { from: 'srv', to: 'dl', label: 'opt 67', id: 'e3' },
        { from: 'dl', to: 'fw', id: 'e4', via: [[765, 150], [105, 150]] },
        { from: 'fw', to: 'cfg', id: 'e5' },
        { from: 'cfg', to: 'sc', id: 'e6' },
        { from: 'sc', to: 'cc', id: 'e7' },
        { from: 'cc', to: 'done', id: 'e8' },
      ],
      steps: [
        { title: '沒有 startup config', text: 'ztp.service 判斷需要 provisioning，建立暫時設定讓所有介面可以收發 DHCP。', nodes: ['boot', 'dhcp'], edges: ['e1'] },
        { title: 'DHCP 交換', text: '交換機以 option 61（含型號與序號）識別自己，server 回覆 option 67 指定 ZTP JSON 的位置。', nodes: ['dhcp', 'srv'], edges: ['e2'] },
        { title: '下載 ZTP JSON', text: '下載後存到 /host/ztp，後續即使重開機也會從中斷處繼續。', nodes: ['srv', 'dl'], edges: ['e3'] },
        { title: '依序處理 section', text: '韌體 → 設定 → 自訂腳本 → 連線檢查。每個 section 可要求成功後重開機。', nodes: ['dl', 'fw', 'cfg', 'sc', 'cc'], edges: ['e4', 'e5', 'e6', 'e7'] },
        { title: '完成', text: '所有 section 成功後 ZTP 結束，交換機以下載的設定運作。', nodes: ['cc', 'done'], edges: ['e8'] },
      ],
    });
    S.tabs(root.querySelector('#json'), [
      { label: '基本範例', html: `<pre>{
  <span class="s">"ztp"</span>: {
    <span class="s">"01-firmware"</span>: {
      <span class="s">"install"</span>: { <span class="s">"url"</span>: <span class="s">"http://192.168.1.1/images/sonic-broadcom.bin"</span>, <span class="s">"set-default"</span>: <span class="k">true</span> },
      <span class="s">"reboot-on-success"</span>: <span class="k">true</span>
    },
    <span class="s">"02-configdb-json"</span>: {
      <span class="s">"dynamic-url"</span>: {
        <span class="s">"source"</span>: { <span class="s">"prefix"</span>: <span class="s">"http://192.168.1.1/configs/"</span>, <span class="s">"identifier"</span>: <span class="s">"hostname"</span>, <span class="s">"suffix"</span>: <span class="s">"_config_db.json"</span> }
      }
    },
    <span class="s">"03-provisioning-script"</span>: {
      <span class="s">"plugin"</span>: { <span class="s">"url"</span>: <span class="s">"http://192.168.1.1/scripts/post_install.sh"</span> },
      <span class="s">"reboot-on-success"</span>: <span class="k">false</span>
    },
    <span class="s">"04-connectivity-check"</span>: {
      <span class="s">"ping-hosts"</span>: [<span class="s">"10.1.1.1"</span>, <span class="s">"10.1.1.2"</span>]
    }
  }
}</pre>` },
      { label: '失敗處理', html: `<pre>{
  <span class="s">"ztp"</span>: {
    <span class="s">"halt-on-failure"</span>: <span class="k">true</span>,
    <span class="s">"01-configdb-json"</span>: {
      <span class="s">"url"</span>: { <span class="s">"source"</span>: <span class="s">"http://192.168.1.1/leaf01.json"</span>, <span class="s">"timeout"</span>: <span class="n">30</span> },
      <span class="s">"ignore-result"</span>: <span class="k">false</span>
    },
    <span class="s">"02-snmp"</span>: {
      <span class="s">"community-ro"</span>: <span class="s">"public"</span>,
      <span class="s">"ignore-result"</span>: <span class="k">true</span>
    }
  }
}</pre><p class="muted" style="font-size:13px"><code>halt-on-failure</code> 讓任一 section 失敗時停止整個 ZTP；section 內的 <code>ignore-result</code> 讓該 section 失敗時不影響整體結果。</p>` },
    ]);
  },
  related: ['build', 'config', 'mgmt-framework'],
  refs: [['SONiC ZTP 設計文件', 'https://github.com/sonic-net/SONiC/blob/master/doc/ztp/ztp.md'], ['Enterprise SONiC User Guide UG460：Ch.6', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
