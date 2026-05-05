/* ═══════════════════════════════════════════════════════════════
   app.js — Main entry point: wires all modules, handles routing,
            search, theme, clock, nav, keyboard shortcuts.
   ═══════════════════════════════════════════════════════════════ */

import { State, RAW_BASE, REPO_OWNER, REPO_NAME, BRANCH, ARTICLES_PATH } from './state.js';
import { parseHash, navigate }                    from './router.js';
import { fetchIndex, fetchArticle, fetchLastEdited } from './data.js';
import {
  renderTokensFromBody, extractFrontmatter, parseFrontmatter,
  extractTitle, extractSummary, escapeHtml, escapeAttr,
  escapeRegex, slugToTitle, slugifyHeading, articleExists,
  buildToc, formatInUniverseDate
} from './renderer.js';
import {
  openEditor, openNewArticle, closeEditor,
  previewArticle, saveArticle,
  closeSaveInstructions, copyContentToClipboard,
  switchEditorTab, insertImageAtCursor,
  openImagePicker, closeImagePicker, filterImagePicker
} from './editor.js';
import {
  showCommons, filterCommons, copyCommonsRef,
  copyToClipboard, openUploadHelper, closeUploadHelper,
  getFeaturedImage
} from './gallery.js';
import { showGraph, exposeGraphGlobals } from './graph.js';

// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('marzenapedia-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const label = document.getElementById('theme-label');
  if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('marzenapedia-theme', next);
}

// ═══════════════════════════════════════════════════════════════
// CET CLOCK
// ═══════════════════════════════════════════════════════════════
function startCetClock() {
  const tick = () => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const el = document.getElementById('cet-time');
    if (el) el.textContent = time;
  };
  tick();
  const now = new Date();
  const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, msUntilNextMinute);
}

// ═══════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════
async function handleRoute() {
  const route = parseHash();
  State.view = route.view;
  State.slug = route.slug || null;

  const pageTabs = document.getElementById('page-tabs');
  pageTabs.style.display = route.view === 'article' ? 'flex' : 'none';

  const dd = document.getElementById('search-dropdown');
  if (dd) dd.classList.remove('visible');

  if (State.scrollObserver) { State.scrollObserver.disconnect(); State.scrollObserver = null; }

  if (route.view === 'home')         await showHome();
  else if (route.view === 'all')     await showAllArticles();
  else if (route.view === 'commons') await showCommons();
  else if (route.view === 'graph')   showGraph();
  else if (route.view === 'search')  await showSearchResults(route.query);
  else if (route.view === 'article') await showArticle(route.slug, route.section);
  // no editor case — editor.html handles itself
}

window.addEventListener('hashchange', handleRoute);

// ═══════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════
async function showHome() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading the Republic</div>';
  document.title = 'Marzenapedia — Main Page';
  document.getElementById('breadcrumb').innerHTML = '';

  const index = await fetchIndex();
  const articles = index.articles || [];

  if (articles.length === 0) {
    document.getElementById('main-content').innerHTML = `
      <div class="portal">${portalHero()}
        <div class="notice-box">No articles found yet.</div>
      </div>`;
    return;
  }

  const recent = [...articles]
    .sort((a, b) => new Date(b.last_edited || 0) - new Date(a.last_edited || 0))
    .slice(0, 6);

  const cardsHtml = recent.map(c => `
    <div class="article-card" onclick="navigate('article','${c.slug}')">
      <div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.summary || '')}</p>
      </div>
      <div class="meta">
        ${c.last_edited
          ? new Date(c.last_edited).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : ''}
        ${(c.tags || []).slice(0, 2).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>`).join('');

  const tagCounts = {};
  articles.forEach(a => (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Featured archive image
  const featuredImg = await getFeaturedImage();
  const featuredHtml = featuredImg ? `
    <div class="side-block featured-image-block">
      <h3>Archive Image</h3>
      <div class="featured-image-wrap" onclick="openLightbox('${escapeAttr(featuredImg.url || '')}','${escapeAttr(featuredImg.title || featuredImg.filename || '')}')">
        <img src="${escapeAttr(featuredImg.url || '')}" alt="${escapeAttr(featuredImg.title || '')}" loading="lazy" onerror="this.parentElement.style.display='none'">
        ${featuredImg.title ? `<div class="featured-image-caption">${escapeHtml(featuredImg.title)}</div>` : ''}
        ${featuredImg.description ? `<div class="featured-image-desc">${escapeHtml(featuredImg.description)}</div>` : ''}
      </div>
    </div>` : '';

  document.getElementById('main-content').innerHTML = `
    <div class="portal">
      ${portalHero()}
      <div class="portal-grid">
        <div class="portal-main">
          <h2>Recently Updated</h2>
          ${cardsHtml}
          <div class="article-card" onclick="navigate('all')" style="border-style:dashed;background:transparent;">
            <div><h3 style="color:var(--muted);">Browse all ${articles.length} articles →</h3></div>
          </div>
        </div>
        <aside class="portal-side">
          <div class="side-block">
            <h3>The Republic</h3>
            <p style="font-style:italic;">A semi-presidential republic of the North African seaboard, founded 2 May 1952. Capital: Lévane. Population: ~41 million.</p>
          </div>
          ${featuredHtml}
          ${topTags.length ? `<div class="side-block">
            <h3>Topics</h3>
            <ul>${topTags.map(([t, n]) => `<li><a onclick="navigate('search','${escapeAttr(t)}')" style="cursor:pointer;">${escapeHtml(t)} <span style="color:var(--muted-soft);font-size:12px;">·&nbsp;${n}</span></a></li>`).join('')}</ul>
          </div>` : ''}
          <div class="side-block">
            <h3>Bureau of Records</h3>
            <p>Marzenapedia is maintained by the Bureau of Records, Lévane.</p>
            <p style="margin-top:8px;font-size:12px;color:var(--muted-soft);">Last index rebuild: ${index.generated_at ? new Date(index.generated_at).toLocaleString('en-GB', { timeZone: 'Europe/Paris' }) + ' CET' : 'unknown'}</p>
          </div>
        </aside>
      </div>
    </div>`;
}

function portalHero() {
  return `
    <div class="portal-hero">
      <div class="portal-hero-inner">
        <h1>Marzenapedia</h1>
        <div class="founding">
          A nation of its own civilisation, heir to no single tradition.<br>
          What follows is the Republic's record of itself —<br>
          its institutions, its history, its conflicts and its silences.
        </div>
        <div class="attribution">— Bureau of Records, Lévane · Founded 2 May 1952</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// ALL ARTICLES
// ═══════════════════════════════════════════════════════════════
async function showAllArticles() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading article index</div>';
  document.title = 'All Articles — Marzenapedia';
  document.getElementById('breadcrumb').innerHTML = '';

  const index = await fetchIndex();
  const articles = [...(index.articles || [])].sort((a, b) => a.title.localeCompare(b.title));

  const groups = {};
  articles.forEach(a => {
    const letter = (a.title[0] || '#').toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    (groups[key] = groups[key] || []).push(a);
  });
  const letters = Object.keys(groups).sort();

  const groupsHtml = letters.map(letter => `
    <h3 style="font-family:'Crimson Pro',serif;font-size:24px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:4px;margin:24px 0 12px;font-weight:700;">${letter}</h3>
    ${groups[letter].map(a => `
      <div class="search-result-item" onclick="navigate('article','${a.slug}')">
        <h3>${escapeHtml(a.title)}</h3>
        <p>${escapeHtml(a.summary || '')}</p>
      </div>`).join('')}`).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="search-results">
      <h2>All Articles · ${articles.length}</h2>
      ${groupsHtml || '<div class="notice-box">No articles yet.</div>'}
      <div class="article-card" onclick="openNewArticle()" style="border-style:dashed;margin-top:28px;background:transparent;">
        <div><h3 style="color:var(--muted);">+ New Article</h3></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// EditorPage
// ═══════════════════════════════════════════════════════════════
async function showEditorPage(slug) {
  document.getElementById('page-tabs').style.display = 'none';
  document.getElementById('breadcrumb').innerHTML = '';
  if (slug) {
    State.slug = slug;
    await openEditor();
  } else {
    await openNewArticle();
  }
}
// ═══════════════════════════════════════════════════════════════
// SEARCH RESULTS
// ═══════════════════════════════════════════════════════════════
async function showSearchResults(q) {
  if (!q) { navigate('home'); return; }
  document.getElementById('main-content').innerHTML = '<div class="loading">Searching the archive</div>';
  document.title = `Search: ${q} — Marzenapedia`;
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="navigate('home')">Main Page</a><span class="sep">·</span>Search: <em>${escapeHtml(q)}</em>`;

  const index = await fetchIndex();
  const articles = index.articles || [];
  const ql = q.toLowerCase();

  const indexHits = articles.filter(a =>
    a.title.toLowerCase().includes(ql) ||
    (a.summary || '').toLowerCase().includes(ql) ||
    (a.tags || []).some(t => t.toLowerCase().includes(ql))
  );

  const matched = new Set(indexHits.map(a => a.slug));
  const fullTextResults = await Promise.all(
    articles.filter(a => !matched.has(a.slug)).slice(0, 50).map(async a => {
      try {
        const md = await fetchArticle(a.slug);
        const lower = md.toLowerCase();
        if (lower.includes(ql)) {
          const idx = lower.indexOf(ql);
          const snippet = md.slice(Math.max(0, idx - 70), idx + 130).replace(/\n/g, ' ');
          return { ...a, snippet };
        }
        return null;
      } catch { return null; }
    })
  );

  const allResults = [
    ...indexHits.map(a => ({ ...a, snippet: a.summary })),
    ...fullTextResults.filter(Boolean)
  ];

  if (allResults.length === 0) {
    document.getElementById('main-content').innerHTML = `
      <div class="search-results">
        <h2>No results for "${escapeHtml(q)}"</h2>
        <p style="color:var(--muted);font-family:'Crimson Pro',serif;font-style:italic;">
          No articles matched. <a onclick="openNewArticle()" style="color:var(--link);cursor:pointer;">Create a new article →</a>
        </p>
      </div>`;
    return;
  }

  const re = new RegExp(escapeRegex(q), 'gi');
  const rows = allResults.map(r => `
    <div class="search-result-item" onclick="navigate('article','${r.slug}')">
      <h3>${r.title.replace(re, m => `<mark>${m}</mark>`)}</h3>
      <p>…${(r.snippet || '').replace(re, m => `<mark>${m}</mark>`)}…</p>
    </div>`).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="search-results">
      <h2>Search results for "${escapeHtml(q)}" · ${allResults.length}</h2>
      ${rows}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// ARTICLE
// ═══════════════════════════════════════════════════════════════
async function showArticle(slug, sectionAnchor) {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading article</div>';
  document.title = `${slugToTitle(slug)} — Marzenapedia`;

  await fetchIndex();

  let md;
  try {
    md = await fetchArticle(slug);
  } catch {
    renderArticleNotFound(slug);
    return;
  }

  const fm = parseFrontmatter(md);
  const title = extractTitle(md) || slugToTitle(slug);
  document.title = `${title} — Marzenapedia`;

  const bodyAfterFm = extractFrontmatter(md).body;
  const bodyForRender = bodyAfterFm.replace(/^# .+(\r?\n|$)/m, '');
  const bodyHtml = renderTokensFromBody(bodyForRender);
  const tocHtml  = buildToc(bodyHtml, slug);

  const lastEdited = await fetchLastEdited(slug);
  const editedStr = lastEdited
    ? new Date(lastEdited).toLocaleDateString('en-GB', {
        timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric'
      })
    : null;

  const metaParts = [];
  if (fm.date)   metaParts.push(`<span class="meta-item">${formatInUniverseDate(fm.date)}</span>`);
  if (editedStr) metaParts.push(`<span class="meta-item">Last revised ${editedStr}</span>`);
  if (fm.tags && fm.tags.length)
    metaParts.push(`<span class="meta-item">${fm.tags.map(t => escapeHtml(t)).join(' · ')}</span>`);
  const metaHtml = metaParts.length ? `<div class="article-meta">${metaParts.join('')}</div>` : '';

  let sourcesHtml = '';
  if (fm.sources && fm.sources.length) {
    sourcesHtml = `<div class="sources-block">
      <strong class="sources-label">Cited Sources</strong>
      <ul>${fm.sources.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>`;
  }

  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="navigate('home')">Main Page</a><span class="sep">·</span><a onclick="navigate('all')">All Articles</a><span class="sep">·</span>${escapeHtml(title)}`;

  document.getElementById('main-content').innerHTML = `
    <div class="layout">
      ${tocHtml}
      <article class="article clearfix">
        <div class="article-title">${escapeHtml(title)}</div>
        ${metaHtml}
        ${bodyHtml}
        ${sourcesHtml}
        <div class="article-footer">
          Marzenapedia &nbsp;·&nbsp; Bureau of Records, Lévane &nbsp;·&nbsp; Fictional sovereign state
        </div>
      </article>
    </div>`;

  setupScrollSpy();

  if (sectionAnchor) {
    const target = document.getElementById(sectionAnchor);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 100);
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function renderArticleNotFound(slug) {
  document.getElementById('main-content').innerHTML = `
    <div class="error-msg">
      <h2>Article Not Found</h2>
      <p>The article "<strong>${escapeHtml(slug)}</strong>" does not exist yet in Marzenapedia.</p>
      <p style="margin-top:14px;">
        <a onclick="openNewArticle('${slug}')" style="color:var(--link);cursor:pointer;text-decoration:underline;">Create this article →</a>
      </p>
      <p style="margin-top:8px;">
        <a onclick="navigate('home')" style="color:var(--muted);cursor:pointer;">← Return to the Main Page</a>
      </p>
    </div>`;
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="navigate('home')">Main Page</a><span class="sep">·</span>Not found`;
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.article h2[id]');
  const links    = document.querySelectorAll('.toc-sidebar a[data-toc-target]');
  if (!sections.length || !links.length) return;
  const linkMap = {};
  links.forEach(l => { linkMap[l.dataset.tocTarget] = l; });
  State.scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const link = linkMap[entry.target.id];
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active-toc'));
        link.classList.add('active-toc');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(s => State.scrollObserver.observe(s));
}

// ═══════════════════════════════════════════════════════════════
// SEARCH DROPDOWN
// ═══════════════════════════════════════════════════════════════
function onSearchInput() {
  const q  = document.getElementById('search-input').value.trim();
  const dd = document.getElementById('search-dropdown');
  clearTimeout(State.searchDebounceTimer);
  if (!q) { dd.classList.remove('visible'); return; }
  State.searchDebounceTimer = setTimeout(() => runInstantSearch(q), 120);
}

function runInstantSearch(q) {
  if (!State.index) return;
  const ql = q.toLowerCase();
  const dd = document.getElementById('search-dropdown');
  const articles = State.index.articles || [];

  const hits = articles.filter(a =>
    a.title.toLowerCase().includes(ql) ||
    (a.summary || '').toLowerCase().includes(ql) ||
    (a.tags || []).some(t => t.toLowerCase().includes(ql))
  ).slice(0, 8);

  if (hits.length === 0) {
    dd.innerHTML = `<div class="no-results">No quick matches — press Enter for full-text search.</div>`;
    dd.classList.add('visible');
    return;
  }

  State.searchActiveResult = -1;
  dd.innerHTML = hits.map((h, i) => `
    <div class="result" data-slug="${h.slug}" data-index="${i}"
      onclick="navigate('article','${h.slug}');document.getElementById('search-dropdown').classList.remove('visible');document.getElementById('search-input').value='';">
      <div class="result-title">${escapeHtml(h.title)}</div>
      <div class="result-snippet">${escapeHtml(h.summary || '')}</div>
    </div>`).join('');
  dd.classList.add('visible');
}

function onSearchKeydown(e) {
  const dd      = document.getElementById('search-dropdown');
  const results = dd.querySelectorAll('.result');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    State.searchActiveResult = Math.min(State.searchActiveResult + 1, results.length - 1);
    updateActiveResult(results);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    State.searchActiveResult = Math.max(State.searchActiveResult - 1, -1);
    updateActiveResult(results);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (State.searchActiveResult >= 0 && results[State.searchActiveResult]) {
      navigate('article', results[State.searchActiveResult].dataset.slug);
      dd.classList.remove('visible');
      e.target.value = '';
    } else {
      doSearch();
    }
  } else if (e.key === 'Escape') {
    dd.classList.remove('visible');
    e.target.blur();
  }
}

function updateActiveResult(results) {
  results.forEach((r, i) => r.classList.toggle('active', i === State.searchActiveResult));
  if (State.searchActiveResult >= 0) results[State.searchActiveResult].scrollIntoView({ block: 'nearest' });
}

function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  document.getElementById('search-dropdown').classList.remove('visible');
  navigate('search', q);
}

// ═══════════════════════════════════════════════════════════════
// LIGHTBOX
// ═══════════════════════════════════════════════════════════════
function openLightbox(src, caption) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  img.src = src;
  if (caption) { cap.innerHTML = caption; cap.style.display = 'block'; }
  else { cap.style.display = 'none'; }
  lb.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('visible');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════
async function buildNav() {
  const index    = await fetchIndex();
  const articles = index.articles || [];
  const nav      = document.getElementById('main-nav');

  const backbone = articles.filter(a => (a.tags || []).some(t => /backbone|foundational/i.test(t)));
  const featured = (backbone.length >= 2 ? backbone : articles).slice(0, 3);

  nav.innerHTML = featured.map(a =>
    `<a onclick="navigate('article','${a.slug}')">${escapeHtml(a.title.split(' ').slice(0, 2).join(' '))}</a>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════
function showHelp() {
  document.getElementById('help-overlay').classList.add('visible');
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  if (e.key === 'Escape') {
    closeLightbox();
    const saveOverlay = document.getElementById('save-instructions-overlay');
    if (saveOverlay?.classList.contains('visible')) {
      closeSaveInstructions();
    } else {
      closeEditor();
    }
    document.getElementById('help-overlay')?.classList.remove('visible');
    document.getElementById('graph-export-overlay')?.classList.remove('visible');
    document.getElementById('upload-helper-overlay')?.classList.remove('visible');
    document.getElementById('editor-image-picker')?.classList.remove('visible');
  }
});

// ═══════════════════════════════════════════════════════════════
// EXPOSE GLOBALS (inline handlers in HTML)
// ═══════════════════════════════════════════════════════════════
function exposeGlobals() {
  // Navigation
  window.navigate    = navigate;
  window.toggleTheme = toggleTheme;

  // Editor — navigate to editor.html instead of opening overlay
  window.openEditor = () => {
    window.location.href = `editor.html?slug=${encodeURIComponent(State.slug || '')}`;
  };
  window.openNewArticle = (slug) => {
    window.location.href = `editor.html?slug=${encodeURIComponent(slug || '')}`;
  };

  // Search
  window.onSearchInput   = onSearchInput;
  window.onSearchKeydown = onSearchKeydown;
  window.doSearch        = doSearch;

  // These are still needed for save instructions if somehow triggered from main page,
  // but primarily live in editor-page.js now:
  window.closeEditor             = () => window.history.back();
  window.previewArticle          = () => {};
  window.saveArticle             = () => {};
  window.closeSaveInstructions   = () => {};
  window.copyContentToClipboard  = () => {};
  window.switchEditorTab         = () => {};
  window.openImagePicker         = () => {};
  window.closeImagePicker        = () => {};
  window.filterImagePicker       = () => {};
  window.__insertImage           = () => {};

  // Lightbox
  window.openLightbox   = openLightbox;
  window.closeLightbox  = closeLightbox;
  window.__openLightbox = openLightbox;

  // Commons / gallery
  window.__filterCommons     = filterCommons;
  window.__copyCommonsRef    = copyCommonsRef;
  window.__copyToClipboard   = copyToClipboard;
  window.__openUploadHelper  = openUploadHelper;
  window.__closeUploadHelper = closeUploadHelper;

  // Help
  window.showHelp    = showHelp;
  window.__navigate  = navigate;

  // Graph
  exposeGraphGlobals();
}
// ═══════════════════════════════════════════════════════════════
// PARTIALS
// ═══════════════════════════════════════════════════════════════
async function loadPartials() {
  const [chrome, footer, modals] = await Promise.all([
    fetch('partials/chrome.html').then(r => r.text()),
    fetch('partials/footer.html').then(r => r.text()),
    fetch('partials/modals.html').then(r => r.text()),
  ]);
  document.getElementById('chrome-mount').innerHTML = chrome;
  document.getElementById('footer-mount').innerHTML = footer;
  document.getElementById('modals-mount').innerHTML = modals;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init() {
  exposeGlobals();
  initTheme();
  await loadPartials();       // ← must come before anything that touches the DOM
  startCetClock();
  await fetchIndex();
  await buildNav();
  await handleRoute();
})();
