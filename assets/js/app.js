/* SONiC Reference — 路由、導覽、目錄、搜尋、首頁 */
(function () {
  const $ = sel => document.querySelector(sel);
  const ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  };

  /* ---------- 主題 ---------- */
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const lbl = { auto: '跟隨系統', light: '淺色', dark: '深色' }[t];
    $('#themeBtn').innerHTML = ICON[t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon'];
    $('#themeBtn').title = '主題：' + lbl;
    $('#themeBtn').setAttribute('aria-label', '切換主題（目前：' + lbl + '）');
  }
  let theme = S.store.get('theme', 'auto');
  applyTheme(theme);
  $('#themeBtn').addEventListener('click', () => {
    theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme];
    S.store.set('theme', theme);
    applyTheme(theme);
  });

  /* ---------- 側邊欄 ---------- */
  function renderSidebar() {
    const nav = $('#nav');
    const cur = currentId();
    const all = S.sortedTopics();
    nav.innerHTML = '';
    nav.appendChild(S.el('div', { class: 'nav-group' },
      S.el('a', { class: 'nav-link' + (cur === '' ? ' active' : ''), href: '#/' }, S.el('span', { class: 'n' }, '—'), '總覽')));
    S.categories.forEach((c, ci) => {
      const ts = all.filter(t => t.category === c.id);
      if (!ts.length) return;
      const g = S.el('div', { class: 'nav-group' }, S.el('h4', null, S.el('span', { class: 'n' }, c.appendix ? 'App.' : String(ci + 1).padStart(2, '0')), c.name));
      ts.forEach(t => g.appendChild(S.el('a', { class: 'nav-link' + (cur === t.id ? ' active' : ''), href: '#/' + t.id },
        S.el('span', { class: 'n' }, S.num(t)), t.title)));
      nav.appendChild(g);
    });
  }

  /* ---------- 搜尋 ---------- */
  const index = [];
  function buildIndex() {
    const tmp = document.createElement('div');
    S.topics.forEach(t => {
      tmp.innerHTML = t.html || '';
      const meta = (t.meta || []).map(m => [].concat(m[1]).join(' ')).join(' ');
      const body = [t.title, t.en, t.summary, (t.tags || []).join(' '), meta, tmp.textContent, (t.keypoints || []).join(' '), t.searchText || ''].join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
      index.push({ t, body });
    });
  }
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return index.map(({ t, body }) => {
      const lb = body.toLowerCase();
      if (!words.every(w => lb.includes(w))) return null;
      let score = 0;
      words.forEach(w => {
        if (t.title.toLowerCase().includes(w)) score += 10;
        if ((t.en || '').toLowerCase().includes(w)) score += 6;
        if ((t.tags || []).some(x => x.toLowerCase().includes(w))) score += 5;
        score += Math.min(5, lb.split(w).length - 1);
      });
      const pos = lb.indexOf(words[0]);
      const snip = body.slice(Math.max(0, pos - 30), pos + 80);
      return { t, score, snip: (pos > 30 ? '…' : '') + snip + '…' };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function hlText(s, q) {
    let out = S.esc(s);
    q.trim().split(/\s+/).filter(Boolean).forEach(w => {
      out = out.replace(new RegExp(S.esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    });
    return out;
  }
  const sInput = $('#search'), sRes = $('#searchResults');
  let sel = -1;
  function renderSearch() {
    const q = sInput.value;
    const rs = search(q);
    sel = -1;
    if (!q.trim()) { sRes.classList.remove('open'); return; }
    sRes.innerHTML = rs.length
      ? rs.map(r => `<a href="#/${r.t.id}"><div class="sr-t"><span class="sr-n">${S.num(r.t)}</span>${hlText(r.t.title, q)}</div><div class="sr-s">${hlText(r.snip, q)}</div></a>`).join('')
      : '<div class="empty">沒有符合的章節。可以試試 VLAN、orchagent、PFC、sairedis.rec、ROUTE_TABLE。</div>';
    sRes.classList.add('open');
  }
  sInput.addEventListener('input', renderSearch);
  sInput.addEventListener('focus', renderSearch);
  sInput.addEventListener('keydown', e => {
    const links = [...sRes.querySelectorAll('a')];
    if (e.key === 'ArrowDown') { sel = Math.min(links.length - 1, sel + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { const l = links[sel >= 0 ? sel : 0]; if (l) { location.hash = l.getAttribute('href'); closeSearch(); } return; }
    else if (e.key === 'Escape') { closeSearch(); return; }
    links.forEach((l, i) => l.classList.toggle('active', i === sel));
  });
  function closeSearch() { sRes.classList.remove('open'); sInput.value = ''; sInput.blur(); }
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) sRes.classList.remove('open'); });
  sRes.addEventListener('click', e => { if (e.target.closest('a')) closeSearch(); });
  document.addEventListener('keydown', e => {
    if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); sInput.focus(); }
  });

  /* ---------- 行動版選單 ---------- */
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));

  /* ---------- 本頁目錄 ---------- */
  const toc = $('#toc');
  let spy = null;
  function buildToc(article) {
    const hs = [...article.querySelectorAll('h2')];
    toc.innerHTML = '';
    if (spy) { window.removeEventListener('scroll', spy); spy = null; }
    if (hs.length < 2) { toc.classList.remove('on'); return; }
    toc.appendChild(S.el('h5', null, '本頁內容'));
    const links = hs.map(h => {
      const a = S.el('a', { href: '#/' + currentId(), onclick: e => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      a.innerHTML = h.innerHTML;
      toc.appendChild(a);
      return a;
    });
    toc.classList.add('on');
    spy = () => {
      let idx = 0;
      hs.forEach((h, i) => { if (h.getBoundingClientRect().top < 120) idx = i; });
      links.forEach((l, i) => l.classList.toggle('active', i === idx));
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  /* ---------- 頁面 ---------- */
  function currentId() { return decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]); }

  const STACK = [
    ['管理介面', 'CLI (click) · gNMI · SNMP · REST', 'cli', 'config'],
    ['控制平面容器', 'bgp (FRR) · teamd · lldp · dhcp_relay · radv', 'container', 'containers'],
    ['狀態資料庫', 'Redis：CONFIG_DB · APPL_DB · STATE_DB · ASIC_DB · COUNTERS_DB', 'db', 'redis-db'],
    ['SWSS', 'orchagent · *mgrd · *syncd', 'proc', 'swss'],
    ['ASIC 同步', 'syncd · sairedis · 廠商 libsai', 'proc', 'syncd-sai'],
    ['Linux kernel', 'hostif netdev · Bridge · team · 路由與鄰居表', 'kernel', 'port'],
    ['交換晶片', 'ASIC pipeline · TCAM · 佇列與緩衝', 'hw', 'copp'],
  ];

  function renderHome(main) {
    const all = S.sortedTopics();
    main.innerHTML = `
      <div class="home-head">
        <div class="eyebrow">SONiC Architecture Reference</div>
        <h1>SONiC 架構參考</h1>
        <p>SONiC（Software for Open Networking in the Cloud）的系統架構、資料流與維運參考。內容涵蓋容器與服務、Redis 資料庫、SWSS、syncd 與 SAI、L2/L3 功能、QoS、VXLAN/EVPN、平台監控與故障排除。每一章都附有可操作的架構圖，並提供可執行 SONiC 指令的模擬環境。</p>
        <div class="row">
          <a class="btn primary" href="#/overview">從第 1 章開始</a>
          <a class="btn" href="#/architecture">系統架構總覽</a>
          <a class="btn" href="#/cli-lab">開啟實驗環境</a>
          <a class="btn" href="#/ref-configdb">CONFIG_DB 表格參考</a>
        </div>
      </div>
      <div class="stack-fig">
        <div class="eyebrow" style="margin-bottom:10px">系統分層（由上而下）· 點選前往對應章節</div>
        <div class="stack" id="stack"></div>
      </div>
      <div id="cats"></div>
      <div class="footer">本參考為非官方整理，內容依據 SONiC 社群公開設計文件與原始碼（約 202305–202411 分支）。各分支與平台實作細節可能不同，請以 <a href="https://github.com/sonic-net/SONiC/wiki" target="_blank" rel="noopener">sonic-net/SONiC</a> 文件與原始碼為準。共 ${all.length} 章。</div>`;
    const st = main.querySelector('#stack');
    STACK.forEach(([t, d, k, id]) => {
      const a = S.el('a', { href: '#/' + id, style: `border-left:3px solid var(--k-${k})` }, S.el('b', null, t), S.el('span', null, d));
      st.appendChild(a);
    });
    const cats = main.querySelector('#cats');
    S.categories.forEach((c, ci) => {
      const ts = all.filter(t => t.category === c.id);
      if (!ts.length) return;
      const sec = S.el('section', { class: 'index-sec' },
        S.el('h2', null, S.el('span', { class: 'n' }, c.appendix ? 'App.' : String(ci + 1).padStart(2, '0')), c.name, S.el('span', { style: 'font-weight:400;color:var(--faint);text-transform:none;letter-spacing:0' }, c.en)));
      const list = S.el('div', { class: 'index-list' });
      ts.forEach(t => list.appendChild(S.el('a', { href: '#/' + t.id },
        S.el('span', { class: 'n' }, S.num(t)),
        S.el('span', { class: 't' }, t.title, S.el('small', null, t.en || '')),
        S.el('span', { class: 's' }, t.summary))));
      sec.appendChild(list);
      cats.appendChild(sec);
    });
    toc.classList.remove('on');
    document.title = 'SONiC 架構參考';
  }

  function metaHtml(t) {
    if (!t.meta || !t.meta.length) return '';
    return `<dl class="meta">${t.meta.map(([k, v]) => `<dt>${S.esc(k)}</dt><dd>${Array.isArray(v) ? v.map(x => `<code>${S.esc(x)}</code>`).join(' ') : v}</dd>`).join('')}</dl>`;
  }

  function renderTopic(main, t) {
    const all = S.sortedTopics();
    const i = all.indexOf(t);
    const prev = all[i - 1], next = all[i + 1];
    const cat = S.categories.find(c => c.id === t.category);
    const n = S.num(t);
    main.innerHTML = '';
    const art = S.el('article', { class: 'article' });
    art.innerHTML = `
      <div class="eyebrow"><span class="n">${cat.appendix ? '附錄 ' + n : '第 ' + n + ' 章'}</span><span>·</span><a href="#/">${S.esc(cat.name)}</a></div>
      <h1>${S.esc(t.title)}</h1>
      <div class="en-title">${S.esc(t.en || '')}</div>
      <p class="lead">${t.summary}</p>
      ${metaHtml(t)}
      ${t.keypoints ? `<div class="summary"><h6>本章重點</h6><ul>${t.keypoints.map(k => `<li>${k}</li>`).join('')}</ul></div>` : ''}
      <div class="topic-body">${t.html || ''}</div>
      <div class="foot">
        ${t.related ? `<div><h6>相關章節</h6><div class="related">${t.related.map(r => S.byId(r)).filter(Boolean).map(r => `<a href="#/${r.id}"><span class="n">${S.num(r)}</span>${S.esc(r.title)}</a>`).join('')}</div></div>` : ''}
        ${t.refs ? `<div><h6>參考資料</h6><ul class="refs">${t.refs.map(r => `<li><a href="${r[1]}" target="_blank" rel="noopener">${S.esc(r[0])}</a></li>`).join('')}</ul></div>` : ''}
        <nav class="pager">
          ${prev ? `<a href="#/${prev.id}"><small>上一章</small>${S.num(prev)}　${S.esc(prev.title)}</a>` : ''}
          ${next ? `<a class="next" href="#/${next.id}"><small>下一章</small>${S.num(next)}　${S.esc(next.title)}</a>` : ''}
        </nav>
      </div>`;
    main.appendChild(art);
    // 表格包一層，讓窄螢幕可以水平捲動
    art.querySelectorAll('.topic-body table').forEach(tb => {
      if (tb.parentElement.classList.contains('tbl')) return;
      const w = S.el('div', { class: 'tbl' });
      tb.parentNode.insertBefore(w, tb); w.appendChild(tb);
    });
    try {
      if (t.mount) t.mount(art.querySelector('.topic-body'));
    } catch (e) {
      console.error(e);
      art.querySelector('.topic-body').insertAdjacentHTML('afterbegin', `<div class="callout warn"><div class="ct">載入錯誤</div>互動元件載入失敗：${S.esc(e.message)}</div>`);
    }
    // 小節編號
    art.querySelectorAll('.topic-body h2').forEach((h, k) => h.insertAdjacentHTML('afterbegin', `<span class="hn">${n}.${k + 1}</span>`));
    let fig = 0;
    art.querySelectorAll('.dg-title').forEach(d => d.insertAdjacentHTML('afterbegin', `<span class="fig">圖 ${n}-${++fig}</span>`));
    buildToc(art.querySelector('.topic-body'));
    document.title = `${n} ${t.title} — SONiC 架構參考`;
  }

  function route() {
    const id = currentId();
    const main = $('#content');
    document.body.classList.remove('nav-open');
    if (!id) renderHome(main);
    else {
      const t = S.byId(id);
      if (t) renderTopic(main, t);
      else { main.innerHTML = `<div class="article"><h1>找不到章節</h1><p>沒有「${S.esc(id)}」這個章節。<a href="#/">回到總覽</a></p></div>`; toc.classList.remove('on'); }
    }
    renderSidebar();
    window.scrollTo(0, 0);
    const active = document.querySelector('.nav-link.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  buildIndex();
  window.addEventListener('hashchange', route);
  route();
})();
