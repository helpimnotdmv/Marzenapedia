/* ═══════════════════════════════════════════════════════════════
   graph.js — Visual graph / org-chart creation tool
   Renders inside #main-content. No external dependencies —
   uses an SVG canvas with drag-and-drop nodes.
   ═══════════════════════════════════════════════════════════════ */

import { escapeHtml, escapeAttr } from './renderer.js';

// ─── STATE ─────────────────────────────────────────────────────
const G = {
  nodes: [],        // { id, label, x, y, color, shape, group }
  edges: [],        // { id, from, to, label, style }
  selected: null,   // node id
  edgeFrom: null,   // node id awaiting second click for edge
  dragging: null,   // { id, ox, oy }
  nextId: 1,
  mode: 'select',   // select | addNode | addEdge | pan
  panOffset: { x: 0, y: 0 },
  panStart: null,
  zoom: 1,
};

const NODE_COLORS = [
  '#1a3a8f', '#b8891a', '#2d7a4f', '#8b2e2e',
  '#4a3a8f', '#2a7a8f', '#7a2a6a', '#3a6a2a',
];
const NODE_SHAPES = ['rect', 'rounded', 'diamond', 'circle'];

// ─── ENTRY POINT ───────────────────────────────────────────────
export function showGraph() {
  document.getElementById('main-content').innerHTML = buildGraphUI();
  document.title = 'Graph Tool — Marzenapedia';
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="window.__navigate('home')">Main Page</a><span class="sep">·</span>Graph Tool`;
  document.getElementById('page-tabs').style.display = 'none';

  // Reset state for fresh session (preserve if user navigates away and back)
  if (G.nodes.length === 0) seedExample();

  bindGraphEvents();
  renderGraph();
}

// ─── SEED EXAMPLE ──────────────────────────────────────────────
function seedExample() {
  G.nodes = [
    { id: 1, label: 'President', x: 380, y: 80,  color: '#1a3a8f', shape: 'rounded', group: 'Executive' },
    { id: 2, label: 'Prime Minister', x: 220, y: 200, color: '#1a3a8f', shape: 'rounded', group: 'Executive' },
    { id: 3, label: 'National Assembly', x: 540, y: 200, color: '#2d7a4f', shape: 'rect', group: 'Legislature' },
    { id: 4, label: 'Cabinet', x: 120, y: 320, color: '#1a3a8f', shape: 'rounded', group: 'Executive' },
    { id: 5, label: 'Senate', x: 660, y: 320, color: '#2d7a4f', shape: 'rect', group: 'Legislature' },
    { id: 6, label: 'Supreme Court', x: 380, y: 340, color: '#8b2e2e', shape: 'rounded', group: 'Judiciary' },
  ];
  G.edges = [
    { id: 1, from: 1, to: 2, label: 'appoints', style: 'solid' },
    { id: 2, from: 1, to: 3, label: '', style: 'dashed' },
    { id: 3, from: 2, to: 4, label: 'leads', style: 'solid' },
    { id: 4, from: 3, to: 5, label: '', style: 'solid' },
    { id: 5, from: 1, to: 6, label: 'nominates', style: 'dashed' },
  ];
  G.nextId = 7;
}

// ─── UI SCAFFOLD ───────────────────────────────────────────────
function buildGraphUI() {
  return `
<div class="graph-page">
  <div class="graph-toolbar">
    <div class="graph-toolbar-left">
      <span class="graph-tool-label">Graph Tool</span>
      <div class="graph-tool-group">
        <button class="graph-btn active" id="gtool-select" onclick="window.__gSetMode('select')" title="Select / Move (V)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 1-3 7z"/></svg>
          Select
        </button>
        <button class="graph-btn" id="gtool-addNode" onclick="window.__gSetMode('addNode')" title="Add node (N)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Add Node
        </button>
        <button class="graph-btn" id="gtool-addEdge" onclick="window.__gSetMode('addEdge')" title="Add edge (E)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></svg>
          Add Edge
        </button>
      </div>
      <div class="graph-tool-group">
        <button class="graph-btn" onclick="window.__gDeleteSelected()" title="Delete selected (Del)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete
        </button>
        <button class="graph-btn" onclick="window.__gClear()" title="Clear all">Clear</button>
        <button class="graph-btn" onclick="window.__gSeedExample()" title="Load example">Example</button>
      </div>
      <div class="graph-tool-group">
        <button class="graph-btn" onclick="window.__gZoom(1.2)">+</button>
        <button class="graph-btn" onclick="window.__gZoom(0.83)">−</button>
        <button class="graph-btn" onclick="window.__gResetView()">Fit</button>
      </div>
    </div>
    <div class="graph-toolbar-right">
      <button class="graph-btn graph-btn-primary" onclick="window.__gExportSVG()">Export SVG</button>
      <button class="graph-btn" onclick="window.__gExportMarkdown()">Export Markdown</button>
    </div>
  </div>

  <div class="graph-workspace">
    <!-- LEFT: Canvas -->
    <div class="graph-canvas-wrap" id="graph-canvas-wrap">
      <svg id="graph-svg" width="100%" height="100%"
        onclick="window.__gCanvasClick(event)"
        onmousedown="window.__gCanvasMousedown(event)"
        onmousemove="window.__gCanvasMousemove(event)"
        onmouseup="window.__gCanvasMouseup(event)"
        onwheel="window.__gWheel(event)"
        style="cursor:default;">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--muted)"/>
          </marker>
          <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--gold)"/>
          </marker>
        </defs>
        <g id="graph-root"></g>
      </svg>
      <div class="graph-canvas-hint" id="graph-canvas-hint">
        Click canvas to add a node
      </div>
    </div>

    <!-- RIGHT: Inspector -->
    <aside class="graph-inspector" id="graph-inspector">
      <div class="graph-inspector-empty" id="graph-inspector-empty">
        <p>Select a node or edge to edit its properties.</p>
        <p style="margin-top:10px;font-size:12px;">
          <strong>V</strong> Select &nbsp;·&nbsp;
          <strong>N</strong> Add node &nbsp;·&nbsp;
          <strong>E</strong> Add edge &nbsp;·&nbsp;
          <strong>Del</strong> Delete
        </p>
      </div>
      <div id="graph-inspector-node" style="display:none;">
        <div class="graph-inspector-section">Node</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-label" type="text" oninput="window.__gUpdateNode('label',this.value)">
        <label class="graph-inspector-label">Group / Category</label>
        <input class="graph-inspector-input" id="gi-group" type="text" placeholder="e.g. Executive" oninput="window.__gUpdateNode('group',this.value)">
        <label class="graph-inspector-label">Shape</label>
        <select class="graph-inspector-input" id="gi-shape" onchange="window.__gUpdateNode('shape',this.value)">
          <option value="rounded">Rounded rect</option>
          <option value="rect">Rectangle</option>
          <option value="diamond">Diamond</option>
          <option value="circle">Circle</option>
        </select>
        <label class="graph-inspector-label">Color</label>
        <div class="graph-color-swatches" id="gi-colors">
          ${NODE_COLORS.map(c => `<div class="graph-color-swatch" style="background:${c}" onclick="window.__gUpdateNode('color','${c}')"></div>`).join('')}
        </div>
        <input class="graph-inspector-input" id="gi-color-custom" type="color" oninput="window.__gUpdateNode('color',this.value)" style="margin-top:8px;width:100%;height:32px;padding:2px;border:1px solid var(--border);border-radius:2px;cursor:pointer;">
      </div>
      <div id="graph-inspector-edge" style="display:none;">
        <div class="graph-inspector-section">Edge</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-edge-label" type="text" placeholder="e.g. appoints" oninput="window.__gUpdateEdge('label',this.value)">
        <label class="graph-inspector-label">Style</label>
        <select class="graph-inspector-input" id="gi-edge-style" onchange="window.__gUpdateEdge('style',this.value)">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
    </aside>
  </div>

  <!-- Mode status bar -->
  <div class="graph-statusbar">
    <span id="graph-status">Mode: <strong>Select</strong> — click a node to select, drag to move</span>
    <span id="graph-stats" style="margin-left:auto;color:var(--muted-soft);font-size:11px;"></span>
  </div>
</div>

<!-- Export Markdown modal -->
<div id="graph-export-overlay" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('visible')">
  <div class="modal" style="max-width:560px;">
    <div class="modal-header">
      <span>Export as Markdown</span>
      <button onclick="document.getElementById('graph-export-overlay').classList.remove('visible')">×</button>
    </div>
    <div class="modal-body">
      <p style="font-family:'Crimson Pro',serif;font-size:14px;margin-bottom:12px;">
        Paste this into any Marzenapedia article. The <code>:::graph</code> block renders as an SVG diagram.
      </p>
      <textarea id="graph-export-text" style="width:100%;height:260px;font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--paper-warm);border:1px solid var(--border);padding:10px;color:var(--text);border-radius:2px;" readonly></textarea>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.__gCopyExport()">Copy to Clipboard</button>
        <button class="btn" onclick="document.getElementById('graph-export-overlay').classList.remove('visible')">Close</button>
      </div>
    </div>
  </div>
</div>`;
}

// ─── EVENT BINDING ─────────────────────────────────────────────
function bindGraphEvents() {
  document.addEventListener('keydown', gKeydown);
}

function gKeydown(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'v' || e.key === 'V') gSetMode('select');
  if (e.key === 'n' || e.key === 'N') gSetMode('addNode');
  if (e.key === 'e' || e.key === 'E') gSetMode('addEdge');
  if (e.key === 'Delete' || e.key === 'Backspace') gDeleteSelected();
  if (e.key === 'Escape') { G.selected = null; G.edgeFrom = null; renderGraph(); }
}

// ─── MODE ──────────────────────────────────────────────────────
function gSetMode(mode) {
  G.mode = mode;
  G.edgeFrom = null;
  document.querySelectorAll('.graph-btn[id^="gtool-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`gtool-${mode}`);
  if (btn) btn.classList.add('active');
  const hint = document.getElementById('graph-canvas-hint');
  const svg = document.getElementById('graph-svg');
  if (mode === 'addNode') {
    hint.style.display = 'block';
    hint.textContent = 'Click on the canvas to place a node';
    svg.style.cursor = 'crosshair';
  } else if (mode === 'addEdge') {
    hint.style.display = 'block';
    hint.textContent = 'Click a source node, then a target node';
    svg.style.cursor = 'cell';
  } else {
    hint.style.display = 'none';
    svg.style.cursor = 'default';
  }
  updateStatus();
}

// ─── CANVAS EVENTS ─────────────────────────────────────────────
function gCanvasClick(e) {
  if (G.dragging) return;
  const { sx, sy } = svgXY(e);
  if (G.mode === 'addNode') {
    addNode(sx, sy);
  }
}

function gCanvasMousedown(e) {
  if (e.target === document.getElementById('graph-svg') ||
      e.target === document.getElementById('graph-root')) {
    if (G.mode === 'select') {
      G.panStart = { mx: e.clientX, my: e.clientY, ox: G.panOffset.x, oy: G.panOffset.y };
    }
    G.selected = null;
    G.edgeFrom = null;
    showInspector(null, null);
    renderGraph();
  }
}

function gCanvasMousemove(e) {
  if (G.dragging) {
    const node = G.nodes.find(n => n.id === G.dragging.id);
    if (!node) return;
    const { sx, sy } = svgXY(e);
    node.x = sx;
    node.y = sy;
    renderGraph();
  } else if (G.panStart) {
    const dx = (e.clientX - G.panStart.mx) / G.zoom;
    const dy = (e.clientY - G.panStart.my) / G.zoom;
    G.panOffset.x = G.panStart.ox + dx;
    G.panOffset.y = G.panStart.oy + dy;
    renderGraph();
  }
}

function gCanvasMouseup() {
  G.dragging = null;
  G.panStart = null;
}

function gWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * factor));
  renderGraph();
}

// ─── NODE INTERACTION ──────────────────────────────────────────
function nodeMousedown(e, id) {
  e.stopPropagation();
  if (G.mode === 'select') {
    G.dragging = { id };
    G.selected = id;
    G.edgeFrom = null;
    showInspector(id, null);
    renderGraph();
  } else if (G.mode === 'addEdge') {
    if (G.edgeFrom === null) {
      G.edgeFrom = id;
      G.selected = id;
      renderGraph();
      updateStatus('Now click the target node');
    } else if (G.edgeFrom !== id) {
      addEdge(G.edgeFrom, id);
      G.edgeFrom = null;
      G.selected = null;
    }
  }
}

// ─── CRUD ──────────────────────────────────────────────────────
function addNode(x, y) {
  const id = G.nextId++;
  G.nodes.push({
    id, label: `Node ${id}`, x, y,
    color: NODE_COLORS[(id - 1) % NODE_COLORS.length],
    shape: 'rounded', group: ''
  });
  G.selected = id;
  showInspector(id, null);
  renderGraph();
  // Focus label input
  setTimeout(() => { const el = document.getElementById('gi-label'); if (el) { el.focus(); el.select(); } }, 50);
}

function addEdge(from, to) {
  const id = G.nextId++;
  G.edges.push({ id, from, to, label: '', style: 'solid' });
  G.selected = `e${id}`;
  showInspector(null, id);
  renderGraph();
}

function gDeleteSelected() {
  if (!G.selected) return;
  if (typeof G.selected === 'string' && G.selected.startsWith('e')) {
    const eid = parseInt(G.selected.slice(1));
    G.edges = G.edges.filter(e => e.id !== eid);
  } else {
    G.edges = G.edges.filter(e => e.from !== G.selected && e.to !== G.selected);
    G.nodes = G.nodes.filter(n => n.id !== G.selected);
  }
  G.selected = null;
  showInspector(null, null);
  renderGraph();
}

function gClear() {
  if (!confirm('Clear all nodes and edges?')) return;
  G.nodes = []; G.edges = []; G.selected = null; G.nextId = 1;
  showInspector(null, null);
  renderGraph();
}

function gSeedExample() {
  G.nodes = []; G.edges = []; G.selected = null; G.nextId = 1;
  seedExample();
  showInspector(null, null);
  renderGraph();
}

// ─── INSPECTOR ─────────────────────────────────────────────────
function showInspector(nodeId, edgeId) {
  const empty   = document.getElementById('graph-inspector-empty');
  const nodeDiv = document.getElementById('graph-inspector-node');
  const edgeDiv = document.getElementById('graph-inspector-edge');
  if (!empty || !nodeDiv || !edgeDiv) return;

  if (nodeId) {
    const n = G.nodes.find(n => n.id === nodeId);
    if (!n) return;
    empty.style.display   = 'none';
    nodeDiv.style.display = 'block';
    edgeDiv.style.display = 'none';
    document.getElementById('gi-label').value = n.label;
    document.getElementById('gi-group').value = n.group || '';
    document.getElementById('gi-shape').value = n.shape || 'rounded';
    document.getElementById('gi-color-custom').value = n.color || '#1a3a8f';
    document.querySelectorAll('.graph-color-swatch').forEach(s =>
      s.classList.toggle('active', s.style.background === n.color)
    );
  } else if (edgeId) {
    const edge = G.edges.find(e => e.id === edgeId);
    if (!edge) return;
    empty.style.display   = 'none';
    nodeDiv.style.display = 'none';
    edgeDiv.style.display = 'block';
    document.getElementById('gi-edge-label').value = edge.label || '';
    document.getElementById('gi-edge-style').value = edge.style || 'solid';
  } else {
    empty.style.display   = 'block';
    nodeDiv.style.display = 'none';
    edgeDiv.style.display = 'none';
  }
}

function gUpdateNode(key, value) {
  if (!G.selected || typeof G.selected === 'string') return;
  const n = G.nodes.find(n => n.id === G.selected);
  if (!n) return;
  n[key] = value;
  renderGraph();
}

function gUpdateEdge(key, value) {
  if (!G.selected || typeof G.selected !== 'string') return;
  const eid = parseInt(G.selected.slice(1));
  const e = G.edges.find(e => e.id === eid);
  if (!e) return;
  e[key] = value;
  renderGraph();
}

// ─── RENDER ────────────────────────────────────────────────────
function renderGraph() {
  const root = document.getElementById('graph-root');
  if (!root) return;

  const tx = G.panOffset.x;
  const ty = G.panOffset.y;
  root.setAttribute('transform', `translate(${tx * G.zoom},${ty * G.zoom}) scale(${G.zoom})`);

  // Build SVG content
  let svg = '';

  // Edges
  for (const edge of G.edges) {
    svg += renderEdge(edge);
  }

  // Nodes
  for (const node of G.nodes) {
    svg += renderNode(node);
  }

  root.innerHTML = svg;

  // Rebind node events (SVG innerHTML wipes listeners)
  G.nodes.forEach(n => {
    const el = document.getElementById(`gnode-${n.id}`);
    if (!el) return;
    el.addEventListener('mousedown', e => nodeMousedown(e, n.id));
  });
  G.edges.forEach(edge => {
    const el = document.getElementById(`gedge-${edge.id}`);
    if (!el) return;
    el.addEventListener('click', e => {
      e.stopPropagation();
      G.selected = `e${edge.id}`;
      showInspector(null, edge.id);
      renderGraph();
    });
  });

  // Stats
  const stats = document.getElementById('graph-stats');
  if (stats) stats.textContent = `${G.nodes.length} nodes · ${G.edges.length} edges`;
}

function renderNode(n) {
  const sel = G.selected === n.id;
  const edgeSrc = G.edgeFrom === n.id;
  const stroke = sel ? 'var(--gold)' : edgeSrc ? '#5a9a5a' : 'rgba(255,255,255,0.25)';
  const sw = sel || edgeSrc ? 2.5 : 1.5;
  const W = 120, H = 40;

  let shape = '';
  if (n.shape === 'circle') {
    const r = 44;
    shape = `<circle cx="0" cy="0" r="${r}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}" style="cursor:move;"/>`;
  } else if (n.shape === 'diamond') {
    const hw = 68, hh = 40;
    shape = `<polygon points="0,${-hh} ${hw},0 0,${hh} ${-hw},0"
      fill="${n.color}" stroke="${stroke}" stroke-width="${sw}" style="cursor:move;"/>`;
  } else {
    const rx = n.shape === 'rounded' ? 8 : 2;
    shape = `<rect x="${-W/2}" y="${-H/2}" width="${W}" height="${H}" rx="${rx}"
      fill="${n.color}" stroke="${stroke}" stroke-width="${sw}" style="cursor:move;"/>`;
  }

  const fontSize = n.label.length > 16 ? 10 : n.label.length > 10 ? 11 : 12;
  const textY = n.shape === 'diamond' ? 5 : 1;

  return `<g id="gnode-${n.id}" transform="translate(${n.x},${n.y})" style="cursor:move;">
    ${shape}
    <text text-anchor="middle" dominant-baseline="middle" y="${textY}"
      font-size="${fontSize}" font-family="'Source Sans 3',sans-serif"
      fill="white" font-weight="600" pointer-events="none"
      style="user-select:none;">${escapeHtml(n.label)}</text>
    ${n.group ? `<text text-anchor="middle" dominant-baseline="middle" y="${H/2 + 14}"
      font-size="9" font-family="'Source Sans 3',sans-serif"
      fill="var(--muted)" pointer-events="none" style="user-select:none;">${escapeHtml(n.group)}</text>` : ''}
  </g>`;
}

function renderEdge(edge) {
  const from = G.nodes.find(n => n.id === edge.from);
  const to   = G.nodes.find(n => n.id === edge.to);
  if (!from || !to) return '';

  const sel = G.selected === `e${edge.id}`;
  const stroke = sel ? 'var(--gold)' : 'var(--muted)';
  const strokeW = sel ? 2.5 : 1.5;

  // Calculate edge endpoints (simple midpoint shortening)
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const margin = 50;
  const x1 = from.x + (dx / dist) * margin;
  const y1 = from.y + (dy / dist) * margin;
  const x2 = to.x   - (dx / dist) * (margin + 10);
  const y2 = to.y   - (dy / dist) * (margin + 10);

  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dashArr = edge.style === 'dashed' ? '6,4' : edge.style === 'dotted' ? '2,4' : 'none';
  const marker = sel ? 'url(#arrowhead-selected)' : 'url(#arrowhead)';

  return `<g id="gedge-${edge.id}" style="cursor:pointer;">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${stroke}" stroke-width="${strokeW}"
      stroke-dasharray="${dashArr}"
      marker-end="${marker}"/>
    <!-- Fat invisible hit area -->
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="transparent" stroke-width="12"/>
    ${edge.label ? `<text x="${mx}" y="${my - 7}" text-anchor="middle"
      font-size="10" font-family="'Source Sans 3',sans-serif"
      fill="var(--muted-soft)" style="user-select:none;">${escapeHtml(edge.label)}</text>` : ''}
  </g>`;
}

// ─── ZOOM / VIEW ───────────────────────────────────────────────
function gZoom(factor) {
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * factor));
  renderGraph();
}

function gResetView() {
  G.zoom = 1;
  G.panOffset = { x: 0, y: 0 };
  renderGraph();
}

// ─── EXPORT SVG ────────────────────────────────────────────────
function gExportSVG() {
  const svgEl = document.getElementById('graph-svg');
  if (!svgEl) return;

  // Build a clean SVG with light-theme colors hard-coded
  const W = 800, H = 500;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#f9f7f3;font-family:'Source Sans 3',sans-serif;">`;
  out += `<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#5a5a5a"/></marker></defs>`;

  // Edges
  for (const edge of G.edges) {
    const from = G.nodes.find(n => n.id === edge.from);
    const to   = G.nodes.find(n => n.id === edge.to);
    if (!from || !to) continue;
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const margin = 50;
    const x1 = from.x + (dx/dist)*margin;
    const y1 = from.y + (dy/dist)*margin;
    const x2 = to.x   - (dx/dist)*(margin+10);
    const y2 = to.y   - (dy/dist)*(margin+10);
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const dash = edge.style === 'dashed' ? ' stroke-dasharray="6,4"' : edge.style === 'dotted' ? ' stroke-dasharray="2,4"' : '';
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#5a5a5a" stroke-width="1.5"${dash} marker-end="url(#arrow)"/>`;
    if (edge.label) out += `<text x="${mx.toFixed(1)}" y="${(my-7).toFixed(1)}" text-anchor="middle" font-size="10" fill="#5a5a5a">${escapeHtml(edge.label)}</text>`;
  }
  // Nodes
  for (const n of G.nodes) {
    const W2 = 120, H2 = 40;
    if (n.shape === 'circle') {
      out += `<circle cx="${n.x}" cy="${n.y}" r="44" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else if (n.shape === 'diamond') {
      out += `<polygon points="${n.x},${n.y-40} ${n.x+68},${n.y} ${n.x},${n.y+40} ${n.x-68},${n.y}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else {
      const rx = n.shape === 'rounded' ? 8 : 2;
      out += `<rect x="${n.x-W2/2}" y="${n.y-H2/2}" width="${W2}" height="${H2}" rx="${rx}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    }
    const fs = n.label.length > 16 ? 10 : n.label.length > 10 ? 11 : 12;
    out += `<text x="${n.x}" y="${n.y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="white" font-weight="600">${escapeHtml(n.label)}</text>`;
    if (n.group) out += `<text x="${n.x}" y="${n.y+28}" text-anchor="middle" font-size="9" fill="#7a7a7a">${escapeHtml(n.group)}</text>`;
  }
  out += '</svg>';

  const blob = new Blob([out], { type: 'image/svg+xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'marzenapedia-graph.svg'; a.click();
}

// ─── EXPORT MARKDOWN ───────────────────────────────────────────
function gExportMarkdown() {
  const nodesStr = G.nodes.map(n =>
    `  ${n.id}: ${n.label}|${n.x.toFixed(0)},${n.y.toFixed(0)}|${n.color}|${n.shape}|${n.group || ''}`
  ).join('\n');
  const edgesStr = G.edges.map(e =>
    `  ${e.from}->${e.to}${e.label ? `|${e.label}` : ''}${e.style !== 'solid' ? `|${e.style}` : ''}`
  ).join('\n');

  const md = `:::graph\nnodes:\n${nodesStr}\nedges:\n${edgesStr}\n:::`;

  document.getElementById('graph-export-text').value = md;
  document.getElementById('graph-export-overlay').classList.add('visible');
}

async function gCopyExport() {
  const text = document.getElementById('graph-export-text').value;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.querySelector('#graph-export-overlay .btn-primary');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Copy to Clipboard', 2000); }
  } catch {
    document.getElementById('graph-export-text').select();
  }
}

// ─── HELPERS ───────────────────────────────────────────────────
function svgXY(e) {
  const svg = document.getElementById('graph-svg');
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const sx = (mx / G.zoom) - G.panOffset.x;
  const sy = (my / G.zoom) - G.panOffset.y;
  return { sx, sy };
}

function updateStatus(msg) {
  const el = document.getElementById('graph-status');
  if (!el) return;
  const labels = { select: 'Select — click to select, drag to move', addNode: 'Add Node — click canvas to place', addEdge: 'Add Edge — click source then target node' };
  el.innerHTML = `Mode: <strong>${G.mode === 'select' ? 'Select' : G.mode === 'addNode' ? 'Add Node' : 'Add Edge'}</strong> — ${msg || labels[G.mode] || ''}`;
}

// ─── EXPOSE GLOBALS ────────────────────────────────────────────
export function exposeGraphGlobals() {
  window.__gSetMode       = gSetMode;
  window.__gDeleteSelected = gDeleteSelected;
  window.__gClear         = gClear;
  window.__gSeedExample   = gSeedExample;
  window.__gZoom          = gZoom;
  window.__gResetView     = gResetView;
  window.__gExportSVG     = gExportSVG;
  window.__gExportMarkdown = gExportMarkdown;
  window.__gCopyExport    = gCopyExport;
  window.__gCanvasClick   = gCanvasClick;
  window.__gCanvasMousedown = gCanvasMousedown;
  window.__gCanvasMousemove = gCanvasMousemove;
  window.__gCanvasMouseup = gCanvasMouseup;
  window.__gWheel         = gWheel;
  window.__gUpdateNode    = gUpdateNode;
  window.__gUpdateEdge    = gUpdateEdge;
}
