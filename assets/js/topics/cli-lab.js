S.register({
  id: 'cli-lab',
  category: 'lab',
  order: 1,
  icon: '💻',
  title: '虛擬交換機實驗室',
  en: 'Hands-on CLI Lab',
  summary: '一台完整的虛擬 SONiC 交換機：輸入真實的 SONiC 指令，即時看到 CONFIG_DB、APPL_DB、STATE_DB、ASIC_DB 的變化與背後每個 daemon 的動作。完成任務清單來檢驗學習成果！',
  tags: ['CLI', '實作', 'config', 'show', 'redis-cli', 'sonic-db-cli'],
  features: ['完整終端機', '8 個闖關任務'],
  html: `
<div class="callout"><div class="ct">🧪 這是一個教學用模擬器</div>
<p>它依照 SONiC 真實的資料流設計（CLI → CONFIG_DB → *mgrd → APPL_DB → orchagent → ASIC_DB → syncd），指令語法也盡量與真實 SONiC 一致，但只實作了常用功能的簡化行為。拓樸：<b>Ethernet0～Ethernet28</b> 共 8 個 40G port，其中 <b>Ethernet0/4/8/12 有接線</b>；Ethernet0 預設是 <code>10.0.0.0/31</code> 的 routed port，對端為 <code>10.0.0.1</code>。</p></div>

<h2>🎯 任務清單</h2>
<div id="missions"></div>

<h2>💻 終端機</h2>
<div id="term"></div>

<h2>指令速查</h2>
<table>
<thead><tr><th>目的</th><th>指令</th></tr></thead>
<tbody>
<tr><td>看所有指令</td><td><code>help</code></td></tr>
<tr><td>介面狀態</td><td><code>show interfaces status</code>、<code>show ip interfaces</code></td></tr>
<tr><td>開/關介面</td><td><code>sudo config interface startup Ethernet8</code></td></tr>
<tr><td>VLAN</td><td><code>sudo config vlan add 200</code>、<code>sudo config vlan member add -u 200 Ethernet8</code></td></tr>
<tr><td>IP</td><td><code>sudo config interface ip add Vlan200 192.168.200.1/24</code></td></tr>
<tr><td>LAG</td><td><code>sudo config portchannel add PortChannel0005</code>、<code>sudo config portchannel member add PortChannel0005 Ethernet12</code></td></tr>
<tr><td>靜態路由</td><td><code>sudo config route add prefix 10.10.0.0/16 nexthop 10.0.0.1</code></td></tr>
<tr><td>查 DB</td><td><code>sonic-db-cli ASIC_DB keys "*VLAN*"</code>、<code>redis-cli -n 4 hgetall "VLAN|Vlan200"</code></td></tr>
<tr><td>存檔 / 重載</td><td><code>sudo config save -y</code>、<code>sudo config reload -y</code></td></tr>
</tbody></table>
`,
  mount(root) {
    const M = [
      { t: '啟動 Ethernet8 並確認它 oper up', hint: 'sudo config interface startup Ethernet8', ok: (c, r, s) => s.portOper('Ethernet8') === 'up' },
      { t: '建立 VLAN 200', hint: 'sudo config vlan add 200', ok: (c, r, s) => !!s.cfg.VLAN.Vlan200 },
      { t: '把 Ethernet8 以 untagged 加入 VLAN 200', hint: 'sudo config vlan member add -u 200 Ethernet8', ok: (c, r, s) => (s.cfg.VLAN_MEMBER['Vlan200|Ethernet8'] || {}).tagging_mode === 'untagged' },
      { t: '幫 Vlan200 設定閘道 IP 192.168.200.1/24', hint: 'sudo config interface ip add Vlan200 192.168.200.1/24', ok: (c, r, s) => !!s.cfg.VLAN_INTERFACE['Vlan200|192.168.200.1/24'] },
      { t: '建立 PortChannel0005，並把 Ethernet12 加進去', hint: 'sudo config portchannel add PortChannel0005 → sudo config portchannel member add PortChannel0005 Ethernet12', ok: (c, r, s) => !!s.cfg.PORTCHANNEL_MEMBER['PortChannel0005|Ethernet12'] },
      { t: '新增靜態路由 10.10.0.0/16 經 10.0.0.1，並確認它已寫入 ASIC', hint: 'sudo config route add prefix 10.10.0.0/16 nexthop 10.0.0.1', ok: (c, r, s) => s.routes().some(x => x.prefix === '10.10.0.0/16' && x.resolved) },
      { t: '用 sonic-db-cli 或 redis-cli 查詢 ASIC_DB 中的 VLAN 物件', hint: 'sonic-db-cli ASIC_DB keys "*VLAN*"', ok: c => /(sonic-db-cli\s+ASIC_DB|redis-cli\s+-n\s+1)\s+keys\s+.*VLAN/i.test(c) },
      { t: '把以上設定存檔，讓重開機後依然存在', hint: 'sudo config save -y', ok: (c, r, s) => !!(s.saved.VLAN && s.saved.VLAN.Vlan200) },
    ];
    const KEY = 'lab-missions';
    let done = new Set(S.store.get(KEY, []));
    const host = root.querySelector('#missions');
    function draw() {
      host.innerHTML = '';
      const box = S.el('div', { class: 'w-box' });
      const n = M.filter((m, i) => done.has(i)).length;
      box.appendChild(S.el('div', { class: 'row', style: 'justify-content:space-between' },
        S.el('b', null, `進度 ${n} / ${M.length}${n === M.length ? ' 🎉 全部完成！你已經掌握 SONiC 的基本操作與資料流了。' : ''}`),
        S.el('button', { class: 'btn sm', onclick: () => { done = new Set(); S.store.set(KEY, []); draw(); } }, '↺ 重設任務')));
      const bar = S.el('div', { class: 'side-progress', style: 'margin:6px 0 10px' }, S.el('div', { class: 'bar' }, S.el('i', { style: `width:${n / M.length * 100}%` })));
      box.appendChild(bar);
      M.forEach((m, i) => {
        const d = done.has(i);
        const hint = S.el('code', { class: 'hidden', style: 'margin-left:8px' }, m.hint);
        box.appendChild(S.el('div', { class: 'row', style: `padding:6px 4px;border-bottom:1px dashed var(--border);${d ? 'opacity:.75' : ''}` },
          S.el('span', { style: 'font-size:18px' }, d ? '✅' : '⬜'),
          S.el('span', { style: d ? 'text-decoration:line-through' : '' }, `${i + 1}. ${m.t}`),
          d ? null : S.el('button', { class: 'btn sm', style: 'margin-left:auto', onclick: e => { hint.classList.toggle('hidden'); e.currentTarget.textContent = hint.classList.contains('hidden') ? '💡 提示' : '隱藏'; } }, '💡 提示'),
          hint));
      });
      host.appendChild(box);
    }
    draw();
    S.terminal(root.querySelector('#term'), {
      welcome: '歡迎來到 SONiC 百科虛擬交換機實驗室！輸入 help 查看所有指令，或依照上方任務一步步操作。',
      chips: ['help', 'show interfaces status', 'show ip interfaces', 'show ip route', 'docker ps', 'show version'],
      onRun(cmd, r, sim) {
        let changed = false;
        M.forEach((m, i) => { if (!done.has(i) && !r.err && m.ok(cmd, r, sim)) { done.add(i); changed = true; } });
        if (changed) { S.store.set(KEY, [...done]); draw(); }
      },
    });
  },
  keypoints: [
    '設定類指令需要 sudo，而且只修改 CONFIG_DB，其餘的 DB 由各 daemon 推導。',
    '觀察「背後發生了什麼」面板，可以練習預測每個指令會牽動哪些元件。',
    '用 sonic-db-cli / redis-cli 逐層檢查，是在真實設備上除錯的標準方法。',
  ],
  related: ['config', 'vlan', 'routing', 'lag', 'redis-db'],
});
