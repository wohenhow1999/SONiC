(function () {
  const DBS = {
    CONFIG_DB: {
      n: 4, sep: '|', color: 'cli',
      d: '使用者（或管理系統）想要的<b>設定</b>。開機時由 <code>/etc/sonic/config_db.json</code> 載入，<code>config save</code> 時寫回檔案。',
      keys: {
        'DEVICE_METADATA|localhost': { hostname: 'sonic', hwsku: 'Force10-S6000', platform: 'x86_64-kvm_x86_64-r0', mac: '52:54:00:ab:cd:01', bgp_asn: '65100', type: 'LeafRouter' },
        'PORT|Ethernet0': { alias: 'fortyGigE0/0', lanes: '25,26,27,28', speed: '40000', mtu: '9100', admin_status: 'up', fec: 'none' },
        'VLAN|Vlan100': { vlanid: '100' },
        'VLAN_MEMBER|Vlan100|Ethernet8': { tagging_mode: 'untagged' },
        'INTERFACE|Ethernet0|10.0.0.0/31': { NULL: 'NULL' },
        'BGP_NEIGHBOR|10.0.0.1': { asn: '65200', name: 'ARISTA01T2', local_addr: '10.0.0.0', holdtime: '180', keepalive: '60', admin_status: 'up' },
        'ACL_RULE|DATAACL|RULE_1': { PRIORITY: '9999', SRC_IP: '10.0.0.2/32', PACKET_ACTION: 'DROP' },
      },
    },
    APPL_DB: {
      n: 0, sep: ':', color: 'proc',
      d: '各應用程式（*mgrd、fpmsyncd、teamsyncd…）產生的<b>期望狀態</b>，是 orchagent 的主要輸入。',
      keys: {
        'PORT_TABLE:Ethernet0': { alias: 'fortyGigE0/0', lanes: '25,26,27,28', speed: '40000', mtu: '9100', admin_status: 'up', oper_status: 'up' },
        'ROUTE_TABLE:192.168.0.0/24': { nexthop: '10.0.0.1,10.0.0.3', ifname: 'Ethernet0,Ethernet4', protocol: 'bgp' },
        'NEIGH_TABLE:Ethernet0:10.0.0.1': { neigh: '0c:42:a1:07:4c:bf', family: 'IPv4' },
        'VLAN_TABLE:Vlan100': { admin_status: 'up', mtu: '9100', mac: '52:54:00:ab:cd:01' },
        'LAG_MEMBER_TABLE:PortChannel0001:Ethernet12': { status: 'enabled' },
        'LLDP_ENTRY_TABLE:Ethernet0': { lldp_rem_sys_name: 'ARISTA01T2', lldp_rem_port_id: 'Ethernet1', lldp_rem_chassis_id: '00:1c:73:aa:bb:cc' },
      },
    },
    STATE_DB: {
      n: 6, sep: '|', color: 'kernel',
      d: '各元件回報的<b>實際狀態</b>：kernel 介面是否建立好、光模組資訊、FDB、warm reboot 狀態、平台感測器等。',
      keys: {
        'PORT_TABLE|Ethernet0': { state: 'ok', netdev_oper_status: 'up', admin_status: 'up', mtu: '9100' },
        'TRANSCEIVER_INFO|Ethernet0': { type: 'QSFP28 or later', manufacturer: 'ACME', model: 'QSFP-100G-SR4', serial: 'AB1234567', cable_length: '100', vendor_rev: 'A' },
        'FDB_TABLE|Vlan100:00:11:22:33:44:55': { port: 'Ethernet8', type: 'dynamic' },
        'PSU_INFO|PSU 1': { presence: 'true', status: 'true', temp: '32.0', power: '185.5' },
        'WARM_RESTART_TABLE|orchagent': { restore_count: '0', state: 'reconciled' },
      },
    },
    ASIC_DB: {
      n: 1, sep: ':', color: 'hw',
      d: 'orchagent 經由 sairedis 寫入的 <b>SAI 物件</b>，syncd 據此呼叫 SAI。另有 VID↔RID 對照表。',
      keys: {
        'ASIC_STATE:SAI_OBJECT_TYPE_PORT:oid:0x1000000000002': { SAI_PORT_ATTR_ADMIN_STATE: 'true', SAI_PORT_ATTR_MTU: '9122', SAI_PORT_ATTR_SPEED: '40000' },
        'ASIC_STATE:SAI_OBJECT_TYPE_VLAN:oid:0x26000000000616': { SAI_VLAN_ATTR_VLAN_ID: '100' },
        'ASIC_STATE:SAI_OBJECT_TYPE_ROUTE_ENTRY:{"dest":"192.168.0.0/24","switch_id":"oid:0x21000000000000","vr":"oid:0x3000000000022"}': { SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID: 'oid:0x5000000000633' },
        'VIDTORID': { 'oid:0x1000000000002': 'oid:0x10000000000a1', 'oid:0x26000000000616': 'oid:0x2600000064', '…': '…' },
        'RIDTOVID': { 'oid:0x10000000000a1': 'oid:0x1000000000002', '…': '…' },
      },
    },
    COUNTERS_DB: {
      n: 2, sep: ':', color: 'db',
      d: 'syncd 定期向 ASIC 讀回的<b>統計計數器</b>，還有「名稱 → OID」對照表，供 <code>show interfaces counters</code>、SNMP、gNMI 使用。',
      keys: {
        'COUNTERS_PORT_NAME_MAP': { Ethernet0: 'oid:0x1000000000002', Ethernet4: 'oid:0x1000000000003', '…': '…' },
        'COUNTERS:oid:0x1000000000002': { SAI_PORT_STAT_IF_IN_OCTETS: '918273645', SAI_PORT_STAT_IF_IN_UCAST_PKTS: '1234567', SAI_PORT_STAT_IF_OUT_OCTETS: '827364512', SAI_PORT_STAT_IF_IN_ERRORS: '0' },
        'RATES:oid:0x1000000000002': { RX_BPS: '12500000.0', TX_BPS: '9800000.0' },
      },
    },
  };

  S.register({
    id: 'redis-db',
    category: 'core',
    order: 1,
    title: 'Redis 資料庫',
    en: 'Redis Databases',
    summary: "SONiC 的狀態全部保存在 Redis：CONFIG_DB 為設定、APPL_DB 為應用層期望狀態、ASIC_DB 為 SAI 物件、STATE_DB 為實際狀態、COUNTERS_DB 為計數器。本章說明各 DB 的寫入者、讀取者、key 格式與存取類別。",
    meta: [["容器", ["database"]], ["設定檔", ["/var/run/redis/sonic-db/database_config.json"]], ["存取工具", ["sonic-db-cli", "redis-cli -n <id>"]], ["函式庫", "<code>sonic-swss-common</code>（C++ <code>swss::Table</code>、Python <code>swsscommon</code>）"]],
    tags: ['Redis', 'CONFIG_DB', 'APPL_DB', 'ASIC_DB', 'STATE_DB', 'COUNTERS_DB'],
    html: `
<h2>資料庫一覽</h2>
<table>
<thead><tr><th>名稱</th><th>編號</th><th>key 格式</th><th>主要寫入者</th><th>主要讀取者</th></tr></thead>
<tbody>
<tr><td><b>APPL_DB</b></td><td>0</td><td><code>TABLE:key</code></td><td>*mgrd、fpmsyncd、neighsyncd、teamsyncd</td><td>orchagent</td></tr>
<tr><td><b>ASIC_DB</b></td><td>1</td><td><code>ASIC_STATE:SAI_OBJECT_TYPE_X:oid</code></td><td>orchagent（sairedis）</td><td>syncd</td></tr>
<tr><td><b>COUNTERS_DB</b></td><td>2</td><td><code>COUNTERS:oid</code></td><td>syncd（flex counter）</td><td>CLI、SNMP、gNMI</td></tr>
<tr><td><b>CONFIG_DB</b></td><td>4</td><td><code>TABLE|key</code></td><td>CLI、sonic-cfggen、gNMI、GCU</td><td>*mgrd、orchagent、bgpcfgd、hostcfgd…</td></tr>
<tr><td><b>FLEX_COUNTER_DB</b></td><td>5</td><td><code>FLEX_COUNTER_TABLE:…</code></td><td>orchagent</td><td>syncd</td></tr>
<tr><td><b>STATE_DB</b></td><td>6</td><td><code>TABLE|key</code></td><td>*syncd、*mgrd、pmon、orchagent</td><td>*mgrd、CLI、SNMP</td></tr>
</tbody></table>
<p class="muted">DB 編號與連線資訊定義在 <code>/var/run/redis/sonic-db/database_config.json</code>。程式通常用名稱（例如 <code>sonic-db-cli CONFIG_DB</code>）而不是編號存取。</p>
<div class="callout"><div class="ct">key 分隔符號</div><p>CONFIG_DB 與 STATE_DB 用 <code>|</code>（例如 <code>PORT|Ethernet0</code>）；APPL_DB、ASIC_DB、COUNTERS_DB 用 <code>:</code>（例如 <code>PORT_TABLE:Ethernet0</code>）。打錯分隔符號是新手查不到資料最常見的原因！</p></div>

<h2>資料流向</h2>
<div id="d-db"></div>

<h2>資料範例</h2>
<p>選一個 DB，再點選 key，看看裡面實際的欄位長什麼樣子，以及要用什麼指令查詢。</p>
<div id="explorer"></div>

<h2>swss-common 表格存取類別</h2>
<p>SONiC 在 <code>sonic-swss-common</code> 函式庫中包裝了幾種常用的表格類別：</p>
<table>
<thead><tr><th>類別</th><th>用在</th><th>原理</th></tr></thead>
<tbody>
<tr><td><code>Table</code></td><td>一般讀寫</td><td>單純的 HSET / HGETALL / DEL</td></tr>
<tr><td><code>SubscriberStateTable</code></td><td>訂閱 CONFIG_DB、STATE_DB</td><td>使用 Redis <b>keyspace notification</b>（<code>__keyspace@4__:VLAN|Vlan100</code>），有人改 key 就收到通知</td></tr>
<tr><td><code>ProducerStateTable</code> / <code>ConsumerStateTable</code></td><td>APPL_DB 生產者 / 消費者</td><td>生產者把 key 放進 <code>&lt;TABLE&gt;_KEY_SET</code>、暫存欄位並 PUBLISH；消費者用 Lua 腳本原子性地取出，保證不遺漏且可以批次處理</td></tr>
<tr><td><code>NotificationProducer</code> / <code>NotificationConsumer</code></td><td>事件通知</td><td>Redis Pub/Sub channel，例如 syncd 回報 port 狀態變化</td></tr>
</tbody></table>
`,
    mount(root) {
      S.diagram(root.querySelector('#d-db'), {
        title: 'DB 之間的資料流',
        w: 1000, h: 520,
        nodes: [
          { id: 'cli', x: 20, y: 130, w: 200, h: 56, label: 'CLI / config_db.json', kind: 'cli', info: '<p>使用者設定的入口：<code>config</code> 指令、開機載入 config_db.json、gNMI、GCU（<code>config apply-patch</code>）。</p>' },
          { id: 'cfg', x: 270, y: 130, w: 200, h: 56, label: 'CONFIG_DB (4)', kind: 'db', info: DBS.CONFIG_DB.d },
          { id: 'mgrd', x: 520, y: 130, w: 200, h: 56, label: '*mgrd', sub: 'vlanmgrd / intfmgrd…', kind: 'proc', info: '<p>讀 CONFIG_DB、設定 kernel、寫 APPL_DB。</p>' },
          { id: 'appl', x: 770, y: 130, w: 210, h: 56, label: 'APPL_DB (0)', kind: 'db', info: DBS.APPL_DB.d },
          { id: 'proto', x: 770, y: 20, w: 210, h: 56, label: 'fpmsyncd / teamsyncd\nneighsyncd', kind: 'proc', info: '<p>把協定與 kernel 學到的東西（路由、LAG 狀態、ARP）寫進 APPL_DB。</p>' },
          { id: 'orch', x: 770, y: 280, w: 210, h: 56, label: 'orchagent', kind: 'proc', info: '<p>讀 APPL_DB（和少數 CONFIG_DB 表，如 ACL），寫 ASIC_DB。</p>' },
          { id: 'asicdb', x: 520, y: 280, w: 200, h: 56, label: 'ASIC_DB (1)', kind: 'db', info: DBS.ASIC_DB.d },
          { id: 'syncd', x: 270, y: 280, w: 200, h: 56, label: 'syncd', kind: 'proc', info: '<p>讀 ASIC_DB 呼叫 SAI；並依 FLEX_COUNTER_DB 的設定定期輪詢計數器寫入 COUNTERS_DB。</p>' },
          { id: 'asic', x: 20, y: 280, w: 200, h: 56, label: 'ASIC', kind: 'hw', info: '<p>實際的交換晶片。</p>' },
          { id: 'cnt', x: 270, y: 430, w: 200, h: 56, label: 'COUNTERS_DB (2)', kind: 'db', info: DBS.COUNTERS_DB.d },
          { id: 'state', x: 520, y: 430, w: 200, h: 56, label: 'STATE_DB (6)', kind: 'db', info: DBS.STATE_DB.d },
          { id: 'pmon', x: 770, y: 430, w: 210, h: 56, label: 'pmon / *syncd', kind: 'container', info: '<p>平台監控、portsyncd 等把實際狀態寫進 STATE_DB。*mgrd 也會等 STATE_DB 顯示介面就緒後才繼續設定。</p>' },
          { id: 'show', x: 20, y: 430, w: 200, h: 56, label: 'show / SNMP / gNMI', kind: 'cli', info: '<p>各種讀取端：<code>show interfaces counters</code> 讀 COUNTERS_DB，SNMP 與 gNMI 也直接讀 Redis。</p>' },
        ],
        edges: [
          { from: 'cli', to: 'cfg', id: 'c1' },
          { from: 'cfg', to: 'mgrd', label: '訂閱', id: 'c2' },
          { from: 'mgrd', to: 'appl', id: 'c3' },
          { from: 'proto', to: 'appl', id: 'c4' },
          { from: 'appl', to: 'orch', label: '訂閱', id: 'c5' },
          { from: 'orch', to: 'asicdb', label: 'sairedis', id: 'c6' },
          { from: 'asicdb', to: 'syncd', id: 'c7' },
          { from: 'syncd', to: 'asic', label: 'SAI', id: 'c8' },
          { from: 'syncd', to: 'cnt', label: '輪詢計數器', id: 'c9' },
          { from: 'pmon', to: 'state', id: 'c10' },
          { from: 'cnt', to: 'show', id: 'c11' },
        ],
        steps: [
          { title: '設定進入 CONFIG_DB', text: '不論設定來自 CLI、JSON 檔或 gNMI，最後都寫進 CONFIG_DB。', nodes: ['cli', 'cfg'], edges: ['c1'] },
          { title: '*mgrd 轉成 APPL_DB', text: '*mgrd 訂閱 CONFIG_DB，先套用到 Linux kernel，再寫入 APPL_DB。同時 fpmsyncd 等把動態學到的狀態也寫入 APPL_DB。', nodes: ['cfg', 'mgrd', 'appl', 'proto'], edges: ['c2', 'c3', 'c4'] },
          { title: 'orchagent 轉成 ASIC_DB', text: 'orchagent 訂閱 APPL_DB，把每個物件轉成 SAI 物件寫入 ASIC_DB。', nodes: ['appl', 'orch', 'asicdb'], edges: ['c5', 'c6'] },
          { title: 'syncd 寫進晶片', text: 'syncd 讀 ASIC_DB 並呼叫 SAI，把設定寫入 ASIC。', nodes: ['asicdb', 'syncd', 'asic'], edges: ['c7', 'c8'] },
          { title: '狀態與計數器回流', text: 'syncd 輪詢計數器寫 COUNTERS_DB；pmon、portsyncd 寫 STATE_DB。show 指令、SNMP、gNMI 讀這些 DB 呈現給使用者。', nodes: ['syncd', 'cnt', 'state', 'pmon', 'show'], edges: ['c9', 'c10', 'c11'] },
        ],
      });

      // DB explorer
      const host = root.querySelector('#explorer');
      const box = S.el('div', { class: 'w-box' });
      const tabs = S.el('div', { class: 'row', style: 'margin-bottom:10px' });
      const info = S.el('div', { class: 'dg-desc', style: 'margin-bottom:10px' });
      const cols = S.el('div', { class: 'grid c2' });
      const keyList = S.el('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' });
      const detail = S.el('div', { style: 'min-width:0' });
      cols.appendChild(keyList); cols.appendChild(detail);
      box.appendChild(tabs); box.appendChild(info); box.appendChild(cols);
      host.appendChild(box);
      function showKey(db, k) {
        const v = DBS[db].keys[k];
        [...keyList.children].forEach(b => b.classList.toggle('on', b.dataset.k === k));
        const quoted = `"${k.replace(/"/g, '\\"')}"`;
        detail.innerHTML = `<div class="muted" style="font-size:13px">欄位（Redis hash）：</div>
          <table class="kvtable"><thead><tr><th>field</th><th>value</th></tr></thead><tbody>${Object.entries(v).map(([a, b]) => `<tr><td>${S.esc(a)}</td><td>${S.esc(b)}</td></tr>`).join('')}</tbody></table>
          <div class="muted" style="font-size:13px">查詢指令：</div>
          <pre>sonic-db-cli ${db} hgetall ${S.esc(k.includes('"') ? `'${k}'` : quoted)}\n<span class="c"># 或</span>\nredis-cli -n ${DBS[db].n} hgetall ${S.esc(k.includes('"') ? `'${k}'` : quoted)}</pre>`;
      }
      function showDb(db) {
        const D = DBS[db];
        [...tabs.children].forEach(b => b.classList.toggle('on', b.textContent.startsWith(db)));
        info.innerHTML = `<div class="st">${db}（redis DB ${D.n}，分隔符 <code>${S.esc(D.sep)}</code>）</div>${D.d}`;
        keyList.innerHTML = '';
        Object.keys(D.keys).forEach(k => {
          const b = S.el('button', { class: 'btn sm mono', style: 'justify-content:flex-start;text-align:left;word-break:break-all;font-size:12px', onclick: () => showKey(db, k) }, k);
          b.dataset.k = k;
          keyList.appendChild(b);
        });
        showKey(db, Object.keys(D.keys)[0]);
      }
      Object.keys(DBS).forEach(db => tabs.appendChild(S.el('button', { class: 'btn sm', onclick: () => showDb(db) }, db)));
      showDb('CONFIG_DB');
    },
    keypoints: [
      'CONFIG_DB = 想要的設定；APPL_DB = 應用層期望狀態；ASIC_DB = SAI 物件；STATE_DB = 實際狀態；COUNTERS_DB = 計數器。',
      'CONFIG_DB / STATE_DB 的 key 用「|」分隔，APPL_DB / ASIC_DB / COUNTERS_DB 用「:」。',
      'CONFIG_DB 用 keyspace notification 訂閱；APPL_DB 用 ProducerStateTable / ConsumerStateTable 傳遞。',
      '除錯時可以用 sonic-db-cli 或 redis-cli 直接查看每一層，找出資料「卡」在哪一層。',
    ],
    related: ['swss', 'config', 'cli-lab', 'counters'],
    refs: [['sonic-swss-common（Redis 表格函式庫）', 'https://github.com/sonic-net/sonic-swss-common'], ['Configuration 文件（CONFIG_DB schema）', 'https://github.com/sonic-net/SONiC/wiki/Configuration']],
  });
})();
