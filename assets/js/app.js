/* SONiC 百科 — 路由、側邊欄、搜尋、首頁 */
(function () {
  const $ = sel => document.querySelector(sel);
  const LEARN_PATH = ['overview', 'architecture', 'redis-db', 'swss', 'syncd-sai', 'port', 'routing', 'cli-lab'];

  /* ---------- 主題 ---------- */
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const lbl = { auto: '自動', light: '淺色', dark: '深色' }[t];
    const ico = { auto: '🌓', light: '☀️', dark: '🌙' }[t];
    $('#themeBtn').innerHTML = `${ico} <span class="lbl">${lbl}</span>`;
  }
  let theme = S.store.get('theme', 'auto');
  applyTheme(theme);
  $('#themeBtn').addEventListener('click', () => {
    theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme];
    S.store.set('theme', theme);
    applyTheme(theme);
  });

  /* ---------- 閱讀進度 ---------- */
  const readSet = () => new Set(S.store.get('read', []));
  function setRead(id, v) {
    const s = readSet();
    v ? s.add(id) : s.delete(id);
    S.store.set('read', [...s]);
    renderSidebar();
  }

  /* ---------- 側邊欄 ---------- */
  function renderSidebar() {
    const nav = $('#nav');
    const cur = currentId();
    const read = readSet();
    const all = S.sortedTopics();
    nav.innerHTML = '';
    const pct = Math.round((all.filter(t => read.has(t.id)).length / all.length) * 100);
    nav.appendChild(S.el('div', { class: 'side-progress' },
      `學習進度 ${read.size > 0 ? all.filter(t => read.has(t.id)).length : 0} / ${all.length}（${pct}%）`,
      S.el('div', { class: 'bar' }, S.el('i', { style: `width:${pct}%` }))));
    nav.appendChild(S.el('div', { class: 'nav-group' },
      S.el('a', { class: 'nav-link' + (cur === '' ? ' active' : ''), href: '#/' }, S.el('span', { class: 'ico' }, '🏠'), '首頁')));
    S.categories.forEach(c => {
      const ts = all.filter(t => t.category === c.id);
      if (!ts.length) return;
      const g = S.el('div', { class: 'nav-group' }, S.el('h4', null, c.icon + ' ' + c.name));
      ts.forEach(t => g.appendChild(S.el('a', { class: 'nav-link' + (cur === t.id ? ' active' : ''), href: '#/' + t.id },
        S.el('span', { class: 'ico' }, t.icon), t.title, read.has(t.id) ? S.el('span', { class: 'done', title: '已讀' }, '✓') : null)));
      nav.appendChild(g);
    });
  }

  /* ---------- 搜尋 ---------- */
  const index = [];
  function buildIndex() {
    const tmp = document.createElement('div');
    S.topics.forEach(t => {
      tmp.innerHTML = t.html || '';
      const body = [t.title, t.en, t.summary, (t.tags || []).join(' '), tmp.textContent, (t.keypoints || []).join(' ')].join(' ').replace(/\s+/g, ' ');
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
      const snip = body.slice(Math.max(0, pos - 30), pos + 70);
      return { t, score, snip: (pos > 30 ? '…' : '') + snip + '…' };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function hlText(s, q) {
    let out = S.esc(s);
    q.trim().split(/\s+/).filter(Boolean).forEach(w => {
      out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
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
      ? rs.map(r => `<a href="#/${r.t.id}"><div class="sr-t">${r.t.icon} ${hlText(r.t.title, q)}</div><div class="sr-s">${hlText(r.snip, q)}</div></a>`).join('')
      : '<div class="empty">找不到相關主題，試試 VLAN、orchagent、BGP、SAI…</div>';
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
  function closeSearch() { sRes.classList.remove('open'); sInput.blur(); }
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) sRes.classList.remove('open'); });
  sRes.addEventListener('click', e => { if (e.target.closest('a')) { sInput.value = ''; sRes.classList.remove('open'); } });
  document.addEventListener('keydown', e => {
    if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); sInput.focus(); }
  });

  /* ---------- 行動版選單 ---------- */
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));

  /* ---------- 頁面 ---------- */
  function currentId() { return decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]); }

  function renderHome(main) {
    const all = S.sortedTopics();
    const read = readSet();
    const interactiveCount = all.length;
    main.innerHTML = `
      <div class="hero">
        <h1>SONiC 百科 📖</h1>
        <p>用<b>互動架構圖</b>、<b>逐步動畫</b>與<b>虛擬交換機終端機</b>，一步步搞懂 SONiC（Software for Open Networking in the Cloud）的系統架構：從 Redis 資料庫、SWSS、syncd/SAI，到 BGP、VLAN、LAG 與維運。</p>
        <div class="actions">
          <a class="btn primary" href="#/overview">🚀 從頭開始學</a>
          <a class="btn" href="#/cli-lab">💻 直接玩虛擬交換機</a>
          <a class="btn" href="#/architecture">🗺️ 看整體架構圖</a>
        </div>
      </div>
      <h2 class="sec-title">🧭 建議學習路線</h2>
      <div class="path" id="lp"></div>
      <p class="muted" style="font-size:14px">每個主題都有：可點擊的架構圖 🗺️、逐步資料流動畫 ▶、重點整理 ✓、小測驗 ❓。讀完按「標記為已讀」追蹤進度（進度只存在你的瀏覽器）。</p>
      <div id="cats"></div>
      <div class="footer">SONiC 百科是個人學習用的非官方整理，內容以 SONiC 社群公開文件與原始碼為基礎（約 202305 ~ 202411 版本行為），各版本細節可能不同；實際行為請以 <a href="https://github.com/sonic-net/SONiC/wiki" target="_blank" rel="noopener">sonic-net 官方 Wiki</a> 與原始碼為準。共 ${interactiveCount} 個主題。</div>`;
    const lp = main.querySelector('#lp');
    LEARN_PATH.forEach((id, i) => {
      const t = S.byId(id);
      if (!t) return;
      if (i) lp.appendChild(S.el('span', { class: 'arr' }, '→'));
      lp.appendChild(S.el('a', { href: '#/' + id, class: read.has(id) ? 'done' : '' }, `${i + 1}. ${t.icon} ${t.title}`));
    });
    const cats = main.querySelector('#cats');
    S.categories.forEach(c => {
      const ts = all.filter(t => t.category === c.id);
      if (!ts.length) return;
      cats.appendChild(S.el('h2', { class: 'sec-title' }, `${c.icon} ${c.name}`));
      const g = S.el('div', { class: 'grid c3' });
      ts.forEach(t => {
        g.appendChild(S.el('a', { class: 'card topic-card', href: '#/' + t.id },
          S.el('div', { class: 'tc-head' }, S.el('div', { class: 'tc-ico' }, t.icon),
            S.el('div', null, S.el('div', { class: 'tc-t' }, t.title), S.el('div', { class: 'tc-en' }, t.en || '')),
            read.has(t.id) ? S.el('span', { class: 'done-badge' }, '✓ 已讀') : null),
          S.el('div', { class: 'tc-s' }, t.summary),
          S.el('div', { class: 'tc-f' }, ...(t.features || []).map(f => S.el('span', { class: 'pill int' }, f)))));
      });
      cats.appendChild(g);
    });
    document.title = 'SONiC 百科 — 互動式 SONiC 架構學習網站';
  }

  function renderTopic(main, t) {
    const all = S.sortedTopics();
    const i = all.indexOf(t);
    const prev = all[i - 1], next = all[i + 1];
    const cat = S.categories.find(c => c.id === t.category);
    const read = readSet();
    main.innerHTML = '';
    const art = S.el('article', { class: 'article' });
    art.innerHTML = `
      <div class="crumb"><a href="#/">首頁</a><span>/</span><span>${cat.icon} ${cat.name}</span></div>
      <h1>${t.icon} ${S.esc(t.title)}<span class="en-title">${S.esc(t.en || '')}</span></h1>
      <div class="tag-row">${(t.tags || []).map(x => `<span class="tag">#${S.esc(x)}</span>`).join('')}</div>
      <p class="lead">${t.summary}</p>
      <div class="topic-body">${t.html || ''}</div>
      ${t.keypoints ? `<h2>重點整理</h2><ul class="keypoints">${t.keypoints.map(k => `<li>${k}</li>`).join('')}</ul>` : ''}
      ${t.quiz ? `<h2>小測驗</h2><div id="quiz"></div>` : ''}
      ${t.related ? `<h2>相關主題</h2><div class="related">${t.related.map(r => S.byId(r)).filter(Boolean).map(r => `<a href="#/${r.id}">${r.icon} ${S.esc(r.title)}</a>`).join('')}</div>` : ''}
      ${t.refs ? `<h2>延伸閱讀</h2><ul>${t.refs.map(r => `<li><a href="${r[1]}" target="_blank" rel="noopener">${S.esc(r[0])}</a></li>`).join('')}</ul>` : ''}
      <div class="mark-read"><button class="btn" id="readBtn"></button><span id="readHint"></span></div>
      <nav class="pager">
        ${prev ? `<a href="#/${prev.id}"><small>← 上一篇</small>${prev.icon} ${S.esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="#/${next.id}"><small>下一篇 →</small>${next.icon} ${S.esc(next.title)}</a>` : '<span></span>'}
      </nav>`;
    main.appendChild(art);
    const rb = art.querySelector('#readBtn');
    const upd = () => {
      const r = readSet().has(t.id);
      rb.innerHTML = r ? '✓ 已讀（點此取消）' : '📌 標記為已讀';
      rb.classList.toggle('on', r);
    };
    rb.addEventListener('click', () => { setRead(t.id, !readSet().has(t.id)); upd(); });
    upd();
    if (t.quiz) S.quiz(art.querySelector('#quiz'), t.quiz);
    try {
      if (t.mount) t.mount(art.querySelector('.topic-body'));
    } catch (e) {
      console.error(e);
      art.querySelector('.topic-body').insertAdjacentHTML('afterbegin', `<div class="callout warn">互動元件載入失敗：${S.esc(e.message)}</div>`);
    }
    document.title = `${t.title} — SONiC 百科`;
    void read;
  }

  function route() {
    const id = currentId();
    const main = $('#content');
    document.body.classList.remove('nav-open');
    if (!id) renderHome(main);
    else {
      const t = S.byId(id);
      if (t) renderTopic(main, t);
      else main.innerHTML = `<div class="article"><h1>找不到頁面 🤔</h1><p>沒有「${S.esc(id)}」這個主題。<a href="#/">回首頁</a></p></div>`;
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
