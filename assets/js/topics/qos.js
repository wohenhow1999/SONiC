(function () {
  // Azure 預設 qos.json.j2 範本的簡化對應（實際值依 hwsku 範本而定）
  const DSCP_TC = (() => { const m = {}; for (let d = 0; d < 64; d++) m[d] = 1; Object.assign(m, { 3: 3, 4: 4, 8: 0, 46: 5, 48: 6 }); return m; })();
  const LOSSLESS = new Set([3, 4]);

  S.register({
    id: 'qos',
    category: 'svc',
    order: 3,
    title: 'QoS 與 Buffer 管理',
    en: 'QoS, Buffers & PFC',
    summary: 'SONiC 的 QoS 由分類對應表（DSCP → TC → Queue / PG）、排程器、WRED/ECN 與緩衝區設定組成。lossless 流量（如 RoCE）另需 PFC 與 headroom 計算，並由 PFC watchdog 防止 PFC storm。',
    meta: [
      ['程序', ['buffermgrd', 'orchagent (QosOrch, BufferOrch, PfcWdOrch)', 'syncd (flex counter Lua)']],
      ['資料表', ['DSCP_TO_TC_MAP', 'TC_TO_QUEUE_MAP', 'TC_TO_PRIORITY_GROUP_MAP', 'PORT_QOS_MAP', 'SCHEDULER', 'QUEUE', 'WRED_PROFILE', 'BUFFER_POOL', 'BUFFER_PROFILE', 'BUFFER_PG', 'BUFFER_QUEUE', 'PFC_WD']],
      ['範本', ['<hwsku>/qos.json.j2', '<hwsku>/buffers.json.j2', '<hwsku>/pg_profile_lookup.ini']],
      ['工具', ['config qos reload', 'show queue counters', 'show pfc counters', 'show priority-group watermark', 'pfcwd show stats', 'mmuconfig -l']],
      ['原始碼', '<code>sonic-swss/orchagent/qosorch.cpp</code>、<code>bufferorch.cpp</code>、<code>pfcwdorch.cpp</code>、<code>sonic-swss/cfgmgr/buffermgr*.cpp</code>'],
    ],
    tags: ['QoS', 'Buffer', 'PFC', 'ECN', 'WRED', 'DSCP', 'RoCE', 'lossless', 'headroom', 'pfcwd', 'scheduler'],
    keypoints: [
      '分類鏈：DSCP_TO_TC_MAP 決定 TC，TC_TO_QUEUE_MAP 決定出口佇列，TC_TO_PRIORITY_GROUP_MAP 決定入口 PG；PORT_QOS_MAP 把對應表綁到 port。',
      'QosOrch 直接訂閱 CONFIG_DB 的 QoS 表；BufferOrch 在傳統模式讀 CONFIG_DB、在 dynamic buffer 模式讀 buffermgrd 產生的 APPL_DB 表。',
      'lossless PG 需要 headroom 吸收 PFC 反應時間內的在途封包；headroom 依 port 速率與線長計算。',
      'PFC watchdog 以 syncd 中的 Lua 腳本偵測佇列長時間被 PFC 暫停，觸發後丟棄或轉發該佇列流量以解除死結。',
    ],
    html: `
<h2>處理管線</h2>
<p>封包在 ASIC 中依下列順序被分類、緩衝與排程。每個階段都對應到一組 CONFIG_DB 表，並由 QosOrch 或 BufferOrch 轉成 SAI 物件（QOS_MAP、SCHEDULER、WRED、BUFFER_POOL、BUFFER_PROFILE）。</p>
<div id="d-qos"></div>

<h2>DSCP 分類模擬</h2>
<p>輸入封包的 DSCP 值，依 Azure 預設範本（簡化版）查出 TC、入口 PG 與出口佇列，以及是否屬於 lossless 類別。</p>
<div id="dscp"></div>

<h2>對應表與綁定</h2>
<table>
<thead><tr><th>表</th><th>key 範例</th><th>內容</th><th>SAI 物件</th></tr></thead>
<tbody>
<tr><td><code>DSCP_TO_TC_MAP</code></td><td><code>AZURE</code></td><td><code>"3": "3", "4": "4", "46": "5"</code></td><td>QOS_MAP (DSCP_TO_TC)</td></tr>
<tr><td><code>TC_TO_QUEUE_MAP</code></td><td><code>AZURE</code></td><td><code>"0": "0" … "7": "7"</code></td><td>QOS_MAP (TC_TO_QUEUE)</td></tr>
<tr><td><code>TC_TO_PRIORITY_GROUP_MAP</code></td><td><code>AZURE</code></td><td><code>"3": "3", "4": "4"，其餘 "0"</code></td><td>QOS_MAP (TC_TO_PRIORITY_GROUP)</td></tr>
<tr><td><code>MAP_PFC_PRIORITY_TO_QUEUE</code></td><td><code>AZURE</code></td><td>PFC 優先權 → 佇列</td><td>QOS_MAP (PFC_PRIORITY_TO_QUEUE)</td></tr>
<tr><td><code>PORT_QOS_MAP</code></td><td><code>Ethernet0</code></td><td><code>dscp_to_tc_map: AZURE</code>、<code>pfc_enable: "3,4"</code></td><td>PORT 屬性</td></tr>
<tr><td><code>SCHEDULER</code></td><td><code>scheduler.0</code></td><td><code>type: DWRR, weight: 14</code></td><td>SCHEDULER</td></tr>
<tr><td><code>QUEUE</code></td><td><code>Ethernet0|3</code></td><td><code>scheduler: scheduler.1</code>、<code>wred_profile: AZURE_LOSSLESS</code></td><td>QUEUE 屬性</td></tr>
<tr><td><code>WRED_PROFILE</code></td><td><code>AZURE_LOSSLESS</code></td><td><code>ecn: ecn_all</code>、<code>green_min_threshold</code>、<code>green_max_threshold</code></td><td>WRED</td></tr>
</tbody></table>

<h2>Buffer 模型</h2>
<p>共享緩衝區切成 pool，port 的入口 priority group（PG）與出口 queue 各自綁定一個 buffer profile。profile 以 <code>dynamic_th</code>（動態門檻，α 值）或 <code>static_th</code> 決定可使用的共享空間，lossless PG 另外保留 <code>xon</code>、<code>xoff</code>、<code>size</code>（headroom）。</p>
<table>
<thead><tr><th>表</th><th>key 範例</th><th>主要欄位</th></tr></thead>
<tbody>
<tr><td><code>BUFFER_POOL</code></td><td><code>ingress_lossless_pool</code></td><td><code>size</code>、<code>type: ingress</code>、<code>mode: dynamic</code>、<code>xoff</code>（共享 headroom）</td></tr>
<tr><td><code>BUFFER_PROFILE</code></td><td><code>pg_lossless_100000_5m_profile</code></td><td><code>pool</code>、<code>xon</code>、<code>xoff</code>、<code>size</code>、<code>dynamic_th</code></td></tr>
<tr><td><code>BUFFER_PG</code></td><td><code>Ethernet0|3-4</code></td><td><code>profile</code></td></tr>
<tr><td><code>BUFFER_QUEUE</code></td><td><code>Ethernet0|0-2</code></td><td><code>profile: egress_lossy_profile</code></td></tr>
<tr><td><code>BUFFER_PORT_INGRESS_PROFILE_LIST</code></td><td><code>Ethernet0</code></td><td><code>profile_list</code></td></tr>
</tbody></table>
<div class="callout"><div class="ct">傳統模式與 dynamic 模式</div>
<p><b>傳統模式</b>：buffermgrd 依 port 速率與 <code>CABLE_LENGTH</code> 查 <code>pg_profile_lookup.ini</code>，產生 lossless PG 的 profile 並寫入 CONFIG_DB，BufferOrch 直接讀 CONFIG_DB。</p>
<p><b>Dynamic 模式</b>（<code>DEVICE_METADATA|localhost buffer_model=dynamic</code>）：buffermgrd 透過廠商提供的 Lua 外掛即時計算 headroom 與 pool 大小，寫入 APPL_DB 的 <code>BUFFER_*_TABLE</code>；port 未啟用時不保留 headroom，可提高緩衝區利用率。</p></div>

<h2>PFC 與 PFC watchdog</h2>
<p>PFC（802.1Qbb）以每個優先權為單位送出 PAUSE，讓對端暫停該優先權的傳送，避免 lossless 流量被丟棄。若下游持續送出 PAUSE（例如迴圈或故障 NIC），佇列會長時間無法傳送，形成 <b>PFC storm</b> 或死結。</p>
<ul>
<li><b>偵測</b>：syncd 的 flex counter 執行 <code>pfc_detect_&lt;vendor&gt;.lua</code>，比對佇列在 detection_time 內是否持續被暫停且無傳送。</li>
<li><b>處置</b>：PfcWdOrch 依設定的 action（<code>drop</code> / <code>forward</code> / <code>alert</code>）改變佇列行為，並在 restoration_time 後恢復。</li>
<li><b>設定</b>：<code>pfcwd start --action drop ports all detection-time 200 --restoration-time 200</code>，或 CONFIG_DB <code>PFC_WD</code> 表。</li>
</ul>
<pre><span class="c"># 常用檢查</span>
show pfc counters
show queue counters Ethernet0
show priority-group watermark shared
show queue watermark unicast
pfcwd show config
pfcwd show stats
mmuconfig -l                    <span class="c"># 列出 buffer pool / profile</span></pre>
`,
    mount(root) {
      S.diagram(root.querySelector('#d-qos'), {
        title: 'QoS 管線與設定來源',
        w: 1000, h: 400,
        nodes: [
          { id: 'in', x: 20, y: 60, w: 130, h: 56, label: '入口 port', sub: 'Ethernet0', kind: 'ext', info: '<p>封包從入口 port 進入。PORT_QOS_MAP 決定此 port 使用哪一組對應表與 PFC 優先權。</p>' },
          { id: 'cls', x: 180, y: 60, w: 150, h: 56, label: '分類', sub: 'DSCP / DOT1P → TC', kind: 'hw', info: '<p>依 <code>DSCP_TO_TC_MAP</code>（L3）或 <code>DOT1P_TO_TC_MAP</code>（L2）決定 traffic class。</p>' },
          { id: 'pg', x: 360, y: 60, w: 150, h: 56, label: '入口緩衝', sub: 'TC → PG', kind: 'hw', info: '<p>依 <code>TC_TO_PRIORITY_GROUP_MAP</code> 放入 PG。lossless PG 有 headroom，超過 xoff 時送出 PFC PAUSE。</p>' },
          { id: 'fwd', x: 540, y: 60, w: 130, h: 56, label: '轉發查表', sub: 'L2 / L3 / ACL', kind: 'hw', info: '<p>決定出口 port。</p>' },
          { id: 'q', x: 700, y: 60, w: 130, h: 56, label: '出口佇列', sub: 'TC → Queue', kind: 'hw', info: '<p>依 <code>TC_TO_QUEUE_MAP</code> 進入 8 個 unicast 佇列之一，並套用 WRED / ECN 標記。</p>' },
          { id: 'sch', x: 860, y: 60, w: 120, h: 56, label: '排程', sub: 'SP / DWRR', kind: 'hw', info: '<p><code>SCHEDULER</code> 決定佇列間的嚴格優先或加權輪詢。</p>' },
          { id: 'cfg', x: 180, y: 230, w: 180, h: 56, label: 'CONFIG_DB', sub: 'QoS maps / SCHEDULER', kind: 'db', info: '<p>由 <code>qos.json.j2</code> 範本產生（<code>config qos reload</code>）。</p>' },
          { id: 'bcfg', x: 420, y: 230, w: 180, h: 56, label: 'CONFIG_DB', sub: 'BUFFER_* / CABLE_LENGTH', kind: 'db', info: '<p>由 <code>buffers.json.j2</code> 範本產生。</p>' },
          { id: 'bm', x: 420, y: 330, w: 180, h: 56, label: 'buffermgrd', sub: 'headroom 計算', kind: 'proc', info: '<p>依速率與線長計算 lossless profile；dynamic 模式下輸出到 APPL_DB BUFFER_*_TABLE。</p>' },
          { id: 'qo', x: 180, y: 330, w: 180, h: 56, label: 'QosOrch', kind: 'proc', info: '<p>建立 SAI QOS_MAP、SCHEDULER、WRED，並設定 port 與 queue 屬性。</p>' },
          { id: 'bo', x: 660, y: 330, w: 180, h: 56, label: 'BufferOrch', kind: 'proc', info: '<p>建立 SAI BUFFER_POOL、BUFFER_PROFILE，並設定 ingress PG 與 queue 的 buffer profile。</p>' },
        ],
        edges: [
          { from: 'in', to: 'cls', id: 'p1' }, { from: 'cls', to: 'pg', id: 'p2' }, { from: 'pg', to: 'fwd', id: 'p3' }, { from: 'fwd', to: 'q', id: 'p4' }, { from: 'q', to: 'sch', id: 'p5' },
          { from: 'cfg', to: 'qo', id: 'c1' }, { from: 'bcfg', to: 'bm', id: 'c2' }, { from: 'bm', to: 'bo', label: 'profile', id: 'c3' },
          { from: 'qo', to: 'cls', dash: true, label: 'QOS_MAP', id: 'c4', via: [[120, 358], [120, 150], [255, 150]] },
          { from: 'bo', to: 'pg', dash: true, label: 'BUFFER_PROFILE', id: 'c5', via: [[750, 180], [435, 180]] },
          { from: 'qo', to: 'q', dash: true, label: 'SCHEDULER / WRED', id: 'c6', via: [[270, 200], [765, 200]] },
        ],
        steps: [
          { title: '分類', text: '入口 port 依 PORT_QOS_MAP 綁定的 <code>DSCP_TO_TC_MAP</code>，把 DSCP 對應到 TC。', nodes: ['in', 'cls'], edges: ['p1'] },
          { title: '入口緩衝與 PFC', text: 'TC 經 <code>TC_TO_PRIORITY_GROUP_MAP</code> 放入 PG。lossless PG 使用量超過 xoff 門檻時，向上游送出該優先權的 PFC PAUSE。', nodes: ['cls', 'pg'], edges: ['p2'] },
          { title: '轉發與出口佇列', text: '查表決定出口 port 後，依 <code>TC_TO_QUEUE_MAP</code> 進入出口佇列，WRED_PROFILE 決定 ECN 標記或丟棄門檻。', nodes: ['pg', 'fwd', 'q'], edges: ['p3', 'p4'] },
          { title: '排程', text: 'SCHEDULER 決定佇列間以 strict priority 或 DWRR 權重分享頻寬。', nodes: ['q', 'sch'], edges: ['p5'] },
          { title: '設定來源', text: 'QoS 表由 QosOrch 直接從 CONFIG_DB 讀取；Buffer 表經 buffermgrd 計算 headroom 後由 BufferOrch 下發。', nodes: ['cfg', 'qo', 'bcfg', 'bm', 'bo'], edges: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] },
        ],
      });

      const host = root.querySelector('#dscp');
      const box = S.el('div', { class: 'w-box' });
      host.appendChild(box);
      const inp = S.el('input', { id: 'qos-dscp', type: 'number', min: 0, max: 63, value: 3, style: 'width:90px' });
      const presets = S.el('div', { class: 'chips' });
      [['0', 'Best effort'], ['3', 'RoCE (lossless)'], ['4', 'lossless'], ['46', 'EF'], ['48', 'CS6 網路控制'], ['8', 'CS1 背景']].forEach(([v, n]) => presets.appendChild(S.el('button', { class: 'chip', onclick: () => { inp.value = v; draw(); } }, `DSCP ${v} · ${n}`)));
      const out = S.el('div');
      box.appendChild(S.el('div', { class: 'row' }, S.el('label', { class: 'field', for: 'qos-dscp' }, 'DSCP (0–63)', inp), presets));
      box.appendChild(out);
      function draw() {
        const d = Math.max(0, Math.min(63, parseInt(inp.value, 10) || 0));
        const tc = DSCP_TC[d];
        const pg = LOSSLESS.has(tc) ? tc : 0;
        const lossless = LOSSLESS.has(tc);
        out.innerHTML = `<div class="pipe">
          <div><div class="pl">DSCP</div><div class="pv">${d}</div><div class="ps">0x${(d << 2).toString(16).padStart(2, '0')} ToS</div></div>
          <div><div class="pl">Traffic class</div><div class="pv">TC ${tc}</div><div class="ps">DSCP_TO_TC_MAP</div></div>
          <div><div class="pl">Ingress PG</div><div class="pv">PG ${pg}</div><div class="ps">${lossless ? 'lossless，有 headroom' : 'lossy'}</div></div>
          <div><div class="pl">Egress queue</div><div class="pv">Q ${tc}</div><div class="ps">TC_TO_QUEUE_MAP</div></div>
          <div><div class="pl">PFC</div><div class="pv">${lossless ? 'enabled' : '—'}</div><div class="ps">pfc_enable "3,4"</div></div>
        </div>
        <div class="log">${lossless
          ? `TC ${tc} 屬於 lossless 類別：入口 PG ${pg} 在使用量超過 <code>xoff</code> 時送出優先權 ${tc} 的 PFC PAUSE；出口佇列 ${tc} 的 WRED_PROFILE 通常只做 ECN 標記（DCQCN），不丟封包。`
          : `TC ${tc} 屬於 lossy 類別：共享緩衝不足時以 tail drop 或 WRED 丟棄。${tc === 6 ? '網路控制流量通常放在較高權重或 strict priority 的佇列。' : ''}`}</div>`;
      }
      inp.addEventListener('input', draw);
      draw();
    },
    related: ['copp', 'counters', 'syncd-sai', 'ref-configdb'],
    refs: [
      ['SONiC QoS / Buffer 設計文件', 'https://github.com/sonic-net/SONiC/tree/master/doc/qos'],
      ['Dynamic buffer calculation HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/qos/dynamically-headroom-calculation.md'],
      ['PFC watchdog HLD', 'https://github.com/sonic-net/SONiC/wiki/PFC-Watchdog-Design'],
    ],
  });
})();
