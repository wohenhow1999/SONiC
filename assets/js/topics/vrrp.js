S.register({
  id: 'vrrp',
  category: 'l3',
  order: 6,
  title: 'VRRP',
  en: 'Virtual Router Redundancy Protocol',
  summary: 'VRRP 讓多台路由器共用一個虛擬 IP 與虛擬 MAC 作為主機的預設閘道；由優先權最高者擔任 master 回應 ARP 並轉發流量，master 失效時 backup 在數秒內接手。',
  meta: [
    ['程序', ['vrrpd（FRR）', 'vrrpmgrd / 同步程序', 'orchagent (VrrpOrch)']],
    ['協定', ['IP protocol 112', '224.0.0.18 / ff02::12', 'RFC 3768 (v2)', 'RFC 5798 (v3)']],
    ['虛擬 MAC', ['IPv4：00:00:5E:00:01:{VRID}', 'IPv6：00:00:5E:00:02:{VRID}']],
    ['硬體', ['RIF 加入虛擬 MAC（my-MAC）', 'VIP 以 ip2me 路由送往 CPU']],
    ['指令', ['show vrrp', 'show vrrp6', 'show vrrp interface <if> vrid <id>']],
  ],
  tags: ['VRRP', 'VRRPv3', 'first hop redundancy', 'virtual IP', 'virtual MAC', 'master', 'backup', 'preempt', 'track'],
  keypoints: [
    'master 每個 advertisement interval（預設 1 秒）送出通告；backup 超過 master down interval 沒收到通告就接手。',
    'master down interval = 3 × advertisement interval + skew time，skew = (256 − priority) / 256 × interval，優先權高者等待時間較短。',
    'priority 255 保留給 IP address owner（VIP 就是自己介面位址）；可設定範圍為 1–254，預設 100。',
    'preempt 開啟時，優先權較高的路由器恢復後會搶回 master；關閉時維持現有 master，減少不必要的切換。',
    '在 SONiC 中，master 需要讓 ASIC 把目的 MAC 為虛擬 MAC 的封包視為送給自己（L3 處理），並讓 VIP 的封包送到 CPU。',
  ],
  html: `
<h2>協定原理</h2>
<table>
<thead><tr><th>欄位</th><th>說明</th></tr></thead>
<tbody>
<tr><td>VRID</td><td>1–255，同一網段上識別一個虛擬路由器；決定虛擬 MAC 的最後一個 byte</td></tr>
<tr><td>Priority</td><td>1–254（255 為 owner），高者成為 master；相同時比較介面主位址，大者勝</td></tr>
<tr><td>Advertisement interval</td><td>VRRPv2 以秒為單位；VRRPv3 以 centisecond 為單位，可小於 1 秒</td></tr>
<tr><td>Preempt</td><td>是否允許優先權較高的路由器搶回 master</td></tr>
<tr><td>Track</td><td>追蹤上聯介面，介面 down 時降低優先權，讓出 master</td></tr>
<tr><td>VRRPv3</td><td>同時支援 IPv4 與 IPv6，移除 v2 的認證欄位</td></tr>
</tbody></table>

<h2>選舉與切換模擬</h2>
<p>兩台交換機以 VRID 1 提供閘道 <code>10.1.1.1</code>。調整優先權、preempt 與上聯狀態，觀察 master 如何變化與切換所需時間。</p>
<div id="sim"></div>

<h2>在 SONiC 中的實作</h2>
<div id="d-vrrp"></div>
<div class="callout"><div class="ct">與 MCLAG / EVPN 閘道的差異</div><p>VRRP 同一時間只有 master 轉發流量（active / standby）。在資料中心中，MCLAG 的 peer gateway 或 EVPN 的 anycast gateway（所有 leaf 使用相同的閘道 IP 與 MAC）可以讓每台設備都在本地轉發，通常更適合東西向流量。</p></div>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC</span>
sonic(config)# interface Vlan 10
sonic(config-if-Vlan10)# ip address 10.1.1.2/24
sonic(config-if-Vlan10)# vrrp 1 address-family ipv4
sonic(config-if-Vlan10-vrrp-ipv4-1)# vip 10.1.1.1
sonic(config-if-Vlan10-vrrp-ipv4-1)# priority 120
sonic(config-if-Vlan10-vrrp-ipv4-1)# preempt-delay 200               <span class="c"># preempt 預設開啟；no preempt 關閉</span>
sonic(config-if-Vlan10-vrrp-ipv4-1)# advertise-interval 1
sonic(config-if-Vlan10-vrrp-ipv4-1)# version 3
sonic(config-if-Vlan10-vrrp-ipv4-1)# track-interface Eth1/49 weight 30
sonic# show vrrp
sonic# show vrrp interface Vlan10 vrid 1</pre>
`,
  mount(root) {
    const host = root.querySelector('#sim');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const R = { A: { prio: 120, up: true, uplink: true, ip: '10.1.1.2' }, B: { prio: 100, up: true, uplink: true, ip: '10.1.1.3' } };
    const TRACK = 30;
    let preempt = true, adv = 1, master = 'A';
    const log = [];
    const eff = n => R[n].up ? R[n].prio - (R[n].uplink ? 0 : TRACK) : -1;
    const ip2n = s => s.split('.').reduce((a, b) => a * 256 + (+b), 0);
    const better = (x, y) => eff(x) > eff(y) || (eff(x) === eff(y) && ip2n(R[x].ip) > ip2n(R[y].ip));
    const mdi = n => (3 * adv + (256 - Math.max(1, eff(n))) / 256 * adv);
    function evaluate(reason) {
      const other = master === 'A' ? 'B' : 'A';
      if (!R[master].up) {
        if (R[other].up) { log.unshift(`${reason}：${master} 不再送出通告，${other} 等待 master down interval ${mdi(other).toFixed(2)} 秒後成為 master，並送出 gratuitous ARP 更新主機與交換機的 MAC 表。`); master = other; }
        else log.unshift(`${reason}：兩台都失效，閘道中斷。`);
        return;
      }
      if (better(other, master) && R[other].up) {
        if (preempt) { log.unshift(`${reason}：${other} 的有效優先權 ${eff(other)} 高於 ${master} 的 ${eff(master)}，且啟用 preempt → ${other} 立即搶回 master。`); master = other; }
        else log.unshift(`${reason}：${other} 優先權較高，但 preempt 關閉，維持 ${master} 為 master。`);
      } else log.unshift(`${reason}：master 維持 ${master}。`);
    }
    function draw() {
      box.innerHTML = '';
      const g = S.el('div', { class: 'grid c2' });
      ['A', 'B'].forEach(n => {
        const r = R[n];
        const isM = master === n && r.up;
        const sl = S.el('input', { type: 'range', min: 1, max: 254, value: r.prio, id: 'vrrp-p-' + n, style: 'width:100%' });
        sl.addEventListener('change', () => { r.prio = +sl.value; evaluate(`SW-${n} 優先權改為 ${r.prio}`); draw(); });
        g.appendChild(S.el('div', { class: 'card', style: isM ? 'border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)' : '' },
          S.el('div', { class: 'row', style: 'justify-content:space-between' }, S.el('b', null, `SW-${n}（${r.ip}）`), S.el('span', { class: 'badge ' + (!r.up ? 'r' : isM ? 'b' : 'n') }, !r.up ? 'down' : isM ? 'Master' : 'Backup')),
          S.el('label', { class: 'field', for: 'vrrp-p-' + n, style: 'margin-top:8px' }, `設定優先權 ${r.prio}　有效優先權 ${Math.max(0, eff(n))}`, sl),
          S.el('div', { class: 'row', style: 'margin-top:8px' },
            S.el('button', { class: 'btn sm' + (r.up ? ' on' : ''), onclick: () => { r.up = !r.up; evaluate(`SW-${n} ${r.up ? '恢復' : '失效'}`); draw(); } }, S.el('span', { class: 'dot ' + (r.up ? 'up' : 'down') }), r.up ? '設備正常' : '設備失效'),
            S.el('button', { class: 'btn sm' + (r.uplink ? ' on' : ''), onclick: () => { r.uplink = !r.uplink; evaluate(`SW-${n} 上聯 ${r.uplink ? '恢復' : '中斷'}（track −${TRACK}）`); draw(); } }, S.el('span', { class: 'dot ' + (r.uplink ? 'up' : 'down') }), '上聯 Eth1/49'))));
      });
      box.appendChild(g);
      box.appendChild(S.el('div', { class: 'row', style: 'margin-top:10px' },
        S.el('button', { class: 'btn sm' + (preempt ? ' on' : ''), onclick: () => { preempt = !preempt; evaluate(`preempt ${preempt ? '開啟' : '關閉'}`); draw(); } }, 'preempt'),
        S.el('span', { class: 'muted', style: 'font-size:12.5px' }, 'advertisement interval'),
        ...[1, 0.1].map(v => S.el('button', { class: 'btn sm' + (adv === v ? ' on' : ''), onclick: () => { adv = v; draw(); } }, v === 1 ? '1 s' : '100 ms (v3)'))));
      const backup = master === 'A' ? 'B' : 'A';
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html: `虛擬 IP <code>10.1.1.1</code>、虛擬 MAC <code>00:00:5e:00:01:01</code>。backup（SW-${backup}）的 master down interval = 3 × ${adv} + (256 − ${Math.max(1, eff(backup))}) / 256 × ${adv} = <b>${mdi(backup).toFixed(2)} 秒</b>。` + (log.length ? '<hr style="border:0;border-top:1px solid var(--border)">' + log.slice(0, 6).map(l => `<div>${l}</div>`).join('') : '') }));
    }
    draw();

    S.diagram(root.querySelector('#d-vrrp'), {
      title: 'VRRP master 的軟硬體設定',
      w: 1000, h: 320,
      nodes: [
        { id: 'cfg', x: 20, y: 40, w: 180, h: 56, label: 'CONFIG_DB', sub: 'VRRP 設定', kind: 'db', info: '<p>介面、VRID、VIP、priority、preempt、track 等。</p>' },
        { id: 'vrrpd', x: 260, y: 40, w: 180, h: 56, label: 'vrrpd', sub: 'FRR', kind: 'proc', info: '<p>執行 VRRP 狀態機。FRR vrrpd 以 macvlan 介面（帶虛擬 MAC）收發封包並持有 VIP。</p>' },
        { id: 'peer', x: 500, y: 40, w: 180, h: 56, label: '另一台路由器', sub: 'VRRP 通告', kind: 'ext', info: '<p>IP protocol 112，送往 224.0.0.18；由 CoPP trap 到 CPU。</p>' },
        { id: 'appl', x: 260, y: 160, w: 180, h: 56, label: 'APPL_DB', sub: 'VRRP 狀態', kind: 'db', info: '<p>成為 master 時寫入虛擬 MAC 與 VIP；變成 backup 時移除。</p>' },
        { id: 'orch', x: 500, y: 160, w: 180, h: 56, label: 'VrrpOrch', sub: '(orchagent)', kind: 'proc', info: '<p>把虛擬 MAC 加到 RIF（讓 ASIC 對此 MAC 做 L3 處理），並為 VIP 建立 ip2me 路由送往 CPU（回應 ping、ARP）。</p>' },
        { id: 'asic', x: 760, y: 160, w: 200, h: 56, label: 'ASIC', sub: 'virtual MAC → L3', kind: 'hw', info: '<p>主機送往閘道的封包目的 MAC 為虛擬 MAC，master 的 ASIC 直接路由轉發。</p>' },
        { id: 'host', x: 760, y: 40, w: 200, h: 56, label: '主機', sub: 'gateway 10.1.1.1', kind: 'ext', info: '<p>主機只知道 VIP；切換時 master 送出 gratuitous ARP 更新 MAC 表。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'vrrpd', id: 'e1' }, { from: 'vrrpd', to: 'peer', bi: true, label: 'adv', id: 'e2' },
        { from: 'vrrpd', to: 'appl', label: 'master', id: 'e3' }, { from: 'appl', to: 'orch', id: 'e4' }, { from: 'orch', to: 'asic', label: 'SAI', id: 'e5' },
        { from: 'host', to: 'asic', dash: true, label: 'dst MAC = VMAC', id: 'e6' },
      ],
      steps: [
        { title: '設定', text: 'VRRP 設定傳給 vrrpd。', nodes: ['cfg', 'vrrpd'], edges: ['e1'] },
        { title: '選舉', text: '兩台路由器交換通告，優先權高者成為 master。', nodes: ['vrrpd', 'peer'], edges: ['e2'] },
        { title: '硬體設定', text: 'master 的狀態寫入 APPL_DB，VrrpOrch 讓 ASIC 接受虛擬 MAC 並把 VIP 送往 CPU。', nodes: ['vrrpd', 'appl', 'orch', 'asic'], edges: ['e3', 'e4', 'e5'] },
        { title: '轉發', text: '主機以虛擬 MAC 為閘道，封包在 master 的 ASIC 上路由。', nodes: ['host', 'asic'], edges: ['e6'] },
      ],
    });
  },
  related: ['vlan', 'mclag', 'vxlan', 'protection'],
  refs: [['RFC 5798 VRRPv3', 'https://www.rfc-editor.org/rfc/rfc5798'], ['FRR VRRP 文件', 'https://docs.frrouting.org/en/latest/vrrp.html'], ['Enterprise SONiC User Guide UG460：§10.14', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
