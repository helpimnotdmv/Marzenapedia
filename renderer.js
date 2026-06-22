/* ═══════════════════════════════════════════════════════════════
   renderer.js — Markdown parser, block tokenizer, HTML renderer
   ═══════════════════════════════════════════════════════════════
   Supported block types:
     :::frontmatter   – article metadata
     :::infobox       – sidebar info card
     :::figure        – single floating image
     :::gallery       – multi-image grid (NEW)
     :::map           – Google My Maps embed
     :::table         – static wiki-style table (NEW, explicit)
     :::datatable     – sortable / filterable table (NEW)
     :::chart         – bar/line/pie chart (NEW, rendered SVG)
     :::graph         – org-chart from Graph Tool
   ═══════════════════════════════════════════════════════════════ */

import { RAW_BASE, IMAGES_PATH, State } from './state.js';

// ─── BLOCK HANDLERS ────────────────────────────────────────────
const BLOCK_HANDLERS = {
  infobox:   renderInfobox,
  figure:    renderFigure,
  gallery:   renderGallery,
  map:       renderMapEmbed,
  table:     renderStaticTable,
  datatable: renderDataTable,
  chart:     renderChart,
  graph:     renderGraphBlock,
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

// ─── INFOBOX (with bug fix for image error handler) ────────────
function renderInfobox(tok) {
  const lines = tok.body.split('\n');
  let title = '', image = '', caption = '';
  const sections = [{ header: null, rows: [] }];
  for (const line of lines) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), val = m[2].trim(), lk = key.toLowerCase();
    if (lk === 'title')   { title = val; continue; }
    if (lk === 'image')   { image = val; continue; }
    if (lk === 'caption') { caption = val; continue; }
    if (lk === 'section') { sections.push({ header: val, rows: [] }); continue; }
    sections[sections.length - 1].rows.push({ key, val: renderInline(val) });
  }
  let html = `<aside class="infobox">`;
  if (title) html += `<div class="infobox-title">${escapeHtml(title)}</div>`;
  if (image) {
    const resolved = resolveImagePath(image);
    // Bug fix: use a wrapping <span> as fallback target so onerror can find it
    // reliably regardless of whitespace text nodes between siblings.
    html += `<div class="infobox-image">
      <img src="${resolved}" alt="${escapeHtml(caption || title)}" loading="lazy"
        onclick="window.__openLightbox && window.__openLightbox('${resolved}','${escapeAttr(caption)}')"
        onerror="this.style.display='none';var p=this.parentElement;if(p){var e=p.querySelector('.img-error');if(e)e.style.display='block';}">
      <div class="img-error" style="display:none;padding:8px;font-size:12px;color:var(--muted);font-style:italic;">Image unavailable: <code>${escapeHtml(image)}</code></div>`;
    if (caption) html += `<div class="caption">${renderInline(caption)}</div>`;
    html += `</div>`;
  }
  if (sections.some(s => s.rows.length > 0 || s.header)) {
    html += `<table>`;
    for (const sec of sections) {
      if (sec.header) html += `<tr><td colspan="2" class="infobox-section-header">${escapeHtml(sec.header)}</td></tr>`;
      for (const r of sec.rows) html += `<tr><td>${escapeHtml(r.key)}</td><td>${r.val}</td></tr>`;
    }
    html += `</table>`;
  }
  html += `</aside>`;
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
      onclick="window.__openLightbox && window.__openLightbox('${resolved}','${escapeAttr(caption)}')">
    ${caption ? `<figcaption class="figure-caption">${renderInline(caption)}</figcaption>` : ''}
  </figure>`;
}

// ─── GALLERY (NEW) ─────────────────────────────────────────────
// Syntax:
// :::gallery columns: 3 caption: "Architecture of Lévane"
// - FlagMZ.jpg | The national flag
// - CoAMZ.png | Coat of arms, 1952
// :::
function renderGallery(tok) {
  const args     = parseInlineArgs(tok.args);
  const cols     = Math.max(1, Math.min(8, parseInt(args.columns) || 3));
  const caption  = args.caption || '';
  const items    = tok.body.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('*'))
    .map(l => l.replace(/^[-*]\s*/, ''))
    .map(l => {
      const [src, ...rest] = l.split('|').map(s => s.trim());
      return { src, caption: rest.join('|').trim() };
    })
    .filter(it => it.src);

  if (items.length === 0) return '';

  const itemsHtml = items.map(it => {
    const url = resolveImagePath(it.src);
    return `<figure class="gallery-item">
      <img src="${url}" alt="${escapeAttr(it.caption || it.src)}" loading="lazy"
        onerror="this.style.opacity='0.25'"
        onclick="window.__openLightbox && window.__openLightbox('${url}','${escapeAttr(it.caption)}')">
      ${it.caption ? `<figcaption>${renderInline(it.caption)}</figcaption>` : ''}
    </figure>`;
  }).join('');

  return `<div class="gallery-block" style="--gallery-cols:${cols};">
    ${caption ? `<div class="gallery-block-caption">${renderInline(caption)}</div>` : ''}
    <div class="gallery-grid">${itemsHtml}</div>
  </div>`;
}

// ─── MAP EMBED ─────────────────────────────────────────────────
function renderMapEmbed(tok) {
  const args = parseInlineArgs(tok.args);
  const src = tok.body.trim() || args.src || '';
  const height = args.height || '420';
  const caption = args.caption || '';
  let embedSrc = src;
  const myMapsMatch = src.match(/google\.com\/maps\/d\/(?:u\/\d+\/)?(?:view|edit)[?&]mid=([^&\s]+)/);
  if (myMapsMatch) embedSrc = `https://www.google.com/maps/d/embed?mid=${myMapsMatch[1]}`;
  if (!embedSrc) return `<div class="notice-box">Map block requires a Google My Maps URL.</div>`;
  return `<div class="map-embed-block">
    <iframe src="${escapeAttr(embedSrc)}" width="100%" height="${escapeAttr(height)}"
      style="border:1px solid var(--border);display:block;"
      allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    ${caption ? `<div class="map-caption">${renderInline(caption)}</div>` : ''}
  </div>`;
}

// ─── STATIC TABLE (explicit :::table block) ────────────────────
// Same syntax as inline pipe tables but allows being declared explicitly
// inside a block, so the renderer doesn't have to guess.
function renderStaticTable(tok) {
  const args = parseInlineArgs(tok.args);
  const caption = args.caption || '';
  const html = renderPipeTable(tok.body, 'wiki-table');
  if (!html) return '';
  return caption
    ? `<figure class="table-block"><figcaption>${renderInline(caption)}</figcaption>${html}</figure>`
    : html;
}

// ─── DATATABLE — sortable / filterable (NEW) ──────────────────
// :::datatable sortable: true filterable: true caption: "Election Results"
// | Year | Party | Seats |
// | 1952 | PRM   | 142   |
// | 1956 | PRM   | 138   |
// :::
let DATATABLE_SEQ = 0;
function renderDataTable(tok) {
  const args       = parseInlineArgs(tok.args);
  const sortable   = args.sortable   !== 'false';
  const filterable = args.filterable !== 'false';
  const caption    = args.caption || '';
  const id         = `dt-${++DATATABLE_SEQ}-${Date.now().toString(36)}`;

  const lines = tok.body.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !l.match(/^\|[-| :]+\|$/)); // strip GFM separator if present
  if (lines.length < 2) return `<div class="notice-box">A <code>:::datatable</code> needs a header row and at least one data row.</div>`;

  const rows = lines.map(l => l.split('|').slice(1, -1).map(c => c.trim()));
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const headerHtml = headers.map((h, i) =>
    sortable
      ? `<th data-col="${i}" class="dt-sortable" onclick="window.__dtSort('${id}',${i})">${escapeHtml(h)}<span class="dt-sort-indicator"></span></th>`
      : `<th>${escapeHtml(h)}</th>`
  ).join('');

  const bodyHtml = dataRows.map(r =>
    `<tr>${r.map(c => `<td>${renderInline(c)}</td>`).join('')}</tr>`
  ).join('');

  return `<div class="datatable-block" id="${id}-wrap">
    ${caption ? `<div class="datatable-caption">${renderInline(caption)}</div>` : ''}
    ${filterable ? `<div class="datatable-toolbar">
      <input type="text" class="datatable-filter" placeholder="Filter rows…"
        oninput="window.__dtFilter('${id}', this.value)">
      <span class="datatable-count" id="${id}-count">${dataRows.length} rows</span>
    </div>` : ''}
    <table class="wiki-table datatable" id="${id}">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>`;
}

// ─── CHART (NEW — rendered as SVG) ─────────────────────────────
// :::chart type: bar caption: "GDP Growth"
// labels: 2020, 2021, 2022, 2023, 2024
// series: GDP | 1.2, 2.4, 3.1, 2.8, 3.4
// series: CPI | 2.1, 2.5, 4.2, 3.1, 2.4
// :::
function renderChart(tok) {
  const args    = parseInlineArgs(tok.args);
  const type    = (args.type    || 'bar').toLowerCase();
  const caption = args.caption || '';

  let labels = [];
  const series = [];
  tok.body.split('\n').forEach(line => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^(labels|series):\s*(.+)$/i);
    if (!m) return;
    if (m[1].toLowerCase() === 'labels') {
      labels = m[2].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    } else {
      // "series: NAME | val,val,val"
      const parts = m[2].split('|');
      const name = parts[0].trim();
      const vals = (parts[1] || '').split(/\s*,\s*/).map(s => parseFloat(s)).filter(v => !isNaN(v));
      if (name && vals.length) series.push({ name, vals });
    }
  });

  if (series.length === 0) {
    return `<div class="notice-box">A <code>:::chart</code> needs at least one <code>series:</code> line.</div>`;
  }

  const svg = renderChartSvg({ type, labels, series });
  return `<figure class="chart-block">
    ${svg}
    ${caption ? `<figcaption class="chart-caption">${renderInline(caption)}</figcaption>` : ''}
  </figure>`;
}

// Shared chart renderer used by :::chart block AND the Stats Tool.
// Exposed for reuse; no DOM, just returns an SVG string.
export function renderChartSvg({ type, labels, series, width = 700, height = 360 }) {
  const PALETTE = ['#1a3a8f', '#b8891a', '#2d7a4f', '#8b2e2e', '#4a3a8f', '#2a7a8f', '#7a2a6a', '#3a6a2a'];
  const M = { top: 24, right: 16, bottom: 50, left: 50 };
  const W = width, H = height;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  if (type === 'pie' || type === 'donut') {
    return renderPieSvg({ labels, series, W, H, donut: type === 'donut', PALETTE });
  }

  // Bar / line / stacked share most plumbing
  const allVals = type === 'stacked'
    ? labels.map((_, i) => series.reduce((s, sr) => s + (sr.vals[i] || 0), 0))
    : series.flatMap(s => s.vals);
  const maxVal = Math.max(0, ...allVals);
  const minVal = Math.min(0, ...allVals);
  const range  = (maxVal - minVal) || 1;
  const yScale = v => M.top + innerH - ((v - minVal) / range) * innerH;
  const yZero  = yScale(0);
  const xCount = labels.length || (series[0]?.vals.length || 0);
  const xStep  = innerW / Math.max(1, xCount);

  // Y axis ticks (5 lines)
  let gridSvg = '';
  for (let i = 0; i <= 5; i++) {
    const v = minVal + (range * i / 5);
    const y = yScale(v);
    gridSvg += `<line x1="${M.left}" y1="${y}" x2="${M.left + innerW}" y2="${y}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
    gridSvg += `<text x="${M.left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#5a5a5a">${formatTick(v)}</text>`;
  }

  // X axis labels
  let xSvg = '';
  for (let i = 0; i < xCount; i++) {
    const x = M.left + xStep * (i + 0.5);
    const lbl = labels[i] || '';
    xSvg += `<text x="${x}" y="${M.top + innerH + 16}" text-anchor="middle" font-size="11" fill="#3a3a3a">${escapeHtml(String(lbl))}</text>`;
  }

  let plotSvg = '';
  if (type === 'bar') {
    const groupW = xStep * 0.85;
    const barW = groupW / series.length;
    series.forEach((s, sIdx) => {
      s.vals.forEach((v, i) => {
        const cx = M.left + xStep * i + (xStep - groupW) / 2 + barW * sIdx;
        const y = v >= 0 ? yScale(v) : yZero;
        const h = Math.abs(yScale(v) - yZero);
        const color = PALETTE[sIdx % PALETTE.length];
        plotSvg += `<rect x="${cx}" y="${y}" width="${barW - 2}" height="${h}" fill="${color}" rx="1.5">
          <title>${escapeHtml(s.name)}: ${escapeHtml(String(v))}</title></rect>`;
      });
    });
  } else if (type === 'hbar') {
    // Horizontal bar — only single series for simplicity; use first series
    const s = series[0];
    const yStep = innerH / Math.max(1, s.vals.length);
    s.vals.forEach((v, i) => {
      const y = M.top + yStep * i + 4;
      const x = M.left;
      const w = (v - minVal) / range * innerW;
      plotSvg += `<rect x="${x}" y="${y}" width="${w}" height="${yStep - 8}" fill="${PALETTE[0]}" rx="1.5">
        <title>${escapeHtml(labels[i] || '')}: ${escapeHtml(String(v))}</title></rect>`;
      plotSvg += `<text x="${x + w + 6}" y="${y + (yStep - 8) / 2 + 4}" font-size="11" fill="#3a3a3a">${escapeHtml(String(v))}</text>`;
    });
    // Replace x labels with y labels for hbar
    xSvg = '';
    s.vals.forEach((_, i) => {
      const y = M.top + yStep * i + yStep / 2;
      xSvg += `<text x="${M.left - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#3a3a3a">${escapeHtml(labels[i] || '')}</text>`;
    });
    // Remove yticks for cleaner look
    gridSvg = `<line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${M.top + innerH}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`;
  } else if (type === 'line') {
    series.forEach((s, sIdx) => {
      const color = PALETTE[sIdx % PALETTE.length];
      const points = s.vals.map((v, i) => `${M.left + xStep * (i + 0.5)},${yScale(v)}`).join(' ');
      plotSvg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.vals.forEach((v, i) => {
        plotSvg += `<circle cx="${M.left + xStep * (i + 0.5)}" cy="${yScale(v)}" r="3" fill="${color}">
          <title>${escapeHtml(s.name)}: ${escapeHtml(String(v))}</title></circle>`;
      });
    });
  } else if (type === 'stacked') {
    const cumulative = labels.map(() => 0);
    series.forEach((s, sIdx) => {
      const color = PALETTE[sIdx % PALETTE.length];
      s.vals.forEach((v, i) => {
        const baseY = yScale(cumulative[i]);
        const topY  = yScale(cumulative[i] + v);
        const x = M.left + xStep * i + xStep * 0.075;
        const w = xStep * 0.85;
        plotSvg += `<rect x="${x}" y="${topY}" width="${w}" height="${baseY - topY}" fill="${color}">
          <title>${escapeHtml(s.name)}: ${escapeHtml(String(v))}</title></rect>`;
        cumulative[i] += v;
      });
    });
  }

  // Legend
  let legendSvg = '';
  if (type !== 'hbar' && series.length > 0) {
    const legendY = 6;
    let lx = M.left;
    series.forEach((s, i) => {
      const color = PALETTE[i % PALETTE.length];
      legendSvg += `<rect x="${lx}" y="${legendY}" width="10" height="10" fill="${color}"/>`;
      legendSvg += `<text x="${lx + 14}" y="${legendY + 9}" font-size="11" fill="#2a2a2a">${escapeHtml(s.name)}</text>`;
      lx += 14 + 7 * s.name.length + 16;
    });
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg" style="width:100%;height:auto;font-family:'Source Sans 3',sans-serif;background:transparent;">
    ${legendSvg}
    ${gridSvg}
    ${plotSvg}
    ${xSvg}
    <line x1="${M.left}" y1="${M.top + innerH}" x2="${M.left + innerW}" y2="${M.top + innerH}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    <line x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${M.top + innerH}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  </svg>`;
}

function renderPieSvg({ labels, series, W, H, donut, PALETTE }) {
  // Use first series for pie
  const s = series[0];
  if (!s) return '';
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) / 2 - 24;
  const innerR = donut ? radius * 0.55 : 0;
  const total = s.vals.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  let slices = '';
  let legend = '';
  s.vals.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2;
    const a2 = angle + slice;
    const large = slice > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(angle) * radius, y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(a2)    * radius, y2 = cy + Math.sin(a2)    * radius;
    const color = PALETTE[i % PALETTE.length];
    let path;
    if (donut) {
      const ix1 = cx + Math.cos(angle) * innerR, iy1 = cy + Math.sin(angle) * innerR;
      const ix2 = cx + Math.cos(a2)    * innerR, iy2 = cy + Math.sin(a2)    * innerR;
      path = `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix2.toFixed(2)},${iy2.toFixed(2)} A${innerR},${innerR} 0 ${large} 0 ${ix1.toFixed(2)},${iy1.toFixed(2)} Z`;
    } else {
      path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    }
    slices += `<path d="${path}" fill="${color}" stroke="white" stroke-width="1.5"><title>${escapeHtml(labels[i] || '')}: ${escapeHtml(String(v))} (${(v/total*100).toFixed(1)}%)</title></path>`;
    angle = a2;
    legend += `<g transform="translate(16,${24 + i * 18})">
      <rect width="11" height="11" fill="${color}"/>
      <text x="16" y="9" font-size="11" fill="#2a2a2a">${escapeHtml(labels[i] || '')} (${(v/total*100).toFixed(1)}%)</text>
    </g>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="chart-svg" style="width:100%;height:auto;font-family:'Source Sans 3',sans-serif;background:transparent;">
    ${slices}
    ${legend}
  </svg>`;
}

function formatTick(v) {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

// ─── GRAPH BLOCK (renders Graph Tool exports inline) ───────────
function renderGraphBlock(tok) {
  // Format produced by graph.js gExportMarkdown:
  //   nodes:
  //     1: Label|x,y|color|shape|group
  //   edges:
  //     1->2|label|style
  const nodes = [], edges = [];
  let mode = null;
  tok.body.split('\n').forEach(line => {
    const t = line.trim();
    if (!t) return;
    if (/^nodes:/i.test(t)) { mode = 'nodes'; return; }
    if (/^edges:/i.test(t)) { mode = 'edges'; return; }
    if (mode === 'nodes') {
      const m = t.match(/^(\d+):\s*([^|]+)\|([\d.\-]+),([\d.\-]+)\|([^|]*)\|([^|]*)\|?(.*)$/);
      if (m) nodes.push({ id: +m[1], label: m[2].trim(), x: +m[3], y: +m[4],
                          color: m[5].trim() || '#1a3a8f', shape: m[6].trim() || 'rounded',
                          group: m[7].trim() });
    } else if (mode === 'edges') {
      const m = t.match(/^(\d+)->(\d+)(?:\|([^|]*))?(?:\|([^|]*))?$/);
      if (m) edges.push({ from: +m[1], to: +m[2], label: (m[3] || '').trim(),
                          style: (m[4] || 'solid').trim() });
    }
  });
  if (nodes.length === 0) return '';

  // Compute bbox
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - 80, maxX = Math.max(...xs) + 80;
  const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 50;

  let svg = `<svg viewBox="${minX} ${minY} ${maxX-minX} ${maxY-minY}" xmlns="http://www.w3.org/2000/svg" class="graph-svg" style="width:100%;height:auto;font-family:'Source Sans 3',sans-serif;background:transparent;">`;
  svg += `<defs><marker id="ga" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#5a5a5a"/></marker></defs>`;
  for (const e of edges) {
    const f = nodes.find(n => n.id === e.from), t = nodes.find(n => n.id === e.to);
    if (!f || !t) continue;
    const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy) || 1;
    const x1 = f.x + (dx/d)*50, y1 = f.y + (dy/d)*50;
    const x2 = t.x - (dx/d)*60, y2 = t.y - (dy/d)*60;
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6,4"' : e.style === 'dotted' ? ' stroke-dasharray="2,4"' : '';
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#5a5a5a" stroke-width="1.5"${dash} marker-end="url(#ga)"/>`;
    if (e.label) svg += `<text x="${((x1+x2)/2).toFixed(1)}" y="${((y1+y2)/2 - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="#5a5a5a">${escapeHtml(e.label)}</text>`;
  }
  for (const n of nodes) {
    if (n.shape === 'circle') {
      svg += `<circle cx="${n.x}" cy="${n.y}" r="44" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else if (n.shape === 'diamond') {
      svg += `<polygon points="${n.x},${n.y-40} ${n.x+68},${n.y} ${n.x},${n.y+40} ${n.x-68},${n.y}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else {
      const rx = n.shape === 'rounded' ? 8 : 2;
      svg += `<rect x="${n.x-60}" y="${n.y-20}" width="120" height="40" rx="${rx}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    }
    const fs = n.label.length > 16 ? 10 : n.label.length > 10 ? 11 : 12;
    svg += `<text x="${n.x}" y="${n.y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="white" font-weight="600">${escapeHtml(n.label)}</text>`;
    if (n.group) svg += `<text x="${n.x}" y="${n.y+32}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${escapeHtml(n.group)}</text>`;
  }
  svg += `</svg>`;
  return `<div class="graph-rendered-block">${svg}</div>`;
}

// ─── PIPE TABLE → HTML ─────────────────────────────────────────
function renderPipeTable(text, klass = 'wiki-table') {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => l.startsWith('|'))
    .filter(l => !l.match(/^\|[-| :]+\|$/));
  if (lines.length === 0) return '';
  return `<table class="${klass}">` + lines.map((r, i) => {
    const cells = r.split('|').slice(1, -1).map(c => c.trim());
    const tag = i === 0 ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag}>${renderInline(c)}</${tag}>`).join('')}</tr>`;
  }).join('') + '</table>';
}

// ─── MARKDOWN PROSE RENDERER ───────────────────────────────────
export function renderMarkdownBlock(md) {
  let html = md;

  // Inline pipe tables (legacy)
  html = html.replace(/(\|.+\|\n)+/g, tableBlock => renderPipeTable(tableBlock));

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
    if (line.match(/^<(h[1-6]|ul|ol|table|blockquote|div|hr|figure|aside|section|p|svg|!)/)) {
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
      onclick="window.__openLightbox && window.__openLightbox('${resolved}','${escapeAttr(alt)}')">`;
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
    return `<a class="${cls}" onclick="window.__navigate && window.__navigate('article','${slug}')" title="${escapeAttr(titleAttr)}" style="cursor:pointer;">${escapeHtml(label)}</a>`;
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
    `<li><a href="#/article/${slug}#${m[1]}" data-toc-target="${m[1]}">${m[2]}</a></li>`
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

// ─── DATATABLE INTERACTIONS (exposed globally) ─────────────────
export function dtSort(id, col) {
  const tbl = document.getElementById(id);
  if (!tbl) return;
  const tbody = tbl.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const cur = tbl.dataset.sortCol === String(col) ? tbl.dataset.sortDir : 'none';
  const dir = cur === 'asc' ? 'desc' : 'asc';
  tbl.dataset.sortCol = String(col);
  tbl.dataset.sortDir = dir;

  rows.sort((a, b) => {
    const av = a.children[col]?.textContent.trim() || '';
    const bv = b.children[col]?.textContent.trim() || '';
    const an = parseFloat(av.replace(/[, ]/g, '')), bn = parseFloat(bv.replace(/[, ]/g, ''));
    let cmp;
    if (!isNaN(an) && !isNaN(bn)) cmp = an - bn;
    else cmp = av.localeCompare(bv, undefined, { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
  rows.forEach(r => tbody.appendChild(r));
  // Indicators
  tbl.querySelectorAll('th .dt-sort-indicator').forEach(s => s.textContent = '');
  const ind = tbl.querySelector(`th[data-col="${col}"] .dt-sort-indicator`);
  if (ind) ind.textContent = dir === 'asc' ? ' ▲' : ' ▼';
}

export function dtFilter(id, q) {
  const tbl = document.getElementById(id);
  if (!tbl) return;
  const ql = q.toLowerCase();
  const rows = tbl.querySelectorAll('tbody tr');
  let visible = 0;
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    const match = !ql || text.includes(ql);
    r.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const count = document.getElementById(`${id}-count`);
  if (count) count.textContent = `${visible} row${visible === 1 ? '' : 's'}`;
}
