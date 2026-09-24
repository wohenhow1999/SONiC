S.register({
  id: 'reboot',
  category: 'ops',
  order: 4,
  icon: '🔄',
  title: 'Warm / Fast / Cold Reboot',
  en: 'Reboot Types',
  summary: '升級或重啟 SONiC 時，流量會中斷多久？Cold reboot 最單純、Fast reboot 把中斷壓到數十秒內、Warm reboot 讓資料平面幾乎不中斷。了解它們背後的機制。',
  tags: ['warm reboot', 'fast reboot', 'kexec', 'BGP Graceful Restart', 'reconcile'],
  features: ['三種 reboot 時間軸比較', 'Warm reboot 流程動畫'],
  html: `
<h2>時間軸比較</h2>
<p>切換三種模式，比較<b>控制平面</b>（BGP、LACP 等協定）與<b>資料平面</b>（ASIC 轉發）的中斷時間。（數值為示意，實際取決於平台、路由數量與設定。）</p>
<div id="tl"></div>

<h2>Warm reboot 在做什麼</h2>
<div id="d-warm"></div>

<h2>比較表</h2>
<table>
<thead><tr><th></th><th>Cold reboot</th><th>Fast reboot</th><th>Warm reboot</th></tr></thead>
<tbody>
<tr><td>指令</td><td><code>sudo reboot</code></td><td><code>sudo fast-reboot</code></td><td><code>sudo warm-reboot</code></td></tr>
<tr><td>資料平面中斷</td><td>數分鐘</td><td>目標 &lt; 30 秒</td><td>接近 0（次秒級）</td></tr>
<tr><td>ASIC</td><td>完整重新初始化</td><td>快速重新初始化（fast boot）</td><td>不重設，以 warm 模式重新接上</td></tr>
<tr><td>kernel 重啟方式</td><td>BIOS / 完整開機</td><td>kexec（跳過 BIOS）</td><td>kexec</td></tr>
<tr><td>狀態保存</td><td>無</td><td>ARP、FDB、路由（BGP GR）</td><td>整個 Redis DB + SAI 狀態</td></tr>
<tr><td>需要鄰居配合</td><td>否</td><td>BGP Graceful Restart</td><td>BGP Graceful Restart、LACP 不逾時</td></tr>
</tbody></table>

<h2>相關指令</h2>
<pre><span class="c"># 開啟某個服務的 warm restart 與調整 BGP 等待時間</span>
sudo config warm_restart enable swss
sudo config warm_restart bgp_timer 120
<span class="c"># 查看各元件的 warm restart 狀態（restore_count、state=reconciled…）</span>
show warm_restart state
show warm_restart config
<span class="c"># 查詢上次重開機的原因</span>
show reboot-cause
show reboot-cause history</pre>
`,
  mount(root) {
    const MODES = [
      { n: 'Cold reboot', cp: [0, 150], dp: [0, 130], note: '整台機器從 BIOS 重新開機，ASIC 完全重新初始化，所有路由要重新學習、重新下發。資料平面中斷時間最長。' },
      { n: 'Fast reboot', cp: [0, 90], dp: [10, 32], note: '用 kexec 直接載入新 kernel（跳過 BIOS），事先保存 ARP / FDB，並透過 BGP Graceful Restart 讓鄰居暫時保留路由。ASIC 仍需重新初始化，但會以最快順序重建轉發表，資料平面中斷通常在 30 秒內。' },
      { n: 'Warm reboot', cp: [0, 90], dp: null, note: 'ASIC <b>完全不重設</b>，舊的轉發表持續運作。軟體重啟後從保存的 Redis 狀態與 SAI 狀態重新「接上」硬體，比對（reconcile）差異後只套用必要的變更。資料平面幾乎不中斷。' },
    ];
    const host = root.querySelector('#tl');
    const box = S.el('div', { class: 'w-box' });
    const body = S.el('div', { style: 'margin-top:12px' });
    host.appendChild(box);
    const T = 180;
    function bar(label, rng, color, sub) {
      const wrap = S.el('div', { style: 'margin:10px 0' });
      wrap.appendChild(S.el('div', { style: 'font-size:14px;margin-bottom:4px' }, S.el('b', null, label), ' ', S.el('span', { class: 'muted' }, sub)));
      const track = S.el('div', { style: 'position:relative;height:26px;background:var(--good-soft);border-radius:6px;overflow:hidden;border:1px solid var(--border)' });
      if (rng) {
        const seg = S.el('div', { style: `position:absolute;top:0;bottom:0;left:${rng[0] / T * 100}%;width:0;background:${color};border-radius:4px;transition:width .9s ease;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden` }, `中斷 ~${rng[1] - rng[0]} 秒`);
        track.appendChild(seg);
        requestAnimationFrame(() => requestAnimationFrame(() => (seg.style.width = (rng[1] - rng[0]) / T * 100 + '%')));
      } else track.appendChild(S.el('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;padding-left:10px;font-size:12px;font-weight:700;color:var(--good)' }, '✅ 持續轉發，幾乎不中斷'));
      wrap.appendChild(track);
      return wrap;
    }
    S.seg(box, MODES.map(m => m.n), i => {
      const m = MODES[i];
      body.innerHTML = '';
      body.appendChild(bar('控制平面', m.cp, 'var(--warn)', '（BGP / LACP / 服務重啟）'));
      body.appendChild(bar('資料平面', m.dp, 'var(--bad)', '（ASIC 轉發使用者流量）'));
      const axis = S.el('div', { class: 'muted mono', style: 'display:flex;justify-content:space-between;font-size:12px' }, ...[0, 30, 60, 90, 120, 150, 180].map(t => S.el('span', null, t + 's')));
      body.appendChild(axis);
      body.appendChild(S.el('div', { class: 'dg-desc', style: 'margin-top:10px', html: m.note }));
    });
    box.appendChild(body);

    S.diagram(root.querySelector('#d-warm'), {
      title: 'Warm reboot 流程',
      w: 1000, h: 380,
      nodes: [
        { id: 'cmd', x: 20, y: 30, w: 170, h: 60, label: 'warm-reboot', sub: '預先檢查', kind: 'cli', info: '<p>檢查各服務狀態、確認新映像、準備 kexec 參數。若有不支援 warm reboot 的條件會中止。</p>' },
        { id: 'gr', x: 215, y: 30, w: 170, h: 60, label: 'BGP GR', sub: '通知鄰居保留路由', kind: 'proc', info: '<p>bgpd 以 Graceful Restart 方式停止，鄰居在 restart time 內繼續使用舊路由轉發，不會撤路由。</p>' },
        { id: 'frz', x: 410, y: 30, w: 170, h: 60, label: 'orchagent 凍結', sub: 'restart check', kind: 'proc', info: '<p><code>orchagent_restart_check</code> 要求 orchagent 暫停處理新事件，並確認所有 m_toSync 都已清空，以確保保存的是一致的狀態。</p>' },
        { id: 'save', x: 605, y: 30, w: 170, h: 60, label: '保存 Redis', sub: 'dump.rdb', kind: 'db', info: '<p>把整個 Redis 資料庫存成 RDB 檔，重開機後還原。</p>' },
        { id: 'sd', x: 800, y: 30, w: 180, h: 60, label: 'syncd warm 關閉', sub: 'SAI pre-shutdown', kind: 'proc', info: '<p>syncd 以 <code>SAI_SWITCH_ATTR_RESTART_WARM=true</code> 關閉 switch，廠商 SAI 把必要狀態存到檔案，但<b>不重設 ASIC</b>。</p>' },
        { id: 'kx', x: 800, y: 160, w: 180, h: 60, label: 'kexec', sub: '直接載入新 kernel', kind: 'kernel', info: '<p>跳過 BIOS 與韌體初始化，節省大量時間。</p>' },
        { id: 'asic', x: 215, y: 160, w: 560, h: 60, label: 'ASIC 持續以舊的轉發表轉發封包 🚀', kind: 'hw', info: '<p>整個軟體重啟期間，ASIC 沒有被重設，舊的 L2/L3 表項仍在，使用者流量不受影響。</p>' },
        { id: 'rs', x: 800, y: 290, w: 180, h: 60, label: '還原 Redis', kind: 'db', info: '<p>database 容器啟動時載入 dump.rdb。</p>' },
        { id: 'ws', x: 605, y: 290, w: 170, h: 60, label: 'syncd warm start', sub: '重新接上硬體', kind: 'proc', info: '<p>SAI 以 warm boot 模式初始化，從保存的狀態重建軟體結構並與硬體對應，<b>不清除</b>硬體表。</p>' },
        { id: 'orc', x: 410, y: 290, w: 170, h: 60, label: 'orchagent reconcile', kind: 'proc', info: '<p>orchagent 從還原的 APPL_DB 重建內部狀態，搭配 syncd 的 view 比對，只把真正有差異的物件寫入硬體。</p>' },
        { id: 'frr', x: 215, y: 290, w: 170, h: 60, label: 'fpmsyncd reconcile', sub: 'bgp_timer 後', kind: 'proc', info: '<p>BGP 重新建立後，fpmsyncd 等待 warm_restart bgp_timer（例如 120 秒）讓路由收斂，再比對新舊路由，只更新有變化的部分，並清除過期路由。</p>' },
        { id: 'done', x: 20, y: 290, w: 170, h: 60, label: '完成 ✅', sub: 'state=reconciled', kind: 'ext', info: '<p><code>show warm_restart state</code> 各元件顯示 reconciled。</p>' },
      ],
      edges: [
        { from: 'cmd', to: 'gr', id: 's1' }, { from: 'gr', to: 'frz', id: 's2' }, { from: 'frz', to: 'save', id: 's3' }, { from: 'save', to: 'sd', id: 's4' },
        { from: 'sd', to: 'kx', id: 's5' }, { from: 'kx', to: 'rs', id: 's6' }, { from: 'rs', to: 'ws', id: 's7' }, { from: 'ws', to: 'orc', id: 's8' },
        { from: 'orc', to: 'frr', id: 's9' }, { from: 'frr', to: 'done', id: 's10' },
      ],
      steps: [
        { title: '準備與 BGP GR', text: 'warm-reboot 腳本做預先檢查，讓 bgpd 以 Graceful Restart 模式停止，鄰居繼續用舊路由。', nodes: ['cmd', 'gr', 'asic'], edges: ['s1'] },
        { title: '凍結並保存狀態', text: 'orchagent 暫停並清空待處理任務；整個 Redis 存成 dump.rdb。', nodes: ['gr', 'frz', 'save', 'asic'], edges: ['s2', 's3'] },
        { title: 'syncd 以 warm 模式關閉', text: 'SAI 保存狀態但不重設 ASIC。', nodes: ['save', 'sd', 'asic'], edges: ['s4'] },
        { title: 'kexec 進新 kernel', text: '跳過 BIOS，直接啟動（可能是新版本的）SONiC。', nodes: ['sd', 'kx', 'asic'], edges: ['s5'] },
        { title: '還原並重新接上硬體', text: 'Redis 還原，syncd 以 warm start 重新連上 ASIC。', nodes: ['kx', 'rs', 'ws', 'asic'], edges: ['s6', 's7'] },
        { title: '比對與收斂', text: 'orchagent、fpmsyncd 依序比對新舊狀態，只套用差異；全部 reconciled 後 warm reboot 完成。', nodes: ['ws', 'orc', 'frr', 'done'], edges: ['s8', 's9', 's10'] },
      ],
    });
  },
  keypoints: [
    'Cold reboot 完整重開、ASIC 重新初始化，中斷最久。',
    'Fast reboot 用 kexec、保存 ARP/FDB 並依賴 BGP GR，把資料平面中斷壓在數十秒內。',
    'Warm reboot 不重設 ASIC：保存 Redis 與 SAI 狀態，重啟後 reconcile，資料平面幾乎不中斷。',
    'warm reboot 需要鄰居支援 BGP Graceful Restart，且各元件都要實作 reconcile。',
  ],
  quiz: [
    { q: 'Warm reboot 期間，使用者流量為何還能轉發？', options: ['流量改走 CPU', 'ASIC 沒有被重設，舊的轉發表持續運作', '鄰居幫忙轉發', 'Redis 在轉發'], answer: 1, explain: 'ASIC 保持原狀，軟體重啟後再重新接上並比對差異。' },
    { q: 'Fast / warm reboot 使用什麼來跳過 BIOS 開機？', options: ['GRUB', 'kexec', 'ONIE', 'PXE'], answer: 1, explain: 'kexec 讓執行中的 kernel 直接載入新 kernel。' },
    { q: '要讓 BGP 鄰居在重啟期間不撤路由，需要？', options: ['BFD', 'BGP Graceful Restart', 'LACP fallback', 'ECMP'], answer: 1, explain: 'Graceful Restart 讓鄰居在 restart time 內保留舊路由。' },
  ],
  related: ['build', 'syncd-sai', 'routing', 'containers'],
  refs: [['Warm Reboot 設計文件', 'https://github.com/sonic-net/SONiC/blob/master/doc/warm-reboot/SONiC_Warmboot.md'], ['Fast Reboot 設計文件', 'https://github.com/sonic-net/SONiC/blob/master/doc/fast-reboot/fastreboot.pdf']],
});
