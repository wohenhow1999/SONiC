S.register({
  id: 'ptp',
  category: 'ops',
  order: 10,
  title: 'PTP 與 SyncE 時間同步',
  en: 'Precision Time Protocol (IEEE 1588) & Synchronous Ethernet',
  summary: 'NTP 的精度約在毫秒級，5G 前傳、金融交易、工業控制與分散式量測需要次微秒的時間與頻率同步。PTP 以硬體時間戳記交換 Sync / Delay_Req 訊息計算時間偏移，並以 BMCA 自動選出最佳時鐘；SyncE 則以實體層的位元時脈傳遞頻率。Enterprise SONiC 支援 boundary clock 與 end-to-end transparent clock，以及 G.8275.1 / G.8275.2 電信 profile。',
  meta: [
    ['時鐘類型', ['Grandmaster（GM）', 'Boundary Clock（BC）', 'Transparent Clock（E2E TC）', 'Ordinary Clock（OC）']],
    ['Profile', ['Default（IEEE 1588）', 'ITU-T G.8275.1（L2 multicast，全程支援）', 'ITU-T G.8275.2（IPv4 unicast，部分支援）']],
    ['傳輸', ['L2（EtherType 0x88F7）', 'UDP 319（event）/ 320（general）']],
    ['相關', ['SyncE：ITU-T G.8261 / G.8262 / G.8264（ESMC）', '硬體時間戳記', 'one-step / two-step']],
  ],
  tags: ['PTP', 'IEEE 1588', 'grandmaster', 'boundary clock', 'transparent clock', 'BMCA', 'G.8275.1', 'G.8275.2', 'SyncE', 'ESMC', 'QL', 'timestamp', 'offset', 'path delay', 'asymmetry', 'two-step'],
  keypoints: [
    'PTP 以四個時間戳記計算：offset = ((t2 − t1) − (t4 − t3)) / 2，mean path delay = ((t2 − t1) + (t4 − t3)) / 2。',
    '公式假設來回路徑延遲相同；路徑不對稱時，誤差為不對稱量的一半，且無法由協定本身偵測。',
    '精度取決於時間戳記的位置：在 PHY / MAC 以硬體標記可避開軟體與佇列的延遲變動，這也是交換機需要硬體支援的原因。',
    'Boundary clock 在每一跳終止 PTP 並重新產生，上游是 slave、下游是 master；transparent clock 不終止，而是把封包在交換機內停留的時間累加到 correctionField。',
    'SyncE 只傳遞頻率不傳遞時間，但能讓 PTP 伺服迴路更穩定；兩者合用稱為 hybrid 模式。',
  ],
  html: `
<h2>架構</h2>
<div id="d-ptp"></div>

<h2>偏移與路徑延遲</h2>
<p>調整 slave 的實際時間偏移與兩個方向的鏈路延遲，觀察四個時間戳記與計算結果。當兩個方向延遲不同時，計算出的 offset 會出現誤差。</p>
<div id="calc"></div>

<h2>BMCA：選出最佳時鐘</h2>
<p>每個 port 比較收到的 Announce 訊息，依下列順序逐項比較，數值小者優先，第一個分出高下的欄位決定結果。</p>
<div id="bmca"></div>

<h2>Profile 比較</h2>
<table>
<thead><tr><th>項目</th><th>Default（1588）</th><th>G.8275.1</th><th>G.8275.2</th></tr></thead>
<tbody>
<tr><td>傳輸</td><td>L2 或 UDP</td><td>L2 multicast</td><td>IPv4 / IPv6 unicast</td></tr>
<tr><td>網路支援</td><td>任意</td><td>每一跳都必須是 BC 或 TC（full on-path support）</td><td>允許中間經過不支援 PTP 的設備（partial support）</td></tr>
<tr><td>Domain</td><td>0</td><td>24–43</td><td>44–63</td></tr>
<tr><td>BMCA</td><td>標準 BMCA</td><td>Alternate BMCA，加入 localPriority</td><td>Alternate BMCA，加入 localPriority</td></tr>
<tr><td>典型用途</td><td>企業、資料中心</td><td>電信前傳、新建網路</td><td>既有 IP 網路上疊加時間同步</td></tr>
</tbody></table>

<h2>SyncE</h2>
<table>
<thead><tr><th>項目</th><th>說明</th></tr></thead>
<tbody>
<tr><td>原理</td><td>接收端從上游鏈路的位元流中回復時脈，並以此驅動本機所有發送 port，使整個網路的頻率一致</td></tr>
<tr><td>ESMC</td><td>Ethernet Synchronization Messaging Channel（slow protocol），攜帶 Quality Level（QL），讓下游選擇品質最好的頻率來源並避免迴圈</td></tr>
<tr><td>QL-enabled / disabled</td><td>enabled 依 ESMC 的 QL 選擇來源；disabled 依設定的優先順序</td></tr>
<tr><td>Hybrid</td><td>SyncE 提供頻率、PTP 提供相位與時間，常見於 G.8275.1 部署</td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC：boundary clock，G.8275.1</span>
sonic(config)# ptp mode boundary-clock
sonic(config)# ptp domain-profile g8275.1
sonic(config)# ptp domain 24
sonic(config)# ptp network-transport l2 multicast
sonic(config)# ptp priority2 128
sonic(config)# ptp port add Eth1/1
sonic(config)# ptp port add Eth1/2
sonic(config)# ptp port add Eth1/1 local-priority 100
sonic(config)# ptp two-step enable
sonic# show ptp
sonic# show ptp clock
sonic# show ptp parent
sonic# show ptp servo

<span class="c"># Enterprise SONiC：G.8275.2 以 IPv4 unicast</span>
sonic(config)# ptp domain-profile g8275.2
sonic(config)# ptp domain 44
sonic(config)# ptp source-interface Loopback 0
sonic(config)# ptp port master-table Eth1/1 add 10.10.10.2</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-ptp'), {
      title: 'PTP 時鐘階層',
      w: 1000, h: 300,
      nodes: [
        { id: 'gnss', x: 20, y: 40, w: 130, h: 56, label: 'GNSS', sub: 'GPS · Galileo', kind: 'ext', info: '<p>提供 UTC 與 1PPS 的參考來源。</p>' },
        { id: 'gm', x: 240, y: 40, w: 160, h: 56, label: 'Grandmaster', sub: 'clockClass 6', kind: 'ext', info: '<p>鎖定 GNSS 時為 clockClass 6；失去參考時降級並在 Announce 中公告。</p>' },
        { id: 'bc1', x: 500, y: 40, w: 170, h: 56, label: 'Spine · BC', sub: 'slave ← | → master', kind: 'hw', info: '<p>Boundary clock：上游 port 為 slave，同步本機時鐘；下游 port 為 master，重新產生 Sync。每一跳只承受一段鏈路的誤差。</p>' },
        { id: 'bc2', x: 780, y: 40, w: 190, h: 56, label: 'Leaf · BC', sub: '→ 下游 OC', kind: 'hw' },
        { id: 'tc', x: 500, y: 210, w: 170, h: 56, label: 'Leaf · E2E TC', sub: 'correctionField', kind: 'hw', info: '<p>Transparent clock 不參與 BMCA，只量測 PTP 封包在交換機內的停留時間，累加到 correctionField。</p>' },
        { id: 'ru', x: 780, y: 210, w: 190, h: 56, label: 'Slave OC', sub: '5G RU · 伺服器 NIC', kind: 'ext', info: '<p>Ordinary clock（slave only），例如 5G 無線單元或具 PTP 硬體時間戳記的伺服器網卡。</p>' },
      ],
      edges: [
        { from: 'gnss', to: 'gm', label: '1PPS · ToD', id: 'e0' },
        { from: 'gm', to: 'bc1', label: 'Sync\nFollow_Up', id: 'e1', bi: true },
        { from: 'bc1', to: 'bc2', label: 'Sync', id: 'e2', bi: true },
        { from: 'bc1', to: 'tc', label: 'Sync ↓ · Delay_Req ↑', id: 'e3', bi: true },
        { from: 'tc', to: 'ru', label: '+ 停留時間', id: 'e4', bi: true },
      ],
      steps: [
        { title: '參考來源', text: 'Grandmaster 由 GNSS 取得 UTC，並在 Announce 中公告自己的時鐘品質。', nodes: ['gnss', 'gm'], edges: ['e0'] },
        { title: 'Boundary clock', text: 'Spine 的上游 port 經 BMCA 成為 slave，同步到 GM；下游 port 成為 master，重新送出 Sync。', nodes: ['gm', 'bc1', 'bc2'], edges: ['e1', 'e2'] },
        { title: 'Transparent clock', text: 'E2E TC 不終止 PTP，而是把 Sync 與 Delay_Req 在交換機內停留的時間寫入 correctionField，讓 slave 扣除排隊造成的變動。', nodes: ['bc1', 'tc', 'ru'], edges: ['e3', 'e4'] },
      ],
    });

    // ---------- 偏移計算 ----------
    const host = root.querySelector('#calc');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { off: 1500, dms: 800, dsm: 800 };
    const F = [['off', 'slave 實際偏移 (ns)'], ['dms', 'master → slave 延遲 (ns)'], ['dsm', 'slave → master 延遲 (ns)']];
    const g = S.el('div', { class: 'grid c3' });
    F.forEach(([k, l]) => { const inp = S.el('input', { type: 'number', value: P[k] }); inp.addEventListener('input', () => { P[k] = +inp.value || 0; draw(); }); g.appendChild(S.el('label', { class: 'field' }, l, inp)); });
    box.appendChild(g);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);
    function draw() {
      const t1 = 1000000, t2 = t1 + P.dms + P.off, t3 = t2 + 20000, t4 = t3 - P.off + P.dsm;
      const off = ((t2 - t1) - (t4 - t3)) / 2, mpd = ((t2 - t1) + (t4 - t3)) / 2, err = off - P.off;
      const X1 = 120, X2 = 600, y = t => 40 + (t - t1) / 25000 * 180;
      const svg = `<svg viewBox="0 0 720 250" style="width:100%;min-width:520px;display:block">
        <text x="${X1}" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Master</text>
        <text x="${X2}" y="22" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Slave</text>
        <line x1="${X1}" y1="30" x2="${X1}" y2="235" stroke="var(--border-strong)"/><line x1="${X2}" y1="30" x2="${X2}" y2="235" stroke="var(--border-strong)"/>
        <line x1="${X1}" y1="${y(t1)}" x2="${X2}" y2="${y(t1 + P.dms)}" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#pt-a)"/>
        <text x="${(X1 + X2) / 2}" y="${(y(t1) + y(t1 + P.dms)) / 2 - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">Sync（two-step 時再送 Follow_Up 帶 t1）</text>
        <line x1="${X2}" y1="${y(t3 - P.off)}" x2="${X1}" y2="${y(t3 - P.off + P.dsm)}" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#pt-a)"/>
        <text x="${(X1 + X2) / 2}" y="${(y(t3 - P.off) + y(t3 - P.off + P.dsm)) / 2 - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">Delay_Req → Delay_Resp 回傳 t4</text>
        <text x="${X1 - 8}" y="${y(t1) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)" fill="var(--text)">t1</text>
        <text x="${X2 + 8}" y="${y(t1 + P.dms) + 4}" font-size="11" font-family="var(--mono)" fill="var(--text)">t2</text>
        <text x="${X2 + 8}" y="${y(t3 - P.off) + 4}" font-size="11" font-family="var(--mono)" fill="var(--text)">t3</text>
        <text x="${X1 - 8}" y="${y(t3 - P.off + P.dsm) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)" fill="var(--text)">t4</text>
        <defs><marker id="pt-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs></svg>`;
      out.innerHTML = `<div class="dg-canvas" style="border:1px solid var(--border);border-radius:6px">${svg}</div>
        <div class="pipe"><div><div class="pl">t1（master 送出）</div><div class="pv mono" style="font-size:13px">${t1}</div></div><div><div class="pl">t2（slave 收到）</div><div class="pv mono" style="font-size:13px">${t2}</div></div><div><div class="pl">t3（slave 送出）</div><div class="pv mono" style="font-size:13px">${t3}</div></div><div><div class="pl">t4（master 收到）</div><div class="pv mono" style="font-size:13px">${t4}</div></div></div>
        <div class="pipe"><div><div class="pl">計算 offset</div><div class="pv">${off} ns</div></div><div><div class="pl">mean path delay</div><div class="pv">${mpd} ns</div></div><div><div class="pl">誤差</div><div class="pv" style="color:${err ? 'var(--bad)' : 'var(--good)'}">${err > 0 ? '+' : ''}${err} ns</div><div class="ps">= (d<sub>ms</sub> − d<sub>sm</sub>) / 2</div></div></div>
        <div class="log">${err ? `兩個方向相差 ${Math.abs(P.dms - P.dsm)} ns，協定無法察覺，offset 被算錯 ${Math.abs(err)} ns。光纖長度不同、光模組或 PHY 的收發延遲不同，都會造成不對稱，需要以量測值補償。` : '來回延遲相同，計算出的 offset 等於實際偏移。slave 會把自己的時鐘調整這個量。'}</div>`;
    }
    draw();

    // ---------- BMCA ----------
    const bh = root.querySelector('#bmca');
    const bbox = S.el('div', { class: 'w-box' });
    bh.appendChild(bbox);
    const FIELDS = [['priority1', 'p1'], ['clockClass', 'cc'], ['clockAccuracy', 'ca'], ['offsetScaledLogVariance', 'var'], ['priority2', 'p2'], ['clockIdentity', 'id']];
    const C = [
      { n: 'GM-A（GNSS 鎖定）', p1: 128, cc: 6, ca: 0x21, var: 0x4e5d, p2: 128, id: '00:1b:21:ff:fe:00:00:0a' },
      { n: 'GM-B（備援）', p1: 128, cc: 6, ca: 0x21, var: 0x4e5d, p2: 129, id: '00:1b:21:ff:fe:00:00:0b' },
      { n: 'BC 自身（holdover）', p1: 128, cc: 165, ca: 0xfe, var: 0xffff, p2: 128, id: '3c:2c:30:ff:fe:12:34:56' },
    ];
    function bdraw() {
      bbox.innerHTML = '';
      const t = S.el('table');
      t.innerHTML = `<thead><tr><th>欄位</th>${C.map(c => `<th>${c.n}</th>`).join('')}</tr></thead>`;
      const tb = S.el('tbody');
      FIELDS.forEach(([label, k]) => {
        const tr = S.el('tr', {}, S.el('td', {}, label));
        C.forEach(c => {
          if (k === 'id') { tr.appendChild(S.el('td', { html: `<code style="font-size:11px">${c.id}</code>` })); return; }
          const inp = S.el('input', { type: 'number', value: c[k], style: 'width:90px' });
          inp.addEventListener('input', () => { c[k] = +inp.value || 0; res(); });
          tr.appendChild(S.el('td', {}, inp));
        });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      bbox.appendChild(S.el('div', { class: 'tbl' }, t));
      const ro = S.el('div', { style: 'margin-top:10px' });
      bbox.appendChild(ro);
      function res() {
        let cand = C.slice();
        const log = [];
        for (const [label, k] of FIELDS) {
          const vals = cand.map(c => c[k]);
          const best = k === 'id' ? vals.slice().sort()[0] : Math.min(...vals);
          const next = cand.filter(c => c[k] === best);
          if (next.length < cand.length) log.push(`${label}：${cand.map(c => `${c.n.split('（')[0]}=${k === 'id' ? c.id.slice(-5) : c[k]}`).join('、')} → 保留 ${next.map(c => c.n.split('（')[0]).join('、')}`);
          cand = next;
          if (cand.length === 1) break;
        }
        ro.innerHTML = `<div class="row" style="margin-bottom:8px"><span class="w-label">最佳時鐘</span><span class="badge g">${cand[0].n}</span></div><div class="log">${log.map(l => `<div>${l}</div>`).join('') || '<div>所有欄位相同</div>'}</div>
          <div class="muted" style="font-size:12.5px;margin-top:8px">clockClass 6 表示鎖定主要參考來源、165 表示可追溯性不明的 holdover、248 為預設。G.8275.x 的 alternate BMCA 另外在 priority2 之後比較 localPriority。</div>`;
      }
      res();
    }
    bdraw();
  },
  searchText: 'Sync Follow_Up Delay_Req Delay_Resp Announce correctionField clockClass clockAccuracy offsetScaledLogVariance priority1 priority2 localPriority ptp mode boundary-clock end-to-end-transport-clock domain-profile g8275.1 g8275.2 ESMC QL SyncE holdover',
  related: ['sys-services', 'design', 'roce'],
  refs: [['IEEE 1588-2019', 'https://standards.ieee.org/ieee/1588/6825/'], ['ITU-T G.8275.1', 'https://www.itu.int/rec/T-REC-G.8275.1'], ['ITU-T G.8275.2', 'https://www.itu.int/rec/T-REC-G.8275.2'], ['Enterprise SONiC User Guide UG460：§5.18–5.19', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
