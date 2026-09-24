S.register({
  id: 'counters',
  category: 'ops',
  order: 4,
  title: '計數器與遙測',
  en: 'Counters & Telemetry',
  summary: "Flex Counter 機制讓 syncd 依設定週期性從 ASIC 讀取統計值並寫入 COUNTERS_DB；CLI、SNMP 與 gNMI 皆由此取得計數器資料。",
  meta: [["程序", ["orchagent (FlexCounterOrch)", "syncd (FlexCounter)", "snmp-subagent", "gnmi"]], ["資料表", ["CONFIG_DB FLEX_COUNTER_TABLE", "FLEX_COUNTER_DB", "COUNTERS_DB COUNTERS / RATES / *_NAME_MAP"]], ["工具", ["counterpoll show", "show interfaces counters", "portstat", "sonic-clear counters"]]],
  tags: ['Flex Counter', 'COUNTERS_DB', 'counterpoll', 'portstat', 'SNMP', 'gNMI', 'Telemetry'],
  html: `
<h2>Flex Counter 架構</h2>
<div id="d-cnt"></div>

<h2>介面計數器模擬</h2>
<p>調整各 port 的流量負載、注入錯誤，或執行 <code>sonic-clear counters</code>。注意右邊 COUNTERS_DB 裡的原始值——清除計數器其實<b>並不會</b>把 ASIC 或 DB 歸零！</p>
<div id="live"></div>

<h2>資料取得方式</h2>
<table>
<thead><tr><th>方式</th><th>範例</th><th>資料來源</th></tr></thead>
<tbody>
<tr><td>CLI</td><td><code>show interfaces counters</code>、<code>show queue counters</code>、<code>show pfc counters</code></td><td>COUNTERS_DB</td></tr>
<tr><td>輪詢設定</td><td><code>counterpoll show</code>、<code>counterpoll port interval 1000</code></td><td>CONFIG_DB FLEX_COUNTER_TABLE</td></tr>
<tr><td>SNMP</td><td><code>snmpwalk -v2c -c public &lt;ip&gt; IF-MIB::ifHCInOctets</code></td><td>snmp 子代理讀 COUNTERS_DB</td></tr>
<tr><td>gNMI</td><td>Subscribe <code>COUNTERS/Ethernet0</code>（target=COUNTERS_DB）</td><td>gnmi 容器讀 COUNTERS_DB，可 SAMPLE / ON_CHANGE 串流</td></tr>
<tr><td>直接查 DB</td><td><code>sonic-db-cli COUNTERS_DB hgetall "COUNTERS:oid:0x1000000000002"</code></td><td>先用 <code>COUNTERS_PORT_NAME_MAP</code> 找出 OID</td></tr>
</tbody></table>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-cnt'), {
      title: 'Flex Counter 的設定與輪詢路徑',
      w: 1000, h: 420,
      nodes: [
        { id: 'cli', x: 20, y: 40, w: 170, h: 56, label: 'counterpoll CLI', kind: 'cli', info: '<p><code>counterpoll port enable</code>、<code>counterpoll queue interval 10000</code>…設定哪些計數器群組要開、多久讀一次。</p>' },
        { id: 'cfg', x: 230, y: 40, w: 190, h: 56, label: 'CONFIG_DB', sub: 'FLEX_COUNTER_TABLE', kind: 'db', info: '<p>例如 <code>FLEX_COUNTER_TABLE|PORT</code>：<code>FLEX_COUNTER_STATUS=enable</code>、<code>POLL_INTERVAL=1000</code>。</p>' },
        { id: 'fco', x: 460, y: 40, w: 180, h: 56, label: 'FlexCounterOrch', sub: '(orchagent)', kind: 'proc', info: '<p>把群組的開關與輪詢間隔寫進 FLEX_COUNTER_DB。</p>' },
        { id: 'po', x: 460, y: 170, w: 180, h: 56, label: 'PortsOrch 等', sub: '登記要讀的 OID', kind: 'proc', info: '<p>各 Orch 登記「哪個物件（OID）要讀哪些計數器 ID」，例如每個 port 的 <code>SAI_PORT_STAT_IF_IN_OCTETS</code> 等；也建立 <code>COUNTERS_PORT_NAME_MAP</code>（名稱 → OID）。</p>' },
        { id: 'fdb', x: 690, y: 40, w: 180, h: 56, label: 'FLEX_COUNTER_DB', kind: 'db', info: '<p>syncd 的輪詢工作清單：<code>FLEX_COUNTER_TABLE:PORT_STAT_COUNTER:oid:0x1…</code> → PORT_COUNTER_ID_LIST。</p>' },
        { id: 'sy', x: 690, y: 170, w: 180, h: 56, label: 'syncd', sub: 'FlexCounter 執行緒', kind: 'proc', info: '<p>每個群組一個輪詢迴圈，依間隔呼叫 SAI <code>get_port_stats()</code> / <code>get_queue_stats()</code>…批次讀取。</p>' },
        { id: 'asic', x: 900, y: 170, w: 80, h: 56, label: 'ASIC', kind: 'hw', info: '<p>硬體計數器。</p>' },
        { id: 'cnt', x: 690, y: 320, w: 180, h: 56, label: 'COUNTERS_DB', sub: 'COUNTERS:oid…', kind: 'db', info: '<p>原始累計值。另有 RATES 表（每秒速率，由 Lua 外掛計算）。</p>' },
        { id: 'users', x: 230, y: 320, w: 380, h: 56, label: 'show interfaces counters / SNMP / gNMI', kind: 'cli', info: '<p>讀取端。portstat（show interfaces counters 的實作）會用 COUNTERS_PORT_NAME_MAP 把 OID 對回 port 名稱。</p>' },
      ],
      edges: [
        { from: 'cli', to: 'cfg', id: 'e1' },
        { from: 'cfg', to: 'fco', id: 'e2' },
        { from: 'fco', to: 'fdb', id: 'e3' },
        { from: 'po', to: 'fdb', label: 'OID + counter ID', id: 'e4' },
        { from: 'fdb', to: 'sy', id: 'e5' },
        { from: 'sy', to: 'asic', label: 'get_stats', bi: true, id: 'e6', lx: 885, ly: 156 },
        { from: 'sy', to: 'cnt', label: '寫入', id: 'e7' },
        { from: 'cnt', to: 'users', id: 'e8' },
      ],
      steps: [
        { title: '啟用計數器群組', text: '<code>counterpoll port enable</code> 寫入 CONFIG_DB，FlexCounterOrch 把設定寫到 FLEX_COUNTER_DB。', nodes: ['cli', 'cfg', 'fco', 'fdb'], edges: ['e1', 'e2', 'e3'] },
        { title: '登記物件', text: 'PortsOrch 為每個 port 登記要讀的計數器 ID。', nodes: ['po', 'fdb'], edges: ['e4'] },
        { title: '週期輪詢', text: 'syncd 的 FlexCounter 執行緒依間隔（port 預設 1 秒）呼叫 SAI 取得統計值。', nodes: ['fdb', 'sy', 'asic'], edges: ['e5', 'e6'] },
        { title: '寫入並提供查詢', text: '結果寫進 COUNTERS_DB，CLI、SNMP、gNMI 都從這裡讀。', nodes: ['sy', 'cnt', 'users'], edges: ['e7', 'e8'] },
      ],
    });

    // ---------- 即時計數器 ----------
    const host = root.querySelector('#live');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const PORTS = ['Ethernet0', 'Ethernet4', 'Ethernet8', 'Ethernet12'].map((n, i) => ({ n, oid: 'oid:0x100000000000' + (2 + i).toString(16), load: [35, 10, 60, 0][i], rxOk: 1e6 * (i + 1) + 12345, txOk: 9e5 * (i + 1) + 5432, rxB: 0, txB: 0, rxErr: 0, rxBps: 0, txBps: 0 }));
    let snap = null, running = true;
    const LINE = 40e9 / 8; // 40G bytes/s
    const fmt = n => Math.round(n).toLocaleString('en-US');
    const bps = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB/s' : b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB/s' : b >= 1e3 ? (b / 1e3).toFixed(2) + ' KB/s' : b.toFixed(2) + ' B/s';
    const ctrl = S.el('div');
    const view = S.el('div', { class: 'grid c2', style: 'margin-top:10px' });
    box.appendChild(ctrl); box.appendChild(view);
    function drawCtrl() {
      ctrl.innerHTML = '';
      const r = S.el('div', { class: 'grid c2' });
      PORTS.forEach(p => {
        const s = S.el('input', { type: 'range', min: 0, max: 100, value: p.load, style: 'width:100%' });
        const lbl = S.el('span', { class: 'mono' }, p.load + '%');
        s.addEventListener('input', () => { p.load = +s.value; lbl.textContent = p.load + '%'; });
        r.appendChild(S.el('label', { class: 'field' }, S.el('span', null, `${p.n} 負載 `, lbl), s));
      });
      ctrl.appendChild(r);
      ctrl.appendChild(S.el('div', { class: 'row', style: 'margin-top:8px' },
        S.el('button', { class: 'btn sm', onclick: e => { running = !running; e.currentTarget.textContent = running ? '暫停' : '繼續'; } }, '暫停'),
        S.el('button', { class: 'btn sm', onclick: () => { PORTS[2].rxErr += 137; } }, 'Ethernet8 注入 137 個 CRC 錯誤'),
        S.el('button', { class: 'btn sm primary', onclick: () => { snap = PORTS.map(p => ({ rxOk: p.rxOk, txOk: p.txOk, rxErr: p.rxErr })); draw(); } }, 'sonic-clear counters'),
        S.el('button', { class: 'btn sm', onclick: () => { snap = null; draw(); } }, '↺ 取消 clear')));
    }
    function draw() {
      const rows = PORTS.map((p, i) => {
        const b = snap ? snap[i] : { rxOk: 0, txOk: 0, rxErr: 0 };
        return [p.n, p.load > 0 ? 'U' : 'D', fmt(p.rxOk - b.rxOk), bps(p.rxBps), (p.rxBps / LINE * 100).toFixed(2) + '%', fmt(p.rxErr - b.rxErr), fmt(p.txOk - b.txOk), bps(p.txBps), (p.txBps / LINE * 100).toFixed(2) + '%'];
      });
      const h = ['IFACE', 'STATE', 'RX_OK', 'RX_BPS', 'RX_UTIL', 'RX_ERR', 'TX_OK', 'TX_BPS', 'TX_UTIL'];
      const w = h.map((x, i) => Math.max(x.length, ...rows.map(r => r[i].length)));
      const line = r => r.map((c, i) => c.padStart(w[i])).join('  ');
      const e8 = PORTS[2];
      view.innerHTML = `<div style="min-width:0"><b>$ show interfaces counters</b>${snap ? ' <span class="badge y">已 clear（顯示差值）</span>' : ''}<pre style="font-size:12px">${[line(h), w.map(x => '-'.repeat(x)).join('  '), ...rows.map(line)].join('\n')}</pre></div>
        <div style="min-width:0"><b>$ sonic-db-cli COUNTERS_DB hgetall "COUNTERS:${e8.oid}"</b> <span class="muted">(Ethernet8)</span><pre style="font-size:12px">{
  'SAI_PORT_STAT_IF_IN_UCAST_PKTS': '${Math.round(e8.rxOk)}',
  'SAI_PORT_STAT_IF_IN_OCTETS': '${Math.round(e8.rxB)}',
  'SAI_PORT_STAT_IF_IN_ERRORS': '${e8.rxErr}',
  'SAI_PORT_STAT_IF_OUT_UCAST_PKTS': '${Math.round(e8.txOk)}',
  'SAI_PORT_STAT_IF_OUT_OCTETS': '${Math.round(e8.txB)}',
  ...
}</pre><div class="muted" style="font-size:13px"><code>sonic-clear counters</code> 只是把目前數值存成快照（在 <code>/tmp</code> 下的 portstat 快取），之後 show 顯示「目前值 − 快照」。COUNTERS_DB 與 ASIC 的值持續累加，SNMP 與 gNMI 也不受影響。</div></div>`;
    }
    function tick() {
      if (!running) return;
      PORTS.forEach(p => {
        const target = LINE * p.load / 100;
        p.rxBps = target * (0.93 + Math.random() * 0.14);
        p.txBps = target * 0.8 * (0.9 + Math.random() * 0.2);
        p.rxB += p.rxBps; p.txB += p.txBps;
        p.rxOk += p.rxBps / 1000; p.txOk += p.txBps / 1000; // 假設平均 1000 bytes/pkt
      });
      draw();
    }
    drawCtrl();
    tick();
    const iv = setInterval(() => { if (!document.body.contains(box)) { clearInterval(iv); return; } tick(); }, 1000);
  },
  keypoints: [
    'counterpoll（CONFIG_DB FLEX_COUNTER_TABLE）決定哪些計數器群組要輪詢、多久一次。',
    'syncd 的 FlexCounter 執行緒呼叫 SAI get_*_stats，把結果寫進 COUNTERS_DB。',
    'COUNTERS_PORT_NAME_MAP 把 port 名稱對應到 OID，查 COUNTERS_DB 時先查它。',
    'sonic-clear counters 只存本機快照，不會歸零 COUNTERS_DB 或硬體計數器。',
  ],
  related: ['redis-db', 'syncd-sai', 'pmon', 'mgmt-api', 'sys-services'],
  refs: [['SONiC gNMI / Telemetry', 'https://github.com/sonic-net/sonic-gnmi']],
});
