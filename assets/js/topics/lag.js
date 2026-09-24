S.register({
  id: 'lag',
  category: 'net',
  order: 4,
  title: 'PortChannel / LAG',
  en: 'Link Aggregation (teamd)',
  summary: "PortChannel 以 libteam 的 teamd 執行 LACP。teammgrd 負責建立 team 與成員，teamsyncd 回報成員狀態，PortsOrch 依狀態建立或移除 SAI LAG_MEMBER。",
  meta: [["容器", ["teamd"]], ["程序", ["teammgrd", "teamsyncd", "teamd (per LAG)", "orchagent (PortsOrch)"]], ["資料表", ["CONFIG_DB PORTCHANNEL / PORTCHANNEL_MEMBER", "APPL_DB LAG_TABLE / LAG_MEMBER_TABLE", "STATE_DB LAG_TABLE"]], ["工具", ["teamdctl <lag> state", "show interfaces portchannel"]]],
  tags: ['LAG', 'PortChannel', 'LACP', 'teamd', 'teammgrd', 'teamsyncd'],
  html: `
<h2>元件與資料流</h2>
<div id="d-lag"></div>

<h2>LACP 成員狀態模擬</h2>
<p>兩台交換機之間用 3 條線組成 PortChannel0001。切換每條鏈路或對端設定，看看 LACP 如何決定哪些成員「Selected」並寫進 ASIC 的 LAG_MEMBER。</p>
<div id="lacp"></div>

<h2>PORTCHANNEL 設定欄位</h2>
<table>
<thead><tr><th>欄位（CONFIG_DB PORTCHANNEL）</th><th>說明</th></tr></thead>
<tbody>
<tr><td><code>min_links</code></td><td>至少要有幾個成員 selected，PortChannel 才算 up</td></tr>
<tr><td><code>fallback</code></td><td>對端不跑 LACP 時，允許一個成員以 fallback 方式轉發（常用於 PXE 開機）</td></tr>
<tr><td><code>fast_rate</code></td><td>LACPDU 每 1 秒送一次（預設 slow 為 30 秒），偵測故障更快</td></tr>
<tr><td><code>mtu</code>、<code>admin_status</code></td><td>與一般介面相同</td></tr>
</tbody></table>

<h2>操作示範</h2>
<div id="term"></div>
<pre><span class="c"># 真實設備上常用</span>
show interfaces portchannel
<span class="c"># 查看 teamd 的詳細 LACP 狀態</span>
docker exec -it teamd teamdctl PortChannel0001 state</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-lag'), {
      title: 'PortChannel 的元件與資料流',
      w: 1000, h: 470,
      groups: [{ x: 216, y: 16, w: 430, h: 220, label: 'teamd 容器' }],
      nodes: [
        { id: 'cfg', x: 20, y: 50, w: 170, h: 70, label: 'CONFIG_DB', sub: 'PORTCHANNEL\nPORTCHANNEL_MEMBER', kind: 'db', info: '<p><code>PORTCHANNEL|PortChannel0001</code>、<code>PORTCHANNEL_MEMBER|PortChannel0001|Ethernet12</code></p>' },
        { id: 'tm', x: 236, y: 56, w: 170, h: 56, label: 'teammgrd', kind: 'proc', info: '<p>為每個 PortChannel 啟動一個 teamd 程序（LACP runner），並把成員 port 加入 team。寫 APPL_DB <code>LAG_TABLE</code>。</p>' },
        { id: 'td', x: 456, y: 56, w: 170, h: 56, label: 'teamd', sub: '每個 LAG 一個程序', kind: 'proc', info: '<p>libteam 的 daemon，透過成員 port 的 netdev 收發 LACPDU，決定哪些成員可以被選用（selected）。</p>' },
        { id: 'ts', x: 456, y: 160, w: 170, h: 56, label: 'teamsyncd', kind: 'proc', info: '<p>透過 libteam 監看每個 team 的成員狀態，寫 APPL_DB <code>LAG_MEMBER_TABLE:PortChannel0001:Ethernet12 status=enabled/disabled</code>。</p>' },
        { id: 'kt', x: 236, y: 280, w: 390, h: 56, label: 'Linux：PortChannel0001 (team) ← Ethernet12, Ethernet16', kind: 'kernel', info: '<p>kernel 中的 team 介面，讓 LACP 與其他控制平面程式可以使用它。</p>' },
        { id: 'peer', x: 20, y: 280, w: 170, h: 56, label: '對端交換機', sub: 'LACP', kind: 'ext', info: '<p>對端也必須設定 LACP（active 或 passive）並使用相同的 LAG。</p>' },
        { id: 'appl', x: 700, y: 56, w: 150, h: 56, label: 'APPL_DB', sub: 'LAG_TABLE…', kind: 'db', info: '<p>LAG_TABLE、LAG_MEMBER_TABLE。</p>' },
        { id: 'po', x: 700, y: 160, w: 150, h: 56, label: 'PortsOrch', kind: 'proc', info: '<p>建立 <code>SAI_OBJECT_TYPE_LAG</code>；status=enabled 的成員才建立 <code>LAG_MEMBER</code>，disabled 就移除，確保流量不會雜湊到壞掉的鏈路。</p>' },
        { id: 'asic', x: 700, y: 280, w: 280, h: 56, label: 'ASIC：LAG + LAG_MEMBER', kind: 'hw', info: '<p>硬體依雜湊把流量分散到 LAG 成員。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'tm', id: 'e1' },
        { from: 'tm', to: 'td', label: '啟動', id: 'e2' },
        { from: 'td', to: 'ts', label: 'libteam', dash: true, id: 'e3' },
        { from: 'tm', to: 'appl', label: 'LAG_TABLE', id: 'e4', via: [[321, 30], [775, 30]] },
        { from: 'ts', to: 'appl', label: 'LAG_MEMBER', id: 'e5' },
        { from: 'appl', to: 'po', id: 'e6' },
        { from: 'po', to: 'asic', id: 'e7' },
        { from: 'td', to: 'kt', label: 'LACPDU', id: 'e8', via: [[660, 84], [660, 250], [560, 250]] },
        { from: 'kt', to: 'peer', bi: true, dash: true, label: '實體鏈路', id: 'e9', lx: 212, ly: 290 },
      ],
      steps: [
        { title: '建立 PortChannel', text: '<code>config portchannel add PortChannel0001</code> → teammgrd 啟動專屬的 teamd，並寫 LAG_TABLE。', nodes: ['cfg', 'tm', 'td', 'appl'], edges: ['e1', 'e2', 'e4'] },
        { title: '加入成員、交換 LACPDU', text: '成員加入後，teamd 透過成員 netdev 與對端交換 LACPDU（ASIC 把 LACP 封包 trap 給 CPU）。', nodes: ['td', 'kt', 'peer'], edges: ['e8', 'e9'] },
        { title: '成員被選用', text: '雙方協商一致後成員變成 selected；teamsyncd 寫 <code>LAG_MEMBER_TABLE … status=enabled</code>。', nodes: ['td', 'ts', 'appl'], edges: ['e3', 'e5'] },
        { title: '寫入硬體', text: 'PortsOrch 建立 LAG_MEMBER，ASIC 開始把流量分散到這條鏈路上。', nodes: ['appl', 'po', 'asic'], edges: ['e6', 'e7'] },
      ],
    });

    // LACP 模擬
    const host = root.querySelector('#lacp');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const links = [{ p: 'Ethernet12', up: true }, { p: 'Ethernet16', up: true }, { p: 'Ethernet20', up: true }];
    let peerLacp = true, minLinks = 2, peerInLag = [true, true, true];
    function draw() {
      box.innerHTML = '';
      const r1 = S.el('div', { class: 'row' }, S.el('b', null, '鏈路：'));
      links.forEach((l, i) => r1.appendChild(S.el('button', { class: 'btn sm' + (l.up ? ' on' : ''), onclick: () => { l.up = !l.up; draw(); } }, S.el('span', { class: 'dot ' + (l.up ? 'up' : 'down') }), l.p + (l.up ? ' up' : ' down'))));
      const r2 = S.el('div', { class: 'row', style: 'margin-top:8px' }, S.el('b', null, '對端：'),
        S.el('button', { class: 'btn sm' + (peerLacp ? ' on' : ''), onclick: () => { peerLacp = !peerLacp; draw(); } }, peerLacp ? 'LACP 已啟用' : 'LACP 未啟用'),
        ...links.map((l, i) => S.el('button', { class: 'btn sm' + (peerInLag[i] ? ' on' : ''), onclick: () => { peerInLag[i] = !peerInLag[i]; draw(); } }, `${l.p} 對端${peerInLag[i] ? '在' : '不在'}同一 LAG`)));
      const r3 = S.el('div', { class: 'row', style: 'margin-top:8px' }, S.el('b', null, 'min_links：'),
        ...[1, 2, 3].map(n => S.el('button', { class: 'btn sm' + (minLinks === n ? ' on' : ''), onclick: () => { minLinks = n; draw(); } }, String(n))));
      box.appendChild(r1); box.appendChild(r2); box.appendChild(r3);
      const sel = links.map((l, i) => l.up && peerLacp && peerInLag[i]);
      const nsel = sel.filter(Boolean).length;
      const lagUp = nsel >= minLinks;
      const t = S.el('table', { style: 'margin-top:12px' });
      t.innerHTML = `<thead><tr><th>成員</th><th>實體鏈路</th><th>LACP</th><th>APPL_DB status</th><th>ASIC LAG_MEMBER</th></tr></thead><tbody>${links.map((l, i) => {
        const why = !l.up ? '鏈路 down' : !peerLacp ? '收不到對端 LACPDU' : !peerInLag[i] ? '對端的 LAG ID 不同（不聚合）' : 'Selected';
        return `<tr><td class="mono">${l.p}</td><td>${l.up ? '<span class="badge g">up</span>' : '<span class="badge r">down</span>'}</td><td>${sel[i] ? '<span class="badge g">(S) Selected</span>' : `<span class="badge r">(D) ${why}</span>`}</td><td class="mono">${sel[i] ? 'enabled' : 'disabled'}</td><td>${sel[i] ? '已建立' : '— 已移除'}</td></tr>`;
      }).join('')}</tbody>`;
      box.appendChild(t);
      box.appendChild(S.el('div', { class: 'dg-desc', html: `PortChannel0001：<b>${nsel}</b> 個成員 selected，min_links=${minLinks} → oper <span class="badge ${lagUp ? 'g' : 'r'}">${lagUp ? 'UP' : 'DOWN'}</span>。${lagUp ? '' : '成員數不足 min_links，整個 PortChannel 變成 down，上面的路由會撤掉並改走其他路徑。'}` }));
    }
    draw();

    S.terminal(root.querySelector('#term'), {
      filter: 'PortChannel',
      chips: [
        'sudo config portchannel add PortChannel0001',
        'sudo config interface startup Ethernet12',
        'sudo config portchannel member add PortChannel0001 Ethernet12',
        'sudo config portchannel member add PortChannel0001 Ethernet16',
        'show interfaces portchannel',
        'sudo config interface startup Ethernet16',
        'sudo config interface ip add PortChannel0001 10.0.1.0/31',
        'sudo config interface shutdown Ethernet12',
      ],
    });
  },
  keypoints: [
    'teammgrd 為每個 PortChannel 啟動一個 teamd 程序跑 LACP；teamsyncd 把成員狀態寫入 APPL_DB。',
    '只有 LACP selected（status=enabled）的成員才會在 ASIC 建立 LAG_MEMBER。',
    'min_links 決定 PortChannel 需要幾個成員才算 up。',
    'LAG 成員不能單獨設 IP 或加入 VLAN，要對 PortChannel 本身設定。',
  ],
  related: ['port', 'vlan', 'routing'],
  refs: [['LAG / teamd 設計文件', 'https://github.com/sonic-net/SONiC/tree/master/doc']],
});
