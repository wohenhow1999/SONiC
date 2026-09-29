S.register({
  id: 'mclag',
  category: 'dc',
  order: 2,
  title: 'MCLAG',
  en: 'Multi-Chassis Link Aggregation',
  summary: 'MCLAG 讓兩台交換機對下游設備呈現為同一台 LACP 對端，下游以一個 port channel 同時連到兩台，兩條鏈路都能轉發。兩台 peer 以 ICCP 同步 MAC、ARP、介面狀態，並以 peer link isolation 防止 BUM 流量迴圈。',
  meta: [
    ['容器', ['iccpd']],
    ['程序', ['iccpd', 'mclagsyncd', 'teamd', 'orchagent (PortsOrch, FdbOrch, IsoGrpOrch)']],
    ['CONFIG_DB', ['MCLAG_DOMAIN', 'MCLAG_INTERFACE', 'MCLAG_UNIQUE_IP', 'MCLAG_GW_MAC']],
    ['STATE_DB', ['MCLAG_TABLE', 'MCLAG_LOCAL_INTF_TABLE', 'MCLAG_REMOTE_INTF_TABLE']],
    ['協定', ['ICCP（TCP 8888）', 'LACP 共用 system ID']],
    ['指令', ['show mclag brief', 'show mclag interface <domain> <po>', 'show mac', 'show arp']],
  ],
  tags: ['MCLAG', 'MLAG', 'vPC', 'ICCP', 'peer link', 'keepalive', 'split-brain', 'orphan port', 'peer gateway', 'delay restore', 'isolation'],
  keypoints: [
    'MCLAG domain 由兩台 peer、一條 keepalive（L3，承載 ICCP）與一條 peer link（資料備援路徑）組成；IP 較小者為 active，另一台為 standby。',
    '兩台 peer 在 LACP 中使用相同的 system MAC，下游設備因此把兩台的鏈路聚合成同一個 LAG。',
    'Peer link isolation：從 peer link 進來的 BUM 流量不會再送往兩端都 up 的 MCLAG 介面，避免下游收到重複封包；某一端 MCLAG 成員 down 時才解除該介面的隔離。',
    'MAC、ARP / ND 經 ICCP 同步，使兩台都能直接轉發；閘道以 anycast 位址或 peer gateway 讓兩台都能路由。',
    'primary keepalive 中斷但 backup keepalive 確認 active 仍存活時，standby 會關閉自己的 MCLAG port channel，避免 split-brain。',
  ],
  html: `
<h2>拓樸與流量</h2>
<p>兩台 peer 對下游呈現為同一台 LACP 設備。逐步播放可以看到正常轉送、orphan port 的流量，以及成員鏈路失效時流量如何經 peer link 繞行。</p>
<div id="d-mc3"></div>

<h2>架構與名詞</h2>
<table>
<thead><tr><th>名詞</th><th>說明</th></tr></thead>
<tbody>
<tr><td>MCLAG domain</td><td>一對 peer 交換機，domain ID 1–4095，每台交換機只能屬於一個 domain</td></tr>
<tr><td>Keepalive</td><td>peer 之間的 L3 連線，承載 ICCP：週期性心跳（keepalive interval 預設 1 秒，session timeout 預設 30 秒）與狀態同步</td></tr>
<tr><td>Backup keepalive</td><td>走不同路徑的第二條心跳（Enterprise），只用於判斷 active 是否存活，不同步資料</td></tr>
<tr><td>Peer link</td><td>peer 之間的資料鏈路（通常是 port channel），攜帶所有 MCLAG VLAN；在 MCLAG 成員失效或 orphan port 通訊時承載流量</td></tr>
<tr><td>MCLAG interface</td><td>設定為 MCLAG 的 port channel，兩台 peer 上相同編號</td></tr>
<tr><td>Orphan port</td><td>只接到其中一台 peer、但屬於 MCLAG VLAN 的介面</td></tr>
<tr><td>Delay restore</td><td>peer 重開機後延遲啟用 MCLAG 介面，等 MAC / ARP 同步完成與路由收斂</td></tr>
<tr><td>MCLAG system MAC</td><td>兩台共用的 LACP system ID；設定後才可能出現 split-brain（兩台都保持 MCLAG up）</td></tr>
</tbody></table>

<h2>失效情境模擬</h2>
<p>Host A 以 PortChannel10 同時連到 Peer1（10.0.0.1，active）與 Peer2（10.0.0.2，standby）；Host C 只接 Peer2（orphan port）。切換各鏈路與設備狀態，觀察 MCLAG 介面狀態與流量路徑。</p>
<div id="sim"></div>

<h2>在 SONiC 中的實作</h2>
<div id="d-mclag"></div>
<table>
<thead><tr><th>同步項目</th><th>方向</th><th>用途</th></tr></thead>
<tbody>
<tr><td>MCLAG 介面 oper 狀態</td><td>雙向</td><td>對端 MCLAG 成員 down 時，解除本端 peer link 對該介面的隔離，並把流向該主機的流量改走本地</td></tr>
<tr><td>MAC（FDB）</td><td>雙向</td><td>對端學到的 MAC 在本端安裝為指向本地 MCLAG 介面（或 peer link），避免持續泛洪</td></tr>
<tr><td>ARP / ND</td><td>雙向</td><td>兩台都有完整鄰居表，任一台都能直接路由到主機</td></tr>
<tr><td>STP / LACP 狀態</td><td>雙向</td><td>MCLAG 上執行 STP 時兩台以同一個 bridge 身分運作</td></tr>
<tr><td>系統 MAC、角色</td><td>雙向</td><td>決定 active / standby 與 LACP system ID</td></tr>
</tbody></table>

<h2>L3 閘道選項</h2>
<table>
<thead><tr><th>方式</th><th>說明</th></tr></thead>
<tbody>
<tr><td>Anycast gateway</td><td>兩台 VLAN 介面設定相同的 IP 與 gateway MAC（<code>mclag gateway-mac</code>、<code>ip anycast-address</code>），主機的閘道流量由收到的那台直接路由</td></tr>
<tr><td>Peer gateway</td><td>各自使用不同 IP，但每台也會路由目的 MAC 為對端 router MAC 的封包，避免因 LAG 雜湊把回程流量繞過 peer link</td></tr>
<tr><td>Separate IP（unique IP）</td><td>VLAN 介面在兩台使用不同 IP 且不同步 ARP，用於需要各自建立路由協定鄰居的場景（<code>mclag-separate-ip</code>）</td></tr>
<tr><td>VRRP</td><td>只有 master 路由；流量進到 backup 會經 peer link 送往 master，效率較差</td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC（兩台 peer 設定對稱，IP 互換）</span>
sonic(config)# mclag domain 1
sonic(config-mclag-1)# source-ip 10.0.0.1
sonic(config-mclag-1)# peer-ip 10.0.0.2
sonic(config-mclag-1)# peer-link PortChannel100
sonic(config-mclag-1)# mclag-system-mac 00:11:22:33:44:55
sonic(config-mclag-1)# keepalive-interval 1
sonic(config-mclag-1)# session-timeout 30
sonic(config-mclag-1)# delay-restore 300
sonic(config-mclag-1)# backup-keepalive source-ip 192.168.0.1
sonic(config-mclag-1)# backup-keepalive peer-ip 192.168.0.2
sonic(config-mclag-1)# backup-keepalive interval 30
sonic(config)# interface PortChannel10
sonic(config-if-po10)# mclag 1
sonic(config)# mclag gateway-mac 00:00:5e:00:01:01
sonic(config)# interface Vlan 100
sonic(config-if-Vlan100)# ip anycast-address 10.100.0.1/24
sonic# show mclag brief
sonic# show mclag interface 1 10

<span class="c"># 社群版</span>
sudo config mclag add 1 10.0.0.1 10.0.0.2 PortChannel100
sudo config mclag member add 1 PortChannel10
sudo config mclag unique-ip add Vlan100
mclagdctl dump state</pre>
`,
  mount(root) {
    const host = root.querySelector('#sim');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const st = { p1: true, p2: true, m1: true, m2: true, pl: true, ka: true, bka: true, up1: true };
    const LBL = { p1: 'Peer1 設備', p2: 'Peer2 設備', m1: 'Host A ↔ Peer1 成員', m2: 'Host A ↔ Peer2 成員', pl: 'Peer link', ka: 'Primary keepalive', bka: 'Backup keepalive', up1: 'Peer1 上聯（LST）' };
    function evalState() {
      const out = { notes: [] };
      const session = st.p1 && st.p2 && st.ka;
      out.session = session;
      // 角色
      out.active = st.p1 ? 'Peer1' : st.p2 ? 'Peer2' : null;
      // MCLAG 介面狀態
      let po1 = st.p1 && st.m1, po2 = st.p2 && st.m2;
      if (st.p1 && !st.up1 && po1) { po1 = false; out.notes.push('Peer1 上聯中斷：link state tracking 把 Peer1 的下行 MCLAG 介面關閉，Host A 的流量全部由 Peer2 承載。'); }
      if (st.p1 && st.p2 && !st.ka) {
        if (st.bka) { if (po2) out.notes.push('Primary keepalive 中斷，standby（Peer2）經 backup keepalive 確認 active 仍存活 → <b>Peer2 關閉所有 MCLAG port channel</b>，避免 split-brain；恢復後等待 delay-restore 再啟用。'); po2 = false; }
        else out.notes.push('Primary 與 backup keepalive 都中斷：兩台都認為對方失效並保持 MCLAG up，MAC / ARP 不再同步，形成 <b>split-brain</b>，可能出現流量黑洞或重複。');
      }
      if (!st.p1 && st.p2) out.notes.push('Peer1 失效：Peer2 成為 active 並保持 MCLAG 介面 up，承載所有流量。Peer1 恢復後會等待 delay-restore 再啟用自己的 MCLAG 介面。');
      out.po1 = po1; out.po2 = po2;
      // isolation
      out.iso = session && st.pl && po1 && po2;
      // Host A 上行
      out.hostUp = po1 && po2 ? 'LACP 雜湊到 Peer1 或 Peer2，由收到的那台直接轉發 / 路由' : po1 ? '只經 Peer1' : po2 ? '只經 Peer2' : '無可用路徑（Host A 斷線）';
      // Host C（orphan，接在 Peer2）→ Host A
      if (!st.p2) out.hostC = 'Peer2 失效，Host C（orphan port）斷線';
      else if (po2) out.hostC = 'Host C → Peer2 → 本地 MCLAG 成員 → Host A';
      else if (po1 && st.pl) out.hostC = 'Host C → Peer2 → <b>peer link</b> → Peer1 → Host A（Peer2 的 MCLAG 成員不可用，peer link 承載資料）';
      else out.hostC = 'Host C 無法到達 Host A';
      if (st.p1 && st.p2 && st.ka && !st.pl) out.notes.push('Peer link 中斷但 keepalive 正常：MCLAG 介面仍可轉發，但 orphan port 與單邊失效的流量失去備援路徑。');
      return out;
    }
    function draw() {
      const r = evalState();
      box.innerHTML = '';
      const row = S.el('div', { class: 'row' });
      Object.keys(LBL).forEach(k => row.appendChild(S.el('button', { class: 'btn sm' + (st[k] ? ' on' : ''), onclick: () => { st[k] = !st[k]; draw(); } }, S.el('span', { class: 'dot ' + (st[k] ? 'up' : 'down') }), LBL[k])));
      row.appendChild(S.el('button', { class: 'btn sm', onclick: () => { Object.keys(st).forEach(k => (st[k] = true)); draw(); } }, '全部恢復'));
      box.appendChild(row);
      const bad = 'var(--bad)', ok = 'var(--accent)', dim = 'var(--border-strong)';
      const line = (x1, y1, x2, y2, on, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? ok : bad}" stroke-width="${on ? 2.4 : 1.4}" ${!on || dash ? 'stroke-dasharray="6 5"' : ''}/>`;
      const node = (x, y, w, t, sub, on, hl) => `<rect x="${x}" y="${y}" width="${w}" height="54" rx="7" fill="var(--panel)" stroke="${!on ? bad : hl ? ok : dim}" stroke-width="${hl ? 2.2 : 1.2}"/><text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" font-size="13.5" font-weight="600" fill="var(--text)">${t}</text><text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">${sub}</text>`;
      let svg = '<svg viewBox="0 0 760 330" style="width:100%;min-width:560px;display:block">';
      svg += line(330, 64, 170, 122, st.p1 && st.up1) + line(430, 64, 590, 122, st.p2);
      svg += line(250, 150, 510, 150, st.p1 && st.p2 && st.pl) + `<text x="380" y="140" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">peer link${r.iso ? ' · isolation on' : ''}</text>`;
      svg += `<path d="M 170 175 Q 380 225 590 175" fill="none" stroke="${st.p1 && st.p2 && st.ka ? ok : bad}" stroke-width="1.4" stroke-dasharray="3 4"/><text x="380" y="214" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">keepalive (ICCP)</text>`;
      svg += line(170, 178, 330, 262, r.po1) + line(590, 178, 430, 262, r.po2) + line(590, 178, 640, 262, st.p2);
      svg += node(300, 10, 160, 'Spine', 'L3 uplinks', true, false);
      svg += node(90, 122, 160, 'Peer1', st.p1 ? (r.active === 'Peer1' ? 'active · 10.0.0.1' : 'standby') : 'down', st.p1, r.active === 'Peer1');
      svg += node(510, 122, 160, 'Peer2', st.p2 ? (r.active === 'Peer2' ? 'active · 10.0.0.2' : 'standby · 10.0.0.2') : 'down', st.p2, r.active === 'Peer2');
      svg += node(300, 264, 160, 'Host A', 'PortChannel10', r.po1 || r.po2, false);
      svg += node(580, 264, 130, 'Host C', 'orphan port', st.p2, false);
      svg += `<text x="232" y="232" text-anchor="end" font-size="11" font-family="var(--mono)" fill="${r.po1 ? 'var(--good)' : bad}">Po10 ${r.po1 ? 'up' : 'down'}</text><text x="522" y="232" font-size="11" font-family="var(--mono)" fill="${r.po2 ? 'var(--good)' : bad}">Po10 ${r.po2 ? 'up' : 'down'}</text>`;
      svg += '</svg>';
      box.appendChild(S.el('div', { class: 'dg-canvas', style: 'margin-top:12px;border:1px solid var(--border);border-radius:6px', html: svg }));
      box.appendChild(S.el('div', { class: 'log', style: 'margin-top:10px', html:
        `<div>ICCP session：<span class="badge ${r.session ? 'g' : 'r'}">${r.session ? 'up' : 'down'}</span>　Peer link isolation：${r.iso ? '啟用（peer link 進來的 BUM 不送往 Po10）' : '解除'}</div>` +
        `<div>Host A 上行：${r.hostUp}</div><div>Host C → Host A：${r.hostC}</div>` + r.notes.map(n => `<div>${n}</div>`).join('') }));
    }
    draw();

    S.diagram(root.querySelector('#d-mc3'), {
      title: 'MCLAG 拓樸',
      w: 1000, h: 420, layerGap: 120, view3d: 'iso',
      nodes: [
        { id: 'sp', x: 390, y: 20, w: 220, h: 52, lv: 2, label: 'Spine', sub: 'L3 · ECMP 到兩台 peer', kind: 'hw', info: '<p>上游以 L3 連到兩台 peer，兩條路徑等價。</p>' },
        { id: 'p1', x: 130, y: 170, w: 220, h: 58, lv: 1, label: 'Peer 1', sub: 'active · 10.0.0.1', kind: 'hw', info: '<p>MCLAG peer。與 Peer 2 以 ICCP 同步 MAC、ARP 與介面狀態；兩台對下游使用相同的 LACP system MAC。</p>' },
        { id: 'p2', x: 650, y: 170, w: 220, h: 58, lv: 1, label: 'Peer 2', sub: 'standby · 10.0.0.2', kind: 'hw', info: '<p>另一台 peer，另外接了一台只連到它的 orphan 主機。</p>' },
        { id: 'ha', x: 390, y: 330, w: 220, h: 56, lv: 0, label: 'Host A', sub: 'PortChannel10 · LACP', kind: 'ext', info: '<p>雙歸屬主機：兩條成員鏈路分別接到兩台 peer，LACP 認為對端是同一台設備。</p>' },
        { id: 'hc', x: 760, y: 330, w: 200, h: 56, lv: 0, label: 'Host C', sub: 'orphan port', kind: 'ext', info: '<p>只接在 Peer 2 的單歸屬主機。</p>' },
      ],
      edges: [
        { from: 'p1', to: 'sp', id: 'u1', label: 'uplink' }, { from: 'p2', to: 'sp', id: 'u2', label: 'uplink' },
        { from: 'p1', to: 'p2', id: 'pl', bi: true, label: 'peer link（ICCP）' },
        { from: 'p1', to: 'p2', id: 'ka', dash: true, bi: true, label: 'keepalive', via: [[240, 290], [760, 290]] },
        { from: 'ha', to: 'p1', id: 'm1', label: 'Po10 成員' }, { from: 'ha', to: 'p2', id: 'm2', label: 'Po10 成員' },
        { from: 'hc', to: 'p2', id: 'oc' },
      ],
      steps: [
        { title: 'LACP 綁定', text: 'Host A 的兩條鏈路分別接到 Peer 1 與 Peer 2。兩台 peer 以相同的 system MAC 回應 LACP，Host A 視為一個 PortChannel。', nodes: ['ha', 'p1', 'p2'], edges: ['m1', 'm2'] },
        { title: 'ICCP 同步', text: 'iccpd 經 peer link 建立 ICCP session，同步 MAC、ARP 與成員狀態；keepalive 走另一條路徑，用來分辨「peer 故障」與「peer link 斷線」。', nodes: ['p1', 'p2'], edges: ['pl', 'ka'] },
        { title: '南北向流量', text: 'Host A 依 LACP hash 選一條成員鏈路；收到的 peer 直接以 L3 轉給 spine，不經 peer link。', nodes: ['ha', 'p1', 'sp'], edges: ['m1', 'u1'] },
        { title: 'Orphan port', text: 'Host C 送往 Host A：Peer 2 有本地的 Po10 成員，直接從本地送出。peer link 只承載必要的流量，且從 peer link 進來的 BUM 不會再送往 MCLAG 成員（isolation）。', nodes: ['hc', 'p2', 'ha'], edges: ['oc', 'm2'] },
        { title: '成員鏈路失效', text: 'Peer 2 到 Host A 的鏈路斷線：Peer 2 解除該成員的隔離，Host C 的流量改經 peer link 到 Peer 1，再送到 Host A。', nodes: ['hc', 'p2', 'p1', 'ha'], edges: ['oc', 'pl', 'm1'], down: ['m2'] },
      ],
    });

    S.diagram(root.querySelector('#d-mclag'), {
      title: 'MCLAG 在 SONiC 中的元件',
      w: 1000, h: 380,
      groups: [{ x: 250, y: 16, w: 250, h: 200, label: 'iccpd 容器' }],
      nodes: [
        { id: 'cfg', x: 20, y: 50, w: 190, h: 56, label: 'CONFIG_DB', sub: 'MCLAG_DOMAIN / INTERFACE', kind: 'db', info: '<p>domain、source / peer IP、peer link、成員 port channel、unique IP VLAN。</p>' },
        { id: 'iccpd', x: 280, y: 50, w: 190, h: 56, label: 'iccpd', kind: 'proc', info: '<p>與 peer 建立 ICCP（TCP 8888）session，交換心跳、角色、介面狀態、MAC、ARP；決定 active / standby。</p>' },
        { id: 'peer', x: 560, y: 50, w: 190, h: 56, label: 'Peer 交換機', sub: 'iccpd', kind: 'ext', info: '<p>對稱設定的另一台。</p>' },
        { id: 'ms', x: 280, y: 140, w: 190, h: 56, label: 'mclagsyncd', kind: 'proc', info: '<p>iccpd 與 Redis 之間的橋樑：把本機學到的 MAC（STATE_DB FDB_TABLE）交給 iccpd，並把對端同步來的 MAC、隔離設定、介面控制寫入 APPL_DB。</p>' },
        { id: 'appl', x: 280, y: 270, w: 190, h: 56, label: 'APPL_DB', sub: 'MCLAG FDB / 隔離 / 介面', kind: 'db', info: '<p>對端 MAC、peer link isolation group、MCLAG 介面的 learning / admin 控制。</p>' },
        { id: 'orch', x: 560, y: 270, w: 190, h: 56, label: 'FdbOrch / IsoGrpOrch', sub: 'PortsOrch', kind: 'proc', info: '<p>安裝同步來的 FDB、建立 SAI ISOLATION_GROUP（peer link 的 bridge port 不得轉送到兩端 up 的 MCLAG 介面）。</p>' },
        { id: 'asic', x: 800, y: 270, w: 180, h: 56, label: 'ASIC', kind: 'hw', info: '<p>硬體依隔離群組過濾 peer link 進來的 BUM。</p>' },
        { id: 'teamd', x: 20, y: 270, w: 190, h: 56, label: 'teamd', sub: 'LACP system ID', kind: 'proc', info: '<p>MCLAG 成員 port channel 使用共同的 system MAC，讓下游視為同一台 LACP 對端。</p>' },
        { id: 'st', x: 560, y: 150, w: 190, h: 56, label: 'STATE_DB', sub: 'MCLAG_TABLE / FDB_TABLE', kind: 'db', info: '<p>session 狀態、角色、本端與遠端介面狀態，以及本機學到的 FDB。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'iccpd', id: 'e1' },
        { from: 'iccpd', to: 'peer', bi: true, label: 'ICCP', id: 'e2' },
        { from: 'iccpd', to: 'ms', bi: true, id: 'e3' },
        { from: 'ms', to: 'appl', id: 'e4' },
        { from: 'appl', to: 'orch', id: 'e5' },
        { from: 'orch', to: 'asic', id: 'e6' },
        { from: 'st', to: 'ms', dash: true, label: '本機 MAC', id: 'e7' },
        { from: 'cfg', to: 'teamd', dash: true, label: 'system MAC', id: 'e8' },
      ],
      steps: [
        { title: '建立 session', text: 'iccpd 依 CONFIG_DB 與 peer 建立 ICCP，依 IP 大小決定角色，並同步 system MAC 給 teamd。', nodes: ['cfg', 'iccpd', 'peer', 'teamd'], edges: ['e1', 'e2', 'e8'] },
        { title: '同步 MAC', text: '本機學到的 MAC 由 mclagsyncd 從 STATE_DB 讀出交給 iccpd，送到對端；對端的 MAC 寫入 APPL_DB 後由 FdbOrch 安裝。', nodes: ['st', 'ms', 'iccpd', 'peer', 'appl', 'orch'], edges: ['e7', 'e3', 'e2', 'e4', 'e5'] },
        { title: 'Peer link isolation', text: '兩端 MCLAG 介面都 up 時，建立隔離群組；任一端 down 時解除對應介面的隔離，讓 peer link 可以承載流量。', nodes: ['ms', 'appl', 'orch', 'asic'], edges: ['e4', 'e5', 'e6'] },
      ],
    });
  },
  related: ['lag', 'stp', 'vrrp', 'protection', 'design'],
  refs: [['SONiC MCLAG HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/mclag/MCLAG_HLD.md'], ['Enterprise SONiC User Guide UG460：Ch.14', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
