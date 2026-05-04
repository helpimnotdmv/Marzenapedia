/* ═══════════════════════════════════════════════════════════════
   MARZENAPEDIA — Application JavaScript
   ═══════════════════════════════════════════════════════════════ */

// ─── CONFIGURATION ─────────────────────────────────────────────
const REPO_OWNER = 'helpimnotdmv';
const REPO_NAME = 'Marzenapedia';
const BRANCH = 'main';
const ARTICLES_PATH = 'articles';
const IMAGES_PATH = 'images';

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const INDEX_URL = `${RAW_BASE}/index.json`;

// ─── STATE ─────────────────────────────────────────────────────
const State = {
  view: 'home',
  slug: null,
  index: null,
  articleCache: {},
  lastEditCache: {},
  searchDebounceTimer: null,
  searchActiveResult: -1,
  scrollObserver: null
};

// ═══════════════════════════════════════════════════════════════
// THEME / DARK MODE
// ═══════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('marzenapedia-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
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
// CET CLOCK — minute precision only
// ═══════════════════════════════════════════════════════════════
function startCetClock() {
  const tick = () => {
    const now = new Date();
    const opts = { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false };
    const time = now.toLocaleTimeString('en-GB', opts);
    const el = document.getElementById('cet-time');
    if (el) el.textContent = time;
  };
  tick();
  // Align to the top of the next minute, then update every 60s
  const now = new Date();
  const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => { tick(); setInterval(tick, 60000); }, msUntilNextMinute);
}

function formatInUniverseDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ═══════════════════════════════════════════════════════════════
// HASH ROUTING
// ═══════════════════════════════════════════════════════════════
function parseHash() {
  let hash = location.hash || '#/';
  if (!hash.startsWith('#/')) hash = '#/' + hash.replace(/^#/, '');
  const path = hash.slice(2);
  if (!path || path === 'home') return { view: 'home' };
  if (path === 'all') return { view: 'all' };
  if (path.startsWith('search/')) return { view: 'search', query: decodeURIComponent(path.slice(7)) };
  const [slug, section] = path.split('#');
  return { view: 'article', slug: decodeURIComponent(slug), section: section ? decodeURIComponent(section) : null };
}

function navigate(target, slugOrQuery) {
  if (target === 'home') location.hash = '#/';
  else if (target === 'all') location.hash = '#/all';
  else if (target === 'article' && slugOrQuery) location.hash = '#/' + encodeURIComponent(slugOrQuery);
  else if (target === 'search' && slugOrQuery) location.hash = '#/search/' + encodeURIComponent(slugOrQuery);
  else location.hash = '#/';
}

async function handleRoute() {
  const route = parseHash();
  State.view = route.view;
  State.slug = route.slug || null;

  document.getElementById('page-tabs').style.display = route.view === 'article' ? 'flex' : 'none';

  const dd = document.getElementById('search-dropdown');
  if (dd) dd.classList.remove('visible');

  if (State.scrollObserver) { State.scrollObserver.disconnect(); State.scrollObserver = null; }

  if (route.view === 'home') await showHome();
  else if (route.view === 'all') await showAllArticles();
  else if (route.view === 'search') await showSearchResults(route.query);
  else if (route.view === 'article') await showArticle(route.slug, route.section);
}

window.addEventListener('hashchange', handleRoute);

// ═══════════════════════════════════════════════════════════════
// INDEX FETCHING
// ═══════════════════════════════════════════════════════════════
async function fetchIndex() {
  if (State.index) return State.index;

  try {
    const res = await fetch(`${INDEX_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.articles)) {
        State.index = data;
        return data;
      }
    }
  } catch (e) { /* fall through */ }

  console.warn('[Marzenapedia] index.json not found, falling back to GitHub tree API');
  try {
    const res = await fetch(`${API_BASE}/git/trees/${BRANCH}?recursive=1`);
    if (!res.ok) throw new Error('GitHub API unavailable');
    const data = await res.json();
    const mdFiles = (data.tree || []).filter(f =>
      f.path.startsWith(ARTICLES_PATH + '/') && f.path.endsWith('.md')
    );
    const articles = await Promise.all(mdFiles.map(async f => {
      const slug = f.path.replace(ARTICLES_PATH + '/', '').replace(/\.md$/, '');
      let title = slugToTitle(slug), summary = '', tags = [];
      try {
        const md = await fetchArticle(slug);
        title = extractTitle(md) || title;
        summary = extractSummary(md);
        const fm = parseFrontmatter(md);
        if (fm.tags) tags = fm.tags;
      } catch {}
      return { slug, title, summary, tags, infobox_type: null, last_edited: null };
    }));
    const fallback = { articles, generated_at: new Date().toISOString(), source: 'fallback' };
    State.index = fallback;
    return fallback;
  } catch (e) {
    console.error('[Marzenapedia] Index fetch failed entirely:', e);
    State.index = { articles: [], generated_at: null, source: 'empty' };
    return State.index;
  }
}

async function fetchArticle(slug) {
  if (State.articleCache[slug]) return State.articleCache[slug];
  const url = `${RAW_BASE}/${ARTICLES_PATH}/${slug}.md?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Article not found: ${slug}`);
  const text = await res.text();
  State.articleCache[slug] = text;
  return text;
}

async function fetchLastEdited(slug) {
  if (State.lastEditCache[slug] !== undefined) return State.lastEditCache[slug];
  if (State.index) {
    const entry = State.index.articles.find(a => a.slug === slug);
    if (entry && entry.last_edited) {
      State.lastEditCache[slug] = entry.last_edited;
      return entry.last_edited;
    }
  }
  try {
    const url = `${API_BASE}/commits?path=${ARTICLES_PATH}/${slug}.md&per_page=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('commits API failed');
    const commits = await res.json();
    const date = commits?.[0]?.commit?.author?.date || null;
    State.lastEditCache[slug] = date;
    return date;
  } catch {
    State.lastEditCache[slug] = null;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN PARSER — BLOCK TOKENIZER
// ═══════════════════════════════════════════════════════════════

const BLOCK_HANDLERS = {
  infobox: renderInfobox,
  figure: renderFigure,
};

// ─── FRONTMATTER ─────────────────────────────────────────────
function extractFrontmatter(md) {
  const m = md.match(/^:::frontmatter\s*\n([\s\S]*?)\n:::\s*\n?/);
  if (!m) return { frontmatter: {}, body: md };
  return { frontmatter: parseFrontmatterBody(m[1]), body: md.slice(m[0].length) };
}

function parseFrontmatter(md) {
  return extractFrontmatter(md).frontmatter;
}

function parseFrontmatterBody(text) {
  const out = {};
  text.split('\n').forEach(line => {
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (!m) return;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === 'tags') out.tags = val.split(/[,;]\s*/).map(t => t.trim()).filter(Boolean);
    else if (key === 'sources') out.sources = val.split(/;\s*/).map(s => s.trim()).filter(Boolean);
    else out[key] = val;
  });
  return out;
}

// ─── BLOCK TOKENIZER ─────────────────────────────────────────────
function tokenizeBlocks(md) {
  const tokens = [];
  const re = /:::([a-z_][a-z0-9_-]*)([^\n]*)\n([\s\S]*?)\n:::/g;
  let lastIndex = 0, match;
  while ((match = re.exec(md)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'markdown', body: md.slice(lastIndex, match.index) });
    tokens.push({ type: 'block', name: match[1].toLowerCase(), args: match[2].trim(), body: match[3] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < md.length) tokens.push({ type: 'markdown', body: md.slice(lastIndex) });
  return tokens;
}

function renderToken(tok) {
  if (tok.type === 'markdown') return renderMarkdownBlock(tok.body);
  const handler = BLOCK_HANDLERS[tok.name];
  if (handler) return handler(tok);
  return `<div class="notice-box"><strong>Unknown block:</strong> <code>:::${tok.name}</code> — this block type isn't registered yet.</div>`;
}

// ─── INFOBOX BLOCK ─────────────────────────────────────────────
function renderInfobox(tok) {
  const lines = tok.body.split('\n');
  let title = '', image = '', caption = '';
  const sections = [{ header: null, rows: [] }];

  for (const line of lines) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim(), lk = key.toLowerCase();
    if (lk === 'title') { title = val; continue; }
    if (lk === 'image') { image = val; continue; }
    if (lk === 'caption') { caption = val; continue; }
    if (lk === 'section') { sections.push({ header: val, rows: [] }); continue; }
    sections[sections.length - 1].rows.push({ key, val: renderInline(val) });
  }

  let html = `<div class="infobox">`;
  if (title) html += `<div class="infobox-title">${escapeHtml(title)}</div>`;
  if (image) {
    const resolved = resolveImagePath(image);
    html += `<div class="infobox-image">
      <img src="${resolved}" alt="${escapeHtml(caption || title)}" loading="lazy"
        onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='block')"
        onclick="openLightbox('${resolved}','${escapeAttr(caption)}')">
      <div class="img-error" style="display:none;padding:8px;font-size:12px;color:var(--muted);font-style:italic;">Image unavailable</div>`;
    if (caption) html += `<div class="caption">${renderInline(caption)}</div>`;
    html += `</div>`;
  }
  html += `<table>`;
  for (const sec of sections) {
    if (sec.header) html += `<tr><td colspan="2" class="infobox-section-header">${escapeHtml(sec.header)}</td></tr>`;
    for (const r of sec.rows) html += `<tr><td>${escapeHtml(r.key)}</td><td>${r.val}</td></tr>`;
  }
  html += `</table></div>`;
  return html;
}

// ─── FIGURE BLOCK ─────────────────────────────────────────────
function renderFigure(tok) {
  const args = parseInlineArgs(tok.args);
  const align = args.align || 'right';
  const caption = args.caption || '';
  const src = tok.body.trim().split('\n')[0].trim();
  const klass = align === 'left' ? 'float-left' : (align === 'none' ? '' : 'float-right');
  const resolved = resolveImagePath(src);
  return `<figure class="figure-block ${klass}">
    <img src="${resolved}" alt="${escapeAttr(caption)}" loading="lazy"
      onerror="this.style.opacity='0.3'"
      onclick="openLightbox('${resolved}','${escapeAttr(caption)}')">
    ${caption ? `<figcaption class="figure-caption">${renderInline(caption)}</figcaption>` : ''}
  </figure>`;
}

function parseInlineArgs(str) {
  const out = {};
  if (!str) return out;
  const re = /(\w+):\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(str)) !== null) out[m[1]] = m[2] ?? m[3] ?? m[4];
  return out;
}

// ─── MARKDOWN PROSE BLOCK RENDERER ─────────────────────────────────────────────
function renderMarkdownBlock(md) {
  let html = md;

  // Tables
  html = html.replace(/(\|.+\|\n)+/g, tableBlock => {
    const rows = tableBlock.trim().split('\n').filter(r => !r.match(/^\|[-| :]+\|$/));
    return '<table class="wiki-table">' + rows.map((r, i) => {
      const cells = r.split('|').slice(1, -1).map(c => c.trim());
      const tag = i === 0 ? 'th' : 'td';
      return `<tr>${cells.map(c => `<${tag}>${renderInline(c)}</${tag}>`).join('')}</tr>`;
    }).join('') + '</table>';
  });

  // Headings (H1 fully suppressed — showArticle renders the title separately)
  html = html.replace(/^#### (.+)$/gm, (_, t) => `<h4 id="${slugifyHeading(t)}">${renderInline(t)}</h4>`);
  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugifyHeading(t)}">${renderInline(t)}</h3>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2 id="${slugifyHeading(t)}">${renderInline(t)}</h2>`);
  html = html.replace(/^# .+$/gm, ''); // suppress H1 — title shown by article-title div

  // Blockquotes
  html = html.replace(/(?:^> .+\n?)+/gm, block => {
    const inner = block.trim().split('\n').map(l => l.replace(/^>\s?/, '')).join(' ');
    return `<blockquote>${renderInline(inner)}</blockquote>`;
  });

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/(?:^- .+\n?)+/gm, block => {
    const items = block.trim().split('\n').map(l => `<li>${renderInline(l.replace(/^- /, ''))}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/(?:^\d+\. .+\n?)+/gm, block => {
    const items = block.trim().split('\n').map(l => `<li>${renderInline(l.replace(/^\d+\.\s/, ''))}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  const lines = html.split('\n');
  const out = [];
  let inPara = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inPara) { out.push('</p>'); inPara = false; }
      continue;
    }
    if (line.match(/^<(h[1-6]|ul|ol|table|blockquote|div|hr|figure|aside|section|p|!)/)) {
      if (inPara) { out.push('</p>'); inPara = false; }
      out.push(line);
    } else {
      if (!inPara) { out.push('<p>'); inPara = true; }
      out.push(renderInline(line) + ' ');
    }
  }
  if (inPara) out.push('</p>');
  return out.join('\n');
}

// ─── INLINE RENDERING ─────────────────────────────────────────────
function renderInline(text) {
  if (!text) return '';
  let s = text;

  // Images: ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const resolved = resolveImagePath(url);
    return `<img src="${resolved}" alt="${escapeAttr(alt)}" loading="lazy"
      style="max-width:100%;height:auto;cursor:zoom-in;"
      onerror="this.style.opacity='0.3'"
      onclick="openLightbox('${resolved}','${escapeAttr(alt)}')">`;
  });

  // Bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');

  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Wiki links
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
    const slug = slugifyTarget(target);
    const exists = articleExists(slug);
    const label = display || target;
    const cls = exists ? '' : 'redlink';
    const titleAttr = exists ? `Read: ${target}` : `Create: ${target}`;
    return `<a class="${cls}" onclick="navigate('article','${slug}')" title="${escapeAttr(titleAttr)}" style="cursor:pointer;">${escapeHtml(label)}</a>`;
  });

  // External links
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return s;
}

// ─── HELPERS ─────────────────────────────────────────────
function slugifyHeading(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}
function slugifyTarget(text) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function articleExists(slug) {
  if (!State.index) return true;
  return State.index.articles.some(a => a.slug === slug);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function escapeAttr(s) {
  return String(s ?? '').replace(/["'<>&]/g, c =>
    ({ '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])
  );
}

// FIX: resolveImagePath — handles all image path forms correctly
function resolveImagePath(src) {
  if (!src) return '';
  src = src.trim();
  if (src.match(/^https?:\/\//)) return src;                          // full external URL
  if (src.startsWith('/images/')) return `${RAW_BASE}${src}`;        // /images/foo.png
  if (src.startsWith('/')) return `${RAW_BASE}${src}`;               // any repo-root path
  if (src.includes('/')) return `${RAW_BASE}/${src}`;                // relative path with folder
  return `${RAW_BASE}/${IMAGES_PATH}/${src}`;                        // bare filename → /images/
}

function extractTitle(md) {
  const body = extractFrontmatter(md).body;
  const m = body.match(/^# (.+)$/m);
  return m ? m[1].trim() : null;
}
function extractSummary(md) {
  const body = extractFrontmatter(md).body;
  const stripped = body.replace(/:::[\s\S]*?:::/g, '');
  const lines = stripped.split('\n');
  let pastTitle = false;
  for (const l of lines) {
    if (!pastTitle && l.startsWith('# ')) { pastTitle = true; continue; }
    const trimmed = l.trim();
    if (pastTitle && trimmed && !trimmed.startsWith('#')) {
      const clean = trimmed.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/\*\*?/g, '');
      return clean.length > 160 ? clean.slice(0, 160) + '…' : clean;
    }
  }
  return '';
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ═══════════════════════════════════════════════════════════════
// VIEW: HOME / PORTAL
// ═══════════════════════════════════════════════════════════════
async function showHome() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading the Republic</div>';
  document.title = 'Marzenapedia — Main Page';
  document.getElementById('breadcrumb').innerHTML = '';

  const index = await fetchIndex();
  const articles = index.articles || [];

  if (articles.length === 0) {
    document.getElementById('main-content').innerHTML = `
      <div class="portal">
        ${portalHero()}
        <div class="notice-box">No articles found yet.</div>
      </div>`;
    return;
  }

  const recent = [...articles].sort((a, b) =>
    new Date(b.last_edited || 0).getTime() - new Date(a.last_edited || 0).getTime()
  ).slice(0, 6);

  const cardsHtml = recent.map(c => `
    <div class="article-card" onclick="navigate('article','${c.slug}')">
      <div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.summary || '')}</p>
      </div>
      <div class="meta">
        ${c.last_edited ? new Date(c.last_edited).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
        ${(c.tags || []).slice(0, 2).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>`).join('');

  const tagCounts = {};
  articles.forEach(a => (a.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

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
// VIEW: ALL ARTICLES
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
// VIEW: SEARCH RESULTS
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

  const allResults = [...indexHits.map(a => ({ ...a, snippet: a.summary })), ...fullTextResults.filter(Boolean)];

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
// VIEW: ARTICLE
// ═══════════════════════════════════════════════════════════════
async function showArticle(slug, sectionAnchor) {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading article</div>';
  document.title = `${slugToTitle(slug)} — Marzenapedia`;

  await fetchIndex();

  let md;
  try {
    md = await fetchArticle(slug);
  } catch (e) {
    renderArticleNotFound(slug);
    return;
  }

  const fm = parseFrontmatter(md);
  const title = extractTitle(md) || slugToTitle(slug);
  document.title = `${title} — Marzenapedia`;

  // Strip frontmatter block, then strip the H1 title line so it doesn't appear twice
  const bodyAfterFm = extractFrontmatter(md).body;
  const bodyForRender = bodyAfterFm.replace(/^# .+(\r?\n|$)/m, '');
  const bodyHtml = renderTokensFromBody(bodyForRender);

  const tocHtml = buildToc(bodyHtml);

  const lastEdited = await fetchLastEdited(slug);
  const editedStr = lastEdited
    ? new Date(lastEdited).toLocaleDateString('en-GB', {
        timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric'
      })
    : null;

  const metaParts = [];
  if (fm.date) metaParts.push(`<span class="meta-item">${formatInUniverseDate(fm.date)}</span>`);
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

// Render body tokens directly (frontmatter already stripped before calling this)
function renderTokensFromBody(bodyMd) {
  const tokens = tokenizeBlocks(bodyMd);
  return tokens.map(renderToken).join('\n');
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

function buildToc(html) {
  const matches = [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)];
  if (matches.length < 2) return '';
  const items = matches.map(m =>
    `<li><a href="#/${State.slug}#${m[1]}" data-toc-target="${m[1]}">${m[2]}</a></li>`
  ).join('');
  return `<nav class="toc-sidebar"><h3>Contents</h3><ol>${items}</ol></nav>`;
}

function setupScrollSpy() {
  const sections = document.querySelectorAll('.article h2[id]');
  const links = document.querySelectorAll('.toc-sidebar a[data-toc-target]');
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
// SEARCH (instant dropdown)
// ═══════════════════════════════════════════════════════════════
function onSearchInput() {
  const q = document.getElementById('search-input').value.trim();
  const dd = document.getElementById('search-dropdown');
  clearTimeout(State.searchDebounceTimer);
  if (!q) { dd.classList.remove('visible'); return; }
  State.searchDebounceTimer = setTimeout(() => runInstantSearch(q), 100);
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
    dd.innerHTML = `<div class="no-results">No quick matches. Press Enter for full-text search.</div>`;
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
  const dd = document.getElementById('search-dropdown');
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
  const lb = document.getElementById('lightbox');
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
// EDITOR
// ═══════════════════════════════════════════════════════════════
async function slugExists(slug) {
  if (State.index) return State.index.articles.some(a => a.slug === slug);
  try {
    const res = await fetch(`${RAW_BASE}/${ARTICLES_PATH}/${slug}.md`);
    return res.ok;
  } catch { return false; }
}

function openEditor() {
  if (!State.slug) { openNewArticle(); return; }
  fetchArticle(State.slug).then(md => {
    document.getElementById('editor-filename').value = State.slug;
    document.getElementById('editor-filename').readOnly = true;
    document.getElementById('editor-filename').style.opacity = '0.6';
    document.getElementById('editor-filename').title = 'Slug cannot be changed for existing articles';
    document.getElementById('editor-content').value = md;
    document.getElementById('editor-title').textContent = `Edit: ${slugToTitle(State.slug)}`;
    document.getElementById('editor-is-existing').value = 'true';
    document.getElementById('editor-overlay').classList.add('visible');
  }).catch(() => {
    document.getElementById('editor-filename').value = State.slug;
    document.getElementById('editor-filename').readOnly = false;
    document.getElementById('editor-filename').style.opacity = '';
    document.getElementById('editor-content').value =
      `:::frontmatter\ntags: \ndate: \nsources: \n:::\n\n# ${slugToTitle(State.slug)}\n\nWrite your article here.\n`;
    document.getElementById('editor-title').textContent = `New: ${slugToTitle(State.slug)}`;
    document.getElementById('editor-is-existing').value = 'false';
    document.getElementById('editor-overlay').classList.add('visible');
  });
}

function openNewArticle(slug) {
  const s = slug || '';
  document.getElementById('editor-filename').value = s;
  document.getElementById('editor-filename').readOnly = false;
  document.getElementById('editor-filename').style.opacity = '';
  document.getElementById('editor-filename').title = '';
  document.getElementById('editor-content').value = s
    ? `:::frontmatter\ntags: \ndate: \nsources: \n:::\n\n# ${slugToTitle(s)}\n\nWrite your article here.\n`
    : `:::frontmatter\ntags: \ndate: \nsources: \n:::\n\n# Article Title\n\nWrite your article here.\n`;
  document.getElementById('editor-title').textContent = 'New Article';
  document.getElementById('editor-is-existing').value = 'false';
  document.getElementById('editor-overlay').classList.add('visible');
}

function closeEditor() {
  document.getElementById('editor-overlay').classList.remove('visible');
  document.getElementById('editor-filename').readOnly = false;
  document.getElementById('editor-filename').style.opacity = '';
}

function previewArticle() {
  const md = document.getElementById('editor-content').value;
  const slug = (document.getElementById('editor-filename').value || 'preview').toLowerCase().replace(/\s+/g, '-');
  State.articleCache[slug] = md;
  closeEditor();
  navigate('article', slug);
}

async function saveArticle() {
  const slugRaw = document.getElementById('editor-filename').value.trim().toLowerCase().replace(/\s+/g, '-');
  const content = document.getElementById('editor-content').value;
  const isExisting = document.getElementById('editor-is-existing').value === 'true';

  if (!slugRaw) { alert('Please enter a slug for the article.'); return; }
  if (!content.trim()) { alert('Article content is empty.'); return; }

  if (!isExisting) {
    const exists = await slugExists(slugRaw);
    if (exists) {
      const proceed = confirm(
        `An article with slug "${slugRaw}" already exists.\nSaving will open the GitHub editor to overwrite it. Continue?`
      );
      if (!proceed) return;
    }
  }

  const filename = `${ARTICLES_PATH}/${slugRaw}.md`;

  if (isExisting) {
    // Open GitHub's web editor for the EXISTING file
    const githubEditUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/edit/${BRANCH}/${filename}`;
    try {
      await navigator.clipboard.writeText(content);
      showSaveInstructions(githubEditUrl, content, true, true);
    } catch {
      showSaveInstructions(githubEditUrl, content, false, true);
    }
  } else {
    // New file — try to pre-fill via URL param; fall back to clipboard
    const githubNewUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(content)}`;
    if (githubNewUrl.length < 7500) {
      window.open(githubNewUrl, '_blank');
      State.articleCache[slugRaw] = content;
      State.index = null;
      closeEditor();
    } else {
      const githubNewBlank = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}`;
      try {
        await navigator.clipboard.writeText(content);
        showSaveInstructions(githubNewBlank, content, true, false);
      } catch {
        showSaveInstructions(githubNewBlank, content, false, false);
      }
    }
  }
}

function showSaveInstructions(url, content, copied, isEdit) {
  const modal = document.getElementById('save-instructions-overlay');
  document.getElementById('save-instructions-link').href = url;
  document.getElementById('save-instructions-link').textContent = isEdit
    ? 'Open GitHub editor for this file →'
    : 'Open GitHub to create this file →';

  const msgEl = document.getElementById('save-clipboard-msg');
  if (copied) {
    msgEl.textContent = '✓ Content copied to clipboard.';
    msgEl.style.color = '#5a9a5a';
  } else {
    msgEl.textContent = 'Clipboard access unavailable — copy the content below manually.';
    msgEl.style.color = 'var(--muted)';
  }

  const instructionsEl = document.getElementById('save-instructions-steps');
  if (isEdit) {
    instructionsEl.innerHTML = `
      <li>Click the link above to open the file in GitHub's editor.</li>
      <li>Select <strong>all</strong> existing content in the editor (<kbd>Ctrl+A</kbd> / <kbd>Cmd+A</kbd>).</li>
      <li>Paste the new content (<kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd>).</li>
      <li>Scroll down and click <strong>"Commit changes"</strong>.</li>
      <li>The index will rebuild automatically within ~30 seconds.</li>`;
  } else {
    instructionsEl.innerHTML = `
      <li>Click the link above — GitHub will open with the filename pre-filled.</li>
      <li>Paste the content into the editor (<kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd>).</li>
      <li>Scroll down and click <strong>"Commit new file"</strong>.</li>
      <li>The index will rebuild automatically within ~30 seconds.</li>`;
  }

  document.getElementById('save-content-textarea').value = content;
  modal.classList.add('visible');
  window.open(url, '_blank');
}

function closeSaveInstructions() {
  document.getElementById('save-instructions-overlay').classList.remove('visible');
  if (State.slug) delete State.articleCache[State.slug];
  State.index = null;
  closeEditor();
}

async function copyContentToClipboard() {
  const content = document.getElementById('save-content-textarea').value;
  try {
    await navigator.clipboard.writeText(content);
    const btn = document.getElementById('copy-content-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy Content'; }, 2000);
  } catch {
    document.getElementById('save-content-textarea').select();
    alert('Press Ctrl+C (or Cmd+C) to copy the selected content.');
  }
}

// ═══════════════════════════════════════════════════════════════
// NAV / TABS / HELP
// ═══════════════════════════════════════════════════════════════
function switchTab(tab) {
  if (tab === 'article') {
    document.getElementById('tab-article').classList.add('active');
    document.getElementById('tab-edit').classList.remove('active');
  }
}

function showHelp() {
  document.getElementById('help-overlay').classList.add('visible');
}

async function buildNav() {
  const index = await fetchIndex();
  const articles = index.articles || [];
  const nav = document.getElementById('main-nav');

  // Pick backbone articles; fall back to first 3 articles
  const backbone = articles.filter(a => (a.tags || []).some(t => /backbone|foundational/i.test(t)));
  const featured = (backbone.length >= 2 ? backbone : articles).slice(0, 3);

  // FIX: only inject article links here — "Main Page" and "All Articles" are in topbar HTML already
  nav.innerHTML = featured.map(a =>
    `<a onclick="navigate('article','${a.slug}')">${escapeHtml(a.title.split(' ').slice(0, 2).join(' '))}</a>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  if (e.key === 'Escape') {
    closeLightbox();
    if (document.getElementById('save-instructions-overlay').classList.contains('visible')) {
      closeSaveInstructions();
    } else {
      closeEditor();
    }
    document.getElementById('help-overlay').classList.remove('visible');
  }
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init() {
  initTheme();
  startCetClock();
  await fetchIndex();
  await buildNav();
  await handleRoute();
})();

// Expose to inline handlers
window.navigate = navigate;
window.toggleTheme = toggleTheme;
window.onSearchInput = onSearchInput;
window.onSearchKeydown = onSearchKeydown;
window.doSearch = doSearch;
window.openEditor = openEditor;
window.openNewArticle = openNewArticle;
window.closeEditor = closeEditor;
window.previewArticle = previewArticle;
window.saveArticle = saveArticle;
window.closeSaveInstructions = closeSaveInstructions;
window.copyContentToClipboard = copyContentToClipboard;
window.switchTab = switchTab;
window.showHelp = showHelp;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
