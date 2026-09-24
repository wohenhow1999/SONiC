S.register({
  id: 'aaa',
  category: 'sec',
  order: 1,
  title: 'AAA、TACACS+ / RADIUS / LDAP 與 RBAC',
  en: 'AAA, TACACS+ / RADIUS / LDAP & Role-Based Access Control',
  summary: '交換機的管理登入由 Linux 的 PAM 與 NSS 完成：hostcfgd 依 CONFIG_DB 的 AAA 設定產生 PAM / NSS 設定檔，sshd 經 PAM 向 TACACS+、RADIUS 或 LDAP 伺服器認證，NSS 把遠端使用者對應成本機帳號。授權分為以角色決定的 RBAC 與逐條指令的 TACACS+ 授權；計帳則由 auditd 收集後送往伺服器。',
  meta: [
    ['程序', ['hostcfgd', 'sshd / login', 'PAM（pam_tacplus、pam_radius_auth、pam_ldap）', 'NSS（libnss_tacplus、libnss_radius、nss_ldap）', 'auditd + audisp-tacplus']],
    ['CONFIG_DB', ['AAA|authentication / authorization / accounting', 'TACPLUS|global、TACPLUS_SERVER', 'RADIUS|global、RADIUS_SERVER', 'LDAP、LDAP_SERVER（Enterprise）']],
    ['協定', ['TACACS+ TCP 49', 'RADIUS UDP 1812 / 1813、RADIUS over TLS（RadSec）TCP 2083', 'LDAP TCP 389、LDAPS TCP 636']],
    ['相關', ['RBAC 角色：admin / operator / netadmin / secadmin（Enterprise）', 'login lockout、password-attributes、MFA、CAC-PIV']],
  ],
  tags: ['AAA', 'TACACS+', 'RADIUS', 'LDAP', 'RBAC', 'PAM', 'NSS', 'hostcfgd', 'failthrough', 'authorization', 'accounting', 'MFA', 'CAC-PIV', 'login lockout', 'password policy', 'SSH'],
  keypoints: [
    '認證方法清單依序執行：例如「tacacs+, local」表示先問 TACACS+ 伺服器，伺服器全部沒有回應時才使用本機帳號。',
    '伺服器明確拒絕（密碼錯誤）與伺服器無回應是兩種不同的結果：預設只有「無回應」才會往下一個方法走；啟用 failthrough 後，「拒絕」也會繼續嘗試下一台伺服器與下一個方法。',
    '遠端使用者在 Linux 上仍需要一個本機帳號：NSS 模組依伺服器回傳的權限等級把使用者對應為具 sudo 權限或唯讀的本機帳號。RADIUS 以 Management-Privilege-Level = 15 表示管理員。',
    'Enterprise SONiC 以四種角色實作 RBAC：admin 登入後進 Linux shell，其他角色進 Management Framework CLI，並由 translib 依角色過濾可執行的設定。',
    '指令授權（authorization commands）只支援 TACACS+：每條指令送伺服器核准，伺服器不可達時可退回本機 RBAC。',
  ],
  html: `
<h2>架構</h2>
<div id="d-aaa"></div>

<h2>認證方法與 failthrough</h2>
<p>選擇方法清單、伺服器的回應與登入方式，觀察每一步的判斷。伺服器依 priority 由高到低嘗試。</p>
<div id="login"></div>
<table>
<thead><tr><th>方法清單</th><th>failthrough</th><th>伺服器拒絕</th><th>伺服器全部無回應</th></tr></thead>
<tbody>
<tr><td>遠端 + local</td><td>停用</td><td>拒絕登入</td><td>改用本機帳號</td></tr>
<tr><td>遠端 + local</td><td>啟用</td><td>嘗試下一台伺服器，最後改用本機帳號</td><td>改用本機帳號</td></tr>
<tr><td>只有遠端</td><td>任一</td><td>拒絕登入</td><td>拒絕登入（console 可另設 <code>login console local</code> 作為救援）</td></tr>
</tbody></table>

<h2>帳號對應：為什麼遠端使用者需要本機帳號</h2>
<p>sshd 在驗證密碼前會先以 <code>getpwnam()</code> 查詢使用者是否存在；遠端使用者不在 <code>/etc/passwd</code> 中，因此由 NSS 模組補上。以社群版 TACACS+ 為例，<code>libnss_tacplus</code> 會向伺服器查詢使用者的 privilege level，並在第一次登入時建立同名本機帳號：</p>
<table>
<thead><tr><th>伺服器回傳</th><th>對應的本機樣板帳號</th><th>結果</th></tr></thead>
<tbody>
<tr><td>TACACS+ priv-lvl 15</td><td><code>remote_user_su</code></td><td>加入 sudo、docker 群組，可執行 <code>config</code></td></tr>
<tr><td>TACACS+ priv-lvl 1–14</td><td><code>remote_user</code></td><td>一般使用者，只能執行 <code>show</code></td></tr>
<tr><td>RADIUS Management-Privilege-Level 15</td><td>管理員</td><td>Enterprise SONiC 要求此屬性為 15 才授予讀寫權限（RFC 5607）</td></tr>
<tr><td>LDAP 群組屬性</td><td>依 <code>ldap-server map</code> 對應</td><td>可把 AD 的 memberOf、sAMAccountName 等屬性對應到 Linux 帳號欄位</td></tr>
</tbody></table>

<h2>RBAC 角色</h2>
<div id="rbac"></div>

<h2>授權與計帳</h2>
<table>
<thead><tr><th>功能</th><th>社群版</th><th>Enterprise SONiC</th></tr></thead>
<tbody>
<tr><td>角色授權</td><td>依 Linux 群組（sudo / docker），唯讀使用者無法執行 <code>config</code></td><td>RBAC 四種角色，可組合，例如 <code>role secadmin,netadmin</code></td></tr>
<tr><td>指令授權</td><td><code>config aaa authorization tacacs+</code>：bash 的 tacplus 外掛在執行每個指令前向伺服器確認</td><td><code>aaa authorization commands default group tacacs+ local</code>：伺服器不可達時退回 RBAC</td></tr>
<tr><td>計帳</td><td><code>config aaa accounting tacacs+</code>：auditd 經 audisp-tacplus 送出指令紀錄</td><td><code>aaa accounting commands all default start-stop group tacacs+ logging</code>；session 計帳另設</td></tr>
<tr><td>動態授權（CoA）</td><td>—</td><td>Dynamic Authorization Server：接收 RADIUS Disconnect / CoA，用於 802.1X 用戶端</td></tr>
</tbody></table>

<h2>登入安全強化</h2>
<table>
<thead><tr><th>項目</th><th>作用</th><th>Enterprise SONiC 指令</th></tr></thead>
<tbody>
<tr><td>登入鎖定</td><td>連續失敗後鎖定帳號一段時間</td><td><code>login lockout max-retries 5</code>、<code>login lockout period 10</code>、<code>login lockout console-exempt</code></td></tr>
<tr><td>閒置逾時</td><td>CLI 閒置自動登出</td><td><code>login exec-timeout 1200</code></td></tr>
<tr><td>密碼規則</td><td>長度、大小寫、數字、特殊字元</td><td><code>login password-attributes min-length 12</code>、<code>character-restriction upper 1</code></td></tr>
<tr><td>密碼雜湊</td><td>本機密碼的雜湊演算法</td><td><code>login password-hashing yescrypt</code>（或 sha-512）</td></tr>
<tr><td>SSH 伺服器</td><td>限制演算法、關閉密碼登入、限制重試</td><td><code>ip ssh ciphers …</code>、<code>ip ssh kexalgorithms …</code>、<code>ip ssh disable-password-authentication true</code>、<code>ip ssh max-auth-retries 3</code></td></tr>
<tr><td>多因素認證</td><td>RSA SecurID 作為第二因素</td><td><code>aaa authentication login mfa rsa-securid</code>，搭配 <code>mfa security-profile</code></td></tr>
<tr><td>CAC / PIV 智慧卡</td><td>以 X.509 使用者憑證登入 SSH，CN 或欄位對應使用者名稱</td><td><code>aaa authentication login default group cac-piv local</code>、<code>aaa cac-piv security-profile …</code></td></tr>
</tbody></table>
<p class="muted">RADIUS over TLS、LDAPS、MFA 與 CAC-PIV 都需要 CA 憑證與 security profile，詳見 <a href="#/pki">憑證與 PKI</a>。</p>

<h2>設定</h2>
<pre><span class="c"># 社群版</span>
sudo config tacacs add 10.0.0.10 --key s3cret --priority 1 --timeout 5
sudo config tacacs authtype pap
sudo config aaa authentication login tacacs+ local
sudo config aaa authentication failthrough enable
sudo config aaa authorization tacacs+
sudo config aaa accounting tacacs+
show aaa
show tacacs

<span class="c"># Enterprise SONiC</span>
sonic(config)# username netops password ******** role netadmin
sonic(config)# username audit password ******** role operator
sonic(config)# tacacs-server host 10.0.0.10 key ****** priority 10 vrf mgmt
sonic(config)# tacacs-server host 10.0.0.11 key ****** priority 5 vrf mgmt
sonic(config)# tacacs-server source-interface Management 0
sonic(config)# aaa authentication login default group tacacs+ local
sonic(config)# aaa authentication failthrough enable
sonic(config)# aaa authentication login console local
sonic(config)# aaa authorization commands default group tacacs+ local
sonic(config)# aaa accounting commands all default start-stop group tacacs+ logging
sonic(config)# radius-server host 10.0.0.20 key ****** auth-port 1812 vrf mgmt
sonic(config)# ldap-server host 10.0.0.30 port 636
sonic(config)# ldap-server base dc=example,dc=com
sonic# show aaa
sonic# show users configured</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-aaa'), {
      title: 'SSH 登入與 AAA 元件',
      w: 1000, h: 400,
      nodes: [
        { id: 'cfg', x: 20, y: 30, w: 170, h: 56, label: 'CONFIG_DB', sub: 'AAA / TACPLUS / RADIUS', kind: 'db', info: '<p><code>AAA|authentication</code> 的 login 欄位存放方法清單（例如 <code>tacacs+,local</code>），另有 failthrough、fallback；伺服器位址、key、priority、VRF 在 <code>TACPLUS_SERVER</code> / <code>RADIUS_SERVER</code>。</p>' },
        { id: 'hc', x: 240, y: 30, w: 170, h: 56, label: 'hostcfgd', sub: '(host)', kind: 'proc', info: '<p>監看 CONFIG_DB，把 AAA 設定轉成 Linux 設定檔。它在主機上執行，不在容器內。</p>' },
        { id: 'files', x: 460, y: 30, w: 260, h: 56, label: 'PAM / NSS 設定檔', sub: 'common-auth-sonic · tacplus_nss.conf', kind: 'file', info: '<p><code>/etc/pam.d/common-auth-sonic</code> 決定 PAM 模組的順序（對應方法清單），<code>/etc/tacplus_nss.conf</code>、<code>/etc/pam_radius_auth.conf</code> 存放伺服器資訊。</p>' },
        { id: 'user', x: 20, y: 175, w: 150, h: 56, label: '管理者', sub: 'SSH / console', kind: 'ext', info: '<p>從 mgmt 介面 SSH 或 console 登入。</p>' },
        { id: 'sshd', x: 220, y: 175, w: 150, h: 56, label: 'sshd / login', kind: 'proc', info: '<p>先透過 NSS 查詢使用者，再呼叫 PAM 驗證密碼，成功後啟動 shell。</p>' },
        { id: 'pam', x: 440, y: 175, w: 200, h: 56, label: 'PAM', sub: 'tacplus · radius · unix', kind: 'proc', info: '<p>依方法清單依序呼叫模組。pam_unix 是本機帳號（local）。</p>' },
        { id: 'srv', x: 760, y: 175, w: 210, h: 56, label: 'AAA 伺服器', sub: 'TACACS+ · RADIUS · LDAP', kind: 'ext', info: '<p>通常經由 mgmt VRF 連線。多台伺服器依 priority 嘗試。</p>' },
        { id: 'nss', x: 440, y: 310, w: 200, h: 56, label: 'NSS', sub: 'libnss_tacplus · ldap', kind: 'proc', info: '<p>讓 getpwnam() 能查到遠端使用者，並依權限等級對應成本機帳號（管理員或唯讀）。</p>' },
        { id: 'sh', x: 220, y: 310, w: 150, h: 56, label: 'shell / KLISH', sub: 'RBAC', kind: 'cli', info: '<p>社群版登入後進 bash；Enterprise SONiC 依角色進 Linux shell（admin）或 Management Framework CLI。</p>' },
        { id: 'aud', x: 700, y: 310, w: 190, h: 56, label: 'auditd', sub: 'audisp-tacplus', kind: 'proc', info: '<p>記錄使用者執行的指令，經 audisp 外掛以 TACACS+ accounting 送出。</p>' },
      ],
      edges: [
        { from: 'cfg', to: 'hc', id: 'e1' }, { from: 'hc', to: 'files', label: '產生', id: 'e2' },
        { from: 'files', to: 'pam', dash: true, id: 'e3' },
        { from: 'user', to: 'sshd', id: 'e4' }, { from: 'sshd', to: 'pam', id: 'e5' },
        { from: 'pam', to: 'srv', bi: true, label: '認證', id: 'e6' },
        { from: 'sshd', to: 'nss', label: '查詢帳號', id: 'e7' },
        { from: 'nss', to: 'srv', dash: true, id: 'e8', via: [[865, 338]] },
        { from: 'sshd', to: 'sh', label: '成功', id: 'e9' },
        { from: 'sh', to: 'aud', dash: true, label: '指令紀錄', id: 'e10', via: [[295, 385], [795, 385]] },
        { from: 'aud', to: 'srv', label: 'accounting', id: 'e11' },
      ],
      steps: [
        { title: '套用設定', text: 'hostcfgd 讀取 CONFIG_DB 的 AAA 表，產生 PAM 與 NSS 設定檔。設定變更不需要重啟任何容器。', nodes: ['cfg', 'hc', 'files', 'pam'], edges: ['e1', 'e2', 'e3'] },
        { title: '查詢帳號', text: 'sshd 先以 NSS 查詢使用者。遠端使用者不在 /etc/passwd 中，由 NSS 模組向伺服器確認並對應為本機帳號。', nodes: ['user', 'sshd', 'nss', 'srv'], edges: ['e4', 'e7', 'e8'] },
        { title: '認證', text: 'PAM 依方法清單依序呼叫模組，向 AAA 伺服器驗證密碼；伺服器無回應時依設定改用本機帳號。', nodes: ['sshd', 'pam', 'srv'], edges: ['e5', 'e6'] },
        { title: '授權', text: '登入成功後啟動 shell。Enterprise SONiC 依 RBAC 角色決定可用的 CLI；啟用指令授權時，每條指令先送 TACACS+ 核准。', nodes: ['sshd', 'sh'], edges: ['e9'] },
        { title: '計帳', text: 'auditd 記錄指令，經 audisp-tacplus 送往 TACACS+ 伺服器。', nodes: ['sh', 'aud', 'srv'], edges: ['e10', 'e11'] },
      ],
    });

    // ---------- 登入模擬 ----------
    const host = root.querySelector('#login');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const LISTS = [['tacacs+', 'local'], ['tacacs+'], ['local', 'tacacs+'], ['local']];
    const ST = ['接受', '拒絕', '無回應'];
    const P = { list: 0, ft: false, s1: 2, s2: 0, local: true, console: false, consoleLocal: true };
    const ctl = S.el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    box.appendChild(ctl);
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);
    const rowOf = (label, el) => S.el('div', { class: 'row' }, S.el('span', { class: 'w-label', style: 'min-width:120px' }, label), el);
    const segHost = () => S.el('span');
    const h1 = segHost(), h2 = segHost(), h3 = segHost(), h4 = segHost(), h5 = segHost();
    ctl.appendChild(rowOf('方法清單', h1));
    ctl.appendChild(rowOf('TACACS+ #1 (prio 10)', h2));
    ctl.appendChild(rowOf('TACACS+ #2 (prio 5)', h3));
    ctl.appendChild(rowOf('登入方式', h4));
    const tg = S.el('span', { class: 'row' });
    ctl.appendChild(rowOf('其他', tg));
    S.seg(h1, LISTS.map(l => l.join(', ')), i => { P.list = i; draw(); }, P.list);
    S.seg(h2, ST, i => { P.s1 = i; draw(); }, P.s1);
    S.seg(h3, ST, i => { P.s2 = i; draw(); }, P.s2);
    S.seg(h4, ['SSH', 'Console'], i => { P.console = i === 1; draw(); }, 0);
    const toggle = (k, label) => {
      const b = S.el('button', { class: 'btn sm' + (P[k] ? ' on' : ''), onclick: () => { P[k] = !P[k]; b.classList.toggle('on', P[k]); draw(); } }, label);
      tg.appendChild(b);
    };
    toggle('ft', 'failthrough');
    toggle('local', '本機密碼正確');
    toggle('consoleLocal', 'login console local');

    function run() {
      const log = [];
      if (P.console && P.consoleLocal) {
        log.push(['n', 'Console 登入，且設定了 <code>aaa authentication login console local</code>：只檢查本機帳號。']);
        return P.local ? { ok: true, by: 'local', log: log.concat([['g', '本機密碼正確 → 登入成功（角色取自本機帳號）']]) } : { ok: false, log: log.concat([['r', '本機密碼錯誤 → 拒絕']]) };
      }
      const list = LISTS[P.list];
      for (let mi = 0; mi < list.length; mi++) {
        const m = list[mi];
        const last = mi === list.length - 1;
        if (m === 'local') {
          if (P.local) { log.push(['g', '方法 local：本機密碼正確 → 登入成功']); return { ok: true, by: 'local', log }; }
          log.push(['r', `方法 local：本機密碼錯誤${last ? '' : ' → 嘗試下一個方法'}`]);
          continue;
        }
        let rejected = false;
        for (const [name, st] of [['#1', P.s1], ['#2', P.s2]]) {
          if (st === 0) { log.push(['g', `TACACS+ ${name}：接受 → 登入成功（權限等級由伺服器決定）`]); return { ok: true, by: 'tacacs+', log }; }
          if (st === 2) { log.push(['y', `TACACS+ ${name}：逾時無回應 → 嘗試下一台伺服器`]); continue; }
          if (!P.ft) { log.push(['r', `TACACS+ ${name}：拒絕。failthrough 停用，伺服器的拒絕即為最終結果`]); return { ok: false, log }; }
          log.push(['y', `TACACS+ ${name}：拒絕。failthrough 啟用 → 繼續嘗試`]);
          rejected = true;
        }
        log.push(['n', (rejected ? '所有 TACACS+ 伺服器都未接受' : '所有 TACACS+ 伺服器都無回應') + (last ? '' : ' → 改用下一個方法')]);
      }
      log.push(['r', '方法清單已用完 → 拒絕登入']);
      return { ok: false, log };
    }
    function draw() {
      const r = run();
      const cls = { g: 'g', r: 'r', y: 'y', n: 'n' };
      out.innerHTML = `<div class="row" style="margin-bottom:8px"><span class="w-label">結果</span><span class="badge ${r.ok ? 'g' : 'r'}">${r.ok ? '登入成功 · ' + r.by : '拒絕登入'}</span></div>
        <div class="log">${r.log.map(([c, t], i) => `<div><span class="badge ${cls[c]}" style="min-width:22px;text-align:center">${i + 1}</span> ${t}</div>`).join('')}</div>`;
    }
    draw();

    // ---------- RBAC ----------
    const rh = root.querySelector('#rbac');
    const rbox = S.el('div', { class: 'w-box' });
    rh.appendChild(rbox);
    const ROLES = ['admin', 'operator', 'netadmin', 'secadmin'];
    const sel = new Set(['netadmin']);
    const CMDS = [
      ['登入後的 shell', r => r.has('admin') ? 'Linux shell（admin@sonic:~$）' : 'Management Framework CLI（sonic#）', null],
      ['show running-configuration / show interface', r => true],
      ['interface Eth1/1 → ip address、mtu', r => r.has('admin') || r.has('netadmin')],
      ['router bgp、vlan、portchannel、qos', r => r.has('admin') || r.has('netadmin')],
      ['tacacs-server / radius-server / aaa', r => r.has('admin') || r.has('secadmin')],
      ['crypto cert install、crypto security-profile', r => r.has('admin') || r.has('secadmin')],
      ['username … role（建立使用者）', r => r.has('admin')],
      ['進入 Linux shell、docker exec', r => r.has('admin')],
    ];
    function rdraw() {
      rbox.innerHTML = '';
      const row = S.el('div', { class: 'row' }, S.el('span', { class: 'w-label' }, '指派角色'));
      ROLES.forEach(k => row.appendChild(S.el('button', { class: 'btn sm' + (sel.has(k) ? ' on' : ''), onclick: () => { sel.has(k) ? sel.delete(k) : sel.add(k); rdraw(); } }, k)));
      rbox.appendChild(row);
      const t = S.el('table', { style: 'margin-top:12px' });
      t.innerHTML = '<thead><tr><th>操作</th><th>結果</th></tr></thead>';
      const tb = S.el('tbody');
      CMDS.forEach(([c, f, x]) => {
        const v = sel.size ? f(sel) : false;
        const cell = typeof v === 'string' ? `<span class="badge b">${v}</span>` : `<span class="badge ${v ? 'g' : 'r'}">${v ? '允許' : '拒絕'}</span>`;
        tb.appendChild(S.el('tr', { html: `<td><code>${c}</code></td><td>${sel.size ? cell : '<span class="badge n">未指派角色，無法登入</span>'}</td>` }));
      });
      t.appendChild(tb);
      rbox.appendChild(S.el('div', { class: 'tbl' }, t));
      rbox.appendChild(S.el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:8px' }, '多個角色的權限取聯集。表格為各角色職責的示意，實際以該版本手冊為準。'));
    }
    rdraw();
  },
  searchText: 'pam_tacplus libnss_tacplus remote_user_su Management-Privilege-Level RFC 5607 aaa authentication login default group tacacs+ local failthrough console local username role secadmin netadmin operator',
  related: ['pki', 'pac', 'mgmt-api', 'vrf'],
  refs: [['SONiC TACACS+ 設計文件', 'https://github.com/sonic-net/SONiC/blob/master/doc/aaa/TACACS%2B%20Design.md'], ['SONiC RADIUS 管理使用者認證 HLD', 'https://github.com/sonic-net/SONiC/blob/master/doc/aaa/radius_authentication.md'], ['RFC 8907 TACACS+', 'https://www.rfc-editor.org/rfc/rfc8907'], ['Enterprise SONiC User Guide UG460：§5.12–5.16', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
