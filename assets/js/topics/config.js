S.register({
  id: 'config',
  category: 'ops',
  order: 1,
  icon: '⚙️',
  title: '設定管理',
  en: 'Configuration Management',
  summary: 'config_db.json、minigraph、sonic-cfggen、config save / reload、GCU 與 YANG——搞清楚 SONiC 的設定從哪來、存在哪、什麼時候生效，以及為什麼「重開機後設定不見了」。',
  tags: ['config_db.json', 'sonic-cfggen', 'config save', 'config reload', 'minigraph', 'GCU', 'YANG'],
  features: ['設定生命週期動畫', '存檔/重載實驗', '設定檔範例'],
  html: `
<h2>設定的生命週期</h2>
<div id="d-cfg"></div>

<div class="callout warn"><div class="ct">⚠️ 新手最常踩的坑</div>
<p><code>config</code> 指令只改 <b>CONFIG_DB</b>（記憶體中的 Redis），立即生效但<b>不會自動存檔</b>。重開機或 <code>config reload</code> 後，會從 <code>/etc/sonic/config_db.json</code> 重新載入。想保留變更，一定要 <code>sudo config save -y</code>。</p></div>

<h2>實驗：沒存檔的設定會怎樣？</h2>
<p>依序點下面的指令：先建立 VLAN 300 然後 reload（消失了！），再建立一次、存檔、reload（還在）。</p>
<div id="term"></div>

<h2>常見指令比較</h2>
<table>
<thead><tr><th>指令</th><th>做什麼</th><th>會中斷流量嗎</th></tr></thead>
<tbody>
<tr><td><code>config save -y</code></td><td>CONFIG_DB → config_db.json</td><td>不會</td></tr>
<tr><td><code>config reload -y</code></td><td>清空 CONFIG_DB，從 config_db.json 重載，<b>重啟服務</b></td><td>會</td></tr>
<tr><td><code>config load file.json -y</code></td><td>把檔案內容「合併」寫入 CONFIG_DB，不重啟服務</td><td>視內容</td></tr>
<tr><td><code>config load_minigraph -y</code></td><td>從 minigraph.xml 產生設定並重啟服務</td><td>會</td></tr>
<tr><td><code>config apply-patch patch.json</code></td><td>GCU：以 JSON Patch 增量修改，先經 YANG 驗證並自動排序步驟</td><td>儘量不會</td></tr>
<tr><td><code>show runningconfiguration all</code></td><td>印出目前 CONFIG_DB</td><td>—</td></tr>
</tbody></table>

<h2>設定檔範例</h2>
<div id="tabs"></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-cfg'), {
      title: '設定從哪裡來、到哪裡去',
      w: 1000, h: 420,
      nodes: [
        { id: 'json', x: 20, y: 60, w: 190, h: 56, label: 'config_db.json', sub: '/etc/sonic/', kind: 'file', info: '<p>持久化的設定檔，格式就是 CONFIG_DB 的 JSON 傾印：<code>{"TABLE": {"key": {"field": "value"}}}</code>。</p>' },
        { id: 'mg', x: 20, y: 180, w: 190, h: 56, label: 'minigraph.xml', sub: '(舊式，Microsoft 使用)', kind: 'file', info: '<p>早期 Azure 使用的 XML 拓樸描述檔（設備、鏈路、BGP 鄰居、IP）。<code>config load_minigraph</code> 由 sonic-cfggen 轉成 CONFIG_DB。</p>' },
        { id: 'gen', x: 300, y: 120, w: 150, h: 56, label: 'sonic-cfggen', kind: 'cli', info: '<p>SONiC 的設定瑞士刀：</p><ul><li><code>-j file.json --write-to-db</code> 載入 JSON</li><li><code>-m minigraph.xml</code> 解析 minigraph</li><li><code>-d --print-data</code> 印出 CONFIG_DB</li><li><code>-d -t template.j2</code> 用 CONFIG_DB 渲染 Jinja2 範本</li></ul>' },
        { id: 'cfg', x: 500, y: 120, w: 180, h: 56, label: 'CONFIG_DB', kind: 'db', info: '<p>執行中的設定，所有服務都從這裡讀。</p>' },
        { id: 'cli', x: 500, y: 290, w: 180, h: 56, label: 'config CLI / gNMI', kind: 'cli', info: '<p>即時修改 CONFIG_DB，立即生效但不存檔。</p>' },
        { id: 'gcu', x: 300, y: 290, w: 150, h: 56, label: 'GCU', sub: 'config apply-patch', kind: 'cli', info: '<p>Generic Config Updater：輸入 JSON Patch（RFC 6902），用 <b>sonic-yang-models</b> 驗證結果是否合法，並自動計算安全的套用順序，支援 checkpoint / rollback。</p>' },
        { id: 'tpl', x: 750, y: 40, w: 230, h: 56, label: 'Jinja2 範本 (*.j2)', kind: 'file', info: '<p>許多服務的設定檔（FRR、lldpd、snmpd、supervisord…）是容器啟動時用 sonic-cfggen 讀 CONFIG_DB 渲染範本產生的。</p>' },
        { id: 'svc', x: 750, y: 150, w: 230, h: 56, label: '服務設定檔', sub: 'frr.conf / snmpd.conf …', kind: 'file', info: '<p>渲染出來的檔案；改 CONFIG_DB 後，有些服務需要重啟才會重新渲染（例如 snmp），有些則由 *cfgd 動態套用（例如 bgpcfgd）。</p>' },
        { id: 'dm', x: 750, y: 290, w: 230, h: 56, label: '*mgrd / orchagent / bgpcfgd', kind: 'proc', info: '<p>訂閱 CONFIG_DB，變更即時生效。</p>' },
      ],
      edges: [
        { from: 'json', to: 'gen', label: '開機 / reload', id: 'e1' },
        { from: 'mg', to: 'gen', label: 'load_minigraph', id: 'e2' },
        { from: 'gen', to: 'cfg', id: 'e3' },
        { from: 'cli', to: 'cfg', id: 'e4' },
        { from: 'gcu', to: 'cfg', label: 'YANG 驗證後', id: 'e5' },
        { from: 'cfg', to: 'json', label: 'config save', dash: true, id: 'e6', via: [[590, 24], [115, 24]] },
        { from: 'tpl', to: 'svc', label: 'sonic-cfggen -t', id: 'e7' },
        { from: 'cfg', to: 'svc', dash: true, id: 'e8' },
        { from: 'cfg', to: 'dm', label: '訂閱', id: 'e9' },
      ],
      steps: [
        { title: '開機載入', text: '<code>config-setup.service</code> 在開機時用 sonic-cfggen 把 <code>/etc/sonic/config_db.json</code> 寫進 CONFIG_DB。（全新安裝時則由 hwsku 預設值產生。）', nodes: ['json', 'gen', 'cfg'], edges: ['e1', 'e3'] },
        { title: '服務啟動', text: '容器啟動時用 CONFIG_DB 渲染範本產生設定檔；*mgrd、orchagent 等則直接訂閱 CONFIG_DB。', nodes: ['cfg', 'tpl', 'svc', 'dm'], edges: ['e7', 'e8', 'e9'] },
        { title: '執行中修改', text: '<code>config vlan add 300</code> 立即寫入 CONFIG_DB，訂閱者馬上反應。但 config_db.json 還是舊的！', nodes: ['cli', 'cfg', 'dm'], edges: ['e4', 'e9'] },
        { title: '存檔', text: '<code>config save -y</code> 把 CONFIG_DB 完整寫回 config_db.json。', nodes: ['cfg', 'json'], edges: ['e6'] },
        { title: '安全的增量變更', text: 'GCU（<code>config apply-patch</code>）用 YANG 模型驗證，並以正確順序套用，適合自動化系統。', nodes: ['gcu', 'cfg'], edges: ['e5'] },
      ],
    });
    S.terminal(root.querySelector('#term'), {
      filter: 'Vlan300',
      chips: [
        'sudo config vlan add 300',
        'show vlan brief',
        'sudo config reload -y',
        'show vlan brief',
        'sudo config vlan add 300',
        'sudo config save -y',
        'sudo config reload -y',
        'show vlan brief',
      ],
    });
    S.tabs(root.querySelector('#tabs'), [
      { label: 'config_db.json', html: `<pre>{
  <span class="s">"DEVICE_METADATA"</span>: {
    <span class="s">"localhost"</span>: {
      <span class="s">"hostname"</span>: <span class="s">"leaf01"</span>, <span class="s">"hwsku"</span>: <span class="s">"Force10-S6000"</span>,
      <span class="s">"bgp_asn"</span>: <span class="s">"65100"</span>, <span class="s">"type"</span>: <span class="s">"LeafRouter"</span>
    }
  },
  <span class="s">"PORT"</span>: {
    <span class="s">"Ethernet0"</span>: { <span class="s">"lanes"</span>: <span class="s">"25,26,27,28"</span>, <span class="s">"speed"</span>: <span class="s">"40000"</span>, <span class="s">"mtu"</span>: <span class="s">"9100"</span>, <span class="s">"admin_status"</span>: <span class="s">"up"</span> }
  },
  <span class="s">"INTERFACE"</span>: {
    <span class="s">"Ethernet0"</span>: {},
    <span class="s">"Ethernet0|10.0.0.0/31"</span>: {}
  },
  <span class="s">"BGP_NEIGHBOR"</span>: {
    <span class="s">"10.0.0.1"</span>: { <span class="s">"asn"</span>: <span class="s">"65200"</span>, <span class="s">"name"</span>: <span class="s">"spine01"</span>, <span class="s">"local_addr"</span>: <span class="s">"10.0.0.0"</span> }
  }
}</pre>` },
      { label: 'GCU patch', html: `<p class="muted" style="font-size:14px">JSON Patch（RFC 6902）格式，路徑對應 CONFIG_DB 的表與 key：</p><pre>[
  { <span class="s">"op"</span>: <span class="s">"add"</span>, <span class="s">"path"</span>: <span class="s">"/VLAN/Vlan300"</span>, <span class="s">"value"</span>: { <span class="s">"vlanid"</span>: <span class="s">"300"</span> } },
  { <span class="s">"op"</span>: <span class="s">"add"</span>, <span class="s">"path"</span>: <span class="s">"/VLAN_MEMBER/Vlan300|Ethernet8"</span>, <span class="s">"value"</span>: { <span class="s">"tagging_mode"</span>: <span class="s">"untagged"</span> } },
  { <span class="s">"op"</span>: <span class="s">"replace"</span>, <span class="s">"path"</span>: <span class="s">"/PORT/Ethernet8/mtu"</span>, <span class="s">"value"</span>: <span class="s">"9000"</span> }
]</pre><pre><span class="c"># 套用、建立 checkpoint、回滾</span>
sudo config checkpoint before-vlan300
sudo config apply-patch vlan300.json-patch
sudo config rollback before-vlan300</pre>` },
      { label: 'sonic-cfggen', html: `<pre><span class="c"># 印出目前 CONFIG_DB（等同 show runningconfiguration all）</span>
sonic-cfggen -d --print-data
<span class="c"># 查詢單一值</span>
sonic-cfggen -d -v DEVICE_METADATA.localhost.hwsku
<span class="c"># 把 JSON 檔寫進 CONFIG_DB</span>
sudo sonic-cfggen -j /tmp/extra.json --write-to-db
<span class="c"># 用 CONFIG_DB 渲染範本（容器啟動時常見）</span>
sonic-cfggen -d -t /usr/share/sonic/templates/lldpd.conf.j2
<span class="c"># 從 minigraph 產生 JSON 但不寫入</span>
sonic-cfggen -m /etc/sonic/minigraph.xml --print-data</pre>` },
      { label: 'YANG 模型', html: `<p class="muted" style="font-size:14px">sonic-yang-models 描述 CONFIG_DB 每張表的結構與限制（型別、範圍、參照）。GCU 與部分 CLI 用它驗證設定：</p><pre>container sonic-vlan {
  container VLAN {
    list VLAN_LIST {
      key <span class="s">"name"</span>;
      leaf name   { type string { pattern <span class="s">'Vlan([0-9]{1,3}|[1-3][0-9]{3}|40[0-8][0-9]|409[0-4])'</span>; } }
      leaf vlanid { type uint16 { range <span class="n">1..4094</span>; } }
      leaf mtu    { type uint16 { range <span class="n">1..9216</span>; } }
    }
  }
}</pre>` },
    ]);
  },
  keypoints: [
    'CONFIG_DB 是執行中的設定；/etc/sonic/config_db.json 是持久化檔案。',
    'config 指令立即生效但不存檔；要 config save 才會寫回 config_db.json。',
    'config reload 會清空並重載 CONFIG_DB、重啟服務，會中斷流量。',
    'sonic-cfggen 負責載入 JSON / minigraph、印出設定，並用 CONFIG_DB 渲染 Jinja2 範本。',
    'GCU（config apply-patch）以 YANG 驗證並排序步驟，適合自動化的增量變更。',
  ],
  quiz: [
    { q: '用 config 指令加了 VLAN 但沒有 save，重開機後會？', options: ['VLAN 仍在', 'VLAN 消失', '交換機無法開機', '自動存檔'], answer: 1, explain: '重開機會從 config_db.json 載入，未存檔的變更就不見了。' },
    { q: '想用 CONFIG_DB 的值產生 lldpd.conf，應使用？', options: ['config save', 'sonic-cfggen -d -t lldpd.conf.j2', 'redis-cli', 'config reload'], answer: 1, explain: 'sonic-cfggen -d 讀 CONFIG_DB，-t 渲染 Jinja2 範本。' },
    { q: 'GCU 的最大優點是？', options: ['速度最快', '用 YANG 驗證並自動排序步驟，降低出錯與中斷', '可以改 ASIC_DB', '不需要 sudo'], answer: 1, explain: 'GCU 以 JSON Patch 增量修改，先驗證再依相依性套用。' },
  ],
  related: ['redis-db', 'cli-lab', 'reboot'],
  refs: [['SONiC Configuration（官方 Wiki）', 'https://github.com/sonic-net/SONiC/wiki/Configuration'], ['Generic Config Updater 設計', 'https://github.com/sonic-net/SONiC/blob/master/doc/config-generic-update-rollback/Json_Change_Application_Design.md']],
});
