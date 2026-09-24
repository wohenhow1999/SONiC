S.register({
  id: 'pki',
  category: 'sec',
  order: 2,
  title: '憑證、CA 與 PKI',
  en: 'Certificates, Certificate Authorities & PKI',
  summary: '交換機上所有以 TLS 保護的服務（REST、gNMI、RADIUS over TLS、LDAPS、Syslog over TLS、MFA、CAC-PIV）都依賴同一組 PKI 物件：代表交換機身分的 host certificate、用來驗證對端的 CA certificate、集合 CA 的 trust store，以及把兩者與檢查選項綁在一起的 security profile。本章說明這些物件的關係、憑證鏈驗證的每一步，以及憑證的生命週期。',
  meta: [
    ['物件', ['host certificate + private key', 'CA certificate', 'trust store', 'security profile']],
    ['使用者', ['REST（mgmt-framework）', 'gNMI（telemetry / gnmi）', 'RADIUS over TLS', 'LDAP over TLS', 'Syslog over TLS', 'MFA、CAC-PIV']],
    ['CONFIG_DB（社群版）', ['RESTAPI|certs、RESTAPI|config', 'GNMI|certs、GNMI|gnmi（舊版為 TELEMETRY）']],
    ['標準', ['X.509 v3（RFC 5280）', 'TLS 1.2 / 1.3', 'CRL、OCSP（RFC 6960）', 'PKCS#10 CSR']],
  ],
  tags: ['PKI', 'CA', 'certificate', 'X.509', 'TLS', 'mTLS', 'trust store', 'security profile', 'CSR', 'CRL', 'OCSP', 'revocation', 'crypto', 'self-signed', 'FIPS', 'image verification', 'SSH key'],
  keypoints: [
    'host certificate 證明「我是誰」，CA certificate 用來驗證「對方是誰」；兩者用途不同，放在不同的地方。',
    '驗證對端憑證時，必須能從對端憑證一路找到 trust store 中的根 CA：缺少中繼憑證、根 CA 不在 trust store、過期或已撤銷，任何一項都會讓 TLS 握手失敗。',
    'security profile 是設定的樞紐：服務只引用 profile 名稱，profile 再指向 host certificate、trust store 與 peer-name / key-usage / revocation 等檢查選項。',
    '交換機既可以是 TLS 伺服器（REST、gNMI），也可以是 TLS 用戶端（RADIUS、LDAP、Syslog）；雙向驗證（mTLS）時兩邊都需要 host certificate 與對方的 CA。',
    'REST 與 gNMI 在沒有設定時使用自簽憑證，可連線但用戶端無法驗證交換機身分；正式環境應換成 CA 簽發的憑證。',
    '憑證有效期以系統時間判斷：NTP 未同步時可能出現「尚未生效」或誤判過期。',
  ],
  html: `
<h2>物件關係</h2>
<div id="d-pki"></div>

<h2>名詞</h2>
<table>
<thead><tr><th>物件</th><th>內容</th><th>用途</th><th>Enterprise SONiC 指令</th></tr></thead>
<tbody>
<tr><td>Host certificate</td><td>交換機的公鑰憑證與對應私鑰</td><td>作為伺服器時出示給用戶端；作為 mTLS 用戶端時出示給伺服器</td><td><code>crypto cert install cert-file … key-file …</code></td></tr>
<tr><td>CSR</td><td>含公鑰與主體名稱的簽發請求（PKCS#10）</td><td>送交 CA 簽發 host certificate，私鑰不離開交換機</td><td><code>crypto cert generate request … cname … altname DNS:…</code></td></tr>
<tr><td>CA certificate</td><td>根 CA 或中繼 CA 的憑證</td><td>驗證對端憑證的簽章</td><td><code>crypto ca-cert install home://ca.crt</code></td></tr>
<tr><td>Trust store</td><td>一組 CA certificate</td><td>定義「信任哪些 CA」</td><td><code>crypto trust-store NAME ca-cert CA1,CA2</code></td></tr>
<tr><td>Security profile</td><td>host cert + trust store + 檢查選項</td><td>被各服務引用</td><td><code>crypto security-profile NAME</code></td></tr>
<tr><td>CRL / CDP</td><td>CA 發布的撤銷清單與其下載位置</td><td>確認對端憑證未被撤銷</td><td><code>crypto security-profile cdp-list NAME URL</code></td></tr>
<tr><td>OCSP</td><td>線上查詢單張憑證的撤銷狀態</td><td>不必下載整份 CRL</td><td><code>crypto security-profile ocsp-list NAME URL</code></td></tr>
</tbody></table>

<h2>哪個服務用到什麼</h2>
<table>
<thead><tr><th>服務</th><th>交換機角色</th><th>需要 host cert</th><th>需要 trust store</th><th>引用方式</th></tr></thead>
<tbody>
<tr><td>REST / RESTCONF</td><td>TLS 伺服器</td><td>是</td><td>啟用用戶端憑證認證（cert）時</td><td><code>ip rest security-profile P</code></td></tr>
<tr><td>gNMI</td><td>TLS 伺服器</td><td>是</td><td>啟用 cert 認證時；用戶端憑證的 CN 必須是使用者名稱</td><td><code>ip telemetry security-profile P</code></td></tr>
<tr><td>RADIUS over TLS</td><td>TLS 用戶端（mTLS）</td><td>是</td><td>是，驗證 RADIUS 伺服器；伺服器憑證 CN 需為其主機名</td><td><code>radius-server host … protocol tls security-profile P</code></td></tr>
<tr><td>LDAPS</td><td>TLS 用戶端</td><td>視伺服器要求</td><td>是</td><td><code>ldap-server security-profile P</code></td></tr>
<tr><td>Syslog over TLS</td><td>TLS 用戶端</td><td>視伺服器要求</td><td>是</td><td><code>logging security-profile P</code>、<code>logging server … protocol tls</code></td></tr>
<tr><td>CAC-PIV SSH 登入</td><td>驗證使用者憑證</td><td>否</td><td>是，並常搭配 OCSP</td><td><code>aaa cac-piv security-profile P</code></td></tr>
</tbody></table>

<h2>憑證鏈驗證</h2>
<p>模擬一方驗證另一方的憑證（例如交換機驗證 RADIUS 伺服器，或 REST 伺服器驗證用戶端憑證）。調整對端憑證與本機 trust store 的狀態，觀察驗證停在哪一步。</p>
<div id="chain"></div>

<h2>憑證生命週期</h2>
<ol>
<li><b>產生金鑰與 CSR</b>：在交換機上產生，私鑰留在本機。CSR 中的 CN 與 SAN（DNS 名稱或 IP）應與用戶端連線時使用的名稱一致。</li>
<li><b>CA 簽發</b>：由企業 CA 簽發 host certificate，並取得 CA 鏈（中繼與根）。</li>
<li><b>安裝</b>：<code>crypto cert install</code> 安裝 host certificate 與私鑰，<code>crypto ca-cert install</code> 安裝 CA。加上 <code>validate</code> 可在安裝前以完整 CA 鏈檢查。</li>
<li><b>綁定</b>：建立 trust store 與 security profile，並在服務上引用。REST 與 gNMI 會在不重啟程序的情況下換上新憑證。</li>
<li><b>監控</b>：系統每天檢查到期日；剩 30 天內每日送 INFO syslog，14 天內送 WARNING，過期送 CRIT。也可以用 <code>crypto cert verify NAME expiry</code> 手動確認。</li>
<li><b>更新</b>：到期前以相同流程換發；升級映像時憑證會保留，但以 ONIE 重灌後需要重新安裝。</li>
</ol>

<h2>其他以密碼學保護的項目</h2>
<table>
<thead><tr><th>項目</th><th>說明</th><th>指令</th></tr></thead>
<tbody>
<tr><td>映像驗證</td><td>安裝前以 GPG 簽章或 PKI（X.509）簽章確認映像未被竄改</td><td><code>image verify URL pki signature SIG public-key KEY</code></td></tr>
<tr><td>SSH host key</td><td>交換機作為 SSH 伺服器的身分金鑰；更換後用戶端會出現 host key 變更警告</td><td><code>crypto ssh-keygen ecdsa 256</code>、<code>show crypto ssh-key</code></td></tr>
<tr><td>REST cipher suite</td><td>限制 REST 伺服器可協商的 TLS 加密套件</td><td><code>ip rest cipher-suite …</code></td></tr>
<tr><td>FIPS</td><td>FIPS 模式下的服務只使用以 <code>fips</code> 參數安裝的憑證與金鑰</td><td><code>crypto cert install … fips</code></td></tr>
</tbody></table>

<h2>設定</h2>
<pre><span class="c"># Enterprise SONiC：REST 與 gNMI 使用 CA 簽發的憑證，並要求用戶端憑證</span>
sonic# crypto cert generate request cert-file home://sw1.csr key-file home://sw1.key cname sw1.example.com altname DNS:sw1.example.com
<span class="c">#   （把 sw1.csr 交給 CA 簽發，取得 sw1.crt 與 CA 鏈）</span>
sonic# crypto cert install cert-file home://sw1.crt key-file home://sw1.key validate
sonic# crypto ca-cert install home://corp-root.crt
sonic# crypto ca-cert install home://corp-issuing.crt
sonic(config)# crypto trust-store corp ca-cert corp-root,corp-issuing
sonic(config)# crypto security-profile mgmt
sonic(config)# crypto security-profile certificate mgmt sw1
sonic(config)# crypto security-profile trust-store mgmt corp
sonic(config)# crypto security-profile mgmt peer-name-check true
sonic(config)# crypto security-profile mgmt revocation-check true
sonic(config)# crypto security-profile cdp-list mgmt http://pki.example.com/corp.crl
sonic(config)# ip rest security-profile mgmt
sonic(config)# ip rest authentication password,jwt,cert
sonic(config)# ip telemetry security-profile mgmt
sonic(config)# ip telemetry authentication password,jwt,cert
sonic# show crypto cert all
sonic# show crypto trust-store
sonic# show crypto security-profile

<span class="c"># 用戶端：以憑證呼叫 REST（CN = 使用者名稱）</span>
curl --cacert corp-root.crt --cert admin.crt --key admin.key \\
  https://sw1.example.com/restconf/data/openconfig-system:system/state

<span class="c"># 社群版：gNMI 伺服器憑證（CONFIG_DB）</span>
sonic-db-cli CONFIG_DB hset "GNMI|certs" server_crt /etc/sonic/credentials/server.crt \\
  server_key /etc/sonic/credentials/server.key ca_crt /etc/sonic/credentials/ca.crt
sonic-db-cli CONFIG_DB hset "GNMI|gnmi" client_auth true port 50051</pre>
`,
  mount(root) {
    S.diagram(root.querySelector('#d-pki'), {
      title: 'PKI 物件與引用它們的服務',
      w: 1000, h: 420,
      groups: [{ x: 700, y: 20, w: 280, h: 380, label: '引用 security profile 的服務' }],
      nodes: [
        { id: 'ca', x: 20, y: 40, w: 180, h: 56, label: 'CA certificate', sub: 'corp-root · corp-issuing', kind: 'file', info: '<p>以 <code>crypto ca-cert install</code> 安裝。只含公鑰，用來驗證對端憑證上的 CA 簽章。</p>' },
        { id: 'ts', x: 250, y: 40, w: 180, h: 56, label: 'trust store', sub: 'crypto trust-store', kind: 'file', info: '<p>一組 CA。只有鏈能追溯到其中之一的對端憑證會被信任。</p>' },
        { id: 'csr', x: 20, y: 180, w: 180, h: 56, label: 'CSR + 私鑰', sub: 'crypto cert generate', kind: 'file', info: '<p>私鑰在交換機上產生，CSR 送到 CA。</p>' },
        { id: 'host', x: 250, y: 180, w: 180, h: 56, label: 'host certificate', sub: 'crypto cert install', kind: 'file', info: '<p>CA 簽發的交換機憑證，與私鑰一起安裝。</p>' },
        { id: 'pca', x: 20, y: 320, w: 180, h: 56, label: '企業 CA', kind: 'ext', info: '<p>簽發 host certificate，並發布 CRL 或提供 OCSP 查詢。</p>' },
        { id: 'sp', x: 470, y: 110, w: 200, h: 70, label: 'security profile', sub: 'peer-name · key-usage · CRL', kind: 'proc', info: '<p>把 host certificate、trust store 與檢查選項綁在一起。服務只引用 profile 名稱，更換憑證時不需修改各服務的設定。</p>' },
        { id: 'rest', x: 740, y: 50, w: 200, h: 44, label: 'REST / RESTCONF', sub: '伺服器', kind: 'proc' },
        { id: 'gnmi', x: 740, y: 110, w: 200, h: 44, label: 'gNMI', sub: '伺服器', kind: 'proc' },
        { id: 'rad', x: 740, y: 170, w: 200, h: 44, label: 'RADIUS over TLS', sub: '用戶端 · mTLS', kind: 'proc' },
        { id: 'ldap', x: 740, y: 230, w: 200, h: 44, label: 'LDAPS', sub: '用戶端', kind: 'proc' },
        { id: 'sys', x: 740, y: 290, w: 200, h: 44, label: 'Syslog over TLS', sub: '用戶端', kind: 'proc' },
        { id: 'cac', x: 740, y: 350, w: 200, h: 44, label: 'MFA · CAC-PIV', sub: '驗證使用者', kind: 'proc' },
      ],
      edges: [
        { from: 'ca', to: 'ts', id: 'e1' }, { from: 'csr', to: 'pca', label: '送簽', id: 'e2' },
        { from: 'pca', to: 'host', label: '簽發', id: 'e3', via: [[340, 348]] },
        { from: 'ts', to: 'sp', id: 'e4' }, { from: 'host', to: 'sp', id: 'e5' },
        { from: 'sp', to: 'rest', id: 'e6' }, { from: 'sp', to: 'gnmi', id: 'e7' }, { from: 'sp', to: 'rad', id: 'e8' },
        { from: 'sp', to: 'ldap', id: 'e9' }, { from: 'sp', to: 'sys', id: 'e10' }, { from: 'sp', to: 'cac', id: 'e11' },
      ],
      steps: [
        { title: '申請 host certificate', text: '在交換機上產生私鑰與 CSR，交由企業 CA 簽發。', nodes: ['csr', 'pca', 'host'], edges: ['e2', 'e3'] },
        { title: '建立 trust store', text: '安裝根 CA 與中繼 CA，放入 trust store，定義要信任的簽發者。', nodes: ['ca', 'ts'], edges: ['e1'] },
        { title: '組成 security profile', text: 'profile 引用 host certificate 與 trust store，並設定 peer-name、key-usage、revocation 檢查。', nodes: ['ts', 'host', 'sp'], edges: ['e4', 'e5'] },
        { title: '服務引用 profile', text: 'REST、gNMI 以此作為伺服器憑證並驗證用戶端；RADIUS、LDAP、Syslog 以此驗證伺服器並出示用戶端憑證。', nodes: ['sp', 'rest', 'gnmi', 'rad', 'ldap', 'sys', 'cac'], edges: ['e6', 'e7', 'e8', 'e9', 'e10', 'e11'] },
      ],
    });

    // ---------- 憑證鏈驗證 ----------
    const host = root.querySelector('#chain');
    const box = S.el('div', { class: 'w-box' });
    host.appendChild(box);
    const P = { issuer: 0, sendInt: true, tsRoot: true, tsInt: false, valid: 0, revoked: false, nameOk: true, kuOk: true, chkName: true, chkRev: true, chkKu: false };
    const ctl = S.el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    box.appendChild(ctl);
    const rowOf = (label, ...els) => S.el('div', { class: 'row' }, S.el('span', { class: 'w-label', style: 'min-width:110px' }, label), ...els);
    const sh = [S.el('span'), S.el('span')];
    ctl.appendChild(rowOf('對端憑證簽發者', sh[0]));
    ctl.appendChild(rowOf('有效期', sh[1]));
    const tgl = (k, label) => { const b = S.el('button', { class: 'btn sm' + (P[k] ? ' on' : ''), onclick: () => { P[k] = !P[k]; b.classList.toggle('on', P[k]); draw(); } }, label); return b; };
    ctl.appendChild(rowOf('對端', tgl('sendInt', '送出中繼憑證'), tgl('nameOk', '名稱符合'), tgl('kuOk', 'key usage 正確'), tgl('revoked', '已被撤銷')));
    ctl.appendChild(rowOf('本機 trust store', tgl('tsRoot', 'Corp Root CA'), tgl('tsInt', 'Corp Issuing CA')));
    ctl.appendChild(rowOf('profile 檢查', tgl('chkName', 'peer-name-check'), tgl('chkKu', 'key-usage-check'), tgl('chkRev', 'revocation-check')));
    const out = S.el('div', { style: 'margin-top:12px' });
    box.appendChild(out);

    S.seg(sh[0], ['Corp Issuing CA', '自簽', 'Other CA'], i => { P.issuer = i; draw(); }, 0);
    S.seg(sh[1], ['有效', '已過期', '尚未生效'], i => { P.valid = i; draw(); }, 0);
    function check() {
      const steps = [];
      const node = { leaf: 'n', int: 'n', root: 'n' };
      const fail = (t, n) => { steps.push(['r', t]); if (n) node[n] = 'r'; return { ok: false, steps, node }; };
      const pass = (t) => steps.push(['g', t]);
      if (P.issuer === 1) { node.int = node.root = 'x'; return fail('建立憑證鏈：對端憑證為自簽，簽發者就是自己，不在 trust store 中 → 不信任。', 'leaf'); }
      if (P.issuer === 2) { node.int = node.root = 'x'; return fail('建立憑證鏈：簽發者 Other CA 不在 trust store，也沒有對端提供的上層憑證 → 無法建立信任鏈。', 'leaf'); }
      const haveInt = P.sendInt || P.tsInt;
      if (!haveInt) return fail('建立憑證鏈：找不到 Corp Issuing CA 的憑證。對端沒有送出中繼憑證，trust store 也沒有 → 鏈斷在中繼層。', 'int');
      pass(`建立憑證鏈：leaf → Corp Issuing CA（${P.sendInt ? '對端送出' : '取自 trust store'}） → Corp Root CA`);
      node.int = 'g';
      if (!P.tsRoot) return fail('信任錨點：鏈的頂端 Corp Root CA 不在 trust store。只信任中繼 CA 時，多數 TLS 實作預設仍要求自簽根作為錨點。', 'root');
      node.root = 'g';
      pass('信任錨點：Corp Root CA 在 trust store 中');
      pass('簽章驗證：每一層憑證都由上一層的私鑰簽章');
      if (P.valid === 1) return fail('有效期：對端憑證已過期（notAfter 早於目前時間）。', 'leaf');
      if (P.valid === 2) return fail('有效期：對端憑證尚未生效（notBefore 晚於目前時間）。常見原因是本機時鐘錯誤，先確認 NTP。', 'leaf');
      pass('有效期：在 notBefore 與 notAfter 之間');
      if (P.chkKu) { if (!P.kuOk) return fail('key usage：憑證的 Extended Key Usage 不含所需用途（serverAuth / clientAuth）。', 'leaf'); pass('key usage：用途符合'); }
      else steps.push(['n', 'key usage：未啟用 key-usage-check，略過']);
      if (P.chkName) { if (!P.nameOk) return fail('名稱檢查：連線目標與憑證的 CN / SAN 不符。', 'leaf'); pass('名稱檢查：CN / SAN 符合連線目標'); }
      else steps.push([P.nameOk ? 'n' : 'y', `名稱檢查：未啟用 peer-name-check，略過${P.nameOk ? '' : '（名稱其實不符，仍會被接受）'}`]);
      if (P.chkRev) { if (P.revoked) return fail('撤銷檢查：CRL / OCSP 顯示此憑證已被撤銷。', 'leaf'); pass('撤銷檢查：CRL / OCSP 未列出此憑證'); }
      else steps.push([P.revoked ? 'y' : 'n', `撤銷檢查：未啟用 revocation-check，略過${P.revoked ? '（憑證其實已撤銷，仍會被接受）' : ''}`]);
      node.leaf = 'g';
      return { ok: true, steps, node };
    }
    function draw() {
      const r = check();
      const c = { g: 'var(--good)', r: 'var(--bad)', n: 'var(--border-strong)', x: 'var(--border)' };
      const box3 = (x, t, sub, st) => `<rect x="${x}" y="14" width="200" height="56" rx="7" fill="var(--panel)" stroke="${c[st]}" stroke-width="${st === 'g' || st === 'r' ? 2 : 1.2}" ${st === 'x' ? 'stroke-dasharray="4 4"' : ''}/><text x="${x + 100}" y="38" text-anchor="middle" font-size="13" font-weight="600" fill="${st === 'x' ? 'var(--faint)' : 'var(--text)'}">${t}</text><text x="${x + 100}" y="56" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--muted)">${sub}</text>`;
      const leafName = ['CN=radius.example.com', 'CN=radius（自簽）', 'CN=radius.example.com'][P.issuer];
      const intName = P.issuer === 0 ? 'Corp Issuing CA' : '—';
      const rootName = P.issuer === 0 ? 'Corp Root CA' : P.issuer === 2 ? 'Other CA' : '—';
      const svg = `<svg viewBox="0 0 720 84" style="width:100%;min-width:520px;display:block">
        ${box3(10, '對端憑證', leafName, r.node.leaf)}
        <line x1="210" y1="42" x2="258" y2="42" stroke="var(--border-strong)" stroke-width="1.4" marker-end="url(#pk-a)"/>
        ${box3(260, '中繼 CA', intName, r.node.int)}
        <line x1="460" y1="42" x2="508" y2="42" stroke="var(--border-strong)" stroke-width="1.4" marker-end="url(#pk-a)"/>
        ${box3(510, '根 CA', rootName, r.node.root)}
        <defs><marker id="pk-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker></defs></svg>`;
      out.innerHTML = `<div class="dg-canvas" style="border:1px solid var(--border);border-radius:6px;padding:6px 0">${svg}</div>
        <div class="row" style="margin:10px 0 8px"><span class="w-label">結果</span><span class="badge ${r.ok ? 'g' : 'r'}">${r.ok ? '信任，TLS 握手繼續' : '不信任，TLS 握手中止'}</span></div>
        <div class="log">${r.steps.map(([k, t]) => `<div><span class="badge ${k}">${k === 'g' ? '通過' : k === 'r' ? '失敗' : k === 'y' ? '注意' : '略過'}</span> ${t}</div>`).join('')}</div>`;
    }
    draw();
  },
  searchText: 'crypto ca-cert install crypto cert install crypto trust-store crypto security-profile peer-name-check revocation-check key-usage-check cdp-list ocsp-list self-signed certificate expiry CN SAN mTLS RESTAPI|certs GNMI|certs client_auth',
  related: ['aaa', 'mgmt-api', 'sys-services', 'mgmt-framework'],
  refs: [['RFC 5280 X.509 PKI Certificate and CRL Profile', 'https://www.rfc-editor.org/rfc/rfc5280'], ['RFC 6960 OCSP', 'https://www.rfc-editor.org/rfc/rfc6960'], ['sonic-gnmi', 'https://github.com/sonic-net/sonic-gnmi'], ['Enterprise SONiC User Guide UG460：§5.13.4.2、§5.14、§21.1、§22.2、§24.3', 'https://www.broadcom.com/products/ethernet-connectivity/software/enterprise-sonic']],
});
