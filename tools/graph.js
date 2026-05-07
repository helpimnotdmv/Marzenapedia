/* ═══════════════════════════════════════════════════════════════
   graph.js — Visual graph / org-chart creation tool (v2)
   ═══════════════════════════════════════════════════════════════
   v2 features:
     • Bidirectional / undirected edges
     • Edge weight (stroke width)
     • Edge routing: straight | curved | orthogonal
     • Per-edge waypoints (Shift+click on edge to add)
     • Area nodes — semi-transparent rectangles behind nodes
     • Areas freely resizable via 8 handles, draggable to move
     • Edge labels are draggable to any position
     • Export as SVG and PNG
   ═══════════════════════════════════════════════════════════════ */

import { escapeHtml } from './renderer.js';

// ─── STATE ─────────────────────────────────────────────────────
const G = {
  nodes: [],
  edges: [],
  selected: null,
  edgeFrom: null,
  dragging: null,
  resizeDir: null,
  nextId: 1,
  mode: 'select',
  panOffset: { x: 0, y: 0 },
  panStart: null,
  zoom: 1,
  defaultRouting: 'straight',
};

const NODE_COLORS = [
  '#1a3a8f', '#b8891a', '#2d7a4f', '#8b2e2e',
  '#4a3a8f', '#2a7a8f', '#7a2a6a', '#3a6a2a',
];
const AREA_COLORS = [
  'rgba(26,58,143,0.12)',
  'rgba(184,137,26,0.14)',
  'rgba(45,122,79,0.13)',
  'rgba(139,46,46,0.13)',
];

// ─── ENTRY POINT ───────────────────────────────────────────────
export function showGraph() {
  document.getElementById('main-content').innerHTML = buildGraphUI();
  document.title = 'Graph Tool — Marzenapedia';
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="window.__navigate('home')">Main Page</a><span class="sep">·</span>Graph Tool`;
  document.getElementById('page-tabs').style.display = 'none';
  if (G.nodes.length === 0) seedExample();
  bindGraphEvents();
  renderGraph();
}

function seedExample() {
  G.nodes = [
    { id: 1, kind: 'area', label: 'Government', x: 60,  y: 40,  w: 720, h: 320, color: AREA_COLORS[0] },
    { id: 2, kind: 'area', label: 'Executive',  x: 80,  y: 100, w: 320, h: 240, color: AREA_COLORS[1] },
    { id: 3, kind: 'area', label: 'Legislature',x: 440, y: 100, w: 320, h: 240, color: AREA_COLORS[2] },
    { id: 4, kind: 'node', label: 'President',         x: 240, y: 200, color: '#1a3a8f', shape: 'rounded', group: '' },
    { id: 5, kind: 'node', label: 'Prime Minister',    x: 240, y: 280, color: '#1a3a8f', shape: 'rounded', group: '' },
    { id: 6, kind: 'node', label: 'National Assembly', x: 600, y: 200, color: '#2d7a4f', shape: 'rect',    group: '' },
    { id: 7, kind: 'node', label: 'Senate',            x: 600, y: 280, color: '#2d7a4f', shape: 'rect',    group: '' },
    { id: 8, kind: 'node', label: 'Supreme Court',     x: 420, y: 420, color: '#8b2e2e', shape: 'rounded', group: 'Judiciary' },
  ];
  G.edges = [
    { id: 1, from: 4, to: 5, label: 'appoints', style: 'solid',  arrows: 'one',  weight: 1.5, routing: 'straight',   waypoints: [], labelOffset: { dx: 0, dy: -8 } },
    { id: 2, from: 4, to: 6, label: '',         style: 'dashed', arrows: 'one',  weight: 1.5, routing: 'curved',     waypoints: [], labelOffset: { dx: 0, dy: -8 } },
    { id: 3, from: 6, to: 7, label: '',         style: 'solid',  arrows: 'both', weight: 1.5, routing: 'straight',   waypoints: [], labelOffset: { dx: 0, dy: -8 } },
    { id: 4, from: 4, to: 8, label: 'nominates',style: 'dashed', arrows: 'one',  weight: 1.5, routing: 'orthogonal', waypoints: [], labelOffset: { dx: 0, dy: -8 } },
  ];
  G.nextId = 9;
}

// ─── UI ────────────────────────────────────────────────────────
function buildGraphUI() {
  return `
<div class="graph-page">
  <div class="graph-toolbar">
    <div class="graph-toolbar-left">
      <span class="graph-tool-label">Graph Tool</span>
      <div class="graph-tool-group">
        <button class="graph-btn active" id="gtool-select"  onclick="window.__gSetMode('select')"  title="Select / Move (V)">Select</button>
        <button class="graph-btn"        id="gtool-addNode" onclick="window.__gSetMode('addNode')" title="Add node (N)">+ Node</button>
        <button class="graph-btn"        id="gtool-addArea" onclick="window.__gSetMode('addArea')" title="Add area (A)">+ Area</button>
        <button class="graph-btn"        id="gtool-addEdge" onclick="window.__gSetMode('addEdge')" title="Add edge (E)">+ Edge</button>
      </div>
      <div class="graph-tool-group">
        <button class="graph-btn" onclick="window.__gDeleteSelected()" title="Delete (Del)">Delete</button>
        <button class="graph-btn" onclick="window.__gClear()">Clear</button>
        <button class="graph-btn" onclick="window.__gSeedExample()">Example</button>
      </div>
      <div class="graph-tool-group">
        <button class="graph-btn" onclick="window.__gZoom(1.2)">+</button>
        <button class="graph-btn" onclick="window.__gZoom(0.83)">−</button>
        <button class="graph-btn" onclick="window.__gResetView()">Fit</button>
      </div>
    </div>
    <div class="graph-toolbar-right">
      <button class="graph-btn graph-btn-primary" onclick="window.__gExportSVG()">Export SVG</button>
      <button class="graph-btn" onclick="window.__gExportPNG()">Export PNG</button>
      <button class="graph-btn" onclick="window.__gExportMarkdown()">Export Markdown</button>
    </div>
  </div>

  <div class="graph-workspace">
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
            <polygon points="0 0,10 3.5,0 7" fill="var(--muted)"/>
          </marker>
          <marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="10 0,0 3.5,10 7" fill="var(--muted)"/>
          </marker>
          <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0,10 3.5,0 7" fill="var(--gold)"/>
          </marker>
          <marker id="arrowhead-start-selected" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="10 0,0 3.5,10 7" fill="var(--gold)"/>
          </marker>
        </defs>
        <g id="graph-areas-layer"></g>
        <g id="graph-edges-layer"></g>
        <g id="graph-nodes-layer"></g>
        <g id="graph-handles-layer"></g>
      </svg>
      <div class="graph-canvas-hint" id="graph-canvas-hint" style="display:none;"></div>
    </div>

    <aside class="graph-inspector" id="graph-inspector">
      <div class="graph-inspector-empty" id="graph-inspector-empty">
        <p>Select a node, area, or edge to edit its properties.</p>
        <p style="margin-top:10px;font-size:12px;line-height:1.7;">
          <strong>V</strong> Select &nbsp;·&nbsp; <strong>N</strong> Node &nbsp;·&nbsp; <strong>A</strong> Area &nbsp;·&nbsp; <strong>E</strong> Edge<br>
          <strong>Del</strong> Delete &nbsp;·&nbsp; <strong>Esc</strong> Clear selection<br>
          <strong>Shift+click edge</strong> add waypoint<br>
          Drag corners/edges to resize areas
        </p>
      </div>

      <div id="graph-inspector-node" style="display:none;">
        <div class="graph-inspector-section">Node</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-label" type="text" oninput="window.__gUpdateNode('label',this.value)">
        <label class="graph-inspector-label">Group</label>
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
        <input class="graph-inspector-input" id="gi-color-custom" type="color" oninput="window.__gUpdateNode('color',this.value)" style="margin-top:8px;width:100%;height:32px;padding:2px;cursor:pointer;">
      </div>

      <div id="graph-inspector-area" style="display:none;">
        <div class="graph-inspector-section">Area</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-area-label" type="text" oninput="window.__gUpdateArea('label',this.value)">
        <label class="graph-inspector-label">Width × Height</label>
        <div style="display:flex;gap:6px;">
          <input class="graph-inspector-input" id="gi-area-w" type="number" min="60" oninput="window.__gUpdateArea('w',+this.value)">
          <input class="graph-inspector-input" id="gi-area-h" type="number" min="60" oninput="window.__gUpdateArea('h',+this.value)">
        </div>
        <label class="graph-inspector-label">Fill</label>
        <div class="graph-color-swatches">
          ${AREA_COLORS.map(c => `<div class="graph-color-swatch" style="background:${c}" onclick="window.__gUpdateArea('color','${c}')"></div>`).join('')}
        </div>
        <p style="margin-top:14px;font-size:11px;color:var(--muted);font-style:italic;font-family:'Crimson Pro',serif;">
          Areas render behind nodes. Drag corners or edges to resize. Drag the body to move. Areas can be nested.
        </p>
      </div>

      <div id="graph-inspector-edge" style="display:none;">
        <div class="graph-inspector-section">Edge</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-edge-label" type="text" placeholder="e.g. appoints" oninput="window.__gUpdateEdge('label',this.value)">
        <label class="graph-inspector-label">Line style</label>
        <select class="graph-inspector-input" id="gi-edge-style" onchange="window.__gUpdateEdge('style',this.value)">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
        <label class="graph-inspector-label">Arrows</label>
        <select class="graph-inspector-input" id="gi-edge-arrows" onchange="window.__gUpdateEdge('arrows',this.value)">
          <option value="one">→ One way</option>
          <option value="both">⇄ Bidirectional</option>
          <option value="none">— None</option>
        </select>
        <label class="graph-inspector-label">Routing</label>
        <select class="graph-inspector-input" id="gi-edge-routing" onchange="window.__gUpdateEdge('routing',this.value)">
          <option value="straight">Straight</option>
          <option value="curved">Curved (Bezier)</option>
          <option value="orthogonal">Orthogonal</option>
        </select>
        <label class="graph-inspector-label">Weight</label>
        <input class="graph-inspector-input" id="gi-edge-weight" type="range" min="1" max="6" step="0.5" oninput="window.__gUpdateEdge('weight',+this.value)">
        <p style="margin-top:10px;font-size:11px;color:var(--muted);font-style:italic;font-family:'Crimson Pro',serif;">
          <strong>Shift+click</strong> the edge to add a waypoint (drag to move).<br>
          Drag the label to reposition.
          <button class="btn" onclick="window.__gClearWaypoints()" style="margin-top:6px;padding:3px 8px;font-size:11px;">Clear waypoints</button>
        </p>
      </div>
    </aside>
  </div>

  <div class="graph-statusbar">
    <span id="graph-status">Mode: <strong>Select</strong></span>
    <span id="graph-stats" style="margin-left:auto;color:var(--muted-soft);font-size:11px;"></span>
  </div>
</div>

<div id="graph-export-overlay" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('visible')">
  <div class="modal" style="max-width:580px;">
    <div class="modal-header">
      <span>Export as Markdown</span>
      <button onclick="document.getElementById('graph-export-overlay').classList.remove('visible')">×</button>
    </div>
    <div class="modal-body">
      <p style="font-family:'Crimson Pro',serif;font-size:14px;margin-bottom:12px;">
        Paste this into any Marzenapedia article. The <code>:::graph</code> block renders inline.
      </p>
      <textarea id="graph-export-text" style="width:100%;height:280px;font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--paper-warm);border:1px solid var(--border);padding:10px;color:var(--text);border-radius:2px;" readonly></textarea>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.__gCopyExport()">Copy to Clipboard</button>
        <button class="btn" onclick="document.getElementById('graph-export-overlay').classList.remove('visible')">Close</button>
      </div>
    </div>
  </div>
</div>`;
}

// ─── EVENTS ────────────────────────────────────────────────────
function bindGraphEvents() {
  document.addEventListener('keydown', gKeydown);
}

function gKeydown(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'v' || e.key === 'V') gSetMode('select');
  if (e.key === 'n' || e.key === 'N') gSetMode('addNode');
  if (e.key === 'a' || e.key === 'A') gSetMode('addArea');
  if (e.key === 'e' || e.key === 'E') gSetMode('addEdge');
  if (e.key === 'Delete' || e.key === 'Backspace') gDeleteSelected();
  if (e.key === 'Escape') { G.selected = null; G.edgeFrom = null; showInspector(null); renderGraph(); }
}

function gSetMode(mode) {
  G.mode = mode;
  G.edgeFrom = null;
  document.querySelectorAll('.graph-btn[id^="gtool-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`gtool-${mode}`);
  if (btn) btn.classList.add('active');
  const hint = document.getElementById('graph-canvas-hint');
  const svg = document.getElementById('graph-svg');
  const labels = {
    addNode: 'Click on the canvas to place a node',
    addArea: 'Click and drag on the canvas to place an area',
    addEdge: 'Click a source node, then a target node',
  };
  if (mode in labels) {
    hint.style.display = 'block';
    hint.textContent = labels[mode];
    svg.style.cursor = mode === 'addEdge' ? 'cell' : 'crosshair';
  } else {
    hint.style.display = 'none';
    svg.style.cursor = 'default';
  }
  updateStatus();
}

// ─── CANVAS HANDLERS ───────────────────────────────────────────
function gCanvasClick(e) {
  if (G.dragging) return;
  if (G.mode === 'addNode') {
    const { sx, sy } = svgXY(e);
    addNode(sx, sy);
  }
}

function gCanvasMousedown(e) {
  const id = e.target.id || '';
  // Only intercept background clicks
  if (id !== 'graph-svg' && !id.endsWith('-layer')) return;
  const { sx, sy } = svgXY(e);
  if (G.mode === 'addArea') {
    const newId = G.nextId++;
    const a = { id: newId, kind: 'area', label: `Area ${newId}`, x: sx, y: sy, w: 60, h: 60,
      color: AREA_COLORS[(newId - 1) % AREA_COLORS.length] };
    G.nodes.push(a);
    G.selected = newId;
    G.dragging = { id: newId, kind: 'resize', startX: sx, startY: sy };
    G.resizeDir = 'se';
    showInspector('area', newId);
    renderGraph();
    return;
  }
  if (G.mode === 'select') {
    G.panStart = { mx: e.clientX, my: e.clientY, ox: G.panOffset.x, oy: G.panOffset.y };
    G.selected = null; G.edgeFrom = null;
    showInspector(null);
    renderGraph();
  }
}

function gCanvasMousemove(e) {
  if (!G.dragging && !G.panStart) return;
  const { sx, sy } = svgXY(e);
  if (G.dragging) {
    const d = G.dragging;
    if (d.kind === 'node' || d.kind === 'area') {
      const n = G.nodes.find(x => x.id === d.id);
      if (n) { n.x = sx - d.ox; n.y = sy - d.oy; renderGraph(); }
    } else if (d.kind === 'resize') {
      const a = G.nodes.find(x => x.id === d.id);
      if (!a) return;
      if (d.startX != null) {
        // Initial drag-to-create
        a.x = Math.min(d.startX, sx);
        a.y = Math.min(d.startY, sy);
        a.w = Math.max(40, Math.abs(sx - d.startX));
        a.h = Math.max(40, Math.abs(sy - d.startY));
      } else {
        const dir = G.resizeDir;
        const right = d.origX + d.origW, bottom = d.origY + d.origH;
        if (dir.includes('e')) a.w = Math.max(40, sx - a.x);
        if (dir.includes('s')) a.h = Math.max(40, sy - a.y);
        if (dir.includes('w')) { const nx = Math.min(sx, right - 40); a.w = right - nx; a.x = nx; }
        if (dir.includes('n')) { const ny = Math.min(sy, bottom - 40); a.h = bottom - ny; a.y = ny; }
      }
      renderGraph();
    } else if (d.kind === 'waypoint') {
      const ed = G.edges.find(x => x.id === d.edgeId);
      if (ed && ed.waypoints[d.idx]) { ed.waypoints[d.idx] = { x: sx, y: sy }; renderGraph(); }
    } else if (d.kind === 'label') {
      const ed = G.edges.find(x => x.id === d.edgeId);
      if (ed) {
        // Compute new offset: where the user moved the cursor relative to the
        // route's natural midpoint.
        const pts = routePoints(ed);
        const mid = pts[Math.floor(pts.length / 2)];
        ed.labelOffset = { dx: sx - mid.x, dy: sy - mid.y };
        renderGraph();
      }
    }
  } else if (G.panStart) {
    const dx = (e.clientX - G.panStart.mx) / G.zoom;
    const dy = (e.clientY - G.panStart.my) / G.zoom;
    G.panOffset.x = G.panStart.ox + dx;
    G.panOffset.y = G.panStart.oy + dy;
    renderGraph();
  }
}

function gCanvasMouseup() {
  if (G.dragging && G.dragging.kind === 'resize' && G.dragging.startX != null) {
    G.dragging = null; G.resizeDir = null;
    gSetMode('select');
    return;
  }
  G.dragging = null; G.resizeDir = null; G.panStart = null;
}

function gWheel(e) {
  e.preventDefault();
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  renderGraph();
}

// ─── ELEMENT HANDLERS ──────────────────────────────────────────
function nodeMousedown(e, id) {
  e.stopPropagation();
  const node = G.nodes.find(n => n.id === id);
  if (!node) return;
  const { sx, sy } = svgXY(e);
  if (G.mode === 'select') {
    G.dragging = { id, kind: node.kind === 'area' ? 'area' : 'node', ox: sx - node.x, oy: sy - node.y };
    G.selected = id; G.edgeFrom = null;
    showInspector(node.kind, id);
    renderGraph();
  } else if (G.mode === 'addEdge' && node.kind === 'node') {
    if (G.edgeFrom === null) {
      G.edgeFrom = id; G.selected = id;
      renderGraph();
      updateStatus('Now click the target node');
    } else if (G.edgeFrom !== id) {
      addEdge(G.edgeFrom, id);
      G.edgeFrom = null; G.selected = null;
    }
  }
}

function areaResizeMousedown(e, areaId, dir) {
  e.stopPropagation();
  const a = G.nodes.find(n => n.id === areaId);
  if (!a) return;
  G.dragging = {
    id: areaId, kind: 'resize',
    origX: a.x, origY: a.y, origW: a.w, origH: a.h,
  };
  G.resizeDir = dir;
  G.selected = areaId;
  showInspector('area', areaId);
}

function edgeMousedown(e, edgeId) {
  e.stopPropagation();
  const edge = G.edges.find(x => x.id === edgeId);
  if (!edge) return;
  if (e.shiftKey) {
    const { sx, sy } = svgXY(e);
    edge.waypoints.push({ x: sx, y: sy });
    G.selected = `e${edgeId}`;
    showInspector('edge', edgeId);
    renderGraph();
    return;
  }
  G.selected = `e${edgeId}`;
  showInspector('edge', edgeId);
  renderGraph();
}

function waypointMousedown(e, edgeId, idx) {
  e.stopPropagation();
  G.dragging = { kind: 'waypoint', edgeId, idx };
  G.selected = `e${edgeId}`;
  showInspector('edge', edgeId);
}

function edgeLabelMousedown(e, edgeId) {
  e.stopPropagation();
  G.dragging = { kind: 'label', edgeId };
  G.selected = `e${edgeId}`;
  showInspector('edge', edgeId);
}

// ─── CRUD ──────────────────────────────────────────────────────
function addNode(x, y) {
  const id = G.nextId++;
  G.nodes.push({
    id, kind: 'node', label: `Node ${id}`, x, y,
    color: NODE_COLORS[(id - 1) % NODE_COLORS.length],
    shape: 'rounded', group: ''
  });
  G.selected = id;
  showInspector('node', id);
  renderGraph();
  setTimeout(() => { const el = document.getElementById('gi-label'); if (el) { el.focus(); el.select(); } }, 50);
}

function addEdge(from, to) {
  const id = G.nextId++;
  G.edges.push({
    id, from, to, label: '', style: 'solid', arrows: 'one',
    weight: 1.5, routing: G.defaultRouting, waypoints: [],
    labelOffset: { dx: 0, dy: -8 },
  });
  G.selected = `e${id}`;
  showInspector('edge', id);
  renderGraph();
}

function gDeleteSelected() {
  if (G.selected == null) return;
  if (typeof G.selected === 'string' && G.selected.startsWith('e')) {
    const eid = parseInt(G.selected.slice(1));
    G.edges = G.edges.filter(e => e.id !== eid);
  } else {
    const id = G.selected;
    G.edges = G.edges.filter(e => e.from !== id && e.to !== id);
    G.nodes = G.nodes.filter(n => n.id !== id);
  }
  G.selected = null;
  showInspector(null);
  renderGraph();
}

function gClear() {
  if (!confirm('Clear all nodes, areas and edges?')) return;
  G.nodes = []; G.edges = []; G.selected = null; G.nextId = 1;
  showInspector(null); renderGraph();
}

function gSeedExample() {
  G.nodes = []; G.edges = []; G.selected = null; G.nextId = 1;
  seedExample();
  showInspector(null); renderGraph();
}

function gClearWaypoints() {
  if (typeof G.selected !== 'string' || !G.selected.startsWith('e')) return;
  const e = G.edges.find(x => x.id === parseInt(G.selected.slice(1)));
  if (e) { e.waypoints = []; renderGraph(); }
}

// ─── INSPECTOR ─────────────────────────────────────────────────
function showInspector(kind, id) {
  const empty = document.getElementById('graph-inspector-empty');
  const nodeDiv = document.getElementById('graph-inspector-node');
  const areaDiv = document.getElementById('graph-inspector-area');
  const edgeDiv = document.getElementById('graph-inspector-edge');
  if (!empty) return;
  empty.style.display   = kind ? 'none' : 'block';
  nodeDiv.style.display = kind === 'node' ? 'block' : 'none';
  areaDiv.style.display = kind === 'area' ? 'block' : 'none';
  edgeDiv.style.display = kind === 'edge' ? 'block' : 'none';
  if (kind === 'node') {
    const n = G.nodes.find(x => x.id === id); if (!n) return;
    document.getElementById('gi-label').value = n.label;
    document.getElementById('gi-group').value = n.group || '';
    document.getElementById('gi-shape').value = n.shape || 'rounded';
    if (n.color && n.color.startsWith('#')) document.getElementById('gi-color-custom').value = n.color;
  } else if (kind === 'area') {
    const a = G.nodes.find(x => x.id === id); if (!a) return;
    document.getElementById('gi-area-label').value = a.label || '';
    document.getElementById('gi-area-w').value = Math.round(a.w);
    document.getElementById('gi-area-h').value = Math.round(a.h);
  } else if (kind === 'edge') {
    const e = G.edges.find(x => x.id === id); if (!e) return;
    document.getElementById('gi-edge-label').value   = e.label || '';
    document.getElementById('gi-edge-style').value   = e.style || 'solid';
    document.getElementById('gi-edge-arrows').value  = e.arrows || 'one';
    document.getElementById('gi-edge-routing').value = e.routing || 'straight';
    document.getElementById('gi-edge-weight').value  = e.weight || 1.5;
  }
}

function gUpdateNode(key, value) {
  if (G.selected == null || typeof G.selected === 'string') return;
  const n = G.nodes.find(x => x.id === G.selected);
  if (!n || n.kind !== 'node') return;
  n[key] = value; renderGraph();
}
function gUpdateArea(key, value) {
  if (G.selected == null || typeof G.selected === 'string') return;
  const a = G.nodes.find(x => x.id === G.selected);
  if (!a || a.kind !== 'area') return;
  a[key] = value; renderGraph();
}
function gUpdateEdge(key, value) {
  if (typeof G.selected !== 'string' || !G.selected.startsWith('e')) return;
  const e = G.edges.find(x => x.id === parseInt(G.selected.slice(1)));
  if (!e) return;
  e[key] = value; renderGraph();
}

// ─── GEOMETRY ──────────────────────────────────────────────────
function edgeEndpoints(edge) {
  const f = G.nodes.find(n => n.id === edge.from && n.kind === 'node');
  const t = G.nodes.find(n => n.id === edge.to   && n.kind === 'node');
  return f && t ? { f, t } : null;
}
function routePoints(edge) {
  const ep = edgeEndpoints(edge);
  if (!ep) return [{ x: 0, y: 0 }];
  return [{ x: ep.f.x, y: ep.f.y }, ...(edge.waypoints || []), { x: ep.t.x, y: ep.t.y }];
}
function shorten(p1, p2, m) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, d = Math.hypot(dx, dy) || 1;
  return { x: p1.x + (dx / d) * m, y: p1.y + (dy / d) * m };
}
function shortenEnd(p1, p2, m) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, d = Math.hypot(dx, dy) || 1;
  return { x: p2.x - (dx / d) * m, y: p2.y - (dy / d) * m };
}

function buildEdgePath(edge) {
  const pts = routePoints(edge);
  if (pts.length < 2) return '';
  const margin = 50;
  const start = shorten(pts[0], pts[1], margin);
  const end   = shortenEnd(pts[pts.length - 2], pts[pts.length - 1], margin + 10);
  const all = [start, ...pts.slice(1, -1), end];

  if (edge.routing === 'orthogonal' && all.length >= 2) {
    let d = `M${all[0].x},${all[0].y}`;
    for (let i = 1; i < all.length; i++) {
      const p = all[i - 1], q = all[i];
      d += ` L${q.x},${p.y} L${q.x},${q.y}`;
    }
    return d;
  }
  if (edge.routing === 'curved' && all.length === 2) {
    const [a, b] = all;
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  if (edge.routing === 'curved' && all.length > 2) {
    let d = `M${all[0].x},${all[0].y}`;
    for (let i = 1; i < all.length - 1; i++) {
      const mid = { x: (all[i].x + all[i + 1].x) / 2, y: (all[i].y + all[i + 1].y) / 2 };
      d += ` Q${all[i].x},${all[i].y} ${mid.x},${mid.y}`;
    }
    d += ` T${all[all.length - 1].x},${all[all.length - 1].y}`;
    return d;
  }
  let d = `M${all[0].x},${all[0].y}`;
  for (let i = 1; i < all.length; i++) d += ` L${all[i].x},${all[i].y}`;
  return d;
}

function edgeLabelPos(edge) {
  const pts = routePoints(edge);
  const mid = pts[Math.floor(pts.length / 2)];
  return { x: mid.x + edge.labelOffset.dx, y: mid.y + edge.labelOffset.dy };
}

// ─── RENDER ────────────────────────────────────────────────────
function renderGraph() {
  const tx = G.panOffset.x * G.zoom, ty = G.panOffset.y * G.zoom;
  ['graph-areas-layer', 'graph-edges-layer', 'graph-nodes-layer', 'graph-handles-layer'].forEach(id => {
    const g = document.getElementById(id);
    if (g) g.setAttribute('transform', `translate(${tx},${ty}) scale(${G.zoom})`);
  });

  const areas = G.nodes.filter(n => n.kind === 'area').sort((a, b) => (b.w * b.h) - (a.w * a.h));
  document.getElementById('graph-areas-layer').innerHTML = areas.map(renderArea).join('');
  document.getElementById('graph-edges-layer').innerHTML = G.edges.map(renderEdge).join('');
  const nodes = G.nodes.filter(n => n.kind !== 'area');
  document.getElementById('graph-nodes-layer').innerHTML = nodes.map(renderNode).join('');

  // Handles
  let handlesHtml = '';
  if (typeof G.selected === 'number') {
    const sel = G.nodes.find(n => n.id === G.selected);
    if (sel && sel.kind === 'area') handlesHtml = renderResizeHandles(sel);
  }
  if (typeof G.selected === 'string' && G.selected.startsWith('e')) {
    const ed = G.edges.find(x => x.id === parseInt(G.selected.slice(1)));
    if (ed) ed.waypoints.forEach((wp, i) => {
      handlesHtml += `<circle class="g-waypoint" data-eid="${ed.id}" data-idx="${i}"
        cx="${wp.x}" cy="${wp.y}" r="6" fill="var(--gold)" stroke="white" stroke-width="2" style="cursor:move;"/>`;
    });
  }
  document.getElementById('graph-handles-layer').innerHTML = handlesHtml;

  // Bind events
  G.nodes.forEach(n => {
    const el = document.getElementById(`gnode-${n.id}`);
    if (el) el.addEventListener('mousedown', e => nodeMousedown(e, n.id));
    if (n.kind === 'area' && G.selected === n.id) {
      ['nw','ne','sw','se','n','s','w','e'].forEach(dir => {
        const h = document.getElementById(`garesize-${n.id}-${dir}`);
        if (h) h.addEventListener('mousedown', e => areaResizeMousedown(e, n.id, dir));
      });
    }
  });
  G.edges.forEach(e => {
    const path = document.getElementById(`gedge-hit-${e.id}`);
    if (path) path.addEventListener('mousedown', ev => edgeMousedown(ev, e.id));
    const lbl = document.getElementById(`gedge-label-${e.id}`);
    if (lbl) lbl.addEventListener('mousedown', ev => edgeLabelMousedown(ev, e.id));
  });
  document.querySelectorAll('.g-waypoint').forEach(c => {
    c.addEventListener('mousedown', e => waypointMousedown(e, +c.dataset.eid, +c.dataset.idx));
  });

  const stats = document.getElementById('graph-stats');
  if (stats) stats.textContent = `${nodes.length} nodes · ${areas.length} areas · ${G.edges.length} edges`;
}

function renderArea(a) {
  const sel = G.selected === a.id;
  return `<g id="gnode-${a.id}" style="cursor:move;">
    <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="4"
      fill="${a.color}" stroke="${sel ? 'var(--gold)' : 'rgba(0,0,0,0.2)'}"
      stroke-width="${sel ? 2 : 1}" stroke-dasharray="${sel ? '0' : '4,3'}"/>
    ${a.label ? `<text x="${a.x + 10}" y="${a.y + 16}" font-size="12" font-family="'Source Sans 3',sans-serif"
      font-weight="700" fill="rgba(0,0,0,0.65)" pointer-events="none"
      style="user-select:none;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(a.label)}</text>` : ''}
  </g>`;
}

function renderResizeHandles(a) {
  const positions = [
    { dir: 'nw', x: a.x,         y: a.y,         cur: 'nwse-resize' },
    { dir: 'ne', x: a.x + a.w,   y: a.y,         cur: 'nesw-resize' },
    { dir: 'sw', x: a.x,         y: a.y + a.h,   cur: 'nesw-resize' },
    { dir: 'se', x: a.x + a.w,   y: a.y + a.h,   cur: 'nwse-resize' },
    { dir: 'n',  x: a.x + a.w/2, y: a.y,         cur: 'ns-resize'   },
    { dir: 's',  x: a.x + a.w/2, y: a.y + a.h,   cur: 'ns-resize'   },
    { dir: 'w',  x: a.x,         y: a.y + a.h/2, cur: 'ew-resize'   },
    { dir: 'e',  x: a.x + a.w,   y: a.y + a.h/2, cur: 'ew-resize'   },
  ];
  return positions.map(p =>
    `<rect id="garesize-${a.id}-${p.dir}" x="${p.x - 5}" y="${p.y - 5}" width="10" height="10"
       fill="white" stroke="var(--gold)" stroke-width="1.5" style="cursor:${p.cur};"/>`
  ).join('');
}

function renderNode(n) {
  const sel = G.selected === n.id;
  const edgeSrc = G.edgeFrom === n.id;
  const stroke = sel ? 'var(--gold)' : edgeSrc ? '#5a9a5a' : 'rgba(255,255,255,0.25)';
  const sw = sel || edgeSrc ? 2.5 : 1.5;
  const W = 120, H = 40;
  let shape;
  if (n.shape === 'circle') {
    shape = `<circle cx="0" cy="0" r="44" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'diamond') {
    shape = `<polygon points="0,-40 68,0 0,40 -68,0" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else {
    const rx = n.shape === 'rounded' ? 8 : 2;
    shape = `<rect x="${-W/2}" y="${-H/2}" width="${W}" height="${H}" rx="${rx}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  const fontSize = n.label.length > 16 ? 10 : n.label.length > 10 ? 11 : 12;
  const textY = n.shape === 'diamond' ? 5 : 1;
  return `<g id="gnode-${n.id}" transform="translate(${n.x},${n.y})" style="cursor:move;">
    ${shape}
    <text text-anchor="middle" dominant-baseline="middle" y="${textY}"
      font-size="${fontSize}" font-family="'Source Sans 3',sans-serif"
      fill="white" font-weight="600" pointer-events="none" style="user-select:none;">${escapeHtml(n.label)}</text>
    ${n.group ? `<text text-anchor="middle" dominant-baseline="middle" y="${H/2 + 14}"
      font-size="9" font-family="'Source Sans 3',sans-serif"
      fill="var(--muted)" pointer-events="none" style="user-select:none;">${escapeHtml(n.group)}</text>` : ''}
  </g>`;
}

function renderEdge(edge) {
  const ep = edgeEndpoints(edge);
  if (!ep) return '';
  const sel = G.selected === `e${edge.id}`;
  const stroke = sel ? 'var(--gold)' : 'var(--muted)';
  const strokeW = (edge.weight || 1.5) * (sel ? 1.4 : 1);
  const dashArr = edge.style === 'dashed' ? '6,4' : edge.style === 'dotted' ? '2,4' : 'none';
  const markerStart = edge.arrows === 'both'
    ? (sel ? 'url(#arrowhead-start-selected)' : 'url(#arrowhead-start)') : 'none';
  const markerEnd = (edge.arrows === 'one' || edge.arrows === 'both')
    ? (sel ? 'url(#arrowhead-selected)' : 'url(#arrowhead)') : 'none';
  const d = buildEdgePath(edge);

  let labelSvg = '';
  if (edge.label) {
    const pos = edgeLabelPos(edge);
    const w = edge.label.length * 6.5 + 10;
    labelSvg = `<g id="gedge-label-${edge.id}" style="cursor:move;">
      <rect x="${pos.x - w/2}" y="${pos.y - 9}" width="${w}" height="14" fill="var(--bg)" opacity="0.9" rx="2"/>
      <text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle"
        font-size="10" font-family="'Source Sans 3',sans-serif"
        fill="var(--muted-soft)" style="user-select:none;">${escapeHtml(edge.label)}</text>
    </g>`;
  }

  return `<g>
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeW}"
      stroke-dasharray="${dashArr}" marker-start="${markerStart}" marker-end="${markerEnd}"/>
    <path id="gedge-hit-${edge.id}" d="${d}" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer;"/>
    ${labelSvg}
  </g>`;
}

// ─── ZOOM ──────────────────────────────────────────────────────
function gZoom(factor) {
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * factor));
  renderGraph();
}
function gResetView() {
  G.zoom = 1; G.panOffset = { x: 0, y: 0 };
  renderGraph();
}

// ─── EXPORT ────────────────────────────────────────────────────
function buildExportSvg() {
  const allX = [], allY = [];
  G.nodes.forEach(n => {
    if (n.kind === 'area') { allX.push(n.x, n.x + n.w); allY.push(n.y, n.y + n.h); }
    else { allX.push(n.x - 70, n.x + 70); allY.push(n.y - 30, n.y + 50); }
  });
  G.edges.forEach(e => (e.waypoints || []).forEach(w => { allX.push(w.x); allY.push(w.y); }));
  if (allX.length === 0) { allX.push(0, 800); allY.push(0, 500); }
  const pad = 40;
  const minX = Math.min(...allX) - pad, maxX = Math.max(...allX) + pad;
  const minY = Math.min(...allY) - pad, maxY = Math.max(...allY) + pad;
  const W = maxX - minX, H = maxY - minY;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${minX} ${minY} ${W} ${H}" style="background:#f9f7f3;font-family:'Source Sans 3',sans-serif;">
    <defs>
      <marker id="ar" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#5a5a5a"/></marker>
      <marker id="ar-start" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="10 0,0 3.5,10 7" fill="#5a5a5a"/></marker>
    </defs>`;

  // Areas (largest first)
  const areas = G.nodes.filter(n => n.kind === 'area').sort((a, b) => b.w * b.h - a.w * a.h);
  for (const a of areas) {
    out += `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="4" fill="${a.color}" stroke="rgba(0,0,0,0.2)" stroke-dasharray="4,3"/>`;
    if (a.label) out += `<text x="${a.x + 10}" y="${a.y + 16}" font-size="12" font-weight="700" fill="rgba(0,0,0,0.65)" style="text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(a.label)}</text>`;
  }

  // Edges
  for (const e of G.edges) {
    const ep = edgeEndpoints(e);
    if (!ep) continue;
    const d = buildEdgePath(e);
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6,4"' : e.style === 'dotted' ? ' stroke-dasharray="2,4"' : '';
    const ms = e.arrows === 'both' ? ' marker-start="url(#ar-start)"' : '';
    const me = (e.arrows === 'one' || e.arrows === 'both') ? ' marker-end="url(#ar)"' : '';
    out += `<path d="${d}" fill="none" stroke="#5a5a5a" stroke-width="${e.weight || 1.5}"${dash}${ms}${me}/>`;
    if (e.label) {
      const pos = edgeLabelPos(e);
      const w = e.label.length * 6.5 + 10;
      out += `<rect x="${pos.x - w/2}" y="${pos.y - 9}" width="${w}" height="14" fill="#f9f7f3" opacity="0.95" rx="2"/>`;
      out += `<text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle" font-size="10" fill="#5a5a5a">${escapeHtml(e.label)}</text>`;
    }
  }

  // Nodes
  const nodes = G.nodes.filter(n => n.kind === 'node');
  for (const n of nodes) {
    if (n.shape === 'circle') {
      out += `<circle cx="${n.x}" cy="${n.y}" r="44" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else if (n.shape === 'diamond') {
      out += `<polygon points="${n.x},${n.y - 40} ${n.x + 68},${n.y} ${n.x},${n.y + 40} ${n.x - 68},${n.y}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    } else {
      const rx = n.shape === 'rounded' ? 8 : 2;
      out += `<rect x="${n.x - 60}" y="${n.y - 20}" width="120" height="40" rx="${rx}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    }
    const fs = n.label.length > 16 ? 10 : n.label.length > 10 ? 11 : 12;
    out += `<text x="${n.x}" y="${n.y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="white" font-weight="600">${escapeHtml(n.label)}</text>`;
    if (n.group) out += `<text x="${n.x}" y="${n.y + 32}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${escapeHtml(n.group)}</text>`;
  }
  out += '</svg>';
  return { svg: out, width: W, height: H };
}

function gExportSVG() {
  const { svg } = buildExportSvg();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'marzenapedia-graph.svg';
  a.click();
}

function gExportPNG() {
  const { svg, width, height } = buildExportSvg();
  // Render the SVG into a canvas via a Blob URL → Image → drawImage → toBlob
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2; // 2× for retina-clean output
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f9f7f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(b => {
      const dlUrl = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = 'marzenapedia-graph.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG export failed — falling back to SVG.');
    gExportSVG();
  };
  img.src = url;
}

function gExportMarkdown() {
  const nodesStr = G.nodes.filter(n => n.kind === 'node').map(n =>
    `  ${n.id}: ${n.label}|${n.x.toFixed(0)},${n.y.toFixed(0)}|${n.color}|${n.shape}|${n.group || ''}`
  ).join('\n');
  const edgesStr = G.edges.map(e => {
    const parts = [`${e.from}->${e.to}`];
    if (e.label) parts.push(e.label);
    if (e.style !== 'solid') parts.push(e.style);
    return `  ${parts.join('|')}`;
  }).join('\n');
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
  return { sx: (mx / G.zoom) - G.panOffset.x, sy: (my / G.zoom) - G.panOffset.y };
}

function updateStatus(msg) {
  const el = document.getElementById('graph-status');
  if (!el) return;
  const labels = {
    select: 'Select — click to select, drag to move',
    addNode: 'Add Node — click canvas to place',
    addArea: 'Add Area — click+drag to size',
    addEdge: 'Add Edge — click source then target',
  };
  const modeLbl = { select: 'Select', addNode: 'Add Node', addArea: 'Add Area', addEdge: 'Add Edge' }[G.mode];
  el.innerHTML = `Mode: <strong>${modeLbl}</strong> — ${msg || labels[G.mode] || ''}`;
}

// ─── EXPOSE ────────────────────────────────────────────────────
export function exposeGraphGlobals() {
  window.__gSetMode         = gSetMode;
  window.__gDeleteSelected  = gDeleteSelected;
  window.__gClear           = gClear;
  window.__gSeedExample     = gSeedExample;
  window.__gZoom            = gZoom;
  window.__gResetView       = gResetView;
  window.__gExportSVG       = gExportSVG;
  window.__gExportPNG       = gExportPNG;
  window.__gExportMarkdown  = gExportMarkdown;
  window.__gCopyExport      = gCopyExport;
  window.__gCanvasClick     = gCanvasClick;
  window.__gCanvasMousedown = gCanvasMousedown;
  window.__gCanvasMousemove = gCanvasMousemove;
  window.__gCanvasMouseup   = gCanvasMouseup;
  window.__gWheel           = gWheel;
  window.__gUpdateNode      = gUpdateNode;
  window.__gUpdateArea      = gUpdateArea;
  window.__gUpdateEdge      = gUpdateEdge;
  window.__gClearWaypoints  = gClearWaypoints;
}
