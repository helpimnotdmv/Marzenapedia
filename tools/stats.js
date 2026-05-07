/* ═══════════════════════════════════════════════════════════════
   stats.js — Statistics & Data Visualisation Tool
   ═══════════════════════════════════════════════════════════════
   Builds bar / hbar / line / stacked / pie / donut charts from
   either a manual spreadsheet-style grid or pasted CSV. Exports
   to PNG, JPG, SVG, or :::chart Markdown block.
   ═══════════════════════════════════════════════════════════════ */

import { renderChartSvg, escapeHtml } from '../renderer.js';

const S = {
  type:    'bar',                      // bar | hbar | line | stacked | pie | donut
  caption: 'Chart caption',
  // Grid: first row is series-name header (col 0 is "Label"); each row is a label then values
  grid: [
    ['Year',  'GDP growth', 'Inflation'],
    ['2020',  '1.2',        '2.1'],
    ['2021',  '2.4',        '2.5'],
    ['2022',  '3.1',        '4.2'],
    ['2023',  '2.8',        '3.1'],
    ['2024',  '3.4',        '2.4'],
  ],
};

export function showStats() {
  document.getElementById('main-content').innerHTML = buildStatsUI();
  document.title = 'Stats Tool — Marzenapedia';
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.innerHTML = `<a onclick="window.__navigate('home')">Main Page</a><span class="sep">·</span>Stats Tool`;
  const pt = document.getElementById('page-tabs');
  if (pt) pt.style.display = 'none';
  renderGrid();
  renderChart();
  bindHotkeys();
}

function buildStatsUI() {
  return `
<div class="stats-page">
  <div class="stats-toolbar">
    <div class="stats-toolbar-left">
      <span class="stats-tool-label">Stats Tool</span>
      <div class="stats-tool-group">
        <label>Chart type</label>
        <select id="stats-type" onchange="window.__sSetType(this.value)">
          <option value="bar">Bar (vertical)</option>
          <option value="hbar">Bar (horizontal)</option>
          <option value="line">Line</option>
          <option value="stacked">Stacked bar</option>
          <option value="pie">Pie</option>
          <option value="donut">Donut</option>
        </select>
      </div>
      <div class="stats-tool-group">
        <label>Caption</label>
        <input type="text" id="stats-caption" value="Chart caption" oninput="window.__sSetCaption(this.value)">
      </div>
    </div>
    <div class="stats-toolbar-right">
      <button class="graph-btn graph-btn-primary" onclick="window.__sExportPNG()">Export PNG</button>
      <button class="graph-btn" onclick="window.__sExportJPG()">Export JPG</button>
      <button class="graph-btn" onclick="window.__sExportSVG()">Export SVG</button>
      <button class="graph-btn" onclick="window.__sExportMarkdown()">Export Markdown</button>
    </div>
  </div>

  <div class="stats-workspace">
    <!-- Left: Data input -->
    <div class="stats-data-pane">
      <div class="stats-data-header">
        <h3>Data</h3>
        <div style="display:flex;gap:6px;">
          <button class="btn" onclick="window.__sAddRow()">+ Row</button>
          <button class="btn" onclick="window.__sAddCol()">+ Column</button>
          <button class="btn" onclick="window.__sClearGrid()">Clear</button>
        </div>
      </div>
      <div class="stats-grid-wrap" id="stats-grid-wrap"></div>
      <div class="stats-csv-wrap">
        <details>
          <summary>Paste CSV instead</summary>
          <p style="font-size:12px;color:var(--muted);margin:8px 0;font-family:'Crimson Pro',serif;font-style:italic;">
            First row is the header (first column = labels, remaining columns = series names). Subsequent rows are data.
          </p>
          <textarea id="stats-csv" placeholder="Year,GDP growth,Inflation
2020,1.2,2.1
2021,2.4,2.5"></textarea>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button class="btn btn-primary" onclick="window.__sImportCSV()">Import CSV</button>
            <button class="btn" onclick="window.__sExportCSV()">Copy as CSV</button>
          </div>
        </details>
      </div>
    </div>

    <!-- Right: Live chart preview -->
    <div class="stats-preview-pane">
      <h3>Preview</h3>
      <div class="stats-chart-wrap" id="stats-chart-wrap"></div>
      <p class="stats-chart-tip">Tip: edit any cell to update the chart live. Switch chart types instantly.</p>
    </div>
  </div>

  <!-- Markdown export modal -->
  <div id="stats-export-overlay" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('visible')">
    <div class="modal" style="max-width:580px;">
      <div class="modal-header">
        <span>Export as Markdown</span>
        <button onclick="document.getElementById('stats-export-overlay').classList.remove('visible')">×</button>
      </div>
      <div class="modal-body">
        <p style="font-family:'Crimson Pro',serif;font-size:14px;margin-bottom:12px;">
          Paste this into any article. The <code>:::chart</code> block renders inline.
        </p>
        <textarea id="stats-export-text" style="width:100%;height:240px;font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--paper-warm);border:1px solid var(--border);padding:10px;color:var(--text);border-radius:2px;" readonly></textarea>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="window.__sCopyExport()">Copy to Clipboard</button>
          <button class="btn" onclick="document.getElementById('stats-export-overlay').classList.remove('visible')">Close</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// ─── GRID RENDERING ────────────────────────────────────────────
function renderGrid() {
  const wrap = document.getElementById('stats-grid-wrap');
  if (!wrap) return;
  const rows = S.grid.length, cols = S.grid[0]?.length || 0;
  let html = '<table class="stats-grid"><thead><tr>';
  for (let c = 0; c < cols; c++) {
    html += `<th class="${c === 0 ? 'stats-grid-corner' : ''}">
      <input type="text" value="${escapeHtml(S.grid[0][c] || '')}"
        oninput="window.__sUpdateCell(0,${c},this.value)" data-r="0" data-c="${c}">
      ${c > 0 ? `<button class="stats-col-x" onclick="window.__sRemoveCol(${c})" title="Remove column">×</button>` : ''}
    </th>`;
  }
  html += `<th style="width:36px;"></th></tr></thead><tbody>`;
  for (let r = 1; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td><input type="${c === 0 ? 'text' : 'number'}"
        value="${escapeHtml(S.grid[r][c] || '')}"
        oninput="window.__sUpdateCell(${r},${c},this.value)" data-r="${r}" data-c="${c}"></td>`;
    }
    html += `<td><button class="stats-row-x" onclick="window.__sRemoveRow(${r})" title="Remove row">×</button></td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ─── CHART RENDERING ───────────────────────────────────────────
function gridToChartData() {
  const labels = [];
  const series = [];
  if (S.grid.length < 2 || (S.grid[0]?.length || 0) < 2) return { labels, series };
  const seriesNames = S.grid[0].slice(1);
  seriesNames.forEach(name => series.push({ name: name || '', vals: [] }));
  for (let r = 1; r < S.grid.length; r++) {
    labels.push(S.grid[r][0] || '');
    for (let c = 1; c < S.grid[r].length; c++) {
      const v = parseFloat(S.grid[r][c]);
      series[c - 1].vals.push(isNaN(v) ? 0 : v);
    }
  }
  return { labels, series };
}

function renderChart() {
  const wrap = document.getElementById('stats-chart-wrap');
  if (!wrap) return;
  const { labels, series } = gridToChartData();
  if (series.length === 0 || series.every(s => s.vals.every(v => v === 0))) {
    wrap.innerHTML = '<div class="stats-chart-empty">Enter some data on the left to see a chart.</div>';
    return;
  }
  const svg = renderChartSvg({ type: S.type, labels, series, width: 700, height: 380 });
  wrap.innerHTML = `<div class="stats-chart-svg">${svg}</div>
    ${S.caption ? `<div class="stats-chart-caption">${escapeHtml(S.caption)}</div>` : ''}`;
}

// ─── EVENT HANDLERS ────────────────────────────────────────────
function sSetType(t)        { S.type = t; renderChart(); }
function sSetCaption(c)     { S.caption = c; renderChart(); }
function sUpdateCell(r,c,v) { S.grid[r][c] = v; renderChart(); }

function sAddRow() {
  const cols = S.grid[0]?.length || 1;
  const newRow = new Array(cols).fill('');
  newRow[0] = `Row ${S.grid.length}`;
  S.grid.push(newRow);
  renderGrid(); renderChart();
}
function sAddCol() {
  S.grid[0].push(`Series ${S.grid[0].length}`);
  for (let r = 1; r < S.grid.length; r++) S.grid[r].push('0');
  renderGrid(); renderChart();
}
function sRemoveRow(r) {
  if (S.grid.length <= 2) return alert('Need at least one data row.');
  S.grid.splice(r, 1);
  renderGrid(); renderChart();
}
function sRemoveCol(c) {
  if ((S.grid[0]?.length || 0) <= 2) return alert('Need at least one data column.');
  S.grid.forEach(row => row.splice(c, 1));
  renderGrid(); renderChart();
}
function sClearGrid() {
  if (!confirm('Clear all data and reset to a blank 2×2 grid?')) return;
  S.grid = [['Label', 'Series 1'], ['', '']];
  renderGrid(); renderChart();
}

// ─── CSV ───────────────────────────────────────────────────────
function sImportCSV() {
  const text = document.getElementById('stats-csv').value.trim();
  if (!text) return;
  const rows = parseCSV(text);
  if (rows.length < 2) return alert('CSV needs at least a header row and one data row.');
  S.grid = rows;
  renderGrid(); renderChart();
}
function sExportCSV() {
  const text = S.grid.map(r => r.map(csvEscape).join(',')).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.stats-csv-wrap button');
    // Find the right button — last one in the row is "Copy as CSV"
  }).catch(() => {});
  const ta = document.getElementById('stats-csv');
  if (ta) ta.value = text;
  alert('CSV copied to the Paste box (and clipboard if allowed).');
}

function parseCSV(text) {
  // Minimal CSV parser supporting quoted fields with commas
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // Normalise to equal column count
  const maxCols = Math.max(...rows.map(r => r.length));
  return rows.map(r => {
    while (r.length < maxCols) r.push('');
    return r.map(s => s.trim());
  });
}
function csvEscape(s) {
  s = String(s ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── EXPORT IMAGE ──────────────────────────────────────────────
function buildExportSvg() {
  const { labels, series } = gridToChartData();
  // Generate larger version for export
  return renderChartSvg({ type: S.type, labels, series, width: 900, height: 500 });
}

function sExportSVG() {
  const svgRaw = wrapStandalone(buildExportSvg());
  const blob = new Blob([svgRaw], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'marzenapedia-chart.svg';
  a.click();
}

function wrapStandalone(svg) {
  // Stamp xmlns onto the inner SVG so it becomes a valid standalone file
  return svg.replace(/<svg([^>]*)>/, (_, attrs) =>
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs.replace(/xmlns="[^"]*"/g, '')}>`);
}

function sExportRaster(mime, ext, fillBg) {
  const svgRaw = wrapStandalone(buildExportSvg());
  const blob = new Blob([svgRaw], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const W = 900, H = 500;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width  = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    if (fillBg) { ctx.fillStyle = '#f9f7f3'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    canvas.toBlob(b => {
      const dl = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = dl; a.download = `marzenapedia-chart.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(dl), 1000);
    }, mime, 0.95);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('Image export failed.'); };
  img.src = url;
}

function sExportPNG() { sExportRaster('image/png',  'png', true); }
function sExportJPG() { sExportRaster('image/jpeg', 'jpg', true); }

// ─── EXPORT MARKDOWN BLOCK ─────────────────────────────────────
function sExportMarkdown() {
  const { labels, series } = gridToChartData();
  const lines = [
    `:::chart type: ${S.type} caption: "${S.caption.replace(/"/g, '\\"')}"`,
    `labels: ${labels.join(', ')}`,
    ...series.map(s => `series: ${s.name} | ${s.vals.join(', ')}`),
    `:::`,
  ];
  document.getElementById('stats-export-text').value = lines.join('\n');
  document.getElementById('stats-export-overlay').classList.add('visible');
}

async function sCopyExport() {
  const t = document.getElementById('stats-export-text').value;
  try {
    await navigator.clipboard.writeText(t);
    const btn = document.querySelector('#stats-export-overlay .btn-primary');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Copy to Clipboard', 2000); }
  } catch {
    document.getElementById('stats-export-text').select();
  }
}

// ─── HOTKEYS ───────────────────────────────────────────────────
function bindHotkeys() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      document.getElementById('stats-export-overlay')?.classList.remove('visible');
    }
  });
}

// ─── EXPOSE ────────────────────────────────────────────────────
export function exposeStatsGlobals() {
  window.__sSetType        = sSetType;
  window.__sSetCaption     = sSetCaption;
  window.__sUpdateCell     = sUpdateCell;
  window.__sAddRow         = sAddRow;
  window.__sAddCol         = sAddCol;
  window.__sRemoveRow      = sRemoveRow;
  window.__sRemoveCol      = sRemoveCol;
  window.__sClearGrid      = sClearGrid;
  window.__sImportCSV      = sImportCSV;
  window.__sExportCSV      = sExportCSV;
  window.__sExportSVG      = sExportSVG;
  window.__sExportPNG      = sExportPNG;
  window.__sExportJPG      = sExportJPG;
  window.__sExportMarkdown = sExportMarkdown;
  window.__sCopyExport     = sCopyExport;
}
