S.register({
  id: 'swss',
  category: 'core',
  order: 2,
  title: 'SWSS 與 orchagent',
  en: 'Switch State Service',
  summary: "SWSS（Switch State Service）由 *mgrd、*syncd 與 orchagent 組成：*mgrd 將設定套用至 kernel，*syncd 將 kernel 與協定狀態同步至 Redis，orchagent 將 APPL_DB 轉換為 SAI 物件並處理物件相依。",
  meta: [["容器", ["swss"]], ["程序", ["orchagent", "portmgrd", "intfmgrd", "vlanmgrd", "nbrmgrd", "vrfmgrd", "buffermgrd", "coppmgrd", "portsyncd", "neighsyncd"]], ["輸入 / 輸出", ["APPL_DB → ASIC_DB", "CONFIG_DB → APPL_DB"]], ["原始碼", "<code>sonic-swss/orchagent/</code>、<code>sonic-swss/cfgmgr/</code>、<code>sonic-swss/portsyncd/</code>"], ["記錄檔", ["/var/log/swss/sairedis.rec", "/var/log/swss/swss.rec", "/var/log/syslog"]]],
  tags: ['swss', 'orchagent', 'Orch', 'ProducerStateTable', 'vlanmgrd', 'portsyncd'],
  html: `
<h2>容器組成</h2>
<div class="defs">
  <div><b>*mgrd</b><p>portmgrd、intfmgrd、vlanmgrd、nbrmgrd、vrfmgrd、buffermgrd、coppmgrd、vxlanmgrd、tunnelmgrd…<br>CONFIG_DB → kernel → APPL_DB</p></div>
  <div><b>*syncd</b><p>portsyncd、neighsyncd（以及 bgp 容器的 fpmsyncd、teamd 容器的 teamsyncd）<br>kernel / 協定 → APPL_DB / STATE_DB</p></div>
  <div><b>orchagent</b><p>由數十個 Orch 組成，APPL_DB → ASIC_DB。單一程序、事件驅動的主迴圈。</p></div>
</div>

<h2>ProducerStateTable 與 ConsumerStateTable</h2>
<p>以 vlanmgrd 寫入 <code>VLAN_TABLE:Vlan100</code> 為例，看看 <code>ProducerStateTable</code> 與 <code>ConsumerStateTable</code> 在 Redis 裡實際做了什麼。</p>
<div id="d-pc"></div>

<h2>Orch 模組</h2>
<table>
<thead><tr><th>Orch</th><th>訂閱的表</th><th>產生的 SAI 物件</th></tr></thead>
<tbody>
<tr><td>PortsOrch</td><td>PORT_TABLE、VLAN_TABLE、VLAN_MEMBER_TABLE、LAG_TABLE、LAG_MEMBER_TABLE</td><td>PORT、HOSTIF、VLAN、VLAN_MEMBER、BRIDGE_PORT、LAG、LAG_MEMBER</td></tr>
<tr><td>IntfsOrch</td><td>INTF_TABLE</td><td>ROUTER_INTERFACE、ip2me / subnet 路由</td></tr>
<tr><td>NeighOrch</td><td>NEIGH_TABLE</td><td>NEIGHBOR_ENTRY、NEXT_HOP</td></tr>
<tr><td>RouteOrch</td><td>ROUTE_TABLE</td><td>ROUTE_ENTRY、NEXT_HOP_GROUP（ECMP）</td></tr>
<tr><td>FdbOrch</td><td>FDB_TABLE + ASIC 的 FDB 事件</td><td>FDB_ENTRY</td></tr>
<tr><td>AclOrch</td><td><b>CONFIG_DB</b> 的 ACL_TABLE、ACL_RULE</td><td>ACL_TABLE、ACL_ENTRY、ACL_COUNTER</td></tr>
<tr><td>BufferOrch / QosOrch</td><td>BUFFER_*、QOS 相關表</td><td>BUFFER_POOL、BUFFER_PROFILE、QOS_MAP、SCHEDULER…</td></tr>
<tr><td>CoppOrch</td><td>COPP_TABLE</td><td>HOSTIF_TRAP、HOSTIF_TRAP_GROUP、POLICER</td></tr>
<tr><td>FlexCounterOrch</td><td>CONFIG_DB FLEX_COUNTER_TABLE</td><td>寫 FLEX_COUNTER_DB，讓 syncd 開始輪詢計數器</td></tr>
</tbody></table>

<h2>相依性處理：m_toSync 與重試</h2>
<p>SAI 物件彼此相依：<b>路由</b>需要 <b>next hop</b>、next hop 需要<b>鄰居（MAC）</b>、鄰居又需要<b>路由器介面（RIF）</b>。APPL_DB 的事件抵達順序不一定剛好，orchagent 會把「還不能處理」的任務留在每個 Orch 的 <code>m_toSync</code> 佇列，下一輪再重試。</p>
<p>操作方式：<b>先</b>送路由，再送鄰居、介面，然後按「執行一輪 doTask」，觀察任務如何卡住又被消化。</p>
<div id="orch-sim"></div>

<h2>日誌與記錄檔</h2>
<pre><span class="c"># orchagent 等 swss 程序的 log</span>
sudo grep -i orchagent /var/log/syslog | tail
<span class="c"># 所有送往 SAI 的呼叫（非常好用的除錯工具）</span>
sudo tail -f /var/log/swss/sairedis.rec
<span class="c"># APPL_DB 的所有寫入紀錄</span>
sudo tail -f /var/log/swss/swss.rec
<span class="c"># 動態調整 log 等級</span>
sudo swssloglevel -l DEBUG -c orchagent</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-pc'), {
      title: 'ProducerStateTable → ConsumerStateTable',
      w: 1000, h: 380,
      groups: [{ x: 300, y: 20, w: 400, h: 340, label: 'Redis APPL_DB (0)', kind: 'db' }],
      nodes: [
        { id: 'vm', x: 30, y: 150, w: 220, h: 70, label: 'vlanmgrd', sub: 'ProducerStateTable\n("VLAN_TABLE")', kind: 'proc', info: '<p>呼叫 <code>set("Vlan100", {admin_status: up, mtu: 9100})</code>。ProducerStateTable 在一個 Lua 腳本中原子性地完成右邊三件事。</p>' },
        { id: 'tmp', x: 330, y: 60, w: 340, h: 56, label: '_VLAN_TABLE:Vlan100', sub: '暫存欄位（前面有底線）', kind: 'db', info: '<p>先把欄位寫到「暫存」hash <code>_VLAN_TABLE:Vlan100</code>，消費者還沒取走前不會出現在正式表裡。多次寫入同一個 key 會合併。</p>' },
        { id: 'ks', x: 330, y: 150, w: 340, h: 56, label: 'VLAN_TABLE_KEY_SET', sub: 'Redis SET：有哪些 key 待處理', kind: 'db', info: '<p>把 <code>Vlan100</code> 放進這個 set。同一個 key 在被取走前重複寫入也只會出現一次，因此消費者可以批次處理、不會重複。</p>' },
        { id: 'ch', x: 330, y: 240, w: 340, h: 56, label: 'PUBLISH VLAN_TABLE_CHANNEL', sub: '只是「有新東西」的通知', kind: 'db', info: '<p>發一個 pub/sub 訊息喚醒消費者。訊息本身不帶資料，資料在上面的 KEY_SET 與暫存 hash 中。</p>' },
        { id: 'orch', x: 750, y: 150, w: 220, h: 70, label: 'orchagent', sub: 'ConsumerStateTable\n(PortsOrch)', kind: 'proc', info: '<p>收到通知後執行 Lua 腳本 <code>consumer_state_table_pops.lua</code>：從 KEY_SET 取出 key、把暫存欄位搬到正式的 <code>VLAN_TABLE:Vlan100</code>、刪掉暫存，然後把 (key, op, fields) 交給 Orch 的 <code>doTask()</code>。</p>' },
        { id: 'real', x: 750, y: 290, w: 220, h: 56, label: 'VLAN_TABLE:Vlan100', sub: '正式表（show 看得到）', kind: 'db', info: '<p>被消費後才出現的正式 key，<code>redis-cli -n 0 hgetall VLAN_TABLE:Vlan100</code> 看到的就是它。</p>' },
      ],
      edges: [
        { from: 'vm', to: 'tmp', label: '① HSET', id: 'e1' },
        { from: 'vm', to: 'ks', label: '② SADD', id: 'e2' },
        { from: 'vm', to: 'ch', label: '③ PUBLISH', id: 'e3' },
        { from: 'ch', to: 'orch', label: '④ 喚醒', dash: true, id: 'e4' },
        { from: 'ks', to: 'orch', label: '⑤ SPOP', id: 'e5' },
        { from: 'tmp', to: 'orch', label: '⑥ 搬移欄位', id: 'e6' },
        { from: 'orch', to: 'real', label: '⑦ 寫正式表', id: 'e7' },
      ],
      steps: [
        { title: '生產者寫入暫存欄位', text: 'vlanmgrd 呼叫 <code>ProducerStateTable::set()</code>，欄位先寫到 <code>_VLAN_TABLE:Vlan100</code>。', nodes: ['vm', 'tmp'], edges: ['e1'] },
        { title: '登記待處理 key', text: '同時把 <code>Vlan100</code> 加入 <code>VLAN_TABLE_KEY_SET</code>。', nodes: ['vm', 'ks'], edges: ['e2'] },
        { title: '發出通知', text: '對 <code>VLAN_TABLE_CHANNEL</code> PUBLISH 一則訊息。以上三步在同一個 Lua 腳本中原子完成。', nodes: ['vm', 'ch'], edges: ['e3'] },
        { title: '消費者被喚醒', text: 'orchagent 的 select 迴圈在該 channel 上收到訊息，知道 VLAN_TABLE 有新資料。', nodes: ['ch', 'orch'], edges: ['e4'] },
        { title: '批次取出', text: 'ConsumerStateTable 一次從 KEY_SET 取出多個 key，把暫存欄位搬到正式表並刪除暫存。', nodes: ['ks', 'tmp', 'orch'], edges: ['e5', 'e6'] },
        { title: '交給 Orch 處理', text: '正式表 <code>VLAN_TABLE:Vlan100</code> 出現；(key, SET, fields) 放入 PortsOrch 的 <code>m_toSync</code>，接著由 <code>doTask()</code> 建立 SAI VLAN 物件。', nodes: ['orch', 'real'], edges: ['e7'] },
      ],
    });

    // ---------- orchagent 相依性模擬 ----------
    const host = root.querySelector('#orch-sim');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    let st;
    function reset() {
      st = { q: { IntfsOrch: [], NeighOrch: [], RouteOrch: [] }, asic: [], log: [], sent: { intf: false, neigh: false, route: false }, round: 0 };
      draw();
    }
    const EV = {
      intf: { orch: 'IntfsOrch', key: 'INTF_TABLE:Ethernet0:10.0.0.0/31', label: '送出 INTF_TABLE:Ethernet0:10.0.0.0/31' },
      neigh: { orch: 'NeighOrch', key: 'NEIGH_TABLE:Ethernet0:10.0.0.1', label: '送出 NEIGH_TABLE:Ethernet0:10.0.0.1' },
      route: { orch: 'RouteOrch', key: 'ROUTE_TABLE:172.16.0.0/16 (nh 10.0.0.1)', label: '送出 ROUTE_TABLE:172.16.0.0/16 via 10.0.0.1' },
    };
    const has = t => st.asic.some(a => a.startsWith(t));
    function send(k) {
      st.sent[k] = true;
      st.q[EV[k].orch].push(EV[k].key);
      st.log.push(`<span class="badge b">APPL_DB</span> ${EV[k].key} → 放入 ${EV[k].orch}.m_toSync`);
      draw();
    }
    function tick() {
      st.round++;
      st.log.push(`<b>— 第 ${st.round} 輪 doTask() —</b>`);
      // IntfsOrch
      if (st.q.IntfsOrch.length) {
        st.q.IntfsOrch = [];
        st.asic.push('ROUTER_INTERFACE (Ethernet0)', 'ROUTE_ENTRY 10.0.0.0/31 → RIF', 'ROUTE_ENTRY 10.0.0.0/32 → CPU');
        st.log.push('<span class="badge g">IntfsOrch</span> 建立 RIF 與 subnet / ip2me 路由 ');
      }
      if (st.q.NeighOrch.length) {
        if (has('ROUTER_INTERFACE')) {
          st.q.NeighOrch = [];
          st.asic.push('NEIGHBOR_ENTRY 10.0.0.1', 'NEXT_HOP 10.0.0.1');
          st.log.push('<span class="badge g">NeighOrch</span> RIF 已存在 → 建立 NEIGHBOR_ENTRY 與 NEXT_HOP ');
        } else st.log.push('<span class="badge y">NeighOrch</span> Ethernet0 的 RIF 還不存在，任務留在 m_toSync 等下一輪 ');
      }
      if (st.q.RouteOrch.length) {
        if (has('NEXT_HOP')) {
          st.q.RouteOrch = [];
          st.asic.push('ROUTE_ENTRY 172.16.0.0/16 → NEXT_HOP');
          st.log.push('<span class="badge g">RouteOrch</span> next hop 已存在 → 建立 ROUTE_ENTRY ');
        } else st.log.push('<span class="badge y">RouteOrch</span> next hop 10.0.0.1 尚未解析，任務保留並請 NeighOrch 解析（實際上會觸發 ARP）');
      }
      if (!st.q.IntfsOrch.length && !st.q.NeighOrch.length && !st.q.RouteOrch.length && st.sent.intf && st.sent.neigh && st.sent.route) st.log.push('所有任務都完成了！這就是 orchagent 靠「保留 + 重試」自然解決相依順序的方法。');
      draw();
    }
    function draw() {
      box.innerHTML = '';
      const btns = S.el('div', { class: 'row' });
      ['route', 'neigh', 'intf'].forEach(k => btns.appendChild(S.el('button', { class: 'btn sm', disabled: st.sent[k], onclick: () => send(k) }, EV[k].label)));
      btns.appendChild(S.el('button', { class: 'btn sm primary', onclick: tick }, '執行一輪 doTask'));
      btns.appendChild(S.el('button', { class: 'btn sm', onclick: reset }, '↺ 重設'));
      box.appendChild(btns);
      const g = S.el('div', { class: 'grid c3', style: 'margin-top:12px' });
      Object.entries(st.q).forEach(([o, items]) => {
        g.appendChild(S.el('div', { class: 'card', style: 'box-shadow:none' },
          S.el('b', null, o + '.m_toSync'),
          items.length ? S.el('div', null, ...items.map(i => S.el('div', { class: 'mono', style: 'font-size:12px;margin-top:4px' }, '' + i))) : S.el('div', { class: 'muted', style: 'font-size:13px' }, '（空）')));
      });
      box.appendChild(g);
      box.appendChild(S.el('div', { style: 'margin-top:12px' }, S.el('b', null, 'ASIC_DB 內容：'),
        st.asic.length ? S.el('div', { class: 'chips' }, ...st.asic.map(a => S.el('span', { class: 'chip', style: 'cursor:default' }, a))) : S.el('span', { class: 'muted' }, ' （空）')));
      const log = S.el('div', { class: 'dg-desc', style: 'margin-top:10px;max-height:220px;overflow:auto;font-size:14px' });
      log.innerHTML = st.log.length ? st.log.map(l => `<div>${l}</div>`).join('') : '<span class="muted">建議順序：先送路由 → 執行 doTask（卡住）→ 送鄰居 → doTask（還是卡）→ 送介面 → 連按幾次 doTask。</span>';
      box.appendChild(log);
      log.scrollTop = log.scrollHeight;
    }
    reset();
  },
  keypoints: [
    '*mgrd：CONFIG_DB → kernel → APPL_DB；*syncd：kernel/協定 → APPL_DB/STATE_DB；orchagent：APPL_DB → ASIC_DB。',
    'APPL_DB 用 ProducerStateTable / ConsumerStateTable：暫存 hash + KEY_SET + PUBLISH，支援批次且不遺漏。',
    'orchagent 由許多 Orch 組成，每個 Orch 有自己的 m_toSync 佇列；相依物件未就緒時，任務會保留並在之後重試。',
    '/var/log/swss/sairedis.rec 記錄所有送往 SAI 的操作，是除錯的利器。',
  ],
  related: ['redis-db', 'syncd-sai', 'port', 'routing'],
  refs: [['sonic-swss 原始碼', 'https://github.com/sonic-net/sonic-swss'], ['sonic-swss-common（ProducerStateTable 等）', 'https://github.com/sonic-net/sonic-swss-common']],
});
