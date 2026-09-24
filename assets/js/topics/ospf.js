S.register({
  id: 'ospf',
  category: 'l3',
  order: 4,
  title: 'OSPF',
  en: 'Open Shortest Path First (v2 / v3)',
  summary: 'OSPF 是 link-state IGP：每台路由器泛洪 LSA 建立相同的鏈路狀態資料庫，再以 Dijkstra 演算法計算最短路徑樹。SONiC 由 FRR 的 ospfd / ospf6d 執行，路由與 BGP 一樣經 zebra 與 fpmsyncd 下發。',
  meta: [
    ['容器', ['bgp（FRR）']],
    ['程序', ['ospfd', 'ospf6d', 'zebra', 'frrcfgd']],
    ['CONFIG_DB（frrcfgd）', ['OSPFV2_ROUTER', 'OSPFV2_ROUTER_AREA', 'OSPFV2_ROUTER_AREA_NETWORK', 'OSPFV2_INTERFACE', 'OSPFV2_ROUTER_DISTRIBUTE_ROUTE']],
    ['協定', ['IP protocol 89', '224.0.0.5 AllSPFRouters', '224.0.0.6 AllDRouters', 'RFC 2328 (v2)', 'RFC 5340 (v3)']],
    ['CoPP', ['trap ospf / ospfv6']],
  ],
  tags: ['OSPF', 'OSPFv3', 'link-state', 'LSA', 'SPF', 'Dijkstra', 'DR', 'BDR', 'area', 'stub', 'NSSA', 'ABR', 'ASBR'],
  keypoints: [
    '鄰居依 Down → Init → 2-Way → ExStart → Exchange → Loading → Full 建立 adjacency；broadcast 網段上只有 DR / BDR 與其他路由器形成 Full。',
    'Router LSA（1）與 Network LSA（2）描述區域內拓樸；Summary LSA（3、4）在區域間傳遞；External LSA（5、7）描述外部路由。',
    '每台路由器用相同的 LSDB 以 Dijkstra 算出以自己為根的最短路徑樹；成本相同的路徑形成 ECMP。',
    '介面成本 = reference bandwidth / 介面頻寬；FRR 預設 reference 為 100 Mbps，在 10G 以上的網路應調高，否則所有介面成本都是 1。',
    'SONiC 社群版 OSPF 通常直接以 vtysh 設定；Management Framework 模式下由 frrcfgd 讀取 OSPFV2_* 表。',
  ],
  html: `
<h2>鄰居狀態</h2>
<table>
<thead><tr><th>狀態</th><th>發生的事</th></tr></thead>
<tbody>
<tr><td>Down</td><td>尚未收到對方 Hello</td></tr>
<tr><td>Init</td><td>收到對方 Hello，但 Hello 中的鄰居清單尚未包含自己</td></tr>
<tr><td>2-Way</td><td>雙向確認；broadcast 網段在此選出 DR / BDR，DROther 之間停在 2-Way</td></tr>
<tr><td>ExStart</td><td>協商 master / slave 與 DD 序號</td></tr>
<tr><td>Exchange</td><td>交換 Database Description（LSA 標頭清單）</td></tr>
<tr><td>Loading</td><td>以 LS Request 取回缺少或較舊的 LSA</td></tr>
<tr><td>Full</td><td>LSDB 同步完成</td></tr>
</tbody></table>
<p>Hello 中必須一致的參數：area ID、hello / dead interval（預設 10 / 40 秒）、子網路遮罩（broadcast 網路）、認證、stub flag；MTU 不一致會卡在 ExStart / Exchange。</p>

<h2>LSA 類型與區域</h2>
<table>
<thead><tr><th>Type</th><th>名稱</th><th>產生者</th><th>範圍</th></tr></thead>
<tbody>
<tr><td>1</td><td>Router LSA</td><td>每台路由器</td><td>區域內，列出自己的鏈路與成本</td></tr>
<tr><td>2</td><td>Network LSA</td><td>DR</td><td>區域內，描述 broadcast 網段上的路由器</td></tr>
<tr><td>3</td><td>Summary LSA</td><td>ABR</td><td>把其他區域的網段帶入本區域</td></tr>
<tr><td>4</td><td>ASBR Summary</td><td>ABR</td><td>告知 ASBR 的位置</td></tr>
<tr><td>5</td><td>AS External</td><td>ASBR</td><td>整個 OSPF domain（stub 區域除外）</td></tr>
<tr><td>7</td><td>NSSA External</td><td>NSSA 中的 ASBR</td><td>NSSA 區域內，由 ABR 轉換為 Type 5</td></tr>
</tbody></table>
<table>
<thead><tr><th>區域類型</th><th>允許的 LSA</th><th>用途</th></tr></thead>
<tbody>
<tr><td>Backbone（area 0）</td><td>全部</td><td>所有區域必須連到 area 0（或經 virtual link）</td></tr>
<tr><td>Stub</td><td>1、2、3（含預設路由）</td><td>不需要外部路由細節的邊緣區域</td></tr>
<tr><td>Totally stubby</td><td>1、2，加上一條預設路由</td><td>進一步縮小 LSDB</td></tr>
<tr><td>NSSA</td><td>1、2、3、7</td><td>邊緣區域需要引入少量外部路由時</td></tr>
</tbody></table>

<h2>SPF 計算模擬</h2>
<p>五台路由器的拓樸。調整鏈路成本，觀察 R1 算出的最短路徑樹（實線）、各目的地的成本與下一跳，以及成本相同時的 ECMP。</p>
<div id="spf"></div>

<h2>在 SONiC 中的實作</h2>
<p>OSPF 與 BGP 共用 bgp 容器中的 FRR。控制封包（IP protocol 89，目的 224.0.0.5 / 224.0.0.6）由 CoPP trap 到 CPU；ospfd 計算出的路由交給 zebra，之後的下發路徑與 BGP 完全相同：zebra → FPM → fpmsyncd → APPL_DB ROUTE_TABLE → RouteOrch → ASIC。</p>
<pre><span class="c"># frrcfgd 模式的 CONFIG_DB</span>
"OSPFV2_ROUTER":              { "default": { "enable": "true", "router_id": "10.1.1.1" } },
"OSPFV2_ROUTER_AREA_NETWORK": { "default|0.0.0.0|10.10.3.0/24": {} },
"OSPFV2_INTERFACE":           { "Ethernet0|10.10.3.1": { "area-id": "0.0.0.0", "network-type": "POINT_TO_POINT", "metric": "10" } }</pre>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# router ospf
sonic(config-router-ospf)# ospf router-id 10.1.1.1
sonic(config-router-ospf)# network 10.10.3.0/24 area 0
sonic(config-router-ospf)# area 0.0.0.1 stub
sonic(config-router-ospf)# area 0 authentication message-digest
sonic(config-router-ospf)# passive-interface Eth1/16
sonic(config)# interface Eth1/15
sonic(config-if-Eth1/15)# ip ospf area 0
sonic(config-if-Eth1/15)# ip ospf network point-to-point
sonic(config-if-Eth1/15)# ip ospf cost 10
sonic(config-if-Eth1/15)# ip ospf bfd
sonic(config)# router ospf vrf Vrf-blue
sonic# show ip ospf neighbor
sonic# show ip ospf database
sonic# show ip route ospf

<span class="c"># 社群版（vtysh）</span>
vtysh
conf t
router ospf
 ospf router-id 10.1.1.1
 auto-cost reference-bandwidth 400000
 network 10.10.3.0/24 area 0
interface Ethernet0
 ip ospf network point-to-point</pre>
`,
  mount(root) {
    const host = root.querySelector('#spf');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const POS = { R1: [100, 190], R2: [340, 70], R3: [340, 310], R4: [600, 70], R5: [600, 310] };
    const L = [['R1', 'R2', 10], ['R1', 'R3', 10], ['R2', 'R3', 5], ['R2', 'R4', 10], ['R3', 'R5', 10], ['R4', 'R5', 5], ['R2', 'R5', 20]];
    function spf() {
      const N = Object.keys(POS);
      const dist = Object.fromEntries(N.map(n => [n, Infinity])); dist.R1 = 0;
      const nh = Object.fromEntries(N.map(n => [n, new Set()]));
      const pred = Object.fromEntries(N.map(n => [n, []]));
      const done = new Set();
      while (done.size < N.length) {
        const u = N.filter(n => !done.has(n)).sort((a, b) => dist[a] - dist[b])[0];
        if (dist[u] === Infinity) break;
        done.add(u);
        L.forEach(([a, b, c]) => {
          const v = a === u ? b : b === u ? a : null;
          if (!v || done.has(v)) return;
          const d = dist[u] + c;
          const hops = u === 'R1' ? new Set([v]) : nh[u];
          if (d < dist[v]) { dist[v] = d; nh[v] = new Set(hops); pred[v] = [u]; }
          else if (d === dist[v]) { hops.forEach(h => nh[v].add(h)); pred[v].push(u); }
        });
      }
      return { dist, nh, pred };
    }
    function draw() {
      const r = spf();
      box.innerHTML = '';
      const ctl = S.el('div', { class: 'grid c3' });
      L.forEach((l, i) => {
        const sel = S.el('select', { id: 'spf-' + i }, ...[1, 5, 10, 20, 50].map(v => S.el('option', { value: v, selected: l[2] === v }, String(v))));
        sel.addEventListener('change', () => { l[2] = +sel.value; draw(); });
        ctl.appendChild(S.el('label', { class: 'field', for: 'spf-' + i }, `${l[0]}–${l[1]} cost`, sel));
      });
      box.appendChild(ctl);
      const tree = new Set();
      Object.entries(r.pred).forEach(([v, ps]) => ps.forEach(u => tree.add([u, v].sort().join('-'))));
      let svg = '<svg viewBox="0 0 700 380" style="width:100%;min-width:520px;display:block">';
      L.forEach(([a, b, c]) => {
        const [x1, y1] = POS[a], [x2, y2] = POS[b];
        const on = tree.has([a, b].sort().join('-'));
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? 'var(--accent)' : 'var(--border-strong)'}" stroke-width="${on ? 2.6 : 1.4}" ${on ? '' : 'stroke-dasharray="5 5"'}/>`;
        svg += `<rect x="${(x1 + x2) / 2 - 16}" y="${(y1 + y2) / 2 - 10}" width="32" height="20" rx="4" fill="var(--panel)" stroke="var(--border)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-size="11.5" font-family="var(--mono)" fill="var(--muted)">${c}</text>`;
      });
      Object.entries(POS).forEach(([n, [x, y]]) => {
        svg += `<circle cx="${x}" cy="${y}" r="30" fill="var(--panel)" stroke="${n === 'R1' ? 'var(--accent)' : 'var(--k-proc)'}" stroke-width="${n === 'R1' ? 2.6 : 1.6}"/><text x="${x}" y="${y - 4}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text)">${n}</text><text x="${x}" y="${y + 13}" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">${r.dist[n]}</text>`;
      });
      svg += '</svg>';
      box.appendChild(S.el('div', { class: 'dg-canvas', style: 'margin-top:12px;border:1px solid var(--border);border-radius:6px', html: svg }));
      const t = S.el('div', { class: 'tbl', style: 'margin-top:10px' });
      t.innerHTML = `<table><thead><tr><th>目的（loopback）</th><th>成本</th><th>下一跳（R1 的出口）</th><th>路徑</th></tr></thead><tbody>${['R2', 'R3', 'R4', 'R5'].map(n => `<tr><td class="mono">${n} 10.0.0.${n.slice(1)}/32</td><td class="mono">${r.dist[n]}</td><td>${[...r.nh[n]].map(h => `<code>${h}</code>`).join(' ')}${r.nh[n].size > 1 ? ' <span class="badge b">ECMP</span>' : ''}</td><td class="mono" style="font-size:12px">經 ${r.pred[n].join(' / ')} 到達</td></tr>`).join('')}</tbody></table>`;
      box.appendChild(t);
    }
    draw();
  },
  related: ['routing', 'bgp', 'routing-policy', 'protection'],
  refs: [['RFC 2328 OSPFv2', 'https://www.rfc-editor.org/rfc/rfc2328'], ['RFC 5340 OSPFv3', 'https://www.rfc-editor.org/rfc/rfc5340'], ['FRR OSPF 文件', 'https://docs.frrouting.org/en/latest/ospfd.html'], ['Enterprise SONiC User Guide UG460：§10.8–10.9', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
