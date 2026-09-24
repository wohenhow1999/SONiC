S.register({
  id: 'roce',
  category: 'dc',
  order: 4,
  title: 'RoCE 與無損乙太網路',
  en: 'RDMA over Converged Ethernet',
  summary: 'RoCEv2 讓 RDMA 流量跑在 UDP/IP 上，對封包遺失非常敏感。交換機以 PFC 在緩衝區將滿時暫停上游、以 ECN 標記提早通知端點降速（DCQCN），並以 PFC watchdog 防止死結。本章說明這些機制如何在 SONiC 的 QoS / buffer 設定中落實。',
  meta: [
    ['相關表', ['PORT_QOS_MAP (pfc_enable)', 'WRED_PROFILE (ecn)', 'BUFFER_PG / BUFFER_PROFILE (lossless)', 'PFC_WD', 'SCHEDULER']],
    ['協定', ['RoCEv2：UDP 4791', 'PFC 802.1Qbb', 'ETS 802.1Qaz', 'DCBX', 'ECN (RFC 3168)', 'DCQCN']],
    ['Enterprise', ['roce enable', 'roce enable force-defaults', 'show qos interface <if>']],
    ['檢查指令', ['show pfc counters', 'show queue counters', 'show priority-group watermark', 'pfcwd show stats', 'show interfaces counters errors']],
  ],
  tags: ['RoCE', 'RoCEv2', 'RDMA', 'lossless', 'PFC', 'ECN', 'DCQCN', 'CNP', 'ETS', 'DCBX', 'AI fabric', 'headroom'],
  keypoints: [
    'RoCEv2 封包為 Ethernet / IP / UDP（dport 4791）/ InfiniBand BTH；以 DSCP（常見 26 或 24）分類到 lossless TC（常見 3）。',
    'ECN 是第一道防線：佇列超過 WRED Kmin 開始以機率標記 CE，接收端 NIC 回送 CNP，發送端 NIC 依 DCQCN 降速。',
    'PFC 是最後防線：PG 使用量超過 xoff 時送出 PAUSE，確保不丟包；PFC 觸發頻繁代表 ECN 門檻或速率控制不當。',
    'lossless PG 需要 headroom 吸收 PAUSE 生效前的在途資料，headroom 取決於速率、線長與 MTU。',
    'Enterprise SONiC 的 roce enable 一次套用預設的 lossless buffer、DSCP / TC 對應、WRED / ECN 與排程設定。',
  ],
  html: `
<h2>RoCEv2 封包與分類</h2>
<div id="hdr"></div>
<table>
<thead><tr><th>項目</th><th>常見設定</th><th>說明</th></tr></thead>
<tbody>
<tr><td>RDMA 資料</td><td>DSCP 26 → TC 3 → Queue 3，PFC 優先權 3</td><td>lossless</td></tr>
<tr><td>CNP（擁塞通知）</td><td>DSCP 48 → 高優先權佇列（strict priority）</td><td>必須快速送達發送端</td></tr>
<tr><td>其他流量</td><td>TC 0 / 1</td><td>lossy，與 RDMA 以 ETS / DWRR 分享頻寬</td></tr>
</tbody></table>

<h2>ECN 與 PFC 的門檻</h2>
<p>拖動 lossless 佇列的使用量，觀察 WRED / ECN 的標記機率與 PFC 何時觸發。（數值為示意，實際依晶片與範本而定。）</p>
<div id="thr"></div>

<h2>DCQCN 控制迴路</h2>
<div id="d-dcqcn"></div>

<h2>在 SONiC 中需要的設定</h2>
<table>
<thead><tr><th>元件</th><th>設定</th><th>章節</th></tr></thead>
<tbody>
<tr><td>分類</td><td><code>DSCP_TO_TC_MAP</code>、<code>TC_TO_QUEUE_MAP</code>、<code>TC_TO_PRIORITY_GROUP_MAP</code></td><td>QoS 與 Buffer</td></tr>
<tr><td>PFC</td><td><code>PORT_QOS_MAP|Ethernet0 pfc_enable: "3,4"</code>、<code>pfc_to_queue_map</code></td><td>QoS 與 Buffer</td></tr>
<tr><td>lossless buffer</td><td><code>BUFFER_PG|Ethernet0|3-4 profile: pg_lossless_…</code>（xon / xoff / headroom）</td><td>QoS 與 Buffer</td></tr>
<tr><td>ECN</td><td><code>WRED_PROFILE|AZURE_LOSSLESS ecn: ecn_all</code>、green min / max / probability；<code>QUEUE|Ethernet0|3 wred_profile</code></td><td>QoS 與 Buffer</td></tr>
<tr><td>排程</td><td>CNP 佇列 strict，RDMA 與其他佇列 DWRR 權重</td><td>QoS 與 Buffer</td></tr>
<tr><td>保護</td><td>PFC watchdog（drop / forward），偵測時間 200 ms 級</td><td>QoS 與 Buffer</td></tr>
<tr><td>雜湊</td><td>RoCE 流量數少、頻寬大，ECMP / LAG 雜湊應納入 UDP source port 或 RoCE QP 相關欄位</td><td>路由架構</td></tr>
</tbody></table>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# roce enable                      <span class="c"># 套用預設 RoCE 設定（需重新載入）</span>
sonic(config)# roce enable force-defaults       <span class="c"># 覆寫現有 QoS 設定為預設值</span>
sonic# show qos interface Eth1/1
sonic# show pfc counters
<span class="c"># 社群版：依 hwsku 的 qos.json.j2 / buffers.json.j2 產生，常見調整</span>
sudo config qos reload
sudo ecnconfig -p AZURE_LOSSLESS -gmin 250000 -gmax 1000000 -gdrop 5
sudo pfcwd start --action drop ports all detection-time 200 --restoration-time 200
show pfc counters
show queue counters Ethernet0</pre>
<div class="callout warn"><div class="ct">常見問題</div><p>PFC PAUSE 頻繁但幾乎沒有 ECN 標記：ECN 門檻太高或 NIC 未啟用 DCQCN。PFC storm：下游 NIC 故障持續送 PAUSE，由 PFC watchdog 處置。lossless 仍有丟包：headroom 不足（線長設定錯誤）或流量未被分類到 lossless TC。</p></div>
`,
  mount(root) {
    const H = [['Ethernet', '14 B', 'var(--k-kernel)', 1], ['IPv4', '20 B · DSCP 26 · ECN', 'var(--k-container)', 1.4], ['UDP', '8 B · dport 4791', 'var(--k-container)', .9], ['IB BTH', '12 B · opcode · QP · PSN', 'var(--k-db)', 1.3], ['RDMA payload', '', 'var(--k-proc)', 1.6], ['ICRC', '4 B', 'var(--k-db)', .6]];
    root.querySelector('#hdr').innerHTML = `<div class="hdr">${H.map(([a, b, c, w]) => `<div style="--hc:${c};--hw:${w}"><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;

    const host = root.querySelector('#thr');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const KMIN = 250, KMAX = 1000, PMAX = 5, XOFF = 1600, MAX = 2000;
    const sl = S.el('input', { type: 'range', min: 0, max: MAX, value: 400, id: 'roce-q', style: 'width:100%' });
    const out = S.el('div');
    box.appendChild(S.el('label', { class: 'field', for: 'roce-q' }, 'Lossless 佇列 / PG 使用量（KB）', sl));
    box.appendChild(out);
    function draw() {
      const q = +sl.value;
      const p = q < KMIN ? 0 : q >= KMAX ? 100 : Math.round(((q - KMIN) / (KMAX - KMIN)) * PMAX * 10) / 10;
      const pfc = q >= XOFF;
      const pct = v => (v / MAX * 100).toFixed(1) + '%';
      out.innerHTML = `
        <div style="position:relative;height:34px;margin:14px 0 26px;background:var(--sunken);border-radius:4px">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${pct(q)};background:${pfc ? 'var(--bad)' : q >= KMIN ? 'var(--warn)' : 'var(--accent)'};opacity:.75;border-radius:4px;transition:width .2s"></div>
          ${[[KMIN, 'Kmin'], [KMAX, 'Kmax'], [XOFF, 'xoff']].map(([v, l]) => `<div style="position:absolute;left:${pct(v)};top:-4px;bottom:-4px;border-left:2px dashed var(--text-2)"></div><div class="mono" style="position:absolute;left:${pct(v)};top:38px;transform:translateX(-50%);font-size:11px;color:var(--muted)">${l} ${v}KB</div>`).join('')}
        </div>
        <div class="pipe">
          <div><div class="pl">佇列使用量</div><div class="pv">${q} KB</div></div>
          <div><div class="pl">ECN 標記機率</div><div class="pv">${p}%</div><div class="ps">${q < KMIN ? '低於 Kmin，不標記' : q >= KMAX ? '超過 Kmax，全部標記' : '線性增加到 Pmax ' + PMAX + '%'}</div></div>
          <div><div class="pl">PFC</div><div class="pv" style="color:${pfc ? 'var(--bad)' : 'inherit'}">${pfc ? 'PAUSE' : 'no pause'}</div><div class="ps">${pfc ? '向上游送出 priority 3 PAUSE' : '低於 xoff'}</div></div>
          <div><div class="pl">端點行為</div><div class="pv" style="font-size:13px">${q < KMIN ? '全速' : pfc ? '被暫停 + 降速' : '收到 CNP，降速'}</div></div>
        </div>
        <div class="log">${q < KMIN ? '佇列很淺，沒有擁塞。' : pfc ? 'ECN 未能及時讓發送端降速，緩衝區到達 xoff，交換機送出 PFC PAUSE。PAUSE 會向上游擴散，可能造成 head-of-line blocking；正常情況應盡量由 ECN 處理擁塞，讓 PFC 很少觸發。' : `佇列介於 Kmin 與 ${q >= KMAX ? '以上' : 'Kmax 之間'}，WRED 以 ${p}% 的機率把 ECN 欄位設為 CE。接收端 NIC 看到 CE 後回送 CNP，發送端 NIC 依 DCQCN 降低該 QP 的速率。`}</div>`;
    }
    sl.addEventListener('input', draw);
    draw();

    S.diagram(root.querySelector('#d-dcqcn'), {
      title: 'DCQCN：交換機標記、接收端通知、發送端降速',
      w: 1000, h: 300,
      nodes: [
        { id: 'rp', x: 20, y: 110, w: 190, h: 70, label: '發送端 NIC', sub: 'Reaction Point', kind: 'ext', info: '<p>收到 CNP 後依 DCQCN 演算法降低該 QP 的傳送速率，之後逐步回升。</p>' },
        { id: 'sw', x: 300, y: 110, w: 200, h: 70, label: '交換機', sub: 'Congestion Point', kind: 'hw', info: '<p>lossless 佇列超過 Kmin 時依 WRED 機率把 IP ECN 欄位設為 CE（11）；超過 xoff 時送出 PFC。</p>' },
        { id: 'np', x: 590, y: 110, w: 190, h: 70, label: '接收端 NIC', sub: 'Notification Point', kind: 'ext', info: '<p>收到 CE 標記的封包後，送出 CNP（RoCEv2 opcode 0x81）給發送端。</p>' },
        { id: 'pfc', x: 300, y: 220, w: 200, h: 56, label: 'PFC PAUSE', sub: '最後防線', kind: 'hw', info: '<p>只在緩衝區將滿時觸發。</p>' },
      ],
      edges: [
        { from: 'rp', to: 'sw', label: 'RDMA 資料', id: 'e1' },
        { from: 'sw', to: 'np', label: 'CE 標記', id: 'e2' },
        { from: 'np', to: 'rp', label: 'CNP（高優先權）', dash: true, id: 'e3', via: [[685, 50], [115, 50]] },
        { from: 'sw', to: 'pfc', id: 'e4' },
        { from: 'pfc', to: 'rp', dash: true, label: 'PAUSE', id: 'e5', via: [[115, 248]] },
      ],
      steps: [
        { title: '資料送出', text: '發送端以線速送出 RDMA 流量，被分類到 lossless 佇列。', nodes: ['rp', 'sw'], edges: ['e1'] },
        { title: '擁塞標記', text: '佇列開始累積，交換機以 ECN 標記 CE。', nodes: ['sw', 'np'], edges: ['e2'] },
        { title: '通知發送端', text: '接收端 NIC 回送 CNP，交換機以高優先權佇列轉送。', nodes: ['np', 'rp'], edges: ['e3'] },
        { title: '降速或暫停', text: '發送端降速；若仍不足以緩解，緩衝區到達 xoff，交換機送出 PFC PAUSE 暫停上游。', nodes: ['sw', 'pfc', 'rp'], edges: ['e4', 'e5'] },
      ],
    });
  },
  related: ['qos', 'counters', 'design', 'troubleshooting', 'ecmp'],
  refs: [['Congestion Control for Large-Scale RDMA Deployments（DCQCN, SIGCOMM 2015）', 'https://conferences.sigcomm.org/sigcomm/2015/pdf/papers/p523.pdf'], ['IEEE 802.1Qbb PFC', 'https://standards.ieee.org/ieee/802.1Qbb/4361/'], ['Enterprise SONiC User Guide UG460：Ch.17、§16.2、§16.8–16.10、§27.5', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
