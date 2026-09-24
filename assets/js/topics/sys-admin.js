S.register({
  id: 'sys-admin',
  category: 'ops',
  order: 11,
  title: '系統管理：映像、組態 Session 與資源設定檔',
  en: 'System Administration: Images, Firmware, Configuration Sessions, Third-Party Containers & Resource Profiles',
  summary: '日常維運除了設定協定，還包括管理映像與韌體、安全地套用大量變更、在交換機上執行自訂容器，以及依用途調整硬體表格的分配。本章整理這些系統層級的功能：映像的安裝與切換、韌體與 patch、候選組態 session 與逾時回滾、第三方容器（TPC）、switch profile 與 route-scale、cut-through 轉發。',
  meta: [
    ['工具', ['sonic-installer（社群版）', 'image install / set-default / remove（Enterprise）', 'config checkpoint / rollback / apply-patch', 'configure session / commit', 'tpcm']],
    ['檔案位置', ['/host/image-*（每個映像一個目錄）', '/host/grub/grub.cfg', '/etc/sonic/config_db.json', 'home://、config://、usb:// 路徑']],
    ['資源', ['switch-resource route-scale', 'CRM', 'factory default profile l2 / l3']],
  ],
  tags: ['sonic-installer', 'image install', 'set-default', 'firmware', 'ONIE', 'BIOS', 'patch', 'configure session', 'candidate configuration', 'commit confirm', 'rollback', 'checkpoint', 'TPC', 'tpcm', 'third-party container', 'switch profile', 'route-scale', 'cut-through', 'USB'],
  keypoints: [
    'SONiC 同時保留多個映像：每個映像在 /host 下有自己的目錄，GRUB 決定下次開機使用哪一個；安裝新映像不影響目前執行的系統，切換後可隨時回到舊映像。',
    '升級時設定由遷移腳本轉換到新版格式；以 ONIE 重灌則會清空，需要另外還原設定、使用者與憑證。',
    '組態 session 先把變更寫入候選組態，確認差異後才 commit；commit timeout 會在時間內等待 confirm，沒有確認就自動回滾，避免遠端改壞設定後無法連線。',
    'session 進行中，CLI、REST、gNMI 對 running config 的變更都會被拒絕，確保不會交錯。',
    '硬體表格（路由、主機、MAC）共用有限的記憶體，switch profile 與 route-scale 決定分配方式，變更後需要重新開機或 reload。',
  ],
  html: `
<h2>映像與開機</h2>
<div id="d-img"></div>
<table>
<thead><tr><th>操作</th><th>社群版</th><th>Enterprise SONiC</th></tr></thead>
<tbody>
<tr><td>列出映像</td><td><code>sudo sonic-installer list</code></td><td><code>show image list</code></td></tr>
<tr><td>安裝</td><td><code>sudo sonic-installer install URL</code></td><td><code>image install URL</code>、<code>show image status</code></td></tr>
<tr><td>下次開機使用</td><td><code>sudo sonic-installer set-default IMAGE</code>、<code>set-next-boot</code>（只生效一次）</td><td><code>image set-default IMAGE</code></td></tr>
<tr><td>移除</td><td><code>sudo sonic-installer remove IMAGE</code>、<code>cleanup</code></td><td><code>image remove IMAGE</code></td></tr>
<tr><td>驗證</td><td>—</td><td><code>image verify … gpg | pki</code>，見 <a href="#/pki">PKI</a></td></tr>
<tr><td>韌體（ONIE、BIOS、CPLD）</td><td>fwutil：<code>sudo fwutil install chassis component BIOS fw FILE</code></td><td><code>image firmware install URL</code>，下次開機時套用</td></tr>
<tr><td>Patch</td><td>—</td><td><code>image patch install URL</code>、<code>image patch rollback NAME</code>、<code>show image patch history</code></td></tr>
</tbody></table>
<p>升級與不中斷升級的方式（fast-reboot、warm-reboot）見 <a href="#/reboot">Warm / Fast Reboot</a>；映像的建置見 <a href="#/build">建置與安裝映像</a>。</p>

<h2>組態 session</h2>
<p>模擬透過 SSH 修改 mgmt 介面的 ACL：如果規則寫錯，SSH 會立刻中斷，無法再輸入 <code>commit confirm</code>。比較有無 timeout 的差別。</p>
<div id="sess"></div>
<table>
<thead><tr><th>指令</th><th>作用</th></tr></thead>
<tbody>
<tr><td><code>configure session</code></td><td>進入候選組態模式，提示字元為 <code>config-s</code>；同一時間只允許一個 session</td></tr>
<tr><td><code>show session-config diff</code></td><td>列出候選組態與 running config 的差異</td></tr>
<tr><td><code>commit</code></td><td>套用並建立 checkpoint，可加 <code>label</code></td></tr>
<tr><td><code>commit timeout N</code></td><td>套用，N 秒內沒有 <code>commit confirm</code> 就移除變更並重新啟動核心服務</td></tr>
<tr><td><code>commit timeout-rollback N</code></td><td>同上，但回滾時不重新啟動核心服務</td></tr>
<tr><td><code>commit confirm</code></td><td>確認並取消計時</td></tr>
<tr><td><code>abort</code></td><td>放棄候選組態</td></tr>
</tbody></table>
<p>社群版以 GCU（<code>config apply-patch</code>）、<code>config checkpoint</code> 與 <code>config rollback</code> 達到類似效果，見 <a href="#/config">設定管理</a>。</p>

<h2>第三方容器（TPC）</h2>
<p>Enterprise SONiC 可以用 <code>tpcm</code> 安裝與管理自訂 Docker 容器（例如監控代理或自動化工具），可從 URL、SCP / SFTP、本機檔案或 registry 取得映像，指定在 mgmt VRF 中執行、記憶體上限，以及是否等系統就緒後才啟動。升級 SONiC 映像時 TPC 會被保留。</p>

<h2>硬體資源設定檔</h2>
<table>
<thead><tr><th>設定</th><th>選項</th><th>影響</th></tr></thead>
<tbody>
<tr><td>Switch profile</td><td><code>factory default profile l2 | l3</code></td><td>出廠的預設組態角色（L2 接入或 L3 路由），重設時套用</td></tr>
<tr><td>Route scale</td><td><code>route-scale routes max | max-v6</code></td><td>擴大 IPv4 或 IPv6 路由表，減少其他表格</td></tr>
<tr><td>Host scale</td><td><code>route-scale hosts layer2-layer3 | layer2-layer3-balanced | layer2-layer3-max</code></td><td>MAC 表與主機（ARP / ND）表之間的分配</td></tr>
<tr><td>保留本地鄰居</td><td><code>ip reserve local-neigh N</code></td><td>保留主機表空間給直連鄰居，避免被 EVPN 遠端主機路由佔滿</td></tr>
<tr><td>ECMP group</td><td><code>switch-resource</code> → <code>ecmp-group</code></td><td>next hop group 的數量與大小</td></tr>
<tr><td>Cut-through</td><td><code>switching-mode cut-through</code></td><td>收到標頭即開始轉送，降低延遲；壞封包無法在本機丟棄，速率不同的 port 之間仍退回 store-and-forward</td></tr>
</tbody></table>
<p>使用率以 CRM 監控，見 <a href="#/troubleshooting">故障排除</a> 的「硬體表已滿」。</p>

<h2>檔案與 USB</h2>
<pre><span class="c"># Enterprise SONiC 的檔案路徑</span>
sonic# copy running-configuration startup-configuration
sonic# copy scp://user@10.0.0.5/backup/config_db.json home://config_db.json
sonic# copy home://config_db.json usb0://config_db.json
sonic(config)# usb enable
sonic# usb mount
sonic# dir usb0:/

<span class="c"># 社群版</span>
sudo config save -y
sudo sonic-installer list
sudo sonic-installer install http://10.0.0.5/sonic-broadcom.bin
sudo sonic-installer set-default SONiC-OS-202405.0-xxxx
sudo fwutil show status

<span class="c"># Enterprise SONiC：映像、session、TPC、資源</span>
sonic# image install http://10.0.0.5/sonic-broadcom-enterprise.bin
sonic# show image status
sonic# image set-default SONiC-OS-4.6.0-Enterprise_Advanced
sonic# configure session
sonic(config-s)# ip access-list MGMT-IN
sonic(config-s)# show session-config diff
sonic(config-s)# commit timeout-rollback 120
sonic(config-s)# commit confirm
sonic# tpcm install name monitor url http://10.0.0.5/monitor.tar.gz vrf-name mgmt
sonic(config)# switch-resource
sonic(config-switch-resource)# route-scale routes max-v6</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-img'), {
      title: '多映像與開機流程',
      w: 1000, h: 330,
      groups: [{ x: 380, y: 20, w: 600, h: 290, label: '/host（SSD 上的 SONiC 分割區）' }],
      nodes: [
        { id: 'onie', x: 20, y: 40, w: 150, h: 56, label: 'ONIE', sub: '安裝環境', kind: 'proc', info: '<p>Open Network Install Environment：第一次安裝或重灌時使用，會清空 SONiC 分割區。</p>' },
        { id: 'grub', x: 20, y: 200, w: 150, h: 56, label: 'GRUB', sub: 'grub.cfg', kind: 'file', info: '<p>每個已安裝的映像一個選單項目；set-default 修改預設項目。</p>' },
        { id: 'inst', x: 200, y: 120, w: 150, h: 56, label: 'installer', sub: 'sonic-installer', kind: 'cli', info: '<p>下載映像、解開到新目錄、遷移設定，並更新 GRUB。</p>' },
        { id: 'i1', x: 410, y: 60, w: 250, h: 70, label: 'image-202311.x', sub: '目前執行 · fs.squashfs · docker/', kind: 'file', info: '<p>每個映像包含唯讀的根檔案系統（squashfs）、容器映像與 overlay 的可寫層。</p>' },
        { id: 'i2', x: 410, y: 190, w: 250, h: 70, label: 'image-202405.x', sub: '新安裝 · 下次開機', kind: 'file' },
        { id: 'cfg', x: 710, y: 120, w: 240, h: 60, label: '/etc/sonic', sub: 'config_db.json（遷移到新映像）', kind: 'file', info: '<p>安裝新映像時複製並由 db_migrator 等腳本轉換格式；使用者帳號、/home 也會遷移。</p>' },
      ],
      edges: [
        { from: 'onie', to: 'inst', dash: true, label: '首次安裝', id: 'e1' },
        { from: 'inst', to: 'i2', label: '解開', id: 'e2' },
        { from: 'inst', to: 'grub', label: '更新選單', id: 'e3' },
        { from: 'i1', to: 'cfg', id: 'e4', dash: true },
        { from: 'cfg', to: 'i2', label: '遷移', id: 'e5' },
        { from: 'grub', to: 'i2', label: 'default', id: 'e6', via: [[95, 290], [535, 290]] },
      ],
      steps: [
        { title: '安裝新映像', text: 'installer 把新映像解開到獨立目錄，目前執行的系統不受影響。', nodes: ['inst', 'i2', 'i1'], edges: ['e2'] },
        { title: '遷移設定', text: '目前的設定、使用者資料被複製到新映像，並在第一次開機時轉換到新版格式。', nodes: ['i1', 'cfg', 'i2'], edges: ['e4', 'e5'] },
        { title: '切換開機', text: 'GRUB 預設項目改為新映像；重新開機後生效。舊映像保留，可以 set-default 回去。', nodes: ['inst', 'grub', 'i2'], edges: ['e3', 'e6'] },
      ],
    });

    // ---------- Session 模擬 ----------
    const host = root.querySelector('#sess');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const S0 = () => ({ phase: 'idle', t: 0, deadline: null, bad: false, ssh: true, running: ['ip access-list MGMT-IN', ' seq 10 permit tcp 10.100.0.0/16 any eq 22'], cand: null, log: [] });
    let st = S0();
    let badChange = true;
    const ctl = S.el('div', { class: 'row' });
    const tgl = S.el('button', { class: 'btn sm on', onclick: () => { badChange = !badChange; tgl.classList.toggle('on', badChange); } }, '變更會擋掉自己的 SSH');
    box.appendChild(S.el('div', { class: 'row', style: 'margin-bottom:8px' }, S.el('span', { class: 'w-label' }, '情境'), tgl));
    box.appendChild(ctl);
    const view = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(view);
    const log = (t, k) => st.log.push([st.t, t, k || 'n']);
    const A = {
      start: () => { st.phase = 'session'; st.cand = st.running.slice(); log('configure session：建立候選組態'); },
      edit: () => {
        st.cand = ['ip access-list MGMT-IN', badChange ? ' seq 10 permit tcp 10.200.0.0/16 any eq 22' : ' seq 10 permit tcp 10.100.0.0/16 any eq 22', ' seq 20 permit udp 10.100.0.0/16 any eq 161'];
        st.bad = badChange; log('在 config-s 中修改 ACL（尚未生效）');
      },
      diff: () => log('show session-config diff：' + (st.bad ? '<code>- permit … 10.100.0.0/16 … eq 22</code> <code>+ permit … 10.200.0.0/16 … eq 22</code>（來源網段打錯）' : '<code>+ seq 20 permit udp … eq 161</code>')),
      commit: () => { st.running = st.cand; st.phase = 'idle'; log('commit：立即生效，已建立 checkpoint', 'y'); if (st.bad) { st.ssh = false; log('SSH 來源 10.100.0.20 不在允許清單，連線中斷。只能從 console 修復。', 'r'); } },
      commitT: () => { st.prev = st.running; st.running = st.cand; st.phase = 'pending'; st.deadline = st.t + 120; log('commit timeout-rollback 120：變更生效，120 秒內需要 confirm', 'y'); if (st.bad) { st.ssh = false; log('SSH 連線中斷，無法輸入 commit confirm', 'r'); } },
      confirm: () => { st.phase = 'idle'; st.deadline = null; log('commit confirm：確認變更，取消計時', 'g'); },
      abort: () => { st.phase = 'idle'; st.cand = null; log('abort：放棄候選組態，running config 未變'); },
      wait: () => {
        st.t += 60;
        if (st.phase === 'pending' && st.t >= st.deadline) {
          st.running = st.prev; st.phase = 'idle'; st.deadline = null; st.ssh = true;
          log('計時到期，沒有收到 confirm：自動移除這次 session 的變更', 'g');
          if (st.bad) log('ACL 恢復原狀，SSH 可以重新連線', 'g');
        } else log('經過 60 秒');
      },
      reset: () => { st = S0(); },
    };
    const B = [['start', 'configure session', s => s.phase === 'idle' && s.ssh], ['edit', '修改 ACL', s => s.phase === 'session'], ['diff', 'show diff', s => s.phase === 'session' && s.cand], ['commit', 'commit', s => s.phase === 'session'], ['commitT', 'commit timeout-rollback 120', s => s.phase === 'session'], ['confirm', 'commit confirm', s => s.phase === 'pending' && s.ssh], ['abort', 'abort', s => s.phase === 'session'], ['wait', '等待 60 秒', s => true], ['reset', '重設', s => true]];
    function draw() {
      ctl.innerHTML = '';
      B.forEach(([k, l, en]) => ctl.appendChild(S.el('button', { class: 'btn sm' + (k === 'reset' ? '' : ''), disabled: !en(st), onclick: () => { A[k](); draw(); } }, l)));
      view.innerHTML = `<div class="pipe"><div><div class="pl">時間</div><div class="pv">${st.t} s</div></div><div><div class="pl">狀態</div><div class="pv" style="font-size:14px">${{ idle: '一般', session: 'config-s（候選）', pending: '等待 confirm' }[st.phase]}</div>${st.deadline != null ? `<div class="ps">剩 ${Math.max(0, st.deadline - st.t)} 秒</div>` : ''}</div><div><div class="pl">SSH</div><div class="pv"><span class="badge ${st.ssh ? 'g' : 'r'}">${st.ssh ? '連線中' : '中斷'}</span></div></div></div>
        <div class="grid c2"><div><div class="w-label">running config</div><pre style="margin:6px 0 0">${st.running.join('\n')}</pre></div><div><div class="w-label">candidate</div><pre style="margin:6px 0 0">${st.cand ? st.cand.join('\n') : '（無）'}</pre></div></div>
        <div class="log" style="margin-top:10px">${st.log.length ? st.log.map(([t, x, k]) => `<div><span class="badge ${k}">${t}s</span> ${x}</div>`).join('') : '<div>按「configure session」開始。</div>'}</div>`;
    }
    draw();
  },
  searchText: 'sonic-installer list install set-default set-next-boot remove cleanup fwutil image install image set-default image firmware install image patch install rollback configure session config-s show session-config diff commit timeout timeout-rollback confirm abort checkpoint tpcm install uninstall upgrade switch-resource route-scale routes max max-v6 hosts layer2-layer3 ip reserve local-neigh factory default profile switching-mode cut-through usb mount copy home:// usb0://',
  related: ['config', 'build', 'reboot', 'pki', 'troubleshooting'],
  refs: [['SONiC Installer 說明', 'https://github.com/sonic-net/sonic-utilities/blob/master/doc/Command-Reference.md#software-installation-and-management'], ['SONiC fwutil HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/fwutil/fwutil.md'], ['Enterprise SONiC User Guide UG460：§5.1–5.6、§5.26–5.29', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
