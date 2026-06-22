/* ═══════════════════════════════════════════════════════════════
   app.js — Main entry point: routing, search, theme, clock, nav.
   ═══════════════════════════════════════════════════════════════ */

import { State, RAW_BASE, REPO_OWNER, REPO_NAME, BRANCH, ARTICLES_PATH, SiteConfig } from './state.js';
import { parseHash, navigate }                    from './router.js';
import { fetchIndex, fetchArticle, fetchLastEdited } from './data.js';
import {
  renderTokensFromBody, extractFrontmatter, parseFrontmatter,
  extractTitle, extractSummary, escapeHtml, escapeAttr,
  escapeRegex, slugToTitle, slugifyHeading, articleExists,
  buildToc, formatInUniverseDate, dtSort, dtFilter
} from './renderer.js';
import {
  showCommons, filterCommons, copyCommonsRef,
  copyToClipboard, openUploadHelper, closeUploadHelper,
  getFeaturedImage
} from './gallery.js';

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
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('marzenapedia-theme', next);
}

// ═══════════════════════════════════════════════════════════════
// CLOCK
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
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, ms);
}

// ═══════════════════════════════════════════════════════════════
// ROUTING
// ═══════════════════════════════════════════════════════════════
async function handleRoute() {
  const route = parseHash();
  const prevView = State.view;
  const prevSlug = State.slug;
  State.view = route.view;
  State.slug = route.slug || null;

  // Same article, different section anchor → just scroll, don't re-render.
  if (route.view === 'article' && prevView === 'article' &&
      prevSlug === route.slug && document.querySelector('.article')) {
    if (route.section) {
      const target = document.getElementById(route.section);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  const pageTabs = document.getElementById('page-tabs');
  if (pageTabs) pageTabs.style.display = route.view === 'article' ? 'flex' : 'none';

  const dd = document.getElementById('search-dropdown');
  if (dd) dd.classList.remove('visible');

  if (State.scrollObserver) { State.scrollObserver.disconnect(); State.scrollObserver = null; }

  if (route.view === 'home')         await showHome();
  else if (route.view === 'all')     await showAllArticles();
  else if (route.view === 'commons') await showCommons();
  else if (route.view === 'tools')   showTools();
  else if (route.view === 'help')    showHelpPage();
  else if (route.view === 'search')  await showSearchResults(route.query);
  else if (route.view === 'article') await showArticle(route.slug, route.section);
}

window.addEventListener('hashchange', handleRoute);

// ═══════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════
async function showHome() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading the Republic</div>';
  document.title = `${SiteConfig.siteName} — Main Page`;
  document.getElementById('breadcrumb').innerHTML = '';

  const index = await fetchIndex();
  const articles = index.articles || [];

  if (articles.length === 0) {
    document.getElementById('main-content').innerHTML = `
      <div class="portal">${portalHero()}
        <div class="notice-box">No articles found yet. <a onclick="window.openNewArticle()" style="cursor:pointer;color:var(--link);">Create the first article →</a></div>
      </div>`;
    return;
  }

  // Shared article-card markup
  const cardOf = c => `
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
    </div>`;

  // ── Recently Updated — 3 most recent ──
  const recent = [...articles]
    .sort((a, b) => new Date(b.last_edited || 0) - new Date(a.last_edited || 0))
    .slice(0, 3);
  const recentSlugs = new Set(recent.map(a => a.slug));
  const cardsHtml = recent.map(cardOf).join('');

  // ── From the Archive — cycle through the rest, a page at a time ──
  const SHOWCASE_COUNT = 6;
  const pool = [...articles]
    .filter(a => !recentSlugs.has(a.slug))
    .sort((a, b) => a.title.localeCompare(b.title));
  let archive = [];
  if (pool.length > 0) {
    const count = Math.min(SHOWCASE_COUNT, pool.length);
    const offKey = 'marzenapedia-home-offset';
    let offset = parseInt(localStorage.getItem(offKey) || '0', 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    offset = offset % pool.length;
    for (let i = 0; i < count; i++) archive.push(pool[(offset + i) % pool.length]);
    localStorage.setItem(offKey, String((offset + count) % pool.length)); // remember position
  }
  const archiveHtml = archive.map(cardOf).join('');

  const tagCounts = {};
  articles.forEach(a => (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const dykItems = SiteConfig.didYouKnow || [];
  const dykHtml = dykItems.length ? `
    <div class="side-block">
      <h3>Did You Know…</h3>
      <ul>${dykItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>` : '';

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
          ${archive.length ? `<h2 style="margin-top:28px;">From the Archive</h2>${archiveHtml}` : ''}
          <div class="article-card" onclick="navigate('all')" style="border-style:dashed;background:transparent;">
            <div><h3 style="color:var(--muted);">Browse all ${articles.length} articles →</h3></div>
          </div>
        </div>
        <aside class="portal-side">
          <div class="side-block">
            <h3>Welcome</h3>
            <p style="font-style:italic;">${escapeHtml(SiteConfig.nation.summary)}</p>
          </div>
          ${dykHtml}
          ${featuredHtml}
          ${topTags.length ? `<div class="side-block">
            <h3>Topics</h3>
            <ul>${topTags.map(([t, n]) => `<li><a onclick="navigate('search','${escapeAttr(t)}')" style="cursor:pointer;">${escapeHtml(t)} <span style="color:var(--muted-soft);font-size:12px;">·&nbsp;${n}</span></a></li>`).join('')}</ul>
          </div>` : ''}
          <div class="side-block">
            <h3>Tools</h3>
            <ul>
              <li><a onclick="navigate('graph')" style="cursor:pointer;">Graph Tool</a></li>
              <li><a onclick="navigate('stats')" style="cursor:pointer;">Stats &amp; Charts</a></li>
              <li><a onclick="window.openNewArticle()" style="cursor:pointer;">New Article</a></li>
            </ul>
          </div>
          <div class="side-block">
            <h3>Bureau of Records</h3>
            <p>${escapeHtml(SiteConfig.siteName)} is maintained by the Bureau of Records, ${escapeHtml(SiteConfig.nation.capital)}.</p>
            <p style="margin-top:8px;font-size:12px;color:var(--muted-soft);">Last index rebuild: ${index.generated_at ? new Date(index.generated_at).toLocaleString('en-GB', { timeZone: 'Europe/Paris' }) + ' CET' : 'unknown'}</p>
          </div>
        </aside>
      </div>
    </div>`;

   function portalHero() {
  return `
    <div class="portal-hero">
      <div class="portal-hero-inner">
        <h1>${escapeHtml(SiteConfig.siteName)}</h1>
        <div class="founding">
          ${SiteConfig.heroMotto.map(line => escapeHtml(line)).join('<br>')}
        </div>
        <div class="attribution">${escapeHtml(SiteConfig.heroAttribution)}</div>
      </div>
    </div>`;
}
   
}



// ═══════════════════════════════════════════════════════════════
// ALL ARTICLES
// ═══════════════════════════════════════════════════════════════
async function showAllArticles() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading article index</div>';
  document.title = `All Articles — ${SiteConfig.siteName}`;
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
      <div class="article-card" onclick="window.openNewArticle()" style="border-style:dashed;margin-top:28px;background:transparent;">
        <div><h3 style="color:var(--muted);">+ New Article</h3></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// TOOLS INDEX
// ═══════════════════════════════════════════════════════════════
function showTools() {
  document.title = `Tools — ${SiteConfig.siteName}`;
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="navigate('home')">Main Page</a><span class="sep">·</span>Tools`;
  document.getElementById('main-content').innerHTML = `
    <div class="portal">
      <h2 style="font-family:'Playfair Display',serif;font-size:30px;color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:8px;margin-bottom:24px;">Tools</h2>
      <div class="tools-grid">
        <div class="tool-card" onclick="navigate('editor')">
          <div class="tool-icon">✎</div>
          <h3>Article Editor</h3>
          <p>Write and edit articles in a split-pane Markdown editor with live preview, auto-save drafts, and one-click block insertion.</p>
        </div>
        <div class="tool-card" onclick="navigate('graph')">
          <div class="tool-icon">⌬</div>
          <h3>Graph Tool</h3>
          <p>Build org charts, system diagrams and relationship graphs. Areas with nesting, weighted edges, curved or orthogonal routing. Export as SVG, PNG, or Markdown.</p>
        </div>
        <div class="tool-card" onclick="navigate('stats')">
          <div class="tool-icon">▥</div>
          <h3>Stats &amp; Charts</h3>
          <p>Author bar, line, pie and stacked charts from a spreadsheet or pasted CSV. Live preview, exportable as PNG, JPG, SVG or <code>:::chart</code> Markdown.</p>
        </div>
        <div class="tool-card" onclick="navigate('commons')">
          <div class="tool-icon">▦</div>
          <h3>Marzena Commons</h3>
          <p>Browse the Republic's image archive — search by filename or description, see dimensions and file size, copy filenames for use in articles.</p>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SEARCH RESULTS
// ═══════════════════════════════════════════════════════════════
async function showSearchResults(q) {
  if (!q) { navigate('home'); return; }
  document.getElementById('main-content').innerHTML = '<div class="loading">Searching the archive</div>';
  document.title = `Search: ${q} — ${SiteConfig.siteName}`;
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
          No articles matched. <a onclick="window.openNewArticle()" style="color:var(--link);cursor:pointer;">Create a new article →</a>
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
  document.title = `${slugToTitle(slug)} — ${SiteConfig.siteName}`;

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
  document.title = `${title} — ${SiteConfig.siteName}`;

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

  // Cite this article block
  const citeHtml = buildCitationBlock(title, slug, lastEdited);

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
        ${citeHtml}
        <div class="article-footer">
          ${escapeHtml(SiteConfig.siteName)} &nbsp;·&nbsp; Bureau of Records, ${escapeHtml(SiteConfig.nation.capital)} &nbsp;·&nbsp; ${escapeHtml(SiteConfig.tagline)}
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

function buildCitationBlock(title, slug, lastEdited) {
  const url = `${window.location.origin}${window.location.pathname}#/article/${slug}`;
  const date = lastEdited ? new Date(lastEdited) : new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const apa = SiteConfig.citation.template
    .replace('{contributors}', SiteConfig.citation.contributors)
    .replace('{year}',  date.getFullYear())
    .replace('{monthName}', months[date.getMonth()])
    .replace('{day}',   date.getDate())
    .replace('{title}', title)
    .replace('{siteName}', SiteConfig.siteName)
    .replace('{url}',   url);
  return `<div class="cite-block" id="cite-block">
    <div class="cite-header">
      <strong>Cite this article</strong>
      <button class="btn" onclick="window.__copyCitation()" id="cite-copy-btn">Copy citation</button>
    </div>
    <div class="cite-text" id="cite-text">${escapeHtml(apa)}</div>
  </div>`;
}

function copyCitation() {
  const text = document.getElementById('cite-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('cite-copy-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Copy citation', 2000); }
  }).catch(() => alert(text));
}

function renderArticleNotFound(slug) {
  document.getElementById('main-content').innerHTML = `
    <div class="error-msg">
      <h2>Article Not Found</h2>
      <p>The article "<strong>${escapeHtml(slug)}</strong>" does not exist yet in ${escapeHtml(SiteConfig.siteName)}.</p>
      <p style="margin-top:14px;">
        <a onclick="window.openNewArticle('${slug}')" style="color:var(--link);cursor:pointer;text-decoration:underline;">Create this article →</a>
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
  if (!nav) return;

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
  document.getElementById('help-overlay')?.classList.add('visible');
}

function showHelpPage() {
  document.title = `Help — ${SiteConfig.siteName}`;
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="navigate('home')">Main Page</a><span class="sep">·</span>Help`;
  document.getElementById('main-content').innerHTML = helpContentHtml();
}

function helpContentHtml() {
  return `<div class="search-results">
    <h2>How to Edit ${escapeHtml(SiteConfig.siteName)}</h2>
    <div class="help-page-content">
      <h3>Writing articles</h3>
      <p>Articles live in <code>articles/</code> as <code>.md</code> files. Open the <strong>Editor</strong> tool from the top bar (or click <em>Edit</em> on any article). The editor has a split <strong>Write | Preview</strong> mode and auto-saves a local <strong>draft</strong> to your browser as you type — if you close the tab and come back, you'll be offered to restore it.</p>
      <p>When you click <strong>Save to GitHub</strong> the editor opens GitHub and copies the content to your clipboard. Paste, commit, and the index rebuilds automatically within ~30 seconds.</p>

      <h3>Markdown reference</h3>
      <table class="help-table">
        <tr><td><code># Title</code></td><td>Article H1 (the title)</td></tr>
        <tr><td><code>## Section</code></td><td>Section heading (appears in TOC)</td></tr>
        <tr><td><code>### Subsection</code></td><td>Subsection heading</td></tr>
        <tr><td><code>**bold** *italic*</code></td><td>Inline emphasis</td></tr>
        <tr><td><code>[[Article Name]]</code></td><td>Wiki link to another article</td></tr>
        <tr><td><code>[[slug|display]]</code></td><td>Wiki link with custom display text</td></tr>
        <tr><td><code>[label](url)</code></td><td>External link</td></tr>
        <tr><td><code>![alt](filename.jpg)</code></td><td>Inline image from <code>/images/</code></td></tr>
        <tr><td><code>&gt; Quote text</code></td><td>Block quote</td></tr>
        <tr><td><code>- list item</code></td><td>Bullet list</td></tr>
        <tr><td><code>1. ordered item</code></td><td>Numbered list</td></tr>
      </table>

      <h3>Block syntax</h3>
      <p>Marzenapedia adds custom <code>:::block:::</code> syntax for richer content. Use the formatting toolbar in the editor to insert templates with one click.</p>

      <h4>Frontmatter — article metadata</h4>
      <pre class="help-pre">:::frontmatter
tags: government, founding
date: 1952-05-02
sources: National Archive Doc 44-B; Bureau Bulletin 12
:::</pre>

      <h4>Infobox — sidebar info card</h4>
      <pre class="help-pre">:::infobox
title: Republic of Marzena
image: FlagMZ.jpg
caption: Flag of the Republic
Capital: Lévane
Population: 41,000,000
:::</pre>
      <p>The Frontmatter tab in the editor includes a <strong>structured Infobox builder</strong> — fill in fields and the block is generated automatically.</p>

      <h4>Figure — single floating image</h4>
      <pre class="help-pre">:::figure align: right caption: "Map of the Republic"
marzena-map.png
:::</pre>

      <h4>Gallery — multi-image grid</h4>
      <pre class="help-pre">:::gallery columns: 3 caption: "Architecture of Lévane"
- LevaneCity1.jpg | The Capitol
- LevaneCity2.jpg | The Bourse
- LevaneCity3.jpg | National Library
:::</pre>

      <h4>Table — static wiki table</h4>
      <pre class="help-pre">:::table caption: "Cabinet members"
| Position    | Name              | Party |
| ----------- | ----------------- | ----- |
| President   | Élise Marchand    | PRM   |
| PM          | Jean Talleyrand   | PRM   |
:::</pre>

      <h4>DataTable — sortable, filterable table</h4>
      <pre class="help-pre">:::datatable sortable: true filterable: true caption: "Election results"
| Year | Party | Seats |
| 1952 | PRM   | 142   |
| 1956 | PRM   | 138   |
:::</pre>
      <p>Click column headers to sort; type in the filter to narrow rows.</p>

      <h4>Chart — bar / line / pie</h4>
      <pre class="help-pre">:::chart type: bar caption: "GDP growth"
labels: 2020, 2021, 2022, 2023, 2024
series: GDP    | 1.2, 2.4, 3.1, 2.8, 3.4
series: CPI    | 2.1, 2.5, 4.2, 3.1, 2.4
:::</pre>
      <p>Types: <code>bar</code>, <code>hbar</code>, <code>line</code>, <code>stacked</code>, <code>pie</code>, <code>donut</code>. Use the <strong>Stats Tool</strong> to author charts visually and export the block.</p>

      <h4>Map — Google My Maps embed</h4>
      <pre class="help-pre">:::map caption: "Administrative regions" height: 480
https://www.google.com/maps/d/embed?mid=YOUR_MAP_ID
:::</pre>

      <h4>Graph — diagram from the Graph Tool</h4>
      <p>Build the diagram in the <strong>Graph Tool</strong>, click <em>Export Markdown</em>, paste the resulting <code>:::graph</code> block.</p>

      <h3>Drafts and unsaved changes</h3>
      <p>The editor saves a draft to your browser's local storage every second while you type. Drafts persist across browser sessions. If you try to close the tab with unsaved changes, the browser will warn you.</p>
      <p>Drafts are <strong>cleared automatically</strong> when you successfully save to GitHub.</p>

      <h3>Citations</h3>
      <p>Every article has a <strong>Cite this article</strong> button at the bottom that produces an APA-formatted reference for the article in its current state.</p>

      <h3>Tools</h3>
      <ul>
        <li><strong>Editor</strong> — split-pane editor with toolbar, drafts, and live preview</li>
        <li><strong>Graph Tool</strong> — build org charts and relationship diagrams</li>
        <li><strong>Stats &amp; Charts</strong> — author charts from spreadsheet or CSV input</li>
        <li><strong>Marzena Commons</strong> — image archive with search and metadata</li>
      </ul>

      <h3>Customising</h3>
      <p>Site-level settings (name, subtitle, tagline, hero text, footer, etc.) live in <code>config.js</code> at the repo root. Edit and commit to change them — no JavaScript modifications needed.</p>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
  if (e.key === 'Escape') {
    closeLightbox();
    document.getElementById('help-overlay')?.classList.remove('visible');
    document.getElementById('upload-helper-overlay')?.classList.remove('visible');
  }
});

// ═══════════════════════════════════════════════════════════════
// EXPOSE GLOBALS
// ═══════════════════════════════════════════════════════════════
function exposeGlobals() {
  window.navigate    = navigate;
  window.toggleTheme = toggleTheme;

// Random article (top-bar button)
  window.randomArticle = function () {
    const arts = (State.index && State.index.articles) || [];
    if (!arts.length) { navigate('all'); return; }
    let pick = arts[Math.floor(Math.random() * arts.length)];
    let guard = 0;
    while (arts.length > 1 && pick.slug === State.slug && guard++ < 8) {
      pick = arts[Math.floor(Math.random() * arts.length)];
    }
    navigate('article', pick.slug);
  };

   
  window.openEditor = () => {
    window.location.href = `tools/editor.html?slug=${encodeURIComponent(State.slug || '')}`;
  };
  window.openNewArticle = (slug) => {
    window.location.href = `tools/editor.html?slug=${encodeURIComponent(slug || '')}`;
  };

  window.onSearchInput   = onSearchInput;
  window.onSearchKeydown = onSearchKeydown;
  window.doSearch        = doSearch;

  window.openLightbox   = openLightbox;
  window.closeLightbox  = closeLightbox;
  window.__openLightbox = openLightbox;

  window.__filterCommons     = filterCommons;
  window.__copyCommonsRef    = copyCommonsRef;
  window.__copyToClipboard   = copyToClipboard;
  window.__openUploadHelper  = openUploadHelper;
  window.__closeUploadHelper = closeUploadHelper;

  window.showHelp    = showHelp;
  window.__navigate  = navigate;

  // Datatable interactions
  window.__dtSort    = dtSort;
  window.__dtFilter  = dtFilter;

  // Citation
  window.__copyCitation = copyCitation;
}

// ═══════════════════════════════════════════════════════════════
// PARTIALS
// ═══════════════════════════════════════════════════════════════
async function loadPartials() {
  async function safeFetch(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) { console.warn(`Partial not found: ${url}`); return ''; }
      return r.text();
    } catch(e) { console.warn(`Partial fetch failed: ${url}`, e); return ''; }
  }

  const [chrome, footer, modals] = await Promise.all([
    safeFetch('partials/chrome.html'),
    safeFetch('partials/footer.html'),
    safeFetch('partials/modals.html'),
  ]);

  document.getElementById('chrome-mount').innerHTML  = chrome;
  document.getElementById('footer-mount').innerHTML  = footer;
  document.getElementById('modals-mount').innerHTML  = modals;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init() {
  exposeGlobals();
  initTheme();
  await loadPartials();
  startCetClock();
  await fetchIndex();
  await buildNav();
  await handleRoute();
})();
