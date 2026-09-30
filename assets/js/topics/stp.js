S.register({
  id: 'stp',
  category: 'l2',
  order: 5,
  title: 'Spanning Tree（PVST / RPVST+ / MSTP）',
  en: 'Spanning Tree Protocol',
  summary: 'STP 在有備援鏈路的 L2 網路中選出一棵無迴圈的樹。SONiC 由 stp 容器中的 stpd 執行協定，port 狀態經 APPL_DB 交給 StpOrch，以 SAI STP instance 與 STP port 物件控制硬體的轉發與學習。',
  meta: [
    ['容器', ['stp']],
    ['程序', ['stpd', 'stpmgrd', 'orchagent (StpOrch, FdbOrch)']],
    ['CONFIG_DB', ['STP|GLOBAL', 'STP_VLAN', 'STP_PORT', 'STP_VLAN_PORT', 'STP_MST', 'STP_MST_INST']],
    ['APPL_DB', ['STP_VLAN_INSTANCE_TABLE', 'STP_PORT_STATE_TABLE', 'STP_FASTAGEING_FLUSH_TABLE', 'STP_INST_PORT_FLUSH_TABLE', 'STP_PORT_TABLE']],
    ['STATE_DB', ['STP_TABLE', 'STP_VLAN_TABLE', 'STP_VLAN_PORT_TABLE']],
    ['SAI 物件', ['STP', 'STP_PORT', 'VLAN (SAI_VLAN_ATTR_STP_INSTANCE)']],
    ['模式', ['PVST+', 'Rapid-PVST+', 'MSTP (802.1s)']],
  ],
  tags: ['STP', 'RSTP', 'PVST', 'RPVST', 'MSTP', 'BPDU', 'root bridge', 'BPDU guard', 'root guard', 'loop guard', 'portfast', 'edge port'],
  keypoints: [
    '選舉順序：Bridge ID 最小者為 root；非 root 交換機選出到 root 成本最低的 root port；每個網段選一個 designated port；其餘為 alternate / backup（阻斷）。',
    'PVST 為每個 VLAN 跑獨立實例，可讓不同 VLAN 選不同 root 以分擔負載；MSTP 把多個 VLAN 對應到少數實例，節省硬體 STP instance。',
    'RSTP 以 proposal / agreement 握手在點對點鏈路上快速收斂，不必等 forward delay；edge port（portfast）直接進入 forwarding。',
    'stpd 在 Linux netdev 上收發 BPDU（ASIC 將 BPDU trap 到 CPU），計算結果以 port state 寫入 APPL_DB，由 StpOrch 設定 SAI STP_PORT 狀態。',
    '拓樸變更時會觸發 FDB flush，讓 MAC 重新學習到新的路徑上。',
  ],
  html: `
<h2>立體模型</h2>
<p>高度代表交換機到 root bridge 的路徑成本：選出 root 之後，整棵生成樹吊掛在它下方，被阻斷的鏈路以紅色表示。最後一步切斷一條鏈路，可以看到交換機移到新的高度、原本阻斷的鏈路轉為轉送。</p>
<div id="s3-stp"></div>

<h2>協定原理</h2>
<h3>Bridge ID 與路徑成本</h3>
<p>每台交換機有一個 <b>Bridge ID</b> = 優先權（預設 32768，以 4096 為單位）+ 系統 MAC。在 PVST 中優先權欄位另外加上 VLAN ID（extended system ID）。每條鏈路依速率有一個 <b>path cost</b>（802.1t 長格式：1G = 20000、10G = 2000、100G = 200），交換機到 root 的成本是沿途入口 port 成本的總和。</p>
<h3>選舉規則</h3>
<p>所有比較都依序使用：<b>root bridge ID → root path cost → 對端 bridge ID → 對端 port ID</b>，數值小者勝。</p>
<table>
<thead><tr><th>角色</th><th>選擇方式</th><th>狀態（RSTP）</th></tr></thead>
<tbody>
<tr><td>Root bridge</td><td>全網 Bridge ID 最小者</td><td>所有 port 為 designated</td></tr>
<tr><td>Root port</td><td>非 root 交換機上，到 root 成本最低的 port</td><td>forwarding</td></tr>
<tr><td>Designated port</td><td>每個網段上，到 root 成本最低的那一端</td><td>forwarding</td></tr>
<tr><td>Alternate port</td><td>可以通往 root 的備援路徑</td><td>discarding</td></tr>
<tr><td>Backup port</td><td>同一台交換機連到同一網段的另一個 port</td><td>discarding</td></tr>
<tr><td>Edge port</td><td>接主機的 port（portfast）</td><td>立即 forwarding；收到 BPDU 即失去 edge 身分</td></tr>
</tbody></table>

<h2>選舉模擬</h2>
<p>三台交換機以三角形互連。調整優先權與鏈路成本，觀察 root bridge、各 port 角色與被阻斷的鏈路如何改變。</p>
<div id="sim"></div>

<h2>STP、RSTP、MSTP 比較</h2>
<table>
<thead><tr><th></th><th>STP (802.1D) / PVST+</th><th>RSTP (802.1w) / Rapid-PVST+</th><th>MSTP (802.1s)</th></tr></thead>
<tbody>
<tr><td>實例</td><td>PVST+：每 VLAN 一個</td><td>Rapid-PVST+：每 VLAN 一個</td><td>多個 VLAN 對應到一個 MSTI；另有 IST / CIST</td></tr>
<tr><td>port 狀態</td><td>blocking → listening → learning → forwarding</td><td>discarding → learning → forwarding</td><td>同 RSTP</td></tr>
<tr><td>收斂</td><td>30–50 秒（max age 20 + 2×forward delay 15）</td><td>點對點鏈路以 proposal / agreement 次秒級收斂</td><td>同 RSTP</td></tr>
<tr><td>拓樸變更</td><td>TCN BPDU 送到 root，root 廣播 TC</td><td>任何交換機都可直接送出 TC</td><td>每個實例獨立</td></tr>
<tr><td>區域</td><td>—</td><td>—</td><td>region 由 name、revision、VLAN→實例對應表共同決定，三者一致才屬同一 region</td></tr>
</tbody></table>

<h2>保護機制</h2>
<table>
<thead><tr><th>功能</th><th>作用</th><th>典型位置</th></tr></thead>
<tbody>
<tr><td>BPDU guard</td><td>edge port 收到 BPDU 時將 port 設為 err-disabled，可搭配 errdisable recovery 自動恢復</td><td>接主機的 port</td></tr>
<tr><td>BPDU filter</td><td>不送也不處理 BPDU（等同在該 port 關閉 STP）</td><td>明確不需要 STP 的邊界</td></tr>
<tr><td>Root guard</td><td>收到更優的 BPDU 時把 port 置於 root-inconsistent，防止下游設備搶走 root</td><td>往下游的 designated port</td></tr>
<tr><td>Loop guard</td><td>root / alternate port 收不到 BPDU 時不自動轉為 designated，防止單向鏈路造成迴圈</td><td>非 edge port</td></tr>
<tr><td>Uplink fast</td><td>root port 失效時立即切換到 alternate port</td><td>存取層交換機的上聯</td></tr>
</tbody></table>

<h2>在 SONiC 中的實作</h2>
<div id="d-stp"></div>
<table>
<thead><tr><th>資料</th><th>範例</th></tr></thead>
<tbody>
<tr><td>CONFIG_DB <code>STP|GLOBAL</code></td><td><code>mode: pvst</code>、<code>priority: 32768</code>、<code>forward_delay: 15</code>、<code>hello_time: 2</code>、<code>max_age: 20</code>、<code>rootguard_timeout: 30</code></td></tr>
<tr><td>CONFIG_DB <code>STP_PORT|Ethernet0</code></td><td><code>enabled</code>、<code>portfast</code>、<code>bpdu_guard</code>、<code>root_guard</code>、<code>path_cost</code>、<code>priority</code></td></tr>
<tr><td>APPL_DB <code>STP_VLAN_INSTANCE_TABLE:Vlan100</code></td><td><code>stp_instance: 1</code>（VLAN 對應的硬體實例）</td></tr>
<tr><td>APPL_DB <code>STP_PORT_STATE_TABLE:Ethernet0:1</code></td><td><code>state: 4</code>（forwarding）</td></tr>
<tr><td>STATE_DB <code>STP_VLAN_PORT_TABLE|Vlan100|Ethernet0</code></td><td><code>port_state</code>、<code>role</code>、<code>designated_bridge</code>、<code>bpdu_sent / bpdu_received</code></td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># 社群版 Click CLI</span>
sudo config spanning_tree enable pvst
sudo config spanning_tree vlan priority 100 4096
sudo config spanning_tree interface portfast enable Ethernet0
sudo config spanning_tree interface bpdu_guard enable Ethernet0 --shutdown
show spanning_tree
show spanning_tree vlan 100

<span class="c"># Enterprise SONiC（Management Framework）</span>
sonic(config)# spanning-tree mode rapid-pvst
<span class="c"># VLAN bridge priority（0–61440，以 4096 為單位）的指令格式見 UG460 §8.4.8.3</span>
sonic(config)# spanning-tree vlan 100 hello-time 2
sonic(config)# interface Eth1/2
sonic(config-if-Eth1/2)# spanning-tree portfast
sonic(config-if-Eth1/2)# spanning-tree bpduguard port-shutdown
sonic(config-if-Eth1/2)# spanning-tree link-type point-to-point
sonic(config)# spanning-tree loopguard default
sonic(config)# errdisable recovery cause bpduguard

<span class="c"># MSTP</span>
sonic(config)# spanning-tree mode mst
sonic(config)# spanning-tree mst configuration
sonic(config-mst)# name DC1
sonic(config-mst)# revision 1
sonic(config-mst)# instance 1 vlan 100-199
sonic(config-mst)# instance 2 vlan 200-299
sonic(config-mst)# activate
sonic(config)# spanning-tree mst 1 priority 4096
sonic# show spanning-tree mst</pre>
`,
  mount(root) {
    S.scenes.stp(root.querySelector('#s3-stp'));
    // ---------- 選舉模擬 ----------
    const host = root.querySelector('#sim');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const SW = { A: { mac: '00:1c:73:00:00:0a', prio: 32768 }, B: { mac: '00:1c:73:00:00:0b', prio: 32768 }, C: { mac: '00:1c:73:00:00:0c', prio: 32768 } };
    const LINKS = [{ a: 'A', pa: 1, b: 'B', pb: 1, cost: 2000 }, { a: 'A', pa: 2, b: 'C', pb: 1, cost: 2000 }, { a: 'B', pa: 2, b: 'C', pb: 2, cost: 2000 }];
    const POS = { A: [400, 70], B: [170, 300], C: [630, 300] };
    const bid = n => [SW[n].prio, SW[n].mac];
    const cmpBid = (x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0);
    const bidStr = n => `${SW[n].prio}.${SW[n].mac.slice(-5)}`;
    function compute() {
      const names = Object.keys(SW);
      const rootN = names.slice().sort((a, b) => cmpBid(bid(a), bid(b)))[0];
      // root path cost：三個節點直接用 Bellman-Ford
      const rpc = { A: Infinity, B: Infinity, C: Infinity }; rpc[rootN] = 0;
      for (let i = 0; i < 3; i++) LINKS.forEach(l => { rpc[l.b] = Math.min(rpc[l.b], rpc[l.a] + l.cost); rpc[l.a] = Math.min(rpc[l.a], rpc[l.b] + l.cost); });
      const ports = {}; // key 'A1' -> role
      const rootPort = {};
      names.forEach(n => {
        if (n === rootN) return;
        let best = null;
        LINKS.forEach(l => {
          const mine = l.a === n ? { p: l.pa, nb: l.b, np: l.pb } : l.b === n ? { p: l.pb, nb: l.a, np: l.pa } : null;
          if (!mine) return;
          const cand = [rpc[mine.nb] + l.cost, bid(mine.nb), mine.np, mine.p];
          if (!best || cand[0] < best[0] || (cand[0] === best[0] && (cmpBid(cand[1], best[1]) < 0 || (cmpBid(cand[1], best[1]) === 0 && cand[2] < best[2])))) best = cand;
        });
        rootPort[n] = best[3];
        ports[n + best[3]] = 'R';
      });
      LINKS.forEach(l => {
        if (ports[l.a + l.pa] === 'R' || ports[l.b + l.pb] === 'R') {
          // 一端是 root port，另一端必為 designated
          if (ports[l.a + l.pa] !== 'R') ports[l.a + l.pa] = 'D';
          if (ports[l.b + l.pb] !== 'R') ports[l.b + l.pb] = 'D';
          return;
        }
        const aBetter = rpc[l.a] < rpc[l.b] || (rpc[l.a] === rpc[l.b] && cmpBid(bid(l.a), bid(l.b)) < 0);
        ports[l.a + l.pa] = aBetter ? 'D' : 'A';
        ports[l.b + l.pb] = aBetter ? 'A' : 'D';
      });
      return { rootN, rpc, ports, rootPort };
    }
    function draw() {
      const r = compute();
      box.innerHTML = '';
      const ctl = S.el('div', { class: 'grid c3' });
      Object.keys(SW).forEach(n => {
        const sel = S.el('select', { id: 'stp-prio-' + n });
        [0, 4096, 8192, 16384, 24576, 28672, 32768, 36864, 61440].forEach(v => sel.appendChild(S.el('option', { value: v, selected: SW[n].prio === v }, String(v))));
        sel.addEventListener('change', () => { SW[n].prio = +sel.value; draw(); });
        ctl.appendChild(S.el('label', { class: 'field', for: 'stp-prio-' + n }, `SW-${n} bridge priority`, sel));
      });
      LINKS.forEach((l, i) => {
        const sel = S.el('select', { id: 'stp-cost-' + i });
        [[200, '100G · 200'], [2000, '10G · 2000'], [20000, '1G · 20000']].forEach(([v, t]) => sel.appendChild(S.el('option', { value: v, selected: l.cost === v }, t)));
        sel.addEventListener('change', () => { l.cost = +sel.value; draw(); });
        ctl.appendChild(S.el('label', { class: 'field', for: 'stp-cost-' + i }, `鏈路 ${l.a}–${l.b} path cost`, sel));
      });
      box.appendChild(ctl);
      const NS = 'http://www.w3.org/2000/svg';
      let svg = `<svg viewBox="0 0 800 380" style="width:100%;min-width:560px;display:block">`;
      LINKS.forEach(l => {
        const [x1, y1] = POS[l.a], [x2, y2] = POS[l.b];
        const blocked = r.ports[l.a + l.pa] === 'A' || r.ports[l.b + l.pb] === 'A';
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${blocked ? 'var(--bad)' : 'var(--accent)'}" stroke-width="${blocked ? 1.6 : 2.6}" ${blocked ? 'stroke-dasharray="6 5"' : ''}/>`;
        svg += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">cost ${l.cost}</text>`;
        [[l.a, l.pa, x1, y1, x2, y2], [l.b, l.pb, x2, y2, x1, y1]].forEach(([n, p, sx, sy, ex, ey]) => {
          const role = r.ports[n + p];
          const px = sx + (ex - sx) * 0.24, py = sy + (ey - sy) * 0.24;
          const col = role === 'R' ? 'var(--good)' : role === 'D' ? 'var(--accent)' : 'var(--bad)';
          svg += `<rect x="${px - 30}" y="${py - 12}" width="60" height="24" rx="4" fill="var(--panel)" stroke="${col}"/><text x="${px}" y="${py + 1}" text-anchor="middle" dominant-baseline="middle" font-size="11.5" font-family="var(--mono)" fill="${col}" font-weight="600">p${p} ${role === 'R' ? 'Root' : role === 'D' ? 'Desg' : 'Alt'}</text>`;
        });
      });
      Object.keys(SW).forEach(n => {
        const [x, y] = POS[n];
        const isRoot = n === r.rootN;
        svg += `<rect x="${x - 80}" y="${y - 30}" width="160" height="60" rx="8" fill="var(--panel)" stroke="${isRoot ? 'var(--accent)' : 'var(--border-strong)'}" stroke-width="${isRoot ? 2.4 : 1.2}"/>`;
        svg += `<text x="${x}" y="${y - 8}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text)">SW-${n}${isRoot ? '  (root)' : ''}</text>`;
        svg += `<text x="${x}" y="${y + 13}" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">${bidStr(n)} · RPC ${r.rpc[n]}</text>`;
      });
      svg += '</svg>';
      box.appendChild(S.el('div', { class: 'dg-canvas', style: 'margin-top:12px;border:1px solid var(--border);border-radius:6px', html: svg }));
      void NS;
      const blockedL = LINKS.find(l => r.ports[l.a + l.pa] === 'A' || r.ports[l.b + l.pb] === 'A');
      const altEnd = blockedL ? (r.ports[blockedL.a + blockedL.pa] === 'A' ? `SW-${blockedL.a} p${blockedL.pa}` : `SW-${blockedL.b} p${blockedL.pb}`) : '';
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html:
        `Root bridge 為 <b>SW-${r.rootN}</b>（Bridge ID ${bidStr(r.rootN)} 最小）。` +
        Object.keys(r.rootPort).map(n => `SW-${n} 的 root port 為 p${r.rootPort[n]}（root path cost ${r.rpc[n]}）`).join('；') +
        `。${blockedL ? `鏈路 ${blockedL.a}–${blockedL.b} 上，${altEnd} 成為 alternate port 並進入 discarding，打斷迴圈。` : ''}` }));
    }
    draw();

    S.diagram(root.querySelector('#d-stp'), {
      title: 'STP 在 SONiC 中的資料流',
      w: 1000, h: 400,
      nodes: [
        { id: 'peer', x: 20, y: 40, w: 150, h: 56, label: '相鄰交換機', sub: 'BPDU', kind: 'ext', info: '<p>每 hello time（預設 2 秒）送出 BPDU。</p>' },
        { id: 'asic', x: 220, y: 40, w: 160, h: 56, label: 'ASIC', sub: 'trap stp / pvrst', kind: 'hw', info: '<p>BPDU（目的 MAC 01:80:C2:00:00:00；PVST+ 為 01:00:0C:CC:CC:CD）由 CoPP trap 送往 CPU。</p>' },
        { id: 'k', x: 430, y: 40, w: 160, h: 56, label: 'Linux netdev', sub: 'Ethernet0', kind: 'kernel', info: '<p>stpd 以 raw socket 在各 port 的 netdev 上收發 BPDU。</p>' },
        { id: 'stpd', x: 640, y: 40, w: 160, h: 56, label: 'stpd', sub: 'stp 容器', kind: 'proc', info: '<p>執行 PVST / RPVST / MSTP 狀態機，計算每個 VLAN（或 MST 實例）的 port 角色與狀態，並把結果寫入 APPL_DB 與 STATE_DB。</p>' },
        { id: 'cfg', x: 850, y: 40, w: 130, h: 56, label: 'CONFIG_DB', sub: 'STP_*', kind: 'db', info: '<p>由 stpmgrd 讀取並透過 IPC 交給 stpd，同時管理 VLAN 與 STP 實例的對應。</p>' },
        { id: 'appl', x: 640, y: 180, w: 160, h: 56, label: 'APPL_DB', sub: 'STP_PORT_STATE_TABLE', kind: 'db', info: '<p><code>STP_PORT_STATE_TABLE:Ethernet0:&lt;instance&gt;</code> → state；<code>STP_FASTAGEING_FLUSH_TABLE</code> 觸發 FDB 清除。</p>' },
        { id: 'orch', x: 430, y: 180, w: 160, h: 56, label: 'StpOrch', sub: '(orchagent)', kind: 'proc', info: '<p>建立 SAI STP instance，把 VLAN 綁到實例，並設定每個 STP_PORT 的狀態（BLOCKING / LEARNING / FORWARDING）。拓樸變更時請 FdbOrch 清除對應的 MAC。</p>' },
        { id: 'adb', x: 220, y: 180, w: 160, h: 56, label: 'ASIC_DB', sub: 'STP / STP_PORT', kind: 'db', info: '<p>SAI_OBJECT_TYPE_STP、SAI_OBJECT_TYPE_STP_PORT（SAI_STP_PORT_ATTR_STATE）。</p>' },
        { id: 'hw', x: 20, y: 180, w: 150, h: 56, label: 'ASIC 轉發', sub: 'port × VLAN 狀態', kind: 'hw', info: '<p>discarding 的 port 在該實例的 VLAN 中不轉發也不學習。</p>' },
        { id: 'st', x: 850, y: 180, w: 130, h: 56, label: 'STATE_DB', sub: 'STP_VLAN_*', kind: 'db', info: '<p><code>show spanning-tree</code> 的資料來源。</p>' },
        { id: 'fdb', x: 430, y: 310, w: 160, h: 56, label: 'FdbOrch', sub: 'flush', kind: 'proc', info: '<p>收到拓樸變更時清除該 VLAN / port 的動態 MAC，讓流量重新學習到新路徑。</p>' },
      ],
      edges: [
        { from: 'peer', to: 'asic', bi: true, id: 'e1' },
        { from: 'asic', to: 'k', label: 'trap', id: 'e2' },
        { from: 'k', to: 'stpd', bi: true, id: 'e3' },
        { from: 'cfg', to: 'stpd', label: 'stpmgrd', id: 'e4' },
        { from: 'stpd', to: 'appl', id: 'e5' },
        { from: 'stpd', to: 'st', id: 'e6', via: [[915, 140]] },
        { from: 'appl', to: 'orch', id: 'e7' },
        { from: 'orch', to: 'adb', id: 'e8' },
        { from: 'adb', to: 'hw', label: 'syncd', id: 'e9' },
        { from: 'orch', to: 'fdb', dash: true, label: 'TC flush', id: 'e10' },
      ],
      steps: [
        { title: '設定', text: 'CONFIG_DB 的 STP 設定經 stpmgrd 交給 stpd；VLAN 建立時會分配一個 STP 實例。', nodes: ['cfg', 'stpd'], edges: ['e4'] },
        { title: 'BPDU 交換', text: 'BPDU 由 ASIC trap 到 CPU，經 netdev 交給 stpd；stpd 也從同一路徑送出 BPDU。', nodes: ['peer', 'asic', 'k', 'stpd'], edges: ['e1', 'e2', 'e3'] },
        { title: '計算並發布狀態', text: 'stpd 完成選舉後，把每個 port 在每個實例中的狀態寫入 APPL_DB，並把角色與統計寫入 STATE_DB。', nodes: ['stpd', 'appl', 'st'], edges: ['e5', 'e6'] },
        { title: '硬體套用', text: 'StpOrch 設定 SAI STP_PORT 狀態，syncd 寫入 ASIC。', nodes: ['appl', 'orch', 'adb', 'hw'], edges: ['e7', 'e8', 'e9'] },
        { title: '拓樸變更', text: '狀態改變時送出 TC，本機與鄰居都清除相關 MAC，避免流量繼續送往已阻斷的方向。', nodes: ['orch', 'fdb'], edges: ['e10'] },
      ],
    });
  },
  related: ['vlan', 'lag', 'copp', 'mclag'],
  refs: [['SONiC PVST HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/stp/SONiC_PVST_HLD.md'], ['IEEE 802.1Q-2018（含 RSTP / MSTP）', 'https://standards.ieee.org/ieee/802.1Q/6844/'], ['Enterprise SONiC User Guide UG460：§8.4', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
