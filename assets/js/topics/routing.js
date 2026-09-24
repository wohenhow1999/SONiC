S.register({
  id: 'routing',
  category: 'l3',
  order: 1,
  title: '路由架構與 FRR',
  en: 'Routing, BGP & FRR',
  summary: "SONiC 以 FRRouting 執行 BGP 等路由協定。路由經 bgpd → zebra → fpmsyncd 進入 APPL_DB，再由 RouteOrch 下發為 SAI ROUTE_ENTRY；多路徑以 NEXT_HOP_GROUP 實作 ECMP。",
  meta: [["容器", ["bgp"]], ["程序", ["bgpd", "zebra", "staticd", "bfdd", "bgpcfgd", "fpmsyncd", "orchagent (RouteOrch)"]], ["資料表", ["CONFIG_DB BGP_NEIGHBOR / STATIC_ROUTE", "APPL_DB ROUTE_TABLE", "ASIC_DB ROUTE_ENTRY / NEXT_HOP_GROUP"]], ["工具", ["vtysh", "route_check.py", "show ip bgp summary"]], ["原始碼", "<code>sonic-swss/fpmsyncd/</code>、<code>sonic-swss/orchagent/routeorch.cpp</code>、<code>sonic-bgpcfgd</code>"]],
  tags: ['BGP', 'FRR', 'zebra', 'fpmsyncd', 'RouteOrch', 'ECMP', 'bgpcfgd', '靜態路由'],
  html: `
<h2>路由下發流程</h2>
<p>在典型的資料中心 Clos 網路中，SONiC 交換機之間全部用 eBGP 交換路由。下圖把 BGP 設定、路由學習與硬體下發三條路徑畫在一起。</p>
<div id="d-rt"></div>

<h2>bgp 容器內的元件</h2>
<table>
<thead><tr><th>元件</th><th>來源</th><th>工作</th></tr></thead>
<tbody>
<tr><td>bgpd / staticd / bfdd</td><td>FRR</td><td>協定本身：BGP、靜態路由、BFD</td></tr>
<tr><td>zebra</td><td>FRR</td><td>RIB 管理，選出最終路由、寫 kernel、透過 FPM 通知外部</td></tr>
<tr><td>bgpcfgd</td><td>SONiC</td><td>訂閱 CONFIG_DB（BGP_NEIGHBOR、STATIC_ROUTE、DEVICE_METADATA…），用 Jinja2 範本與 vtysh 動態設定 FRR</td></tr>
<tr><td>fpmsyncd</td><td>SONiC</td><td>接收 FPM 訊息，寫入 APPL_DB <code>ROUTE_TABLE</code></td></tr>
<tr><td>bgpmon</td><td>SONiC</td><td>把 BGP 鄰居狀態寫入 STATE_DB（<code>NEIGH_STATE_TABLE</code>），供 SNMP / 監控使用</td></tr>
</tbody></table>
<div class="callout"><div class="ct">FRR 設定模式</div>
<p>SONiC 預設由 bgpcfgd 依 CONFIG_DB 產生 FRR 設定（「split」或「unified」設定檔模式）。也可以把 <code>DEVICE_METADATA|localhost</code> 的 <code>docker_routing_config_mode</code> 設成 <code>split-unified</code> 或 <code>unified</code>，直接用 <code>vtysh</code> 管理 FRR 設定。</p></div>

<h2>ECMP：多路徑負載分擔</h2>
<p>當同一個網段有多個等價 next hop，RouteOrch 會建立 <b>NEXT_HOP_GROUP</b>，ASIC 依封包 5-tuple 的雜湊值挑一條路。下面模擬 12 條 flow 分配到 4 個 next hop 的情況，試著讓某條鏈路斷掉，看看有多少 flow 被迫換路徑。</p>
<div id="ecmp"></div>

<h2>操作示範：靜態路由</h2>
<p>Ethernet0 已設定 <code>10.0.0.0/31</code>，對端 <code>10.0.0.1</code> 已回應 ARP。以下示範新增一條可達與一條不可達的靜態路由，觀察 zebra、fpmsyncd、orchagent 的不同反應。</p>
<div id="term"></div>

<h2>除錯指令</h2>
<pre><span class="c"># BGP 鄰居摘要</span>
show ip bgp summary
<span class="c"># 直接進 FRR 的 shell</span>
vtysh -c "show ip route 192.168.0.0/24"
<span class="c"># APPL_DB 裡的路由（fpmsyncd 寫入的）</span>
sonic-db-cli APPL_DB keys "ROUTE_TABLE:*"
<span class="c"># ASIC_DB 裡的路由（orchagent 寫入的）</span>
sonic-db-cli ASIC_DB keys "*ROUTE_ENTRY*"
<span class="c"># 比對三者是否一致（官方提供的檢查工具）</span>
sudo route_check.py</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-rt'), {
      title: 'BGP 路由：設定、學習、下發',
      w: 1000, h: 540,
      groups: [{ x: 196, y: 16, w: 410, h: 250, label: 'bgp 容器' }],
      nodes: [
        { id: 'peer', x: 20, y: 60, w: 150, h: 56, label: 'BGP 鄰居', sub: '(另一台交換機)', kind: 'ext', info: '<p>透過 TCP 179 建立 BGP session，送來 UPDATE 訊息（路由通告）。</p>' },
        { id: 'cfg', x: 650, y: 60, w: 150, h: 56, label: 'CONFIG_DB', sub: 'BGP_NEIGHBOR', kind: 'db', info: '<p>例如 <code>BGP_NEIGHBOR|10.0.0.1</code>：asn、name、local_addr、holdtime…</p>' },
        { id: 'bcfg', x: 430, y: 60, w: 156, h: 56, label: 'bgpcfgd', kind: 'proc', info: '<p>看到 CONFIG_DB 新增 BGP 鄰居，就用範本產生 <code>neighbor 10.0.0.1 remote-as 65200</code> 等設定，透過 vtysh 套用到 bgpd。</p>' },
        { id: 'bgpd', x: 216, y: 60, w: 156, h: 56, label: 'bgpd', kind: 'proc', info: '<p>跑 BGP 協定、做 best path 選擇，把結果交給 zebra。</p>' },
        { id: 'zebra', x: 216, y: 180, w: 156, h: 56, label: 'zebra', kind: 'proc', info: '<p>彙整 connected / static / BGP 路由，選出最佳路由（依 administrative distance 與 metric）。</p>' },
        { id: 'fpm', x: 430, y: 180, w: 156, h: 56, label: 'fpmsyncd', kind: 'proc', info: '<p>透過 FPM（TCP 2620 或 netlink 格式）接收 zebra 的路由，寫 APPL_DB。支援 warm restart 時的路由比對（reconciliation）。</p>' },
        { id: 'kern', x: 20, y: 300, w: 150, h: 56, label: 'Linux 路由表', kind: 'kernel', info: '<p>zebra 也把路由寫進 kernel，讓 CPU 自己發出的封包（例如 ping、BGP 本身）能正確選路。</p>' },
        { id: 'appl', x: 430, y: 300, w: 156, h: 56, label: 'APPL_DB', sub: 'ROUTE_TABLE', kind: 'db', info: '<p><code>ROUTE_TABLE:192.168.0.0/24</code> → <code>nexthop: 10.0.0.1,10.0.0.3</code>、<code>ifname: Ethernet0,Ethernet4</code>。多個 next hop 以逗號分隔。</p>' },
        { id: 'ro', x: 650, y: 300, w: 150, h: 56, label: 'RouteOrch', sub: '(orchagent)', kind: 'proc', info: '<p>把路由轉成 SAI：單一 next hop → 指向 NEXT_HOP 物件；多個 → 建立或重用 NEXT_HOP_GROUP（ECMP）。next hop 未解析時先暫存。</p>' },
        { id: 'asicdb', x: 650, y: 420, w: 150, h: 56, label: 'ASIC_DB', sub: 'ROUTE_ENTRY', kind: 'db', info: '<p><code>SAI_OBJECT_TYPE_ROUTE_ENTRY:{"dest":"192.168.0.0/24",…}</code></p>' },
        { id: 'asic', x: 840, y: 420, w: 140, h: 56, label: 'ASIC', sub: 'LPM 表', kind: 'hw', info: '<p>最長前綴比對（Longest Prefix Match）硬體表。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'bcfg', label: '訂閱', id: 'c1' },
        { from: 'bcfg', to: 'bgpd', label: 'vtysh', id: 'c2' },
        { from: 'peer', to: 'bgpd', label: 'UPDATE', bi: true, id: 'r1', lx: 193, ly: 68 },
        { from: 'bgpd', to: 'zebra', id: 'r2' },
        { from: 'zebra', to: 'kern', label: 'netlink', id: 'r3' },
        { from: 'zebra', to: 'fpm', label: 'FPM', id: 'r4' },
        { from: 'fpm', to: 'appl', id: 'r5' },
        { from: 'appl', to: 'ro', id: 'r6' },
        { from: 'ro', to: 'asicdb', id: 'r7' },
        { from: 'asicdb', to: 'asic', label: 'syncd/SAI', id: 'r8', lx: 822, ly: 404 },
      ],
      steps: [
        { title: '設定 BGP 鄰居', text: '<code>BGP_NEIGHBOR|10.0.0.1</code> 寫入 CONFIG_DB（來自 config_db.json、minigraph 或 CLI）。bgpcfgd 產生 FRR 設定並用 vtysh 套用。', nodes: ['cfg', 'bcfg', 'bgpd'], edges: ['c1', 'c2'] },
        { title: '建立 session、收到路由', text: 'bgpd 與鄰居建立 BGP session（BGP 封包由 ASIC trap 到 CPU），收到 <code>192.168.0.0/24</code> 的 UPDATE。', nodes: ['peer', 'bgpd'], edges: ['r1'] },
        { title: 'zebra 選路', text: 'bgpd 把 best path 交給 zebra；zebra 寫入 kernel 路由表。', nodes: ['bgpd', 'zebra', 'kern'], edges: ['r2', 'r3'] },
        { title: 'FPM → fpmsyncd → APPL_DB', text: 'zebra 同時透過 FPM 送出路由，fpmsyncd 寫入 <code>APPL_DB ROUTE_TABLE:192.168.0.0/24</code>。', nodes: ['zebra', 'fpm', 'appl'], edges: ['r4', 'r5'] },
        { title: 'RouteOrch 下發', text: 'RouteOrch 建立（或重用）NEXT_HOP_GROUP，寫入 <code>ROUTE_ENTRY</code> 到 ASIC_DB，syncd 呼叫 SAI 寫進晶片。', nodes: ['appl', 'ro', 'asicdb', 'asic'], edges: ['r6', 'r7', 'r8'] },
      ],
    });

    // ---------- ECMP ----------
    const host = root.querySelector('#ecmp');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const NH = ['10.0.0.1 (Ethernet0)', '10.0.0.3 (Ethernet4)', '10.0.0.5 (Ethernet8)', '10.0.0.7 (Ethernet12)'];
    const COLORS = ['var(--k-container)', 'var(--k-proc)', 'var(--k-ext)', 'var(--k-hw)'];
    const flows = Array.from({ length: 12 }, (_, i) => ({ src: `192.168.1.${10 + i}`, dst: '172.16.5.9', sp: 40000 + i * 137, dp: [443, 80, 22, 8080][i % 4] }));
    const hash = f => { let h = 2166136261; for (const c of `${f.src}|${f.dst}|6|${f.sp}|${f.dp}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
    let up = [true, true, true, true];
    let resilient = false;
    let prevMap = null;
    const out = S.el('div');
    function assign() {
      const alive = up.map((u, i) => (u ? i : -1)).filter(i => i >= 0);
      if (!alive.length) return flows.map(() => -1);
      if (resilient) {
        // 簡化的一致性雜湊：固定 64 個 bucket，斷線成員的 bucket 才重新分配
        const buckets = Array.from({ length: 64 }, (_, b) => b % 4);
        const fixed = buckets.map((m, b) => (up[m] ? m : alive[b % alive.length]));
        return flows.map(f => fixed[hash(f) % 64]);
      }
      return flows.map(f => alive[hash(f) % alive.length]);
    }
    function draw() {
      const map = assign();
      const moved = prevMap ? map.filter((m, i) => m !== prevMap[i]).length : 0;
      out.innerHTML = '';
      const ctl = S.el('div', { class: 'row' });
      NH.forEach((n, i) => ctl.appendChild(S.el('button', { class: 'btn sm' + (up[i] ? ' on' : ''), onclick: () => { prevMap = assign(); up[i] = !up[i]; draw(); } }, S.el('span', { class: 'dot ' + (up[i] ? 'up' : 'down') }), n)));
      out.appendChild(ctl);
      const mode = S.el('div', { style: 'margin:10px 0' });
      S.seg(mode, ['一般雜湊 (hash % N)', '彈性雜湊 (resilient)'], i => { if ((i === 1) !== resilient) { prevMap = assign(); resilient = i === 1; draw(); } }, resilient ? 1 : 0);
      out.appendChild(mode);
      const tbl = S.el('div', { class: 'grid c3' });
      flows.forEach((f, i) => {
        const m = map[i];
        const chg = prevMap && prevMap[i] !== m;
        const c = S.el('div', { class: 'card', style: `box-shadow:none;padding:8px 10px;border-left:5px solid ${m >= 0 ? COLORS[m] : 'var(--bad)'};${chg ? 'background:var(--warn-soft)' : ''}` },
          S.el('div', { class: 'mono', style: 'font-size:12px' }, `${f.src}:${f.sp} → ${f.dst}:${f.dp}`),
          S.el('div', { style: 'font-size:13px' }, m >= 0 ? '→ ' + NH[m] : '無可用路徑', chg ? S.el('span', { class: 'badge y', style: 'margin-left:6px' }, '換路徑') : null));
        tbl.appendChild(c);
      });
      out.appendChild(tbl);
      out.appendChild(S.el('div', { class: 'dg-desc', style: 'margin-top:10px', html: prevMap
        ? `上一次變更後，有 <b>${moved}</b> / ${flows.length} 條 flow 換了 next hop。${resilient ? '彈性雜湊只移動原本走斷線路徑的 flow，其他 flow 不受影響（TCP 連線不會亂序）。' : '一般雜湊用「hash mod 存活數」，成員數一變，很多原本正常的 flow 也被重新分配。'}`
        : '點上方按鈕讓某個 next hop 斷線（模擬鏈路 down，RouteOrch 會把它從 NEXT_HOP_GROUP 移除）。' }));
    }
    box.appendChild(out);
    draw();

    S.terminal(root.querySelector('#term'), {
      filter: 'ROUTE',
      db: 'APPL_DB',
      chips: [
        'show ip route',
        'sudo config route add prefix 172.16.0.0/16 nexthop 10.0.0.1',
        'sudo config route add prefix 172.20.0.0/16 nexthop 10.9.9.9',
        'sonic-db-cli APPL_DB keys "ROUTE_TABLE:*"',
        'sonic-db-cli ASIC_DB keys "*ROUTE_ENTRY*"',
        'sudo config interface shutdown Ethernet0',
        'sudo config interface startup Ethernet0',
        'sudo config route del prefix 172.16.0.0/16',
      ],
    });
  },
  keypoints: [
    'FRR（bgpd、zebra）在 bgp 容器中跑協定；SONiC 加上 bgpcfgd（CONFIG_DB → FRR 設定）與 fpmsyncd（FRR → APPL_DB）。',
    'zebra 同時把路由寫進 Linux kernel 與透過 FPM 送給 fpmsyncd。',
    'RouteOrch 把 ROUTE_TABLE 轉成 SAI ROUTE_ENTRY；多個 next hop 時使用 NEXT_HOP_GROUP（ECMP）。',
    '路由的 next hop 必須先被 NeighOrch 解析（有 MAC）才能下到 ASIC。',
    'route_check.py 可以比對 APPL_DB 與 ASIC_DB 路由是否一致。',
  ],
  related: ['neighbor', 'swss', 'syncd-sai', 'cli-lab', 'ecmp'],
  refs: [['FRRouting 文件', 'https://docs.frrouting.org/'], ['SONiC Routing / BGP 設計文件', 'https://github.com/sonic-net/SONiC/tree/master/doc']],
});
