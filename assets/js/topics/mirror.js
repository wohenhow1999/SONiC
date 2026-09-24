S.register({
  id: 'mirror',
  category: 'l2',
  order: 7,
  title: 'Port Mirroring（SPAN / ERSPAN）',
  en: 'Port Mirroring',
  summary: 'SONiC 支援本地鏡像（SPAN）、以 GRE 封裝送往遠端分析器的 ERSPAN，以及以 ACL 選取特定流量的 flow-based mirroring。ERSPAN session 需要路由與鄰居都已解析才會啟用，MirrorOrch 會持續追蹤並在路徑改變時更新硬體。',
  meta: [
    ['程序', ['orchagent (MirrorOrch, AclOrch)']],
    ['CONFIG_DB', ['MIRROR_SESSION', 'ACL_TABLE (type MIRROR / MIRRORV6)', 'ACL_RULE (MIRROR_ACTION)']],
    ['STATE_DB', ['MIRROR_SESSION_TABLE (status active / inactive)']],
    ['SAI 物件', ['MIRROR_SESSION (LOCAL / ENHANCED_REMOTE)', 'PORT_ATTR_INGRESS / EGRESS_MIRROR_SESSION', 'ACL_ENTRY_ATTR_ACTION_MIRROR_INGRESS']],
    ['指令', ['config mirror_session span / erspan add', 'show mirror_session']],
  ],
  tags: ['mirror', 'SPAN', 'ERSPAN', 'port monitoring', 'GRE', 'MirrorOrch', 'flow-based mirroring'],
  keypoints: [
    'SPAN 把來源 port 的流量複製到同一台交換機的目的 port；ERSPAN 把複製的封包以 GRE（protocol 0x88BE）封裝送往遠端 IP。',
    'ERSPAN session 需要：到 dst_ip 的路由、next hop 的 MAC、出口 port；缺一不可，否則 STATE_DB 顯示 inactive。',
    'MirrorOrch 以 observer 方式訂閱 RouteOrch、NeighOrch、FdbOrch 的變化，路徑改變時自動更新 session 的出口與 MAC。',
    'Flow-based mirroring 使用 MIRROR 類型的 ACL table，只有命中規則的流量才被複製。',
    '鏡像流量會佔用出口 port 頻寬；ERSPAN 可指定 DSCP 與佇列避免影響一般流量。',
  ],
  html: `
<h2>三種鏡像方式</h2>
<table>
<thead><tr><th></th><th>SPAN</th><th>ERSPAN</th><th>Flow-based</th></tr></thead>
<tbody>
<tr><td>目的地</td><td>本機 port（或 CPU）</td><td>遠端 IP（GRE 隧道）</td><td>SPAN 或 ERSPAN session</td></tr>
<tr><td>選取</td><td>來源 port / LAG 的全部流量，方向 rx / tx / both</td><td>同 SPAN，或由 ACL 選取</td><td>ACL 規則（L2 / L3 / L4 欄位）</td></tr>
<tr><td>SAI session 類型</td><td><code>SAI_MIRROR_SESSION_TYPE_LOCAL</code></td><td><code>SAI_MIRROR_SESSION_TYPE_ENHANCED_REMOTE</code></td><td>—</td></tr>
<tr><td>綁定方式</td><td>port 屬性 <code>INGRESS / EGRESS_MIRROR_SESSION</code></td><td>port 屬性或 ACL action</td><td>ACL action <code>MIRROR_INGRESS / EGRESS</code></td></tr>
</tbody></table>

<h2>ERSPAN 啟用條件</h2>
<p>MirrorOrch 建立 ERSPAN session 前，必須知道封裝後的外層標頭要怎麼填。切換下列條件，觀察 session 狀態與 SAI 屬性。</p>
<div id="sim"></div>

<h2>封裝格式</h2>
<div id="hdr"></div>

<h2>資料流</h2>
<div id="d-mir"></div>

<h2>設定</h2>
<pre><span class="c"># 社群版：SPAN 與 ERSPAN</span>
sudo config mirror_session span add span1 Ethernet40 Ethernet0 rx
sudo config mirror_session erspan add ers1 10.1.0.1 192.168.100.10 8 64 0x88be 0 Ethernet0 both
show mirror_session
<span class="c"># 社群版：flow-based（ACL 選取）</span>
"ACL_TABLE":  { "EVERFLOW": { "type": "MIRROR", "stage": "ingress", "ports": ["Ethernet0"] } },
"ACL_RULE":   { "EVERFLOW|RULE_1": { "PRIORITY": "100", "SRC_IP": "10.0.0.0/24", "MIRROR_ACTION": "ers1" } }

<span class="c"># Enterprise SONiC</span>
sonic(config)# mirror-session span1
sonic(config-mirror-span1)# destination Eth1/1 source Eth1/2 direction rx
sonic(config)# mirror-session ers1
sonic(config-mirror-ers1)# destination erspan dst-ip 192.168.100.10 src-ip 10.1.0.1 dscp 8 gre 0x88be ttl 64 source Eth1/2 direction both
sonic(config)# mirror-session cpu1
sonic(config-mirror-cpu1)# destination CPU source Eth1/2 direction rx    <span class="c"># 鏡像到 CPU，可在本機 tcpdump</span>
sonic# show mirror-session</pre>
<p class="muted">Enterprise SONiC 的 flow-based 鏡像以 ACL → class-map → policy-map（monitoring）→ service-policy 的方式設定，見 UG460 §8.5.2。</p>
`,
  mount(root) {
    const host = root.querySelector('#sim');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const st = { route: true, neigh: true, port: true, ecmp: false };
    const LBL = { route: '有到 192.168.100.10 的路由', neigh: 'next hop 10.0.0.1 的 ARP 已解析', port: '出口 port Ethernet0 為 up', ecmp: '路由有多個 next hop（ECMP）' };
    function draw() {
      box.innerHTML = '';
      const row = S.el('div', { class: 'row' });
      Object.keys(LBL).forEach(k => row.appendChild(S.el('button', { class: 'btn sm' + (st[k] ? ' on' : ''), onclick: () => { st[k] = !st[k]; draw(); } }, S.el('span', { class: 'dot ' + (st[k] ? 'up' : 'down') }), LBL[k])));
      box.appendChild(row);
      const active = st.route && st.neigh && st.port;
      const why = !st.route ? 'RouteOrch 沒有涵蓋 dst_ip 的路由，無法決定出口。' : !st.neigh ? 'NeighOrch 尚未解析 next hop 的 MAC，外層目的 MAC 無法填寫。' : !st.port ? '出口 port 為 down，無法送出。' : st.ecmp ? '路由有多個 next hop，MirrorOrch 選擇其中一個作為 session 的出口（不做逐封包分散）。' : '所有條件都滿足。';
      const attrs = active ? [
        ['SAI_MIRROR_SESSION_ATTR_TYPE', 'SAI_MIRROR_SESSION_TYPE_ENHANCED_REMOTE'],
        ['SAI_MIRROR_SESSION_ATTR_MONITOR_PORT', 'oid:0x1000000000002 (Ethernet0)'],
        ['SAI_MIRROR_SESSION_ATTR_ERSPAN_ENCAPSULATION_TYPE', 'SAI_ERSPAN_ENCAPSULATION_TYPE_MIRROR_L3_GRE_TUNNEL'],
        ['SAI_MIRROR_SESSION_ATTR_SRC_IP_ADDRESS', '10.1.0.1'],
        ['SAI_MIRROR_SESSION_ATTR_DST_IP_ADDRESS', '192.168.100.10'],
        ['SAI_MIRROR_SESSION_ATTR_DST_MAC_ADDRESS', '0C:42:A1:07:4C:BF (next hop)'],
        ['SAI_MIRROR_SESSION_ATTR_GRE_PROTOCOL_TYPE', '35006 (0x88BE)'],
        ['SAI_MIRROR_SESSION_ATTR_TOS', '32 (DSCP 8)'],
        ['SAI_MIRROR_SESSION_ATTR_TTL', '64'],
      ] : [];
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:12px', html: `STATE_DB <code>MIRROR_SESSION_TABLE|ers1</code> status = <span class="badge ${active ? 'g' : 'r'}">${active ? 'active' : 'inactive'}</span>　${why}` }));
      if (active) {
        const t = S.el('div', { class: 'tbl', style: 'margin-top:10px' });
        t.innerHTML = `<table><thead><tr><th>ASIC_DB SAI_OBJECT_TYPE_MIRROR_SESSION 屬性</th><th>值</th></tr></thead><tbody>${attrs.map(a => `<tr><td><code>${a[0]}</code></td><td class="mono" style="font-size:12.5px">${a[1]}</td></tr>`).join('')}</tbody></table>`;
        box.appendChild(t);
      } else {
        box.appendChild(S.el('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, 'session 為 inactive 時不會建立 SAI MIRROR_SESSION；條件恢復後 MirrorOrch 會自動建立並綁定到來源 port。'));
      }
    }
    draw();

    const H = [['Outer Ethernet', '14 B · next hop MAC', 'var(--k-kernel)', 1.1], ['Outer IPv4', '20 B · src 10.1.0.1 → dst 192.168.100.10 · DSCP / TTL', 'var(--k-container)', 2], ['GRE', '4 B · proto 0x88BE', 'var(--k-db)', .8], ['ERSPAN II', '8 B · session ID', 'var(--k-db)', .8], ['原始封包', '完整 L2 frame', 'var(--k-proc)', 1.6]];
    root.querySelector('#hdr').innerHTML = `<div class="hdr">${H.map(([a, b, c, w]) => `<div style="--hc:${c};--hw:${w}"><b>${a}</b><span>${b}</span></div>`).join('')}</div><p class="muted" style="font-size:13px">SONiC 預設使用 GRE protocol 0x88BE（ERSPAN Type II）；部分平台只支援不帶 ERSPAN 標頭的 GRE 封裝，分析端需依實際格式解碼。</p>`;

    S.diagram(root.querySelector('#d-mir'), {
      title: 'ERSPAN session 的建立與維護',
      w: 1000, h: 330,
      nodes: [
        { id: 'cfg', x: 20, y: 40, w: 180, h: 56, label: 'CONFIG_DB', sub: 'MIRROR_SESSION', kind: 'db', info: '<p><code>MIRROR_SESSION|ers1</code>：type、src_ip、dst_ip、gre_type、dscp、ttl、queue、src_port、direction。</p>' },
        { id: 'mo', x: 280, y: 40, w: 180, h: 56, label: 'MirrorOrch', kind: 'proc', info: '<p>直接訂閱 CONFIG_DB。向 RouteOrch 查詢 dst_ip 的最長前綴路由，再向 NeighOrch 取得 next hop MAC 與出口 port。</p>' },
        { id: 'ro', x: 280, y: 160, w: 180, h: 56, label: 'RouteOrch / NeighOrch', sub: 'observer 通知', kind: 'proc', info: '<p>路由或鄰居改變時通知 MirrorOrch，session 會被更新或變為 inactive。</p>' },
        { id: 'st', x: 540, y: 160, w: 180, h: 56, label: 'STATE_DB', sub: 'MIRROR_SESSION_TABLE', kind: 'db', info: '<p>status：active / inactive。</p>' },
        { id: 'adb', x: 540, y: 40, w: 180, h: 56, label: 'ASIC_DB', sub: 'MIRROR_SESSION', kind: 'db', info: '<p>session 物件與 port 綁定屬性。</p>' },
        { id: 'asic', x: 800, y: 40, w: 180, h: 56, label: 'ASIC', sub: '複製 + GRE 封裝', kind: 'hw', info: '<p>來源 port 的流量在硬體中被複製並封裝，從監控 port 送出。</p>' },
        { id: 'col', x: 800, y: 250, w: 180, h: 56, label: '分析器', sub: '192.168.100.10', kind: 'ext', info: '<p>Wireshark、封包代理（packet broker）或 IDS。</p>' },
        { id: 'acl', x: 20, y: 160, w: 180, h: 56, label: 'ACL (MIRROR)', sub: 'flow-based', kind: 'db', info: '<p>AclOrch 建立 ACL_ENTRY，action 指向 session 的 OID。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'mo', id: 'e1' },
        { from: 'ro', to: 'mo', dash: true, label: '路由 / 鄰居', id: 'e2' },
        { from: 'mo', to: 'adb', id: 'e3' },
        { from: 'mo', to: 'st', id: 'e4' },
        { from: 'adb', to: 'asic', label: 'syncd', id: 'e5' },
        { from: 'asic', to: 'col', label: 'GRE', id: 'e6' },
        { from: 'acl', to: 'adb', dash: true, label: 'MIRROR action', id: 'e7', via: [[110, 128], [630, 128]] },
      ],
      steps: [
        { title: '設定 session', text: 'MirrorOrch 讀到新的 ERSPAN session。', nodes: ['cfg', 'mo'], edges: ['e1'] },
        { title: '解析路徑', text: '查詢 dst_ip 的路由與 next hop MAC；有缺少就標記 inactive 並等待通知。', nodes: ['mo', 'ro', 'st'], edges: ['e2', 'e4'] },
        { title: '建立 SAI session', text: '條件滿足後建立 MIRROR_SESSION，並綁定到來源 port 或 ACL。', nodes: ['mo', 'adb', 'acl'], edges: ['e3', 'e7'] },
        { title: '硬體複製', text: 'ASIC 複製流量、加上外層 IP / GRE 標頭並送往分析器。', nodes: ['adb', 'asic', 'col'], edges: ['e5', 'e6'] },
      ],
    });
  },
  related: ['acl', 'routing', 'neighbor', 'troubleshooting'],
  refs: [['SONiC Everflow / ERSPAN', 'https://github.com/sonic-net/SONiC/wiki/Everflow-High-Level-Design'], ['Enterprise SONiC User Guide UG460：§8.5', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
