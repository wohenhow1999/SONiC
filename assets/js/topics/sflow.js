S.register({
  id: 'sflow',
  category: 'ops',
  order: 5,
  title: 'sFlow',
  en: 'sFlow Traffic Sampling',
  summary: 'sFlow 以 1/N 的機率在 ASIC 中取樣封包標頭，並定期送出介面計數器，讓收集器以極低成本估算整體流量組成。SONiC 由 SflowOrch 設定 SAI SAMPLEPACKET，取樣封包經 psample 送到 sflow 容器中的 hsflowd，再以 UDP 6343 送往收集器。',
  meta: [
    ['容器', ['sflow']],
    ['程序', ['hsflowd', 'sflowmgrd (swss)', 'orchagent (SflowOrch)']],
    ['CONFIG_DB', ['SFLOW|global', 'SFLOW_COLLECTOR', 'SFLOW_SESSION']],
    ['APPL_DB', ['SFLOW_TABLE', 'SFLOW_SESSION_TABLE']],
    ['SAI', ['SAMPLEPACKET', 'PORT_ATTR_INGRESS_SAMPLEPACKET_ENABLE', 'HOSTIF trap sample_packet（genetlink psample）']],
    ['協定', ['sFlow v5', 'UDP 6343']],
  ],
  tags: ['sFlow', 'sampling', 'hsflowd', 'psample', 'flow monitoring', 'collector', 'telemetry'],
  keypoints: [
    '取樣在 ASIC 中進行，只有被取樣的封包標頭（預設最多 128 bytes）送到 CPU，因此對轉發效能沒有影響。',
    'SONiC 依 port 速率設定預設取樣率：每 N 個封包取 1 個，N 等於速率的 Mbps 數，例如 100G 為 1/100000、400G 為 1/400000。',
    '取樣封包經 CoPP 的 sample_packet trap（queue2_group1，預設 1000 pps 上限）與 genetlink psample 送給 hsflowd。',
    '估算精度取決於取樣數：95% 信賴區間的相對誤差約為 196 / √c（%），c 為該類流量的取樣數。',
    'counter sample 由 hsflowd 定期從 COUNTERS_DB 讀取介面計數器並一併送出。',
  ],
  html: `
<h2>架構</h2>
<div id="d-sflow"></div>

<h2>取樣量與精度估算</h2>
<p>輸入 port 速率、使用率與平均封包大小，計算取樣產生的速率、送往 CPU 的負載，以及某一類流量在一段時間後的估算誤差。</p>
<div id="est"></div>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config feature state sflow enabled
sudo config sflow enable
sudo config sflow collector add c1 10.100.0.10 --port 6343 --vrf mgmt
sudo config sflow agent-id add Loopback0
sudo config sflow polling-interval 20
sudo config sflow interface sample-rate Ethernet0 10000
show sflow
show sflow interface

<span class="c"># Enterprise SONiC</span>
sonic(config)# sflow enable
sonic(config)# sflow collector 10.100.0.10 6343 vrf mgmt
sonic(config)# sflow agent-id Eth1/2
sonic(config)# sflow polling-interval 20
sonic(config)# sflow max-header-size 256
sonic(config)# interface Eth1/2
sonic(config-if-Eth1/2)# sflow sampling-rate 10000
sonic# show sflow</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-sflow'), {
      title: 'sFlow 資料路徑',
      w: 1000, h: 330,
      groups: [{ x: 500, y: 150, w: 260, h: 160, label: 'sflow 容器' }],
      nodes: [
        { id: 'cfg', x: 20, y: 40, w: 180, h: 56, label: 'CONFIG_DB', sub: 'SFLOW / SESSION / COLLECTOR', kind: 'db', info: '<p>全域開關、收集器、每個介面的取樣率。</p>' },
        { id: 'mgr', x: 250, y: 40, w: 180, h: 56, label: 'sflowmgrd', sub: '(swss)', kind: 'proc', info: '<p>依 port 速率補上預設取樣率，寫入 APPL_DB SFLOW_SESSION_TABLE。</p>' },
        { id: 'orch', x: 480, y: 40, w: 180, h: 56, label: 'SflowOrch', kind: 'proc', info: '<p>建立 SAI SAMPLEPACKET（sample rate），並設定到 port 的 ingress samplepacket 屬性；相同取樣率的 port 共用一個物件。</p>' },
        { id: 'asic', x: 720, y: 40, w: 240, h: 56, label: 'ASIC', sub: '1/N 取樣 → trap sample_packet', kind: 'hw', info: '<p>被取樣的封包複製一份（截斷）送到 CPU，原封包照常轉發。</p>' },
        { id: 'ps', x: 250, y: 190, w: 180, h: 56, label: 'psample', sub: 'genetlink（kernel）', kind: 'kernel', info: '<p>廠商驅動把取樣封包與 metadata（入口 port、取樣率）以 genetlink psample 群組送到 user space。</p>' },
        { id: 'hs', x: 520, y: 190, w: 220, h: 56, label: 'hsflowd', kind: 'proc', info: '<p>Host sFlow daemon：組成 sFlow v5 datagram（flow sample + counter sample），counter 從 COUNTERS_DB 讀取。</p>' },
        { id: 'col', x: 800, y: 190, w: 180, h: 56, label: '收集器', sub: 'UDP 6343', kind: 'ext', info: '<p>sFlow-RT、ntopng、pmacct 等。</p>' },
        { id: 'cnt', x: 20, y: 190, w: 180, h: 56, label: 'COUNTERS_DB', kind: 'db', info: '<p>介面計數器來源。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'mgr', id: 'e1' }, { from: 'mgr', to: 'orch', label: 'APPL_DB', id: 'e2' }, { from: 'orch', to: 'asic', label: 'SAI', id: 'e3' },
        { from: 'asic', to: 'ps', label: 'PCIe / driver', id: 'e4', via: [[840, 140], [340, 140]] },
        { from: 'ps', to: 'hs', id: 'e5' }, { from: 'hs', to: 'col', id: 'e6' }, { from: 'cnt', to: 'hs', dash: true, label: 'counters', id: 'e7', via: [[110, 290], [630, 290]] },
      ],
      steps: [
        { title: '設定取樣', text: 'sflowmgrd 決定每個介面的取樣率，SflowOrch 建立 SAMPLEPACKET 並綁定到 port。', nodes: ['cfg', 'mgr', 'orch', 'asic'], edges: ['e1', 'e2', 'e3'] },
        { title: '硬體取樣', text: 'ASIC 以 1/N 機率複製封包標頭，經 trap 與驅動以 psample 送到 user space。', nodes: ['asic', 'ps'], edges: ['e4'] },
        { title: '送往收集器', text: 'hsflowd 組成 sFlow datagram，加上介面計數器，送往收集器。', nodes: ['ps', 'hs', 'col', 'cnt'], edges: ['e5', 'e6', 'e7'] },
      ],
    });

    const host = root.querySelector('#est');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { speed: 100, util: 40, pkt: 800, rate: 100000, share: 1, mins: 5 };
    const F = [['speed', 'Port 速率 (Gbps)'], ['util', '使用率 (%)'], ['pkt', '平均封包大小 (bytes)'], ['rate', '取樣率 1/N'], ['share', '關注流量佔比 (%)'], ['mins', '觀察時間 (分鐘)']];
    const g = S.el('div', { class: 'grid c3' });
    F.forEach(([k, l]) => { const inp = S.el('input', { id: 'sf-' + k, type: 'number', value: P[k], min: 0 }); inp.addEventListener('input', () => { P[k] = Math.max(0, +inp.value || 0); draw(); }); g.appendChild(S.el('label', { class: 'field', for: 'sf-' + k }, l, inp)); });
    box.appendChild(g);
    const out = S.el('div'); box.appendChild(out);
    function draw() {
      const pps = P.speed * 1e9 * (P.util / 100) / ((P.pkt + 20) * 8); // 含 preamble 與 IFG
      const sps = P.rate ? pps / P.rate : 0;
      const c = sps * P.mins * 60 * (P.share / 100);
      const err = c > 0 ? 196 / Math.sqrt(c) : Infinity;
      const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' K' : n.toFixed(1);
      out.innerHTML = `<div class="pipe" style="margin-top:12px">
        <div><div class="pl">封包速率</div><div class="pv">${fmt(pps)} pps</div></div>
        <div><div class="pl">取樣速率</div><div class="pv">${fmt(sps)} /s</div><div class="ps">${sps > 1000 ? '超過預設 CoPP 上限 1000 pps' : '低於 CoPP 上限'}</div></div>
        <div><div class="pl">關注流量取樣數</div><div class="pv">${fmt(c)}</div></div>
        <div><div class="pl">估算誤差 (95%)</div><div class="pv">${isFinite(err) ? '±' + err.toFixed(err < 1 ? 2 : 1) + '%' : '—'}</div></div></div>
        <div class="log">${sps > 1000 ? '取樣速率超過 sample_packet trap 的預設 policer，部分樣本會在 ASIC 中被丟棄，實際有效取樣率會低於設定值。可以提高 N，或調整 CoPP 的 queue2_group1。' : `在 ${P.mins} 分鐘內，佔整體 ${P.share}% 的流量約有 ${fmt(c)} 個樣本，估算其流量的相對誤差約 ±${isFinite(err) ? err.toFixed(1) : '—'}%。`}</div>`;
    }
    draw();
  },
  related: ['counters', 'copp', 'mirror'],
  refs: [['sFlow v5 規格', 'https://sflow.org/sflow_version_5.txt'], ['SONiC sFlow HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/sflow/sflow_hld.md'], ['Enterprise SONiC User Guide UG460：Ch.20', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
