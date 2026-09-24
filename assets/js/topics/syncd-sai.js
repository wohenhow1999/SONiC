S.register({
  id: 'syncd-sai',
  category: 'core',
  order: 3,
  title: 'syncd 與 SAI',
  en: 'syncd & Switch Abstraction Interface',
  summary: "SAI 是交換晶片的標準 C API。orchagent 經 sairedis 將 SAI 呼叫序列化至 ASIC_DB，syncd 再將其轉換為對廠商 libsai 的實際呼叫，並負責 VID/RID 對映與晶片事件回報。",
  meta: [["容器", ["syncd"]], ["程序", ["syncd"]], ["函式庫", ["libsairedis", "libsaimeta", "libsai (vendor)"]], ["資料庫", ["ASIC_DB (ASIC_STATE, VIDTORID, RIDTOVID)", "FLEX_COUNTER_DB", "COUNTERS_DB"]], ["原始碼", "<code>sonic-sairedis/syncd/</code>、<code>sonic-sairedis/lib/</code>、<code>opencomputeproject/SAI</code>"]],
  tags: ['SAI', 'syncd', 'sairedis', 'VID', 'RID', 'ASIC'],
  html: `
<h2>SAI 概述</h2>
<p>每家晶片廠都有自己的 SDK，API 完全不同。<b>SAI（Switch Abstraction Interface）</b>在 2015 年由 OCP 社群制定，定義了一套標準的物件模型（Port、VLAN、Route、Next Hop、ACL…）與 C API。晶片廠只要提供 SAI 實作（<code>libsai.so</code>），上層的 SONiC 就不需要知道底下是哪家晶片。</p>
<div class="defs">
  <div><b>物件模型</b><p>每個東西都是 <code>sai_object_type_t</code>，用 <code>sai_object_id_t</code>（OID）識別，並有一組屬性（attribute）。</p></div>
  <div><b>API 分組</b><p><code>sai_port_api</code>、<code>sai_vlan_api</code>、<code>sai_route_api</code>…每組都有 create / remove / set / get。</p></div>
  <div><b>通知回呼</b><p>晶片事件用 callback 回報，例如 <code>port_state_change</code>、<code>fdb_event</code>。</p></div>
</div>

<h2>SAI 呼叫路徑</h2>
<p>orchagent 呼叫的其實是 <b>sairedis</b>（一個「假的」SAI 實作），它不碰硬體，只把呼叫寫進 Redis；真正的 SAI 在 syncd 裡。</p>
<div id="d-sai"></div>

<h2>VID 與 RID</h2>
<p>orchagent 建立物件時，sairedis 會立刻給一個<b>虛擬 OID（VID）</b>，不用等硬體回應，所以 orchagent 可以非同步、快速地一直往下做。syncd 真正建立物件後拿到<b>真實 OID（RID）</b>，並把對應關係記在 ASIC_DB 的 <code>VIDTORID</code> / <code>RIDTOVID</code> 表中。</p>
<div class="callout tip"><div class="ct">設計考量</div><p>1. orchagent 不必等硬體，效率高；2. syncd 重啟或 warm reboot 後，RID 可能改變，但 VID 不變，上層不需重建；3. 可以在不同平台上「重播」同一份操作記錄除錯。</p></div>

<h2>sairedis.rec 記錄格式</h2>
<p>sairedis 會把每一個 SAI 操作記錄在 <code>/var/log/swss/sairedis.rec</code>。點選任一行看它的意思。</p>
<div id="rec"></div>

<h2>SAI API 範例</h2>
<div id="code"></div>

<h2>SAI 實作與 syncd 映像</h2>
<table><thead><tr><th>平台</th><th>syncd 映像</th><th>說明</th></tr></thead><tbody>
<tr><td>Broadcom</td><td><code>docker-syncd-brcm</code></td><td>Tomahawk / Trident 系列，SAI 由 Broadcom 以 binary 提供</td></tr>
<tr><td>NVIDIA (Mellanox)</td><td><code>docker-syncd-mlnx</code></td><td>Spectrum 系列</td></tr>
<tr><td>Marvell</td><td><code>docker-syncd-mrvl</code> 等</td><td>Prestera / Teralynx 系列</td></tr>
<tr><td>Virtual Switch</td><td><code>docker-syncd-vs</code></td><td><b>saivs</b>：用軟體模擬的 SAI，用在 KVM 虛擬機測試（sonic-vs），不需要實體硬體</td></tr>
</tbody></table>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-sai'), {
      title: 'orchagent → sairedis → ASIC_DB → syncd → libsai → ASIC',
      w: 1000, h: 440,
      groups: [
        { x: 16, y: 16, w: 250, h: 260, label: 'swss 容器' },
        { x: 296, y: 16, w: 310, h: 400, label: 'Redis ASIC_DB (1)', kind: 'db' },
        { x: 636, y: 16, w: 348, h: 260, label: 'syncd 容器' },
      ],
      nodes: [
        { id: 'orch', x: 36, y: 56, w: 210, h: 56, label: 'orchagent', sub: 'RouteOrch 等', kind: 'proc', info: '<p>像呼叫一般 SAI 一樣：<code>sai_vlan_api->create_vlan(&amp;vlan_oid, switch_id, 1, &amp;attr)</code>。</p>' },
        { id: 'sr', x: 36, y: 176, w: 210, h: 70, label: 'libsairedis', sub: '把 SAI 呼叫序列化到 Redis', kind: 'proc', info: '<p>實作了 SAI 介面，但只把操作（物件型別、VID、屬性）序列化寫入 ASIC_DB，並記錄到 <code>sairedis.rec</code>。create 時立即回傳 VID。</p>' },
        { id: 'st', x: 316, y: 56, w: 270, h: 56, label: 'ASIC_STATE', sub: 'create / set / remove 請求', kind: 'db', info: '<p>所有 SAI 物件的「期望狀態」。key 形如 <code>ASIC_STATE:SAI_OBJECT_TYPE_VLAN:oid:0x26…</code>。</p>' },
        { id: 'resp', x: 316, y: 146, w: 270, h: 56, label: 'GETRESPONSE', sub: 'get / 同步回應', kind: 'db', info: '<p>get 操作（以及同步模式下 create/set 的結果）需要等待 syncd 回覆，回覆透過這個 channel 回傳。</p>' },
        { id: 'nt', x: 316, y: 236, w: 270, h: 56, label: 'NOTIFICATIONS', sub: '晶片事件', kind: 'db', info: '<p>syncd 把廠商 SAI 的 callback（port 狀態變化、FDB 事件、switch shutdown…）發佈到這個 channel，orchagent 訂閱它。</p>' },
        { id: 'map', x: 316, y: 330, w: 270, h: 56, label: 'VIDTORID / RIDTOVID', kind: 'db', info: '<p>虛擬 OID ↔ 真實 OID 的雙向對照表，由 syncd 維護。</p>' },
        { id: 'syncd', x: 656, y: 56, w: 308, h: 56, label: 'syncd', sub: '取出請求、VID→RID 轉換', kind: 'proc', info: '<p>主迴圈從 ASIC_DB 取出操作，把屬性中的 VID 都翻成 RID，再呼叫真正的 SAI。</p>' },
        { id: 'lib', x: 656, y: 176, w: 146, h: 70, label: 'libsai.so', sub: '廠商 SAI', kind: 'hw', info: '<p>晶片廠提供的 SAI 實作。</p>' },
        { id: 'sdk', x: 818, y: 176, w: 146, h: 70, label: '廠商 SDK', sub: '+ kernel driver', kind: 'hw', info: '<p>廠商私有的 SDK 與驅動程式，直接操作晶片暫存器與表格。</p>' },
        { id: 'asic', x: 656, y: 340, w: 308, h: 56, label: '交換晶片 ASIC', kind: 'hw', info: '<p>硬體轉發表（L2 FDB、L3 LPM、ACL TCAM…）在這裡。</p>' },
      ],
      edges: [
        { from: 'orch', to: 'sr', label: 'SAI API', id: 'a1' },
        { from: 'sr', to: 'st', label: '序列化', id: 'a2', via: [[280, 211], [280, 84]] },
        { from: 'st', to: 'syncd', label: '取出', id: 'a3' },
        { from: 'syncd', to: 'map', dash: true, label: '查表 / 更新', id: 'a4', via: [[646, 110], [646, 358]], lx: 616, ly: 380 },
        { from: 'syncd', to: 'lib', label: '真正的 SAI', id: 'a5' },
        { from: 'lib', to: 'sdk', id: 'a6' },
        { from: 'sdk', to: 'asic', id: 'a7' },
        { from: 'asic', to: 'syncd', dash: true, label: '事件', id: 'b1', via: [[975, 368], [975, 84]] },
        { from: 'syncd', to: 'nt', id: 'b2', via: [[611, 108], [611, 264]] },
        { from: 'nt', to: 'sr', dash: true, id: 'b3', label: '通知' },
        { from: 'syncd', to: 'resp', dash: true, id: 'c1', via: [[626, 96], [626, 174]] },
      ],
      steps: [
        { title: 'orchagent 呼叫 SAI', text: 'RouteOrch 呼叫 <code>create_route_entry()</code>，但接收呼叫的是 <b>libsairedis</b>。', nodes: ['orch', 'sr'], edges: ['a1'] },
        { title: '寫進 ASIC_DB', text: 'sairedis 把「物件型別 + key + 屬性」寫進 <code>ASIC_STATE</code>，並記錄在 sairedis.rec；orchagent 立刻繼續處理下一個任務。', nodes: ['sr', 'st'], edges: ['a2'] },
        { title: 'syncd 取出並轉換 OID', text: 'syncd 取出請求，把 next hop 的 VID 透過 <code>VIDTORID</code> 換成真實 RID。', nodes: ['st', 'syncd', 'map'], edges: ['a3', 'a4'] },
        { title: '呼叫廠商 SAI', text: 'syncd 呼叫真正的 <code>libsai.so</code>，廠商 SAI 再透過 SDK 寫進晶片。', nodes: ['syncd', 'lib', 'sdk', 'asic'], edges: ['a5', 'a6', 'a7'] },
        { title: '反方向：晶片事件', text: '某個埠的鏈路 up 了：SDK 觸發 SAI callback <code>port_state_change</code>，syncd 收到。', nodes: ['asic', 'syncd'], edges: ['b1'] },
        { title: '通知 orchagent', text: 'syncd 把 RID 轉回 VID，發佈到 <code>NOTIFICATIONS</code>；sairedis 的通知執行緒收到後呼叫 orchagent 註冊的 callback，PortsOrch 更新 APPL_DB / STATE_DB 的 oper_status。', nodes: ['syncd', 'nt', 'sr', 'orch'], edges: ['b2', 'b3', 'a1'] },
      ],
    });

    // sairedis.rec 解讀器
    const LINES = [
      ['2024-07-01.08:00:01.123456|a|INIT_VIEW', 'a', '<b>a = 通知 syncd</b>。orchagent 啟動時告訴 syncd 進入 INIT_VIEW：接下來的操作先放在「暫存視圖」，等全部下完再 <code>APPLY_VIEW</code> 一次比較差異套用，這是 warm/fast reboot 的基礎。'],
      ['2024-07-01.08:00:01.223456|c|SAI_OBJECT_TYPE_SWITCH:oid:0x21000000000000|SAI_SWITCH_ATTR_INIT_SWITCH=true|SAI_SWITCH_ATTR_SRC_MAC_ADDRESS=52:54:00:AB:CD:01', 'c', '<b>c = create</b>。建立 switch 物件（整顆晶片），這是第一個物件，初始化 ASIC。'],
      ['2024-07-01.08:00:05.000001|c|SAI_OBJECT_TYPE_VLAN:oid:0x26000000000616|SAI_VLAN_ATTR_VLAN_ID=100', 'c', '<b>c = create</b>。建立 VLAN 100。<code>oid:0x26…</code> 是 VID，最高位元組 0x26 代表物件型別 VLAN。'],
      ['2024-07-01.08:00:05.100001|s|SAI_OBJECT_TYPE_PORT:oid:0x1000000000004|SAI_PORT_ATTR_ADMIN_STATE=true', 's', '<b>s = set</b>。設定某個 port 的屬性：admin up。對應 <code>config interface startup</code>。'],
      ['2024-07-01.08:00:06.000001|c|SAI_OBJECT_TYPE_ROUTE_ENTRY:{"dest":"172.16.0.0/16","switch_id":"oid:0x21000000000000","vr":"oid:0x3000000000022"}|SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID=oid:0x40000000006e1', 'c', '<b>c = create</b>。路由是「非 OID 物件」，key 是 JSON（目的網段 + virtual router）。屬性指向一個 NEXT_HOP 物件（0x4 = NEXT_HOP 型別）。'],
      ['2024-07-01.08:00:07.000001|g|SAI_OBJECT_TYPE_SWITCH:oid:0x21000000000000|SAI_SWITCH_ATTR_PORT_NUMBER=0', 'g', '<b>g = get</b>。詢問晶片有幾個 port。get 是同步的，orchagent 會等待回應。'],
      ['2024-07-01.08:00:07.000900|G|SAI_STATUS_SUCCESS|SAI_SWITCH_ATTR_PORT_NUMBER=32', 'G', '<b>G = get response</b>。syncd 經由 GETRESPONSE 回覆：成功，共 32 個 port。'],
      ['2024-07-01.08:00:09.000001|n|port_state_change|[{"port_id":"oid:0x1000000000004","port_state":"SAI_PORT_OPER_STATUS_UP"}]|', 'n', '<b>n = notification</b>。晶片回報：這個 port 鏈路 UP 了。'],
      ['2024-07-01.08:00:10.000001|r|SAI_OBJECT_TYPE_VLAN_MEMBER:oid:0x27000000000619', 'r', '<b>r = remove</b>。刪除一個 VLAN member（0x27 = VLAN_MEMBER 型別）。'],
    ];
    const rec = root.querySelector('#rec');
    const box = S.el('div', { class: 'w-box' });
    const pre = S.el('div', { class: 'term-out', style: 'background:var(--code-bg);border-radius:8px;max-height:none;cursor:pointer' });
    const exp = S.el('div', { class: 'dg-desc', style: 'margin-top:10px' });
    exp.innerHTML = '<span class="muted">點選上面任一行。</span>';
    LINES.forEach(([l, op, e]) => {
      const parts = l.split('|');
      const row = S.el('div', { style: 'padding:3px 4px;border-radius:4px' });
      row.innerHTML = `<span class="dim">${S.esc(parts[0])}</span>|<span class="p" style="font-weight:700">${S.esc(parts[1])}</span>|<span class="ok">${S.esc(parts.slice(2).join('|'))}</span>`;
      row.addEventListener('click', () => {
        [...pre.children].forEach(r => (r.style.background = ''));
        row.style.background = '#23304a';
        exp.innerHTML = e;
      });
      pre.appendChild(row);
    });
    box.appendChild(S.el('div', { class: 'row', style: 'margin-bottom:8px;font-size:13px' }, S.el('span', { class: 'muted' }, '操作代碼：'),
      ...[['c', 'create'], ['r', 'remove'], ['s', 'set'], ['g', 'get'], ['G', 'get 回應'], ['n', '通知'], ['a', '控制']].map(([a, b]) => S.el('span', { class: 'badge b mono' }, `${a}=${b}`))));
    box.appendChild(pre); box.appendChild(exp);
    rec.appendChild(box);

    S.tabs(root.querySelector('#code'), [
      { label: '建立 VLAN', html: `<pre><span class="k">sai_attribute_t</span> attr;
<span class="k">sai_object_id_t</span> vlan_oid;

attr.id = SAI_VLAN_ATTR_VLAN_ID;
attr.value.u16 = <span class="n">100</span>;

<span class="c">/* orchagent 中 sai_vlan_api 指向 sairedis 的實作 */</span>
<span class="k">sai_status_t</span> status = sai_vlan_api-&gt;create_vlan(&amp;vlan_oid, gSwitchId, <span class="n">1</span>, &amp;attr);
<span class="c">/* 立即拿到 VID，例如 oid:0x26000000000616 */</span></pre>` },
      { label: '建立路由', html: `<pre><span class="k">sai_route_entry_t</span> route_entry;
route_entry.switch_id = gSwitchId;
route_entry.vr_id     = gVirtualRouterId;
route_entry.destination = <span class="s">172.16.0.0/16</span>;   <span class="c">/* sai_ip_prefix_t */</span>

<span class="k">sai_attribute_t</span> attr;
attr.id = SAI_ROUTE_ENTRY_ATTR_NEXT_HOP_ID;
attr.value.oid = next_hop_oid;          <span class="c">/* NeighOrch 建立的 NEXT_HOP */</span>

sai_route_api-&gt;create_route_entry(&amp;route_entry, <span class="n">1</span>, &amp;attr);</pre>` },
      { label: 'Port admin up', html: `<pre><span class="k">sai_attribute_t</span> attr;
attr.id = SAI_PORT_ATTR_ADMIN_STATE;
attr.value.booldata = <span class="k">true</span>;

sai_port_api-&gt;set_port_attribute(port_oid, &amp;attr);</pre>` },
      { label: '註冊通知', html: `<pre><span class="c">/* syncd 在建立 switch 時註冊 callback */</span>
<span class="k">void</span> on_port_state_change(<span class="k">uint32_t</span> count, <span class="k">const sai_port_oper_status_notification_t</span> *data)
{
    <span class="c">/* 轉成 VID 後發佈到 ASIC_DB 的 NOTIFICATIONS channel */</span>
}

attr.id = SAI_SWITCH_ATTR_PORT_STATE_CHANGE_NOTIFY;
attr.value.ptr = (<span class="k">void</span> *)on_port_state_change;</pre>` },
    ]);
  },
  keypoints: [
    'SAI 是標準 C API；晶片廠提供 libsai.so 實作，讓 SONiC 能跨晶片。',
    'orchagent 呼叫的是 sairedis：把 SAI 操作序列化到 ASIC_DB，並立即回傳虛擬 OID（VID）。',
    'syncd 是唯一呼叫真正 SAI 的程序，負責 VID↔RID 轉換，並把晶片事件經 NOTIFICATIONS 回報。',
    '/var/log/swss/sairedis.rec 用 c/r/s/g/G/n 等代碼記錄每一個 SAI 操作。',
    'saivs 是軟體模擬的 SAI，讓 SONiC 能在虛擬機上跑完整測試。',
  ],
  related: ['swss', 'redis-db', 'reboot', 'architecture'],
  refs: [['SAI 規格', 'https://github.com/opencomputeproject/SAI'], ['sonic-sairedis 原始碼', 'https://github.com/sonic-net/sonic-sairedis']],
});
