S.register({
  id: 'multicast',
  category: 'dc',
  order: 3,
  title: 'Multicast（IGMP / PIM）',
  en: 'IP Multicast, IGMP Snooping & PIM',
  summary: 'IGMP 讓主機向路由器宣告要加入的群組，IGMP snooping 讓交換機只把群組流量送到有成員的 port；PIM 在路由器之間建立群組的轉發樹。SONiC 以 FRR pimd 執行 IGMP / PIM，結果以 SAI IPMC / L2MC 物件寫入 ASIC 的 multicast 複製表。',
  meta: [
    ['程序', ['pimd（FRR，含 IGMP）', 'IGMP snooping daemon', 'orchagent（L2MC / IPMC 相關 Orch）']],
    ['SAI 物件', ['L2MC_ENTRY', 'L2MC_GROUP / MEMBER', 'IPMC_ENTRY', 'IPMC_GROUP / MEMBER', 'RPF_GROUP / MEMBER']],
    ['協定', ['IGMPv2 (RFC 2236)', 'IGMPv3 (RFC 3376)', 'PIM-SM (RFC 7761)', 'PIM-SSM (RFC 4607)', '232.0.0.0/8 SSM 範圍']],
    ['指令', ['show ip igmp groups', 'show ip igmp snooping', 'show ip pim neighbor', 'show ip mroute']],
  ],
  tags: ['multicast', 'IGMP', 'IGMP snooping', 'querier', 'mrouter', 'PIM', 'PIM-SM', 'PIM-SSM', 'RP', 'RPF', 'IPMC', 'L2MC'],
  keypoints: [
    'IPv4 multicast MAC 為 01:00:5E 加上群組 IP 的低 23 bit，因此 32 個群組共用一個 MAC；交換機以 IP 層的 snooping 項目避免誤送。',
    'IGMP snooping 監聽 Join / Leave 與 Query，建立 (VLAN, 群組) → port 清單；群組流量只送往成員 port 與 mrouter port，其餘 unknown multicast 可依設定泛洪或丟棄。',
    '沒有路由器的 VLAN 需要一台交換機擔任 snooping querier，否則成員資訊會隨時間老化而消失。',
    'PIM-SM 透過 RP 建立共享樹（*,G），可切換到來源樹（S,G）；PIM-SSM 由接收端（IGMPv3）指定來源，直接建立（S,G），不需要 RP。',
    'RPF 檢查確保 multicast 封包從「往來源方向」的介面進來，否則丟棄以避免迴圈。',
  ],
  html: `
<h2>IGMP</h2>
<table>
<thead><tr><th>版本</th><th>加入</th><th>離開</th><th>來源過濾</th></tr></thead>
<tbody>
<tr><td>IGMPv1</td><td>Membership Report</td><td>逾時</td><td>無</td></tr>
<tr><td>IGMPv2</td><td>Membership Report</td><td>Leave Group，路由器再送 group-specific query 確認</td><td>無</td></tr>
<tr><td>IGMPv3</td><td>Report 含 INCLUDE / EXCLUDE 來源清單</td><td>State change report</td><td>有（SSM 必需）</td></tr>
</tbody></table>
<table>
<thead><tr><th>計時器</th><th>預設</th><th>作用</th></tr></thead>
<tbody>
<tr><td>Query interval</td><td>125 秒</td><td>querier 週期性送出 general query</td></tr>
<tr><td>Query max response time</td><td>10 秒</td><td>主機在此時間內隨機延遲回應</td></tr>
<tr><td>Last member query interval</td><td>1 秒</td><td>收到 Leave 後的確認查詢間隔；fast-leave 可略過確認立即移除</td></tr>
<tr><td>Group membership timeout</td><td>2 × query interval + max response</td><td>超過此時間沒有 report 即移除成員</td></tr>
</tbody></table>

<h2>IGMP snooping 模擬</h2>
<p>VLAN 120 有一個 mrouter port 與三台主機。讓主機加入或離開群組，再由來源送出流量，觀察哪些 port 收到封包。</p>
<div id="snoop"></div>

<h2>PIM</h2>
<table>
<thead><tr><th></th><th>PIM-SM</th><th>PIM-SSM</th></tr></thead>
<tbody>
<tr><td>樹</td><td>先建共享樹（*,G）以 RP 為根，流量開始後可切到最短路徑樹（S,G）</td><td>直接建立來源樹（S,G）</td></tr>
<tr><td>RP</td><td>需要（static、BSR 或 Auto-RP）</td><td>不需要</td></tr>
<tr><td>來源發現</td><td>來源端 DR 以 Register 訊息把封包單播封裝給 RP</td><td>接收端以 IGMPv3 指定來源</td></tr>
<tr><td>群組範圍</td><td>一般 multicast 位址</td><td>232.0.0.0/8（可用 prefix-list 調整）</td></tr>
<tr><td>訊息</td><td colspan="2">Hello（鄰居與 DR 選舉，DR priority）、Join / Prune（週期性，預設 60 秒）、Assert（同網段多台轉發者時選一台）</td></tr>
</tbody></table>
<div class="callout"><div class="ct">RPF 檢查</div><p>路由器收到 (S,G) 封包時，查詢到來源 S 的單播路由；封包必須從該路由的出介面進來才會轉發。PIM 的 Join 也沿著這個 RPF 方向往來源（或 RP）送。ASIC 以 RPF_GROUP 表示允許的入口介面集合。</p></div>

<h2>在 SONiC 中的實作</h2>
<div id="d-mc"></div>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC：IGMP snooping</span>
sonic(config)# interface Vlan120
sonic(config-if-Vlan120)# ip igmp snooping
sonic(config-if-Vlan120)# ip igmp snooping version 3
sonic(config-if-Vlan120)# ip igmp snooping querier
sonic(config-if-Vlan120)# ip igmp snooping fast-leave
sonic(config-if-Vlan120)# ip igmp snooping mrouter interface Eth1/2
sonic(config-if-Vlan120)# ip igmp snooping static-group 225.0.0.1 interface PortChannel2
sonic# show ip igmp snooping vlan 120

<span class="c"># Enterprise SONiC：L3 multicast（PIM-SSM）</span>
sonic(config)# ip pim ssm prefix-list PIM_SSM
sonic(config)# ip pim ecmp
sonic(config)# interface Eth1/1
sonic(config-if-Eth1/1)# ip pim sparse-mode
sonic(config-if-Eth1/1)# ip pim bfd
sonic(config-if-Eth1/1)# ip pim drpriority 10
sonic(config)# interface Vlan 120
sonic(config-if-Vlan120)# ip pim sparse-mode
sonic(config-if-Vlan120)# ip igmp version 3
sonic(config-if-Vlan120)# ip igmp query-interval 60
sonic# show ip igmp groups
sonic# show ip pim neighbor
sonic# show ip mroute</pre>
`,
  mount(root) {
    const host = root.querySelector('#snoop');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const PORTS = [{ p: 'Eth1/2', who: 'mrouter（上游路由器）', mr: true }, { p: 'Eth1/10', who: 'H1' }, { p: 'Eth1/11', who: 'H2' }, { p: 'Eth1/12', who: 'H3' }];
    const GROUPS = ['239.1.1.1', '239.129.1.1', '239.2.2.2'];
    let table = {}, snooping = true, fastLeave = true, lit = {}, log = [];
    const mac = g => { const o = g.split('.').map(Number); return '01:00:5e:' + [o[1] & 0x7f, o[2], o[3]].map(x => x.toString(16).padStart(2, '0')).join(':'); };
    function join(h, g) { (table[g] = table[g] || new Set()).add(h); lit = {}; log.unshift(`${PORTS.find(x => x.p === h).who} 送出 IGMP Report（${g}）→ snooping 把 ${h} 加入 ${g} 的成員清單，並把 Report 轉給 mrouter port。`); draw(); }
    function leave(h, g) {
      if (!table[g] || !table[g].has(h)) return;
      if (fastLeave) { table[g].delete(h); log.unshift(`${PORTS.find(x => x.p === h).who} 送出 Leave（${g}）→ fast-leave：立即從成員清單移除 ${h}。`); }
      else { table[g].delete(h); log.unshift(`${PORTS.find(x => x.p === h).who} 送出 Leave（${g}）→ querier 送出 group-specific query，等待 last member query interval 沒有回應後才移除 ${h}。`); }
      if (!table[g].size) delete table[g];
      lit = {}; draw();
    }
    function send(g) {
      lit = {};
      if (!snooping) { PORTS.forEach(x => (lit[x.p] = true)); log.unshift(`來源送出 ${g}（dst MAC ${mac(g)}）→ snooping 關閉：在 VLAN 內泛洪到所有 port。`); }
      else {
        const mem = table[g] ? [...table[g]] : [];
        PORTS.forEach(x => { if (x.mr || mem.includes(x.p)) lit[x.p] = true; });
        log.unshift(`來源送出 ${g}（dst MAC ${mac(g)}）→ ${mem.length ? `送往成員 ${mem.join('、')} 與 mrouter port` : '沒有成員，只送往 mrouter port'}。${GROUPS.filter(x => x !== g && mac(x) === mac(g)).length ? `注意：${GROUPS.filter(x => x !== g && mac(x) === mac(g)).join('、')} 使用相同的 MAC，但 snooping 以 IP 群組區分，不會誤送。` : ''}`);
      }
      draw();
    }
    function draw() {
      box.innerHTML = '';
      const r1 = S.el('div', { class: 'row' });
      [['Eth1/10', '239.1.1.1'], ['Eth1/11', '239.1.1.1'], ['Eth1/12', '239.2.2.2'], ['Eth1/11', '239.129.1.1']].forEach(([h, g]) => {
        const on = table[g] && table[g].has(h);
        r1.appendChild(S.el('button', { class: 'btn sm' + (on ? ' on' : ''), onclick: () => (on ? leave(h, g) : join(h, g)) }, `${PORTS.find(x => x.p === h).who} ${on ? 'leave' : 'join'} ${g}`));
      });
      box.appendChild(r1);
      const r2 = S.el('div', { class: 'row', style: 'margin-top:8px' }, S.el('span', { class: 'w-label' }, '來源送出'), ...GROUPS.map(g => S.el('button', { class: 'btn sm primary', onclick: () => send(g) }, g)),
        S.el('button', { class: 'btn sm' + (snooping ? ' on' : ''), onclick: () => { snooping = !snooping; lit = {}; draw(); } }, 'IGMP snooping'),
        S.el('button', { class: 'btn sm' + (fastLeave ? ' on' : ''), onclick: () => { fastLeave = !fastLeave; draw(); } }, 'fast-leave'),
        S.el('button', { class: 'btn sm', onclick: () => { table = {}; lit = {}; log = []; draw(); } }, '重設'));
      box.appendChild(r2);
      const g = S.el('div', { class: 'grid c3', style: 'margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))' });
      PORTS.forEach(x => g.appendChild(S.el('div', { class: 'card', style: lit[x.p] ? 'border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)' : '' },
        S.el('b', { class: 'mono' }, x.p), S.el('div', { class: 'muted', style: 'font-size:12.5px' }, x.who), S.el('div', { style: 'font-size:12.5px;margin-top:4px;color:' + (lit[x.p] ? 'var(--accent-ink)' : 'var(--faint)') }, lit[x.p] ? '收到群組流量' : '—'))));
      box.appendChild(g);
      const t = S.el('div', { class: 'tbl', style: 'margin-top:10px' });
      const rows = Object.entries(table);
      t.innerHTML = `<table><thead><tr><th>VLAN</th><th>群組</th><th>multicast MAC</th><th>成員 port</th></tr></thead><tbody>${rows.length ? rows.map(([gp, s]) => `<tr><td>120</td><td class="mono">${gp}</td><td class="mono">${mac(gp)}</td><td class="mono">${[...s].join(', ')}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">（沒有群組成員）</td></tr>'}</tbody></table>`;
      box.appendChild(t);
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html: log.length ? log.slice(0, 6).map(l => `<div>${l}</div>`).join('') : '<span class="muted">試試：H1 join 239.1.1.1 → 送出 239.1.1.1 → 送出 239.129.1.1（同一個 MAC）→ 關閉 snooping 再送一次。</span>' }));
    }
    draw();

    S.diagram(root.querySelector('#d-mc'), {
      title: 'Multicast 的控制平面與硬體表',
      w: 1000, h: 400,
      nodes: [
        { id: 'host', x: 20, y: 40, w: 170, h: 56, label: '接收端主機', sub: 'IGMP Report', kind: 'ext', info: '<p>加入群組時送出 IGMP Report。</p>' },
        { id: 'asic1', x: 250, y: 40, w: 170, h: 56, label: 'ASIC', sub: 'trap igmp / pim', kind: 'hw', info: '<p>IGMP 與 PIM 封包由 CoPP 送到 CPU。</p>' },
        { id: 'snoop', x: 480, y: 40, w: 200, h: 56, label: 'IGMP snooping', sub: 'L2 成員表', kind: 'proc', info: '<p>依 Report / Leave 建立 (VLAN, G) 或 (VLAN, S, G) → port 清單，交給 orchagent 建立 L2MC 項目。</p>' },
        { id: 'pimd', x: 480, y: 160, w: 200, h: 56, label: 'pimd（FRR）', sub: 'IGMP querier + PIM', kind: 'proc', info: '<p>在 L3 介面上處理 IGMP，並與鄰居交換 PIM Join / Prune，決定 (S,G) 的入口（RPF）與出口介面清單（OIL）。</p>' },
        { id: 'peer', x: 760, y: 160, w: 200, h: 56, label: 'PIM 鄰居', sub: '往來源方向', kind: 'ext', info: '<p>Join 沿 RPF 方向送往來源或 RP。</p>' },
        { id: 'appl', x: 480, y: 290, w: 200, h: 56, label: 'APPL_DB', sub: 'L2MC / IPMC route', kind: 'db', info: '<p>multicast 路由：(VRF, S, G) → RPF 介面、OIL。</p>' },
        { id: 'orch', x: 250, y: 290, w: 170, h: 56, label: 'orchagent', sub: 'L2MC / IPMC Orch', kind: 'proc', info: '<p>建立 IPMC_ENTRY（key 為 VR、S、G），指向 RPF_GROUP（允許的入口）與 IPMC_GROUP（出口 RIF 集合）；L2 則建立 L2MC_ENTRY 與 L2MC_GROUP。</p>' },
        { id: 'asic2', x: 20, y: 290, w: 170, h: 56, label: 'ASIC 複製', sub: 'IPMC / L2MC 表', kind: 'hw', info: '<p>硬體依群組表複製封包到各出口，每個出口可能還需要 L2 層再複製到 VLAN 成員。</p>' },
      ],
      edges: [
        { from: 'host', to: 'asic1', id: 'e1' }, { from: 'asic1', to: 'snoop', label: 'trap', id: 'e2' },
        { from: 'asic1', to: 'pimd', label: 'L3 介面', id: 'e3', via: [[335, 188]] },
        { from: 'pimd', to: 'peer', bi: true, label: 'Join / Prune', id: 'e4' },
        { from: 'snoop', to: 'appl', id: 'e5', via: [[700, 68], [720, 318]] },
        { from: 'pimd', to: 'appl', id: 'e6' },
        { from: 'appl', to: 'orch', id: 'e7' }, { from: 'orch', to: 'asic2', label: 'SAI', id: 'e8' },
      ],
      steps: [
        { title: '主機加入', text: '主機送出 IGMP Report，ASIC trap 到 CPU。', nodes: ['host', 'asic1'], edges: ['e1'] },
        { title: 'L2 snooping', text: 'snooping 記錄成員 port，建立 L2MC 項目，讓 VLAN 內只有成員收到流量。', nodes: ['asic1', 'snoop', 'appl'], edges: ['e2', 'e5'] },
        { title: 'L3：PIM Join', text: '若閘道啟用 PIM，pimd 把 VLAN 介面加入 OIL，並向來源方向送出 (S,G) Join。', nodes: ['asic1', 'pimd', 'peer'], edges: ['e3', 'e4'] },
        { title: '硬體複製表', text: 'multicast 路由寫入 APPL_DB，orchagent 建立 IPMC_ENTRY、RPF_GROUP、IPMC_GROUP，ASIC 開始複製轉發。', nodes: ['pimd', 'appl', 'orch', 'asic2'], edges: ['e6', 'e7', 'e8'] },
      ],
    });
  },
  related: ['vlan', 'copp', 'vxlan', 'protection'],
  refs: [['RFC 3376 IGMPv3', 'https://www.rfc-editor.org/rfc/rfc3376'], ['RFC 4541 IGMP snooping considerations', 'https://www.rfc-editor.org/rfc/rfc4541'], ['FRR PIM 文件', 'https://docs.frrouting.org/en/latest/pim.html'], ['Enterprise SONiC User Guide UG460：Ch.12', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
