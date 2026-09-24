S.register({
  id: 'nat',
  category: 'l3',
  order: 8,
  title: 'NAT',
  en: 'Network Address Translation',
  summary: 'SONiC 的 NAT 結合 Linux netfilter 與 ASIC：靜態項目直接下發到硬體；動態項目的第一個封包被送到 CPU，由 kernel iptables 完成轉換並建立 conntrack，natsyncd 再把 conntrack 同步成硬體 NAT 項目，後續封包由 ASIC 以線速轉換。',
  meta: [
    ['容器', ['nat']],
    ['程序', ['natmgrd', 'natsyncd', 'orchagent (NatOrch)']],
    ['CONFIG_DB', ['NAT_GLOBAL', 'STATIC_NAT', 'STATIC_NAPT', 'NAT_POOL', 'NAT_BINDINGS', 'INTERFACE nat_zone']],
    ['APPL_DB', ['NAT_TABLE', 'NAPT_TABLE', 'NAT_TWICE_TABLE', 'NAPT_TWICE_TABLE', 'NAT_GLOBAL_TABLE']],
    ['SAI', ['NAT_ENTRY（SOURCE_NAT / DESTINATION_NAT / DOUBLE_NAT）', 'trap src_nat_miss / dest_nat_miss']],
    ['指令', ['show nat translations', 'show nat statistics', 'show nat config', 'sonic-clear nat translations']],
  ],
  tags: ['NAT', 'SNAT', 'DNAT', 'NAPT', 'PAT', 'twice NAT', 'conntrack', 'iptables', 'natsyncd', 'nat zone'],
  keypoints: [
    'NAT zone 決定方向：zone 0 為內部，其他 zone 為外部；封包從內部 zone 往外部 zone 時做 SNAT，反向做 DNAT。',
    '靜態 NAT / NAPT 由 natmgrd 同時寫入 iptables 與 APPL_DB，NatOrch 直接建立硬體項目。',
    '動態 NAPT 以 pool + binding（ACL 選取來源）定義；第一個封包因硬體沒有項目而被 trap，kernel 完成轉換後由 natsyncd 從 conntrack 事件建立硬體項目。',
    'Twice NAT 同時轉換來源與目的，以 twice-nat-id 把一條 SNAT 與一條 DNAT 配對。',
    '老化依靠硬體 hit bit：NatOrch 定期讀取，閒置超過 timeout 的項目從硬體與 conntrack 移除。',
  ],
  html: `
<h2>轉換類型</h2>
<table>
<thead><tr><th>類型</th><th>轉換</th><th>範例</th></tr></thead>
<tbody>
<tr><td>Static NAT</td><td>一對一 IP</td><td>10.0.0.5 ↔ 125.4.4.4</td></tr>
<tr><td>Static NAPT</td><td>IP + port 一對一</td><td>TCP 10.0.0.5:22 ↔ 125.4.4.4:2222（對外提供服務）</td></tr>
<tr><td>Dynamic NAT</td><td>內部位址從 pool 取得對外 IP</td><td>10.0.0.0/24 → pool 65.55.45.10–15</td></tr>
<tr><td>Dynamic NAPT（PAT）</td><td>多個內部位址共用 pool 的 IP，以 port 區分</td><td>10.0.0.0/24 → 65.55.45.10:500–1000</td></tr>
<tr><td>Twice NAT</td><td>同一個流量同時轉換來源與目的</td><td>重疊位址空間之間的互通</td></tr>
</tbody></table>

<h2>動態 NAPT 的第一個封包</h2>
<div id="d-nat"></div>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config nat feature enable
sudo config interface nat_zone Ethernet0 1                 <span class="c"># 外部介面</span>
sudo config nat add static basic 125.4.4.4 10.0.0.5
sudo config nat add static tcp 125.4.4.4 2222 10.0.0.5 22
sudo config nat add pool Pool1 65.55.45.10-65.55.45.15 500-1000
sudo config nat add binding Bind1 Pool1 NAT_ACL
sudo config nat set timeout 600
show nat translations
show nat statistics

<span class="c"># Enterprise SONiC</span>
sonic(config)# nat
sonic(config-nat)# enable
sonic(config-nat)# static basic 125.4.4.4 12.1.1.1
sonic(config-nat)# static tcp 123.3.4.1 901 11.11.1.1 1000
sonic(config-nat)# pool Pool3 65.55.45.10-65.55.45.15 500-1000
sonic(config-nat)# binding Bind1 Pool3 10_ACL_IPV4
sonic(config-nat)# static basic 100.100.100.100 15.15.15.15 snat twice-nat-id 5
sonic(config-nat)# static basic 200.200.200.5 17.17.17.17 dnat twice-nat-id 5
sonic(config)# interface Eth1/2
sonic(config-if-Eth1/2)# nat-zone 1</pre>

<h2>計時與容量</h2>
<table>
<thead><tr><th>參數</th><th>預設</th><th>說明</th></tr></thead>
<tbody>
<tr><td>nat_timeout</td><td>600 秒</td><td>一般（非 TCP / UDP）NAT 項目閒置時間</td></tr>
<tr><td>nat_tcp_timeout</td><td>86400 秒</td><td>TCP NAPT 項目</td></tr>
<tr><td>nat_udp_timeout</td><td>300 秒</td><td>UDP NAPT 項目</td></tr>
<tr><td>容量</td><td>依晶片</td><td>以 <code>crm show resources all</code> 查看 snat / dnat 表使用量；表滿時新流量維持在 kernel 處理，效能下降</td></tr>
</tbody></table>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-nat'), {
      title: '動態 NAPT：由 kernel 處理第一個封包，再下發到硬體',
      w: 1000, h: 380,
      groups: [{ x: 250, y: 150, w: 480, h: 210, label: 'CPU（kernel + nat 容器）', kind: 'kernel' }],
      nodes: [
        { id: 'host', x: 20, y: 40, w: 170, h: 56, label: '內部主機', sub: '10.0.0.5:40000', kind: 'ext', info: '<p>位於 NAT zone 0 的主機發起連線。</p>' },
        { id: 'asic', x: 280, y: 40, w: 420, h: 56, label: 'ASIC：查詢 NAT 表', sub: '命中 → 線速轉換；未命中 → trap src_nat_miss', kind: 'hw', info: '<p>硬體 NAT 表以 5-tuple 為 key。第一個封包沒有對應項目，被送到 CPU。</p>' },
        { id: 'out', x: 800, y: 40, w: 180, h: 56, label: '外部網路', sub: '8.8.8.8:443', kind: 'ext', info: '<p>看到的來源為 65.55.45.10:500。</p>' },
        { id: 'ipt', x: 280, y: 190, w: 200, h: 60, label: 'iptables / conntrack', sub: 'kernel', kind: 'kernel', info: '<p>natmgrd 事先依 pool / binding 寫好 iptables SNAT 規則。kernel 完成轉換並建立 conntrack 項目，封包從 kernel 送出。</p>' },
        { id: 'sync', x: 510, y: 190, w: 200, h: 60, label: 'natsyncd', kind: 'proc', info: '<p>監聽 netfilter conntrack 事件（NEW），把轉換結果寫入 APPL_DB NAPT_TABLE（正反兩個方向各一筆）。</p>' },
        { id: 'mgr', x: 280, y: 290, w: 200, h: 56, label: 'natmgrd', kind: 'proc', info: '<p>讀 CONFIG_DB：設定 iptables 規則，並把靜態項目與全域設定寫入 APPL_DB。</p>' },
        { id: 'appl', x: 510, y: 290, w: 200, h: 56, label: 'APPL_DB', sub: 'NAPT_TABLE', kind: 'db', info: '<p>例如 <code>NAPT_TABLE:TCP:10.0.0.5:40000</code> → translated_ip 65.55.45.10、translated_l4_port 500。</p>' },
        { id: 'orch', x: 800, y: 290, w: 180, h: 56, label: 'NatOrch', kind: 'proc', info: '<p>建立 SAI NAT_ENTRY，並定期讀取 hit bit 決定是否老化。</p>' },
      ],
      edges: [
        { from: 'host', to: 'asic', label: '第 1 個封包', id: 'e1' },
        { from: 'asic', to: 'ipt', label: 'trap', id: 'e2' },
        { from: 'ipt', to: 'out', label: 'SNAT 後送出', id: 'e3', via: [[380, 130], [890, 130]] },
        { from: 'ipt', to: 'sync', label: 'conntrack NEW', id: 'e4' },
        { from: 'sync', to: 'appl', id: 'e5' },
        { from: 'appl', to: 'orch', id: 'e6' },
        { from: 'orch', to: 'asic', label: 'NAT_ENTRY', id: 'e7', via: [[890, 160], [640, 160]] },
        { from: 'mgr', to: 'ipt', dash: true, label: 'iptables 規則', id: 'e8' },
      ],
      steps: [
        { title: '事前設定', text: 'natmgrd 依 pool 與 binding 建立 iptables SNAT 規則。', nodes: ['mgr', 'ipt'], edges: ['e8'] },
        { title: '第一個封包未命中', text: '硬體 NAT 表沒有此 5-tuple，封包被 trap 到 CPU。', nodes: ['host', 'asic', 'ipt'], edges: ['e1', 'e2'] },
        { title: 'kernel 轉換', text: 'kernel 依 iptables 選出 65.55.45.10:500，完成 SNAT 後送出，並建立 conntrack。', nodes: ['ipt', 'out'], edges: ['e3'] },
        { title: '同步到硬體', text: 'natsyncd 收到 conntrack 事件，寫入 APPL_DB；NatOrch 建立正反向 NAT_ENTRY。', nodes: ['ipt', 'sync', 'appl', 'orch', 'asic'], edges: ['e4', 'e5', 'e6', 'e7'] },
        { title: '後續封包', text: '同一連線的後續封包在 ASIC 中直接轉換，不再經過 CPU。', nodes: ['host', 'asic', 'out'], edges: ['e1'] },
      ],
    });
  },
  related: ['acl', 'copp', 'vrf'],
  refs: [['SONiC NAT HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/nat/nat_design_spec.md'], ['Enterprise SONiC User Guide UG460：§10.15、§24.23', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
