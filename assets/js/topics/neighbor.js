S.register({
  id: 'neighbor',
  category: 'net',
  order: 5,
  title: '鄰居解析與 MAC 學習',
  en: 'Neighbors (ARP/NDP) & FDB',
  summary: "L3 鄰居（ARP/NDP）由 Linux kernel 解析，neighsyncd 同步至 APPL_DB，NeighOrch 建立 NEIGHBOR_ENTRY 與 NEXT_HOP；L2 MAC 由 ASIC 硬體學習，經 fdb_event 回報 FdbOrch。",
  meta: [["程序", ["neighsyncd", "nbrmgrd", "orchagent (NeighOrch, FdbOrch)", "syncd"]], ["資料表", ["APPL_DB NEIGH_TABLE", "STATE_DB FDB_TABLE", "ASIC_DB NEIGHBOR_ENTRY / NEXT_HOP / FDB_ENTRY", "CONFIG_DB NEIGH"]], ["SAI 事件", ["SAI_FDB_EVENT_LEARNED", "AGED", "MOVE", "FLUSHED"]]],
  tags: ['ARP', 'NDP', 'neighsyncd', 'NeighOrch', 'FDB', 'MAC 學習', 'FdbOrch'],
  html: `
<h2>L3 鄰居與 L2 FDB 的學習路徑</h2>
<div class="defs">
  <div><b>L3 鄰居（ARP / NDP）</b><p><b>軟體學習</b>：ARP 封包被 trap 到 CPU，由 Linux kernel 維護鄰居表，neighsyncd 把它同步進 APPL_DB，NeighOrch 建立 SAI NEIGHBOR_ENTRY 與 NEXT_HOP。</p></div>
  <div><b>L2 MAC（FDB）</b><p><b>硬體學習</b>：ASIC 看到新的來源 MAC 會自動寫入 FDB 表，並透過 SAI <code>fdb_event</code> 通知 syncd → FdbOrch，FdbOrch 再寫 STATE_DB 讓 <code>show mac</code> 看得到。</p></div>
</div>
<div id="d-nb"></div>

<h2>MAC 學習模擬</h2>
<p>Vlan100 有三個成員 port，各接一台主機。送出封包，觀察交換機如何<b>學習來源 MAC</b>、在 FDB 中<b>查詢目的 MAC</b>，以及查不到時的<b>泛洪（flooding）</b>。</p>
<div id="fdb"></div>

<h2>指令與資料表</h2>
<pre><span class="c"># L3 鄰居</span>
show arp                        <span class="c"># 或 show ndp</span>
sonic-db-cli APPL_DB keys "NEIGH_TABLE:*"
<span class="c"># L2 MAC</span>
show mac                        <span class="c"># 讀 STATE_DB FDB_TABLE / ASIC_DB</span>
sonic-db-cli STATE_DB keys "FDB_TABLE|*"
sudo sonic-clear fdb all
<span class="c"># 靜態鄰居：寫 CONFIG_DB NEIGH 表，由 nbrmgrd 設定到 kernel</span></pre>
<div class="callout"><div class="ct">設計考量</div><p>這樣 SONiC 就能直接利用 Linux 成熟的鄰居狀態機（REACHABLE / STALE / PROBE…）、老化與重送機制，不需要自己再實作一次。nbrmgrd 在需要時也會主動觸發 kernel 去解析某個 next hop。</p></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-nb'), {
      title: 'ARP 鄰居與 FDB 學習流程',
      w: 1000, h: 420,
      nodes: [
        { id: 'host', x: 20, y: 60, w: 150, h: 56, label: '伺服器 / 鄰居', sub: '10.0.0.1', kind: 'ext', info: '<p>回應 ARP、或傳送一般封包的對端設備。</p>' },
        { id: 'asic', x: 230, y: 60, w: 190, h: 56, label: 'ASIC', kind: 'hw', info: '<p>ARP 封包依 CoPP 規則 trap 到 CPU；同時硬體也會對來源 MAC 做 L2 學習。</p>' },
        { id: 'kern', x: 480, y: 60, w: 200, h: 56, label: 'Linux 鄰居表', sub: 'ip neigh', kind: 'kernel', info: '<p>kernel 收到 ARP reply 後建立 <code>10.0.0.1 lladdr 0c:42:… REACHABLE</code>。</p>' },
        { id: 'ns', x: 760, y: 60, w: 200, h: 56, label: 'neighsyncd', kind: 'proc', info: '<p>監聽 netlink 的 <code>RTM_NEWNEIGH</code> / <code>RTM_DELNEIGH</code>，寫入或刪除 APPL_DB NEIGH_TABLE。</p>' },
        { id: 'appl', x: 760, y: 190, w: 200, h: 56, label: 'APPL_DB', sub: 'NEIGH_TABLE:Ethernet0:10.0.0.1', kind: 'db', info: '<p>欄位：<code>neigh</code>（MAC）、<code>family</code>。</p>' },
        { id: 'no', x: 480, y: 190, w: 200, h: 56, label: 'NeighOrch', sub: '(orchagent)', kind: 'proc', info: '<p>建立 NEIGHBOR_ENTRY（IP → MAC 改寫）與 NEXT_HOP 物件。等待這個 next hop 的路由（RouteOrch）此時就能下發了。</p>' },
        { id: 'adb', x: 230, y: 190, w: 190, h: 56, label: 'ASIC_DB', sub: 'NEIGHBOR_ENTRY / NEXT_HOP', kind: 'db', info: '<p>syncd 讀取後呼叫 SAI。</p>' },
        { id: 'syncd', x: 20, y: 330, w: 150, h: 56, label: 'syncd', sub: 'fdb_event', kind: 'proc', info: '<p>收到 SAI <code>fdb_event</code>（LEARNED / AGED / MOVE / FLUSHED），轉發到 NOTIFICATIONS channel。</p>' },
        { id: 'fo', x: 480, y: 330, w: 200, h: 56, label: 'FdbOrch', sub: '(orchagent)', kind: 'proc', info: '<p>維護軟體中的 FDB 副本，寫 STATE_DB FDB_TABLE；也處理 MAC move、flush（例如 port down 時清掉該 port 的 MAC）。</p>' },
        { id: 'st', x: 760, y: 330, w: 200, h: 56, label: 'STATE_DB', sub: 'FDB_TABLE|Vlan100:00:11:…', kind: 'db', info: '<p><code>show mac</code> 的資料來源之一。</p>' },
      ],
      edges: [
        { from: 'host', to: 'asic', label: 'ARP', bi: true, id: 'a1' },
        { from: 'asic', to: 'kern', label: 'trap → CPU', id: 'a2', lx: 450, ly: 66 },
        { from: 'kern', to: 'ns', label: 'netlink', id: 'a3' },
        { from: 'ns', to: 'appl', id: 'a4' },
        { from: 'appl', to: 'no', id: 'a5' },
        { from: 'no', to: 'adb', id: 'a6' },
        { from: 'adb', to: 'asic', label: 'syncd / SAI', id: 'a7' },
        { from: 'asic', to: 'syncd', dash: true, label: 'fdb_event', id: 'f1', via: [[200, 100], [200, 358]] },
        { from: 'syncd', to: 'fo', label: 'NOTIFICATIONS', id: 'f2' },
        { from: 'fo', to: 'st', id: 'f3' },
      ],
      steps: [
        { title: '鄰居回應 ARP', text: '交換機要送封包到 10.0.0.1，發出 ARP request；10.0.0.1 回覆 ARP reply。', nodes: ['host', 'asic'], edges: ['a1'] },
        { title: 'ARP 被送上 CPU', text: 'ASIC 依 CoPP 規則把 ARP 封包 trap 到 CPU，經驅動進入 Linux 的 Ethernet0，kernel 更新鄰居表。', nodes: ['asic', 'kern'], edges: ['a2'] },
        { title: 'neighsyncd 同步', text: 'neighsyncd 收到 netlink 事件，寫入 <code>APPL_DB NEIGH_TABLE:Ethernet0:10.0.0.1</code>。', nodes: ['kern', 'ns', 'appl'], edges: ['a3', 'a4'] },
        { title: 'NeighOrch 下發', text: 'NeighOrch 建立 NEIGHBOR_ENTRY 與 NEXT_HOP；syncd 呼叫 SAI 寫入 ASIC。從此到 10.0.0.1 的封包能被硬體改寫 MAC 後轉發。', nodes: ['appl', 'no', 'adb', 'asic'], edges: ['a5', 'a6', 'a7'] },
        { title: 'L2：硬體學到新 MAC', text: '另一方面，ASIC 在 VLAN 中看到新的來源 MAC，自動寫入硬體 FDB，並送出 <code>fdb_event(LEARNED)</code>。', nodes: ['asic', 'syncd'], edges: ['f1'] },
        { title: 'FdbOrch 記錄', text: 'syncd 把事件送給 orchagent，FdbOrch 更新 STATE_DB <code>FDB_TABLE</code>。', nodes: ['syncd', 'fo', 'st'], edges: ['f2', 'f3'] },
      ],
    });

    // MAC 學習模擬器
    const host = root.querySelector('#fdb');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const HOSTS = { A: { mac: '00:11:22:00:00:0a', port: 'Ethernet8' }, B: { mac: '00:11:22:00:00:0b', port: 'Ethernet12' }, C: { mac: '00:11:22:00:00:0c', port: 'Ethernet16' } };
    const PORTS = ['Ethernet8', 'Ethernet12', 'Ethernet16'];
    let fdb, log, lit;
    function reset() { fdb = {}; log = []; lit = {}; draw(); }
    function send(src, dst) {
      const s = HOSTS[src];
      lit = {};
      const msgs = [];
      const old = fdb[s.mac];
      if (!old) { fdb[s.mac] = { port: s.port, age: 0 }; msgs.push(`學習：來源 MAC <code>${s.mac}</code> 在 ${s.port}（ASIC → fdb_event LEARNED → FdbOrch → STATE_DB）`); }
      else if (old.port !== s.port) { msgs.push(`MAC move：<code>${s.mac}</code> 從 ${old.port} 移到 ${s.port}（fdb_event MOVE）`); fdb[s.mac] = { port: s.port, age: 0 }; }
      else { old.age = 0; msgs.push(`已知 MAC <code>${s.mac}</code>，重設老化計時`); }
      lit[s.port] = 'src';
      if (dst === 'bcast') {
        PORTS.filter(p => p !== s.port).forEach(p => (lit[p] = 'flood'));
        msgs.push('目的為廣播 FF:FF:FF:FF:FF:FF → 泛洪到 VLAN 內其他所有 port（也會複製一份給 CPU，例如 ARP）');
      } else {
        const d = HOSTS[dst];
        const e = fdb[d.mac];
        if (e) {
          if (e.port === s.port) msgs.push(`目的 MAC 在同一個 port，直接過濾丟棄`);
          else { lit[e.port] = 'fwd'; msgs.push(`FDB 命中：<code>${d.mac}</code> → ${e.port}，只從該 port 送出（已知單播）`); }
        } else {
          PORTS.filter(p => p !== s.port).forEach(p => (lit[p] = 'flood'));
          msgs.push(`FDB 查無 <code>${d.mac}</code>（unknown unicast）→ 泛洪到其他所有 port`);
        }
      }
      log.unshift(`<div style="margin-bottom:6px"><b>主機 ${src} → ${dst === 'bcast' ? '廣播' : '主機 ' + dst}</b><br>${msgs.join('<br>')}</div>`);
      draw();
    }
    function moveB() { HOSTS.B.port = HOSTS.B.port === 'Ethernet12' ? 'Ethernet16' : 'Ethernet12'; log.unshift(`<div style="margin-bottom:6px">主機 B 的網路線被換到 <b>${HOSTS.B.port}</b>（交換機要等 B 再送封包才會知道）</div>`); lit = {}; draw(); }
    function age() { const n = Object.keys(fdb).length; fdb = {}; lit = {}; log.unshift(`<div style="margin-bottom:6px">老化時間到（預設 600 秒），${n} 筆動態 MAC 被移除（fdb_event AGED）</div>`); draw(); }
    function draw() {
      box.innerHTML = '';
      const row = S.el('div', { class: 'row' });
      [['A', 'B'], ['B', 'A'], ['C', 'A'], ['A', 'bcast']].forEach(([s, d]) => row.appendChild(S.el('button', { class: 'btn sm', onclick: () => send(s, d) }, `${s} → ${d === 'bcast' ? '廣播' : d}`)));
      row.appendChild(S.el('button', { class: 'btn sm', onclick: moveB }, '把 B 移到另一個 port'));
      row.appendChild(S.el('button', { class: 'btn sm', onclick: age }, '老化'));
      row.appendChild(S.el('button', { class: 'btn sm', onclick: reset }, '↺ 重設'));
      box.appendChild(row);
      const g = S.el('div', { class: 'grid c3', style: 'margin-top:12px' });
      PORTS.forEach(p => {
        const who = Object.entries(HOSTS).filter(([, h]) => h.port === p).map(([k, h]) => `主機 ${k} (${h.mac})`).join('、') || '（無主機）';
        const st = lit[p];
        const color = st === 'src' ? 'var(--accent)' : st === 'fwd' ? 'var(--good)' : st === 'flood' ? 'var(--warn)' : 'var(--border)';
        const tag = st === 'src' ? '← 封包進入' : st === 'fwd' ? '→ 單播送出' : st === 'flood' ? '→ 泛洪送出' : '';
        g.appendChild(S.el('div', { class: 'card', style: `box-shadow:none;border:2px solid ${color}` }, S.el('b', { class: 'mono' }, p), S.el('div', { class: 'muted', style: 'font-size:13px' }, who), S.el('div', { style: 'font-size:13px;font-weight:700;color:' + color }, tag)));
      });
      box.appendChild(g);
      const t = S.el('table');
      const rows = Object.entries(fdb);
      t.innerHTML = `<thead><tr><th>No.</th><th>Vlan</th><th>MacAddress</th><th>Port</th><th>Type</th></tr></thead><tbody>${rows.length ? rows.map(([m, e], i) => `<tr><td>${i + 1}</td><td>100</td><td class="mono">${m}</td><td class="mono">${e.port}</td><td>dynamic</td></tr>`).join('') : '<tr><td colspan="5" class="muted">（FDB 是空的）</td></tr>'}</tbody>`;
      box.appendChild(S.el('div', { style: 'margin-top:10px' }, S.el('b', null, '$ show mac'), t));
      const lg = S.el('div', { class: 'dg-desc', style: 'max-height:200px;overflow:auto;font-size:14px' });
      lg.innerHTML = log.length ? log.join('') : '<span class="muted">建議順序：先 A → B（泛洪），再 B → A（命中），再 A → B（兩邊都學會了）。</span>';
      box.appendChild(lg);
    }
    reset();
  },
  keypoints: [
    'ARP/NDP 由 Linux kernel 處理；neighsyncd 把 kernel 鄰居表同步到 APPL_DB NEIGH_TABLE。',
    'NeighOrch 建立 NEIGHBOR_ENTRY 與 NEXT_HOP，路由必須等 next hop 就緒才能下發。',
    'MAC 位址由 ASIC 硬體學習，透過 SAI fdb_event 通知 FdbOrch，寫入 STATE_DB FDB_TABLE。',
    '未知單播與廣播會在 VLAN 內泛洪；已知單播只從學到的 port 送出。',
  ],
  related: ['vlan', 'routing', 'copp'],
});
