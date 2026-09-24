/* SONiC 百科 — 核心：主題註冊與共用小工具 */
window.S = (function () {
  const topics = [];

  const categories = [
    { id: 'intro', name: '入門', icon: '🚀' },
    { id: 'core', name: '核心元件', icon: '⚙️' },
    { id: 'net', name: '網路功能', icon: '🔀' },
    { id: 'ops', name: '平台與維運', icon: '🛠️' },
    { id: 'lab', name: '實驗室', icon: '🧪' },
    { id: 'ref', name: '參考', icon: '📚' },
  ];

  function register(t) {
    topics.push(t);
  }

  function sortedTopics() {
    const catIdx = Object.fromEntries(categories.map((c, i) => [c.id, i]));
    return topics.slice().sort((a, b) => (catIdx[a.category] - catIdx[b.category]) || (a.order - b.order));
  }

  function byId(id) {
    return topics.find(t => t.id === id);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 建立 DOM 元素：el('div', {class:'x', onclick:fn}, child1, 'text') */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (k === 'html') n.innerHTML = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(k) : k);
    }
    return n;
  }

  /* 本機儲存（失敗時靜默） */
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('sonicwiki:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('sonicwiki:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
  };

  return { topics, categories, register, sortedTopics, byId, esc, el, store };
})();
