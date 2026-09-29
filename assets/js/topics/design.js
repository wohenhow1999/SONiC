S.register({
  id: 'design',
  category: 'dc',
  order: 5,
  title: '資料中心網路設計',
  en: 'Data Center Fabric Design',
  summary: '把前面各章的功能組合成可部署的架構：L3 Clos（eBGP）、L2 fabric（MCLAG + STP）、BGP EVPN VXLAN、園區邊緣，以及 RoCE / AI fabric。說明各種設計的取捨、ASN 與位址規劃，並提供 fabric 容量與超額訂閱的計算工具。',
  meta: [
    ['相關章節', '<a href="#/bgp">BGP</a>、<a href="#/vxlan">VXLAN / EVPN</a>、<a href="#/mclag">MCLAG</a>、<a href="#/stp">STP</a>、<a href="#/roce">RoCE</a>、<a href="#/protection">BFD / LST</a>'],
    ['參考', ['RFC 7938', 'Enterprise SONiC UG460 Ch.27']],
  ],
  tags: ['design', 'Clos', 'spine-leaf', 'fabric', 'oversubscription', 'ASN', 'eBGP', 'EVPN', 'MCLAG', 'AI fabric', 'best practice'],
  keypoints: [
    'Spine-leaf（Clos）讓任兩台 leaf 之間都是兩跳，容量以增加 spine 橫向擴充，ECMP 寬度等於 spine 數量。',
    'L3 fabric 常用 eBGP：spine 共用一個 ASN、每台（或每對）leaf 一個 ASN，以 unnumbered 介面、BFD 與 multipath 簡化並加速收斂。',
    'L2 需要跨機櫃延伸時，優先以 EVPN VXLAN 在 L3 underlay 上提供 overlay，而不是把 VLAN 與 STP 延伸到整個 fabric。',
    '超額訂閱比 = leaf 下行總頻寬 / 上行總頻寬；一般運算 3:1 常見，儲存與 AI fabric 通常要求 1:1。',
    '所有 fabric 都應啟用 jumbo frame、至少兩條上聯、link state tracking，並在維護前以 traffic shift 把流量導走。',
  ],
  html: `
<h2>Spine-leaf 拓樸</h2>
<div id="d-clos"></div>

<h2>設計選項比較</h2>
<table>
<thead><tr><th></th><th>L3 Clos（eBGP）</th><th>L2 fabric（MCLAG + STP）</th><th>BGP EVPN VXLAN</th></tr></thead>
<tbody>
<tr><td>L2 範圍</td><td>限於單一 leaf（或 leaf pair）</td><td>跨整個 fabric</td><td>以 overlay 按需延伸</td></tr>
<tr><td>擴充性</td><td>最佳，路由表隨機櫃數量成長</td><td>受 MAC 表、STP 實例、廣播域限制</td><td>佳，symmetric IRB 可控制 MAC / ARP 規模</td></tr>
<tr><td>收斂</td><td>BGP + BFD，次秒級</td><td>RSTP / MCLAG，秒級</td><td>BGP + BFD，EVPN mass withdraw</td></tr>
<tr><td>多租戶</td><td>VRF-lite，需逐跳設定</td><td>VLAN</td><td>VRF + L3 VNI，只需在 leaf 設定</td></tr>
<tr><td>主機雙歸屬</td><td>BGP 到主機，或 MCLAG</td><td>MCLAG</td><td>EVPN multihoming 或 MCLAG</td></tr>
<tr><td>適用</td><td>雲端、大型運算叢集</td><td>小型或傳統應用需要大型 L2</td><td>企業私有雲、多租戶、VM 遷移</td></tr>
</tbody></table>

<h2>ASN 與位址規劃（L3 Clos）</h2>
<table>
<thead><tr><th>元件</th><th>常見做法</th><th>理由</th></tr></thead>
<tbody>
<tr><td>Spine ASN</td><td>所有 spine 共用一個（例如 65100）</td><td>leaf 收到經由不同 spine 的相同路由時 AS path 長度相同，可以形成 ECMP；spine 之間不需互連</td></tr>
<tr><td>Leaf ASN</td><td>每台 leaf 唯一（4-byte 私有 ASN 4200000000–4294967294），或每對 MCLAG leaf 共用</td><td>AS path 防迴圈；Enterprise AutoASN 可依 MAC 自動產生</td></tr>
<tr><td>Leaf–spine 鏈路</td><td>unnumbered（IPv6 link-local + RFC 5549），或 /31</td><td>減少位址規劃與設定</td></tr>
<tr><td>Loopback</td><td>每台一個 /32，作為 router ID 與 VTEP 來源</td><td>穩定、不隨介面狀態改變</td></tr>
<tr><td>伺服器網段</td><td>每台 leaf 一個或多個子網，以 redistribute connected + route-map 通告</td><td>彙總在 leaf，spine 只看到機櫃前綴</td></tr>
<tr><td>BGP 參數</td><td>timers 3 / 9 或 BFD、maximum-paths 64、bestpath as-path multipath-relax</td><td>快速收斂與完整 ECMP</td></tr>
</tbody></table>

<h2>容量與超額訂閱計算</h2>
<div id="calc"></div>

<h2>部署建議</h2>
<table>
<thead><tr><th>情境</th><th>建議</th></tr></thead>
<tbody>
<tr><td>通用</td><td>fabric 與主機 port 啟用 jumbo frame（9100–9216）；每台 leaf 至少兩條上聯；啟用 link state tracking；維護前以 TSA 讓流量離開、完成後 TSB</td></tr>
<tr><td>L2 fabric</td><td>VLAN 數量少時用 RPVST，數量多時改用 MSTP；leaf–spine 以 LACP port channel 為 trunk；以邊界 leaf pair 作為南北向閘道</td></tr>
<tr><td>L3 fabric</td><td>eBGP + ECMP；BFD；不同 leaf 使用不同 ASN；以 route-map 控制通告的前綴</td></tr>
<tr><td>EVPN VXLAN</td><td>underlay 為 unnumbered eBGP；leaf 以 MCLAG 或 EVPN multihoming 提供冗餘；使用 symmetric IRB 與 anycast gateway；租戶 VLAN 啟用 neigh-suppress；BUM storm control</td></tr>
<tr><td>園區邊緣</td><td>802.1X 與 port security；IGMP snooping；語音與視訊使用獨立 VLAN 與 QoS；PoE 規劃；存取層以 MCLAG 上聯</td></tr>
<tr><td>RoCE / AI</td><td>RoCE 流量獨立子網或 VLAN；主機端 802.1p 3、DSCP 24 / 26；啟用 ECN 與 PFC；1:1 超額訂閱；QoS 套用在 port channel 而非成員；啟用 PFC watchdog；考慮動態負載平衡（ARS / DLB）與 fast link failover</td></tr>
</tbody></table>
`,
  mount(root) {
    const nodes = [], edges = [];
    ['S1', 'S2', 'S3', 'S4'].forEach((s, i) => nodes.push({ id: s, x: 170 + i * 180, y: 30, w: 120, h: 50, lv: 2, y3: 120, label: `Spine ${i + 1}`, sub: 'AS 65100', kind: 'proc', info: `<p>Spine ${i + 1}：只做 L3 轉發，所有 spine 使用相同 ASN。每台 leaf 都連到每台 spine。</p>` }));
    ['L1', 'L2', 'L3', 'L4', 'L5'].forEach((l, i) => nodes.push({ id: l, x: 40 + i * 190, y: 200, w: 150, h: 56, lv: 1, y3: 170, label: `Leaf ${i + 1}`, sub: `AS 651${String(i + 1).padStart(2, '0')} · VTEP`, kind: 'container', info: `<p>Leaf ${i + 1}：伺服器閘道（anycast gateway）、VTEP，以 eBGP 連到 4 台 spine，形成 4 路 ECMP。</p>` }));
    ['H1', 'H2', 'H3', 'H4', 'H5'].forEach((h, i) => nodes.push({ id: h, x: 55 + i * 190, y: 330, w: 120, h: 44, lv: 0, y3: 250, label: `Rack ${i + 1}`, sub: '伺服器', kind: 'ext', info: '<p>機櫃內的伺服器，以 LAG 或 bonding 連到 leaf（或 leaf pair）。</p>' }));
    ['L1', 'L2', 'L3', 'L4', 'L5'].forEach(l => ['S1', 'S2', 'S3', 'S4'].forEach(s => edges.push({ from: l, to: s, id: `${l}-${s}` })));
    ['1', '2', '3', '4', '5'].forEach(i => edges.push({ from: 'H' + i, to: 'L' + i, id: `H${i}-L${i}` }));
    S.diagram(root.querySelector('#d-clos'), {
      title: 'Spine-leaf fabric 與東西向流量',
      w: 1000, h: 400, layerGap: 110, view3d: 'iso',
      nodes, edges,
      steps: [
        { title: '東西向流量', text: 'Rack 1 的伺服器送往 Rack 4：先到 Leaf 1。', nodes: ['H1', 'L1'], edges: ['H1-L1'] },
        { title: 'ECMP 分散', text: 'Leaf 1 對 Rack 4 的前綴有 4 條等價路徑（經 4 台 spine），依 5-tuple 雜湊選一條。', nodes: ['L1', 'S1', 'S2', 'S3', 'S4'], edges: ['L1-S1', 'L1-S2', 'L1-S3', 'L1-S4'] },
        { title: '到達目的', text: '任一 spine 都直接連到 Leaf 4，兩跳即可到達。', nodes: ['S1', 'S2', 'S3', 'S4', 'L4', 'H4'], edges: ['L4-S1', 'L4-S2', 'L4-S3', 'L4-S4', 'H4-L4'] },
        { title: 'Spine 失效', text: '任一 spine 失效只減少 1/4 的容量；BGP + BFD 在次秒級撤除該路徑，RouteOrch 更新 NEXT_HOP_GROUP。', nodes: ['L1', 'S2', 'S3', 'S4', 'L4'], edges: ['L1-S2', 'L1-S3', 'L1-S4', 'L4-S2', 'L4-S3', 'L4-S4'], down: ['L1-S1', 'L2-S1', 'L3-S1', 'L4-S1', 'L5-S1'] },
      ],
    });

    const host = root.querySelector('#calc');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { spines: 4, spinePorts: 64, leafDown: 48, downSpeed: 25, leafUp: 8, upSpeed: 100 };
    const F = [['spines', 'Spine 數量'], ['spinePorts', '每台 spine 的 port 數'], ['leafDown', '每台 leaf 下行 port 數'], ['downSpeed', '下行速率 (Gbps)'], ['leafUp', '每台 leaf 上行 port 數'], ['upSpeed', '上行速率 (Gbps)']];
    const g = S.el('div', { class: 'grid c3' });
    F.forEach(([k, l]) => { const inp = S.el('input', { id: 'dc-' + k, type: 'number', value: P[k], min: 1 }); inp.addEventListener('input', () => { P[k] = Math.max(1, +inp.value || 1); draw(); }); g.appendChild(S.el('label', { class: 'field', for: 'dc-' + k }, l, inp)); });
    box.appendChild(g);
    const out = S.el('div'); box.appendChild(out);
    function draw() {
      const linksPerSpine = P.leafUp / P.spines;
      const even = Number.isInteger(linksPerSpine);
      const maxLeaves = even ? Math.floor(P.spinePorts / linksPerSpine) : 0;
      const down = P.leafDown * P.downSpeed, up = P.leafUp * P.upSpeed;
      const ratio = down / up;
      out.innerHTML = `<div class="pipe" style="margin-top:12px">
        <div><div class="pl">每台 leaf 下行</div><div class="pv">${down} G</div></div>
        <div><div class="pl">每台 leaf 上行</div><div class="pv">${up} G</div></div>
        <div><div class="pl">超額訂閱比</div><div class="pv" style="color:${ratio > 3 ? 'var(--warn)' : 'inherit'}">${ratio.toFixed(2)} : 1</div></div>
        <div><div class="pl">最多 leaf 數</div><div class="pv">${even ? maxLeaves : '—'}</div></div>
        <div><div class="pl">最多伺服器 port</div><div class="pv">${even ? maxLeaves * P.leafDown : '—'}</div></div>
        <div><div class="pl">ECMP 寬度</div><div class="pv">${P.leafUp}</div></div></div>
        <div class="log">${!even ? `上行 port 數（${P.leafUp}）無法平均分配到 ${P.spines} 台 spine，會造成不均衡的 ECMP，建議上行 port 數為 spine 數的整數倍。` :
          `每台 leaf 以 ${linksPerSpine} 條鏈路連到每台 spine；每台 spine 有 ${P.spinePorts} 個 port，因此最多容納 ${maxLeaves} 台 leaf、共 ${maxLeaves * P.leafDown} 個 ${P.downSpeed}G 伺服器 port。` +
          (ratio > 1 ? ` 超額訂閱 ${ratio.toFixed(2)}:1 表示所有伺服器同時以線速送往其他機櫃時，上行只能承載 ${(100 / ratio).toFixed(0)}% 的流量。${ratio > 3 ? '對儲存或 AI 訓練流量而言偏高。' : ''}` : ' 上行頻寬足以承載全部下行流量（無阻塞）。')}</div>`;
    }
    draw();
  },
  related: ['bgp', 'vxlan', 'mclag', 'roce', 'protection', 'routing', 'ecmp'],
  refs: [['RFC 7938 Use of BGP for Routing in Large-Scale Data Centers', 'https://www.rfc-editor.org/rfc/rfc7938'], ['Enterprise SONiC User Guide UG460：Ch.27', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
