/* ═══════════════════════════════════════════════════════════════
   renderer.js — Markdown parser, block tokenizer, HTML renderer
   ═══════════════════════════════════════════════════════════════ */

import { RAW_BASE, IMAGES_PATH, State } from './state.js';
import { navigate } from './router.js';

// ─── BLOCK HANDLERS ────────────────────────────────────────────
const BLOCK_HANDLERS = {
  infobox: renderInfobox,
  figure: renderFigure,
  map: renderMapEmbed,
};

// ─── FRONTMATTER ───────────────────────────────────────────────
export function extractFrontmatter(md) {
  const m = md.match(/^:::frontmatter\s*\n([\s\S]*?)\n:::\s*\n?/);
  if (!m) return { frontmatter: {}, body: md };
  return { frontmatter: parseFrontmatterBody(m[1]), body: md.slice(m[0].length) };
}

export function parseFrontmatter(md) {
  return extractFrontmatter(md).frontmatter;
}

export function parseFrontmatterBody(text) {
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

// ─── BLOCK TOKENIZER ───────────────────────────────────────────
export function tokenizeBlocks(md) {
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

export function renderToken(tok) {
  if (tok.type === 'markdown') return renderMarkdownBlock(tok.body);
  const handler = BLOCK_HANDLERS[tok.name];
  if (handler) return handler(tok);
  return `<div class="notice-box"><strong>Unknown block:</strong> <code>:::${tok.name}</code></div>`;
}

export function renderTokensFromBody(bodyMd) {
  const tokens = tokenizeBlocks(bodyMd);
  return tokens.map(renderToken).join('\n');
}

// ─── INFOBOX ───────────────────────────────────────────────────
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
        onclick="window.__openLightbox('${resolved}','${escapeAttr(caption)}')">
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

// ─── FIGURE ────────────────────────────────────────────────────
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
      onclick="window.__openLightbox('${resolved}','${escapeAttr(caption)}')">
    ${caption ? `<figcaption class="figure-caption">${renderInline(caption)}</figcaption>` : ''}
  </figure>`;
}

// ─── MAP EMBED ─────────────────────────────────────────────────
function renderMapEmbed(tok) {
  const args = parseInlineArgs(tok.args);
  const src = tok.body.trim() || args.src || '';
  const height = args.height || '420';
  const caption = args.caption || '';
  // Accept Google My Maps share URLs and embed URLs
  let embedSrc = src;
  // Convert share URL to embed URL if needed
  const myMapsMatch = src.match(/google\.com\/maps\/d\/(?:u\/\d+\/)?(?:view|edit)[?&]mid=([^&\s]+)/);
  if (myMapsMatch) {
    embedSrc = `https://www.google.com/maps/d/embed?mid=${myMapsMatch[1]}`;
  }
  if (!embedSrc) return `<div class="notice-box">Map block requires a Google My Maps URL.</div>`;
  return `<div class="map-embed-block">
    <iframe
      src="${escapeAttr(embedSrc)}"
      width="100%"
      height="${escapeAttr(height)}"
      style="border:1px solid var(--border);display:block;"
      allowfullscreen
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade">
    </iframe>
    ${caption ? `<div class="map-caption">${renderInline(caption)}</div>` : ''}
  </div>`;
}

// ─── MARKDOWN PROSE RENDERER ───────────────────────────────────
export function renderMarkdownBlock(md) {
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

  html = html.replace(/^#### (.+)$/gm, (_, t) => `<h4 id="${slugifyHeading(t)}">${renderInline(t)}</h4>`);
  html = html.replace(/^### (.+)$/gm, (_, t) => `<h3 id="${slugifyHeading(t)}">${renderInline(t)}</h3>`);
  html = html.replace(/^## (.+)$/gm, (_, t) => `<h2 id="${slugifyHeading(t)}">${renderInline(t)}</h2>`);
  html = html.replace(/^# .+$/gm, '');

  html = html.replace(/(?:^> .+\n?)+/gm, block => {
    const inner = block.trim().split('\n').map(l => l.replace(/^>\s?/, '')).join(' ');
    return `<blockquote>${renderInline(inner)}</blockquote>`;
  });

  html = html.replace(/^---$/gm, '<hr>');

  html = html.replace(/(?:^- .+\n?)+/gm, block => {
    const items = block.trim().split('\n').map(l => `<li>${renderInline(l.replace(/^- /, ''))}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/(?:^\d+\. .+\n?)+/gm, block => {
    const items = block.trim().split('\n').map(l => `<li>${renderInline(l.replace(/^\d+\.\s/, ''))}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

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

// ─── INLINE ────────────────────────────────────────────────────
export function renderInline(text) {
  if (!text) return '';
  let s = text;
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const resolved = resolveImagePath(url);
    return `<img src="${resolved}" alt="${escapeAttr(alt)}" loading="lazy"
      style="max-width:100%;height:auto;cursor:zoom-in;"
      onerror="this.style.opacity='0.3'"
      onclick="window.__openLightbox('${resolved}','${escapeAttr(alt)}')">`;
  });
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, display) => {
    const slug = slugifyTarget(target);
    const exists = articleExists(slug);
    const label = display || target;
    const cls = exists ? '' : 'redlink';
    const titleAttr = exists ? `Read: ${target}` : `Create: ${target}`;
    return `<a class="${cls}" onclick="window.__navigate('article','${slug}')" title="${escapeAttr(titleAttr)}" style="cursor:pointer;">${escapeHtml(label)}</a>`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

// ─── HELPERS ───────────────────────────────────────────────────
export function slugifyHeading(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}
export function slugifyTarget(text) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
export function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
export function articleExists(slug) {
  if (!State.index) return true;
  return State.index.articles.some(a => a.slug === slug);
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
export function escapeAttr(s) {
  return String(s ?? '').replace(/["'<>&]/g, c =>
    ({ '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])
  );
}
export function resolveImagePath(src) {
  if (!src) return '';
  src = src.trim();
  if (src.match(/^https?:\/\//)) return src;
  if (src.startsWith('/images/')) return `${RAW_BASE}${src}`;
  if (src.startsWith('/')) return `${RAW_BASE}${src}`;
  if (src.includes('/')) return `${RAW_BASE}/${src}`;
  return `${RAW_BASE}/${IMAGES_PATH}/${src}`;
}
export function extractTitle(md) {
  const body = extractFrontmatter(md).body;
  const m = body.match(/^# (.+)$/m);
  return m ? m[1].trim() : null;
}
export function extractSummary(md) {
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
export function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function parseInlineArgs(str) {
  const out = {};
  if (!str) return out;
  const re = /(\w+):\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(str)) !== null) out[m[1]] = m[2] ?? m[3] ?? m[4];
  return out;
}

export function buildToc(html, slug) {
  const matches = [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)];
  if (matches.length < 2) return '';
  const items = matches.map(m =>
    `<li><a href="#/${slug}#${m[1]}" data-toc-target="${m[1]}">${m[2]}</a></li>`
  ).join('');
  return `<nav class="toc-sidebar"><h3>Contents</h3><ol>${items}</ol></nav>`;
}

export function formatInUniverseDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric'
  });
}
