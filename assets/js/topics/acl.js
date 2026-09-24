S.register({
  id: 'acl',
  category: 'svc',
  order: 1,
  title: 'ACL 存取控制',
  en: 'Access Control Lists',
  summary: "資料平面 ACL 由 AclOrch 直接訂閱 CONFIG_DB，以 SAI ACL 物件寫入 ASIC TCAM；控制平面 ACL 由 host 上的 caclmgrd 轉換為 iptables 規則。",
  meta: [["程序", ["orchagent (AclOrch)", "caclmgrd (host)", "acl-loader"]], ["資料表", ["CONFIG_DB ACL_TABLE / ACL_RULE", "COUNTERS_DB ACL counters", "STATE_DB ACL_TABLE_TABLE"]], ["SAI 物件", ["ACL_TABLE", "ACL_TABLE_GROUP", "ACL_ENTRY", "ACL_COUNTER"]], ["工具", ["show acl table", "show acl rule", "aclshow -a", "crm show resources acl group"]]],
  tags: ['ACL', 'AclOrch', 'TCAM', 'acl-loader', 'caclmgrd', 'iptables'],
  html: `
<h2>兩種 ACL</h2>
<div class="defs">
  <div><b>資料平面 ACL（L3 / L3V6 / MIRROR…）</b><p>綁在 port / LAG / VLAN 上，在 ASIC 的 TCAM 中以線速比對。由 <b>AclOrch</b> 處理。</p></div>
  <div><b>控制平面 ACL（CTRLPLANE）</b><p>保護交換機自己的服務（SSH、SNMP、NTP…）。由 host 上的 <b>caclmgrd</b> 轉成 <code>iptables</code> 規則，在 Linux 中過濾。</p></div>
</div>
<div id="d-acl"></div>

<h2>ACL 在 CONFIG_DB 中的樣子</h2>
<pre>{
  <span class="s">"ACL_TABLE"</span>: {
    <span class="s">"DATAACL"</span>: { <span class="s">"type"</span>: <span class="s">"L3"</span>, <span class="s">"stage"</span>: <span class="s">"ingress"</span>, <span class="s">"ports"</span>: [<span class="s">"Ethernet0"</span>, <span class="s">"PortChannel0001"</span>] },
    <span class="s">"SSH_ONLY"</span>: { <span class="s">"type"</span>: <span class="s">"CTRLPLANE"</span>, <span class="s">"services"</span>: [<span class="s">"SSH"</span>] }
  },
  <span class="s">"ACL_RULE"</span>: {
    <span class="s">"DATAACL|RULE_1"</span>: { <span class="s">"PRIORITY"</span>: <span class="s">"9999"</span>, <span class="s">"SRC_IP"</span>: <span class="s">"10.0.0.2/32"</span>, <span class="s">"PACKET_ACTION"</span>: <span class="s">"DROP"</span> }
  }
}</pre>
<p>實務上常用 <code>acl-loader update full acl.json</code> 載入 OpenConfig 格式的 ACL 檔，它會轉成上面的 CONFIG_DB 格式。查看與計數：<code>show acl table</code>、<code>show acl rule</code>、<code>aclshow -a</code>。</p>

<h2>ACL 規則比對模擬</h2>
<p>ACL 表 <b>DATAACL</b>（ingress，綁在 Ethernet0）。ASIC 會找出<b>所有欄位都符合、且 PRIORITY 數字最大</b>的那條規則執行。修改封包欄位或規則，看看哪條規則會命中。</p>
<div id="play"></div>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-acl'), {
      title: 'ACL 的兩條處理路徑',
      w: 1000, h: 330,
      nodes: [
        { id: 'loader', x: 20, y: 40, w: 160, h: 56, label: 'acl-loader / CLI', kind: 'cli', info: '<p>把 OpenConfig 格式的 ACL JSON 轉成 CONFIG_DB 的 ACL_TABLE / ACL_RULE。</p>' },
        { id: 'cfg', x: 230, y: 40, w: 180, h: 56, label: 'CONFIG_DB', sub: 'ACL_TABLE / ACL_RULE', kind: 'db', info: '<p>資料平面與控制平面 ACL 都寫在這兩張表，用 <code>type</code> 區分。</p>' },
        { id: 'ao', x: 470, y: 40, w: 160, h: 56, label: 'AclOrch', sub: '直接訂閱 CONFIG_DB', kind: 'proc', info: '<p>少數直接訂閱 CONFIG_DB 的 Orch。建立 ACL_TABLE、ACL_ENTRY、ACL_COUNTER，並把 ACL table 綁定到 port（ACL_TABLE_GROUP）。</p>' },
        { id: 'adb', x: 680, y: 40, w: 140, h: 56, label: 'ASIC_DB', kind: 'db', info: '<p>ACL 相關 SAI 物件。</p>' },
        { id: 'tcam', x: 860, y: 40, w: 120, h: 56, label: 'ASIC TCAM', kind: 'hw', info: '<p>三態內容可定址記憶體，能在一個時脈中平行比對所有規則。容量有限，可以用 <code>crm show resources acl</code> 查看用量。</p>' },
        { id: 'cnt', x: 680, y: 150, w: 140, h: 56, label: 'COUNTERS_DB', sub: 'ACL 計數器', kind: 'db', info: '<p>每條規則的封包 / 位元組計數，<code>aclshow</code> 讀取這裡。</p>' },
        { id: 'cacl', x: 470, y: 240, w: 160, h: 56, label: 'caclmgrd', sub: '(host)', kind: 'proc', info: '<p>Control-plane ACL manager，監看 CTRLPLANE 類型的 ACL，產生對應 SSH/SNMP/NTP 服務埠的 iptables / ip6tables 規則。</p>' },
        { id: 'ipt', x: 680, y: 240, w: 140, h: 56, label: 'iptables', kind: 'kernel', info: '<p>Linux netfilter，過濾送往交換機本身的封包。</p>' },
      ],
      edges: [
        { from: 'loader', to: 'cfg', id: 'e1' },
        { from: 'cfg', to: 'ao', label: 'L3 / MIRROR…', id: 'e2' },
        { from: 'ao', to: 'adb', id: 'e3' },
        { from: 'adb', to: 'tcam', label: 'SAI', id: 'e4' },
        { from: 'tcam', to: 'cnt', dash: true, label: '輪詢', id: 'e5' },
        { from: 'cfg', to: 'cacl', label: 'CTRLPLANE', id: 'e6', via: [[320, 268]] },
        { from: 'cacl', to: 'ipt', id: 'e7' },
      ],
      steps: [
        { title: '載入 ACL', text: '<code>acl-loader update full acl.json</code> 寫入 ACL_TABLE 與 ACL_RULE。', nodes: ['loader', 'cfg'], edges: ['e1'] },
        { title: '資料平面 ACL → TCAM', text: 'AclOrch 建立 SAI ACL 物件，syncd 寫入 TCAM；計數器由 syncd 定期讀回 COUNTERS_DB。', nodes: ['cfg', 'ao', 'adb', 'tcam', 'cnt'], edges: ['e2', 'e3', 'e4', 'e5'] },
        { title: '控制平面 ACL → iptables', text: 'type 為 CTRLPLANE 的表由 caclmgrd 處理，轉成 iptables 規則保護 SSH / SNMP 等服務。', nodes: ['cfg', 'cacl', 'ipt'], edges: ['e6', 'e7'] },
      ],
    });

    // ---------- 遊樂場 ----------
    const host = root.querySelector('#play');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const PROTO = { TCP: 6, UDP: 17, ICMP: 1 };
    let rules = [
      { name: 'RULE_1', prio: 9999, src: '10.0.0.2/32', proto: '', dport: '', action: 'DROP', hits: 0 },
      { name: 'RULE_2', prio: 9990, src: '192.168.0.0/16', proto: 'TCP', dport: '22', action: 'FORWARD', hits: 0 },
      { name: 'RULE_3', prio: 9980, src: '', proto: 'TCP', dport: '22', action: 'DROP', hits: 0 },
      { name: 'RULE_4', prio: 9000, src: '', proto: 'ICMP', dport: '', action: 'FORWARD', hits: 0 },
      { name: 'DEFAULT_RULE', prio: 1, src: '', proto: '', dport: '', action: 'DROP', hits: 0 },
    ];
    const pkt = { src: '192.168.1.5', dst: '10.1.0.1', proto: 'TCP', dport: '22' };
    let result = null;
    const ip2n = s => { const p = s.split('.').map(Number); return p.length === 4 && p.every(x => x >= 0 && x <= 255) ? (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0) : null; };
    function inPfx(ip, pfx) {
      const [a, l] = pfx.split('/'); const n = ip2n(ip), b = ip2n(a), len = +(l || 32);
      if (n == null || b == null) return false;
      const m = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
      return ((n & m) >>> 0) === ((b & m) >>> 0);
    }
    function match(r) {
      const why = [];
      if (r.src) { const ok = inPfx(pkt.src, r.src); why.push([`SRC_IP ${r.src}`, ok]); }
      if (r.proto) why.push([`IP_PROTOCOL ${PROTO[r.proto]} (${r.proto})`, r.proto === pkt.proto]);
      if (r.dport) why.push([`L4_DST_PORT ${r.dport}`, pkt.proto !== 'ICMP' && r.dport === pkt.dport]);
      if (!why.length) why.push(['（所有 IPv4 封包）', true]);
      return { ok: why.every(w => w[1]), why };
    }
    function evalPkt() {
      const sorted = rules.slice().sort((a, b) => b.prio - a.prio);
      const hit = sorted.find(r => match(r).ok);
      if (hit) hit.hits++;
      result = hit || null;
      draw();
    }
    function draw() {
      box.innerHTML = '';
      const f = (lbl, key, opts) => {
        const inp = opts ? S.el('select', null, ...opts.map(o => S.el('option', { value: o, selected: pkt[key] === o }, o))) : S.el('input', { value: pkt[key], size: 14 });
        inp.addEventListener('change', () => { pkt[key] = inp.value; result = null; draw(); });
        return S.el('label', { class: 'field' }, lbl, inp);
      };
      box.appendChild(S.el('h4', null, '測試封包'));
      box.appendChild(S.el('div', { class: 'row' }, f('來源 IP', 'src'), f('目的 IP', 'dst'), f('協定', 'proto', ['TCP', 'UDP', 'ICMP']), f('目的埠', 'dport'),
        S.el('button', { class: 'btn primary', style: 'align-self:flex-end', onclick: evalPkt }, '送出封包')));
      const presets = S.el('div', { class: 'chips' }, S.el('span', { class: 'muted', style: 'font-size:13px' }, '快速範例：'));
      [['SSH 從內網', '192.168.1.5', 'TCP', '22'], ['SSH 從外網', '8.8.8.8', 'TCP', '22'], ['被封鎖主機', '10.0.0.2', 'ICMP', ''], ['Ping', '172.16.0.9', 'ICMP', ''], ['HTTPS', '172.16.0.9', 'TCP', '443']].forEach(([n, s, p, d]) => {
        presets.appendChild(S.el('button', { class: 'chip', onclick: () => { Object.assign(pkt, { src: s, proto: p, dport: d }); evalPkt(); } }, n));
      });
      box.appendChild(presets);

      const t = S.el('table', { style: 'margin-top:10px' });
      const sorted = rules.slice().sort((a, b) => b.prio - a.prio);
      t.innerHTML = `<thead><tr><th>規則</th><th>PRIORITY</th><th>比對條件（對目前封包）</th><th>動作</th><th>命中數</th><th></th></tr></thead>`;
      const tb = S.el('tbody');
      sorted.forEach(r => {
        const m = match(r);
        const isHit = result === r;
        const tr = S.el('tr', { style: isHit ? 'background:var(--good-soft);outline:2px solid var(--good)' : '' });
        tr.innerHTML = `<td class="mono"><b>${r.name}</b>${isHit ? ' ← 命中' : ''}</td><td class="mono">${r.prio}</td><td style="font-size:13px">${m.why.map(([w, ok]) => `<span class="badge ${ok ? 'g' : 'r'}" style="margin:1px">${ok ? '' : ''} ${S.esc(w)}</span>`).join(' ')}</td><td><span class="badge ${r.action === 'DROP' ? 'r' : 'g'}">${r.action}</span></td><td class="mono">${r.hits}</td>`;
        const td = S.el('td');
        if (r.name !== 'DEFAULT_RULE') td.appendChild(S.el('button', { class: 'btn sm', onclick: () => { rules = rules.filter(x => x !== r); result = null; draw(); } }, '刪除'));
        tr.appendChild(td);
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      box.appendChild(t);

      if (result) box.appendChild(S.el('div', { class: 'dg-desc', html: `結果：命中 <b>${result.name}</b>（PRIORITY ${result.prio}）→ <span class="badge ${result.action === 'DROP' ? 'r' : 'g'}">${result.action === 'DROP' ? '丟棄' : '放行'}</span>。${result.name === 'DEFAULT_RULE' ? '沒有其他規則符合，落到 acl-loader 自動加入的預設拒絕規則。' : '高優先權規則先比對；就算低優先權也符合，也不會被執行。'}` }));

      // 新增規則
      const nr = { prio: '9500', src: '', proto: '', dport: '', action: 'DROP' };
      const add = S.el('div', { class: 'row', style: 'margin-top:12px' }, S.el('b', null, '新增規則：'));
      const mk = (lbl, k, opts) => {
        const e = opts ? S.el('select', null, ...opts.map(o => S.el('option', { value: o }, o || '（任意）'))) : S.el('input', { value: nr[k], size: 12, placeholder: '（任意）' });
        e.addEventListener('change', () => (nr[k] = e.value));
        return S.el('label', { class: 'field' }, lbl, e);
      };
      add.appendChild(mk('PRIORITY', 'prio'));
      add.appendChild(mk('SRC_IP', 'src'));
      add.appendChild(mk('協定', 'proto', ['', 'TCP', 'UDP', 'ICMP']));
      add.appendChild(mk('DST_PORT', 'dport'));
      add.appendChild(mk('動作', 'action', ['DROP', 'FORWARD']));
      add.appendChild(S.el('button', { class: 'btn', style: 'align-self:flex-end', onclick: () => {
        const p = parseInt(nr.prio, 10);
        if (!(p > 1 && p < 100000)) { alert('PRIORITY 請輸入 2 ~ 99999'); return; }
        rules.push({ name: 'RULE_' + (rules.length + 1) + '_NEW', prio: p, src: nr.src.trim(), proto: nr.proto, dport: nr.dport.trim(), action: nr.action, hits: 0 });
        result = null; draw();
      } }, '新增'));
      box.appendChild(add);

      // CONFIG_DB 預覽
      const cfg = {};
      rules.forEach(r => {
        const e = { PRIORITY: String(r.prio), PACKET_ACTION: r.action };
        if (r.src) e.SRC_IP = r.src;
        if (r.proto) e.IP_PROTOCOL = String(PROTO[r.proto]);
        if (r.dport) e.L4_DST_PORT = r.dport;
        if (r.name === 'DEFAULT_RULE') e.ETHER_TYPE = '2048';
        cfg['DATAACL|' + r.name] = e;
      });
      const det = S.el('details', { style: 'margin-top:10px' }, S.el('summary', { style: 'cursor:pointer' }, '對應的 CONFIG_DB ACL_RULE（即時產生）'), S.el('pre', null, JSON.stringify({ ACL_RULE: cfg }, null, 2)));
      box.appendChild(det);
    }
    draw();
  },
  keypoints: [
    'AclOrch 直接訂閱 CONFIG_DB 的 ACL_TABLE / ACL_RULE，產生 SAI ACL 物件寫進 TCAM。',
    'type=CTRLPLANE 的 ACL 由 host 上的 caclmgrd 轉成 iptables，保護交換機自身服務。',
    '多條規則同時符合時，PRIORITY 數字大的優先。',
    'acl-loader 用 OpenConfig 格式載入 ACL；aclshow 查看每條規則的命中計數。',
  ],
  related: ['copp', 'swss', 'config'],
  refs: [['ACL 設計文件（SONiC）', 'https://github.com/sonic-net/SONiC/wiki/ACL-High-Level-Design']],
});
