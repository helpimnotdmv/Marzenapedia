/* ═══════════════════════════════════════════════════════════════
   graph.js — Visual graph / org-chart creation tool (v3)
   ═══════════════════════════════════════════════════════════════
   v3 features:
     • Undo / Redo (Ctrl+Z / Ctrl+Y), 50-step history
     • Snap-to-grid (off / 8 / 16 / 24 px), Alt to bypass
     • Multi-select (Shift+click, Shift+drag-rectangle)
     • Edge endpoints actually touch node borders
     • Edge anchors per endpoint (auto / top / right / bottom / left / nearest)
     • Tree connector routing (shared trunk for parent → many children)
     • Edge label rotation (auto-follow / always-horizontal)
     • Edge label-along-path (textPath) mode
     • Edge labels rendered above nodes (label-not-visible bug fixed)
     • Resizable nodes with text wrapping
     • New shapes: ellipse, semicircle, hexagon, parallelogram, label-only
     • Multi-line labels (Enter for newline in inspector)
     • Rich label formatting: bold, italic, per-label color, font controls
     • Ctrl+D duplicate
     • Autosave to localStorage + restore prompt
   ═══════════════════════════════════════════════════════════════ */

import { escapeHtml } from '../renderer.js';

// ─── CONSTANTS ─────────────────────────────────────────────────
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
const FONT_FAMILIES = [
  { name: 'Source Sans 3',    value: "'Source Sans 3', sans-serif" },
  { name: 'Crimson Pro',      value: "'Crimson Pro', serif" },
  { name: 'Playfair Display', value: "'Playfair Display', serif" },
  { name: 'JetBrains Mono',   value: "'JetBrains Mono', monospace" },
  { name: 'IM Fell English',  value: "'IM Fell English', serif" },
  { name: 'System',           value: 'system-ui, sans-serif' },
];
const HISTORY_LIMIT = 50;
const AUTOSAVE_KEY  = 'marzenapedia-graph-autosave';
const AUTOSAVE_MS   = 1000;

// ─── STATE ─────────────────────────────────────────────────────
const G = {
  nodes: [],
  edges: [],
  selected: new Set(),
  edgeFrom: null,
  dragging: null,
  resizeDir: null,
  nextId: 1,
  mode: 'select',
  panOffset: { x: 0, y: 0 },
  panStart: null,
  zoom: 1,
  snapGrid: 0,
  history: [],
  future: [],
  marquee: null,
  saveTimer: null,
  defaultRouting: 'straight',
};

// ─── ENTRY ─────────────────────────────────────────────────────
export function showGraph() {
  document.getElementById('main-content').innerHTML = buildGraphUI();
  document.title = 'Graph Tool — Marzenapedia';
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="window.__navigate('home')">Main Page</a><span class="sep">·</span>Graph Tool`;
  document.getElementById('page-tabs').style.display = 'none';

  if (G.nodes.length === 0) {
    const restored = tryRestoreAutosave();
    if (!restored) seedExample();
  }

  bindGraphEvents();
  renderGraph();
}

function seedExample() {
  G.nodes = [
    { id: 1, kind: 'area', label: 'Government', x: 60,  y: 40,  w: 720, h: 320, color: AREA_COLORS[0] },
    { id: 2, kind: 'area', label: 'Executive',  x: 80,  y: 100, w: 320, h: 240, color: AREA_COLORS[1] },
    { id: 3, kind: 'area', label: 'Legislature',x: 440, y: 100, w: 320, h: 240, color: AREA_COLORS[2] },
    makeNode(4, 'President',         240, 200, '#1a3a8f', 'rounded'),
    makeNode(5, 'Prime Minister',    240, 280, '#1a3a8f', 'rounded'),
    makeNode(6, 'National Assembly', 600, 200, '#2d7a4f', 'rect'),
    makeNode(7, 'Senate',            600, 280, '#2d7a4f', 'rect'),
    makeNode(8, 'Supreme Court',     420, 420, '#8b2e2e', 'rounded'),
  ];
  G.edges = [
    makeEdge(1, 4, 5, 'appoints', 'solid',  'one',  1.5, 'straight'),
    makeEdge(2, 4, 6, '',         'dashed', 'one',  1.5, 'curved'),
    makeEdge(3, 6, 7, 'laws',     'solid',  'both', 1.5, 'straight'),
    makeEdge(4, 4, 8, 'nominates','dashed', 'one',  1.5, 'orthogonal'),
  ];
  G.nextId = 9;
}

function makeNode(id, label, x, y, color, shape) {
  return {
    id, kind: 'node', label, x, y,
    w: 120, h: 40,
    color, shape, group: '',
    font: { family: FONT_FAMILIES[0].value, size: 12, letterSpacing: 0,
            align: 'center', bold: true, italic: false, color: '#ffffff' },
  };
}
function makeEdge(id, from, to, label, style, arrows, weight, routing) {
  return {
    id, from, to, label, style, arrows, weight, routing,
    waypoints: [],
    labelOffset: { dx: 0, dy: -8 },
    fromAnchor: 'auto', toAnchor: 'auto',
    labelMode: 'midpoint',
    labelRotation: 'horizontal',
    labelFont: { family: FONT_FAMILIES[0].value, size: 10, color: '', bold: false, italic: false },
  };
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
        <button class="graph-btn" onclick="window.__gUndo()" title="Undo (Ctrl+Z)">↶ Undo</button>
        <button class="graph-btn" onclick="window.__gRedo()" title="Redo (Ctrl+Y)">↷ Redo</button>
      </div>
      <div class="graph-tool-group">
        <button class="graph-btn" onclick="window.__gDuplicateSelected()" title="Duplicate (Ctrl+D)">Duplicate</button>
        <button class="graph-btn" onclick="window.__gDeleteSelected()"   title="Delete (Del)">Delete</button>
      </div>
      <div class="graph-tool-group">
        <label style="font-size:11px;color:var(--muted);margin-right:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Snap</label>
        <select id="gtool-snap" onchange="window.__gSetSnap(+this.value)"
          style="padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:2px;background:var(--bg-elev);color:var(--text);font-family:inherit;">
          <option value="0">Off</option>
          <option value="8">8 px</option>
          <option value="16">16 px</option>
          <option value="24">24 px</option>
        </select>
      </div>
      <div class="graph-tool-group">
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
        <g id="graph-edge-labels-layer"></g>
        <g id="graph-handles-layer"></g>
        <g id="graph-marquee-layer"></g>
      </svg>
      <div class="graph-canvas-hint" id="graph-canvas-hint" style="display:none;"></div>
    </div>

    <aside class="graph-inspector" id="graph-inspector">
      <div class="graph-inspector-empty" id="graph-inspector-empty">
        <p>Select a node, area, or edge to edit its properties.</p>
        <p style="margin-top:10px;font-size:12px;line-height:1.7;">
          <strong>V</strong> Select &nbsp;·&nbsp; <strong>N</strong> Node &nbsp;·&nbsp; <strong>A</strong> Area &nbsp;·&nbsp; <strong>E</strong> Edge<br>
          <strong>Shift+click</strong> to multi-select<br>
          <strong>Shift+drag empty space</strong> for marquee<br>
          <strong>Ctrl+Z / Ctrl+Y</strong> undo / redo<br>
          <strong>Ctrl+D</strong> duplicate &nbsp;·&nbsp; <strong>Del</strong> delete<br>
          <strong>Alt</strong> bypass snap while dragging<br>
          <strong>Shift+click edge</strong> add waypoint
        </p>
      </div>

      <div id="graph-inspector-node" style="display:none;">
        <div class="graph-inspector-section">Node</div>
        <label class="graph-inspector-label">Label (Enter for newline)</label>
        <textarea class="graph-inspector-input" id="gi-label" rows="2" oninput="window.__gUpdateNode('label',this.value)"></textarea>
        <label class="graph-inspector-label">Group</label>
        <input class="graph-inspector-input" id="gi-group" type="text" placeholder="e.g. Executive" oninput="window.__gUpdateNode('group',this.value)">
        <label class="graph-inspector-label">Shape</label>
        <select class="graph-inspector-input" id="gi-shape" onchange="window.__gUpdateNode('shape',this.value)">
          <option value="rounded">Rounded rect</option>
          <option value="rect">Rectangle</option>
          <option value="diamond">Diamond</option>
          <option value="circle">Circle</option>
          <option value="ellipse">Ellipse</option>
          <option value="semicircle">Semicircle</option>
          <option value="hexagon">Hexagon</option>
          <option value="parallelogram">Parallelogram</option>
          <option value="label">Label only (borderless)</option>
        </select>
        <label class="graph-inspector-label">Width × Height</label>
        <div style="display:flex;gap:6px;">
          <input class="graph-inspector-input" id="gi-w" type="number" min="20" step="2" oninput="window.__gUpdateNode('w',+this.value)">
          <input class="graph-inspector-input" id="gi-h" type="number" min="20" step="2" oninput="window.__gUpdateNode('h',+this.value)">
        </div>
        <label class="graph-inspector-label">Fill</label>
        <div class="graph-color-swatches" id="gi-colors">
          ${NODE_COLORS.map(c => `<div class="graph-color-swatch" style="background:${c}" onclick="window.__gUpdateNode('color','${c}')"></div>`).join('')}
        </div>
        <input class="graph-inspector-input" id="gi-color-custom" type="color" oninput="window.__gUpdateNode('color',this.value)" style="margin-top:8px;width:100%;height:32px;padding:2px;cursor:pointer;">

        <div class="graph-inspector-section" style="margin-top:18px;">Typography</div>
        <label class="graph-inspector-label">Font</label>
        <select class="graph-inspector-input" id="gi-font-family" onchange="window.__gUpdateNodeFont('family',this.value)">
          ${FONT_FAMILIES.map(f => `<option value="${f.value}">${f.name}</option>`).join('')}
        </select>
        <label class="graph-inspector-label">Size · Letter spacing</label>
        <div style="display:flex;gap:6px;">
          <input class="graph-inspector-input" id="gi-font-size" type="number" min="6" max="48" step="1" oninput="window.__gUpdateNodeFont('size',+this.value)">
          <input class="graph-inspector-input" id="gi-font-spacing" type="number" min="-2" max="12" step="0.5" oninput="window.__gUpdateNodeFont('letterSpacing',+this.value)">
        </div>
        <label class="graph-inspector-label">Align</label>
        <select class="graph-inspector-input" id="gi-font-align" onchange="window.__gUpdateNodeFont('align',this.value)">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
        <label class="graph-inspector-label">Style</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="graph-btn" id="gi-font-bold"   onclick="window.__gToggleNodeFont('bold')"   style="font-weight:700;">B</button>
          <button class="graph-btn" id="gi-font-italic" onclick="window.__gToggleNodeFont('italic')" style="font-style:italic;">I</button>
          <input id="gi-font-color" type="color" oninput="window.__gUpdateNodeFont('color',this.value)" style="flex:1;height:30px;padding:2px;border:1px solid var(--border);border-radius:2px;cursor:pointer;">
        </div>
      </div>

      <div id="graph-inspector-area" style="display:none;">
        <div class="graph-inspector-section">Area</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-area-label" type="text" oninput="window.__gUpdateArea('label',this.value)">
        <label class="graph-inspector-label">Width × Height</label>
        <div style="display:flex;gap:6px;">
          <input class="graph-inspector-input" id="gi-area-w" type="number" min="60" step="2" oninput="window.__gUpdateArea('w',+this.value)">
          <input class="graph-inspector-input" id="gi-area-h" type="number" min="60" step="2" oninput="window.__gUpdateArea('h',+this.value)">
        </div>
        <label class="graph-inspector-label">Fill</label>
        <div class="graph-color-swatches">
          ${AREA_COLORS.map(c => `<div class="graph-color-swatch" style="background:${c}" onclick="window.__gUpdateArea('color','${c}')"></div>`).join('')}
        </div>
        <p style="margin-top:14px;font-size:11px;color:var(--muted);font-style:italic;font-family:'Crimson Pro',serif;">
          Drag corners or edges to resize. Areas can be nested.
        </p>
      </div>

      <div id="graph-inspector-edge" style="display:none;">
        <div class="graph-inspector-section">Edge</div>
        <label class="graph-inspector-label">Label</label>
        <input class="graph-inspector-input" id="gi-edge-label" type="text" oninput="window.__gUpdateEdge('label',this.value)">
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
          <option value="tree">Tree (shared trunk)</option>
        </select>
        <label class="graph-inspector-label">From anchor · To anchor</label>
        <div style="display:flex;gap:6px;">
          <select class="graph-inspector-input" id="gi-edge-fromAnchor" onchange="window.__gUpdateEdge('fromAnchor',this.value)">
            <option value="auto">Auto</option>
            <option value="top">Top</option>
            <option value="right">Right</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="nearest">Nearest</option>
          </select>
          <select class="graph-inspector-input" id="gi-edge-toAnchor" onchange="window.__gUpdateEdge('toAnchor',this.value)">
            <option value="auto">Auto</option>
            <option value="top">Top</option>
            <option value="right">Right</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="nearest">Nearest</option>
          </select>
        </div>
        <label class="graph-inspector-label">Weight</label>
        <input class="graph-inspector-input" id="gi-edge-weight" type="range" min="1" max="6" step="0.5" oninput="window.__gUpdateEdge('weight',+this.value)">

        <div class="graph-inspector-section" style="margin-top:18px;">Label appearance</div>
        <label class="graph-inspector-label">Position</label>
        <select class="graph-inspector-input" id="gi-edge-labelMode" onchange="window.__gUpdateEdge('labelMode',this.value)">
          <option value="midpoint">Midpoint (draggable)</option>
          <option value="along-path">Along path</option>
        </select>
        <label class="graph-inspector-label">Rotation</label>
        <select class="graph-inspector-input" id="gi-edge-labelRotation" onchange="window.__gUpdateEdge('labelRotation',this.value)">
          <option value="horizontal">Always horizontal</option>
          <option value="auto">Follow edge angle</option>
        </select>
        <label class="graph-inspector-label">Font</label>
        <select class="graph-inspector-input" id="gi-edge-font-family" onchange="window.__gUpdateEdgeFont('family',this.value)">
          ${FONT_FAMILIES.map(f => `<option value="${f.value}">${f.name}</option>`).join('')}
        </select>
        <label class="graph-inspector-label">Size</label>
        <input class="graph-inspector-input" id="gi-edge-font-size" type="number" min="6" max="32" step="1" oninput="window.__gUpdateEdgeFont('size',+this.value)">
        <label class="graph-inspector-label">Style · Color</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="graph-btn" id="gi-edge-font-bold"   onclick="window.__gToggleEdgeFont('bold')"   style="font-weight:700;">B</button>
          <button class="graph-btn" id="gi-edge-font-italic" onclick="window.__gToggleEdgeFont('italic')" style="font-style:italic;">I</button>
          <input id="gi-edge-font-color" type="color" oninput="window.__gUpdateEdgeFont('color',this.value)" style="flex:1;height:30px;padding:2px;border:1px solid var(--border);border-radius:2px;cursor:pointer;">
        </div>

        <p style="margin-top:14px;font-size:11px;color:var(--muted);font-style:italic;font-family:'Crimson Pro',serif;">
          <strong>Shift+click</strong> the edge to add a waypoint.
          <button class="btn" onclick="window.__gClearWaypoints()" style="margin-top:6px;padding:3px 8px;font-size:11px;">Clear waypoints</button>
        </p>
      </div>

      <div id="graph-inspector-multi" style="display:none;">
        <div class="graph-inspector-section">Multi-selection</div>
        <p id="gi-multi-summary" style="font-family:'Crimson Pro',serif;font-size:13px;color:var(--text-soft);margin-bottom:10px;"></p>
        <button class="btn btn-primary" onclick="window.__gDuplicateSelected()" style="margin-bottom:6px;width:100%;">Duplicate selection (Ctrl+D)</button>
        <button class="btn" onclick="window.__gDeleteSelected()" style="width:100%;">Delete selection (Del)</button>
      </div>
    </aside>
  </div>

  <div class="graph-statusbar">
    <span id="graph-status">Mode: <strong>Select</strong></span>
    <span id="graph-stats" style="margin-left:auto;color:var(--muted-soft);font-size:11px;"></span>
  </div>
</div>`;
}

// ─── EVENTS ────────────────────────────────────────────────────
function bindGraphEvents() {
  document.addEventListener('keydown', gKeydown);
}

function gKeydown(e) {
  if (e.ctrlKey || e.metaKey) {
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) gRedo(); else gUndo();
      return;
    }
    if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); gRedo(); return; }
    if (e.key === 'd' || e.key === 'D') { e.preventDefault(); gDuplicateSelected(); return; }
    return;
  }
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'v' || e.key === 'V') gSetMode('select');
  if (e.key === 'n' || e.key === 'N') gSetMode('addNode');
  if (e.key === 'a' || e.key === 'A') gSetMode('addArea');
  if (e.key === 'e' || e.key === 'E') gSetMode('addEdge');
  if (e.key === 'Delete' || e.key === 'Backspace') gDeleteSelected();
  if (e.key === 'Escape') { G.selected.clear(); G.edgeFrom = null; showInspector(); renderGraph(); }
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

// ─── HISTORY ───────────────────────────────────────────────────
function snapshot() {
  G.history.push(JSON.stringify({ nodes: G.nodes, edges: G.edges, nextId: G.nextId }));
  if (G.history.length > HISTORY_LIMIT) G.history.shift();
  G.future = [];
}

function gUndo() {
  if (G.history.length === 0) return;
  G.future.push(JSON.stringify({ nodes: G.nodes, edges: G.edges, nextId: G.nextId }));
  applySnapshot(G.history.pop());
  scheduleAutosave();
}
function gRedo() {
  if (G.future.length === 0) return;
  G.history.push(JSON.stringify({ nodes: G.nodes, edges: G.edges, nextId: G.nextId }));
  applySnapshot(G.future.pop());
  scheduleAutosave();
}
function applySnapshot(json) {
  try {
    const s = JSON.parse(json);
    G.nodes = s.nodes; G.edges = s.edges; G.nextId = s.nextId;
    G.selected.clear();
    showInspector();
    renderGraph();
  } catch {}
}

// ─── AUTOSAVE ──────────────────────────────────────────────────
function scheduleAutosave() {
  clearTimeout(G.saveTimer);
  G.saveTimer = setTimeout(autosave, AUTOSAVE_MS);
}
function autosave() {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      nodes: G.nodes, edges: G.edges, nextId: G.nextId,
      savedAt: new Date().toISOString(),
    }));
  } catch {}
}
function tryRestoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) return false;
    const when = new Date(data.savedAt).toLocaleString();
    if (!confirm(`Restore previously saved graph from ${when}? (Click Cancel to start fresh.)`)) {
      localStorage.removeItem(AUTOSAVE_KEY);
      return false;
    }
    G.nodes = data.nodes; G.edges = data.edges; G.nextId = data.nextId;
    return true;
  } catch { return false; }
}

// ─── SNAP ──────────────────────────────────────────────────────
function gSetSnap(px) { G.snapGrid = px; updateGridBackground(); }

function snapValue(v, override) {
  if (override) return v;
  if (!G.snapGrid) return v;
  return Math.round(v / G.snapGrid) * G.snapGrid;
}

function updateGridBackground() {
  const wrap = document.getElementById('graph-canvas-wrap');
  if (!wrap) return;
  const sz = (G.snapGrid || 32) * G.zoom;
  wrap.style.backgroundSize = `${sz}px ${sz}px`;
}

// ─── CANVAS HANDLERS ───────────────────────────────────────────
function gCanvasClick(e) {
  if (G.dragging) return;
  if (G.mode === 'addNode') {
    snapshot();
    const { sx, sy } = svgXY(e);
    addNode(snapValue(sx, e.altKey), snapValue(sy, e.altKey));
    scheduleAutosave();
  }
}

function gCanvasMousedown(e) {
  const id = e.target.id || '';
  if (id !== 'graph-svg' && !id.endsWith('-layer')) return;
  const { sx, sy } = svgXY(e);

  if (G.mode === 'addArea') {
    snapshot();
    const newId = G.nextId++;
    const a = { id: newId, kind: 'area', label: `Area ${newId}`,
      x: snapValue(sx, e.altKey), y: snapValue(sy, e.altKey), w: 60, h: 60,
      color: AREA_COLORS[(newId - 1) % AREA_COLORS.length] };
    G.nodes.push(a);
    G.selected = new Set([newId]);
    G.dragging = { id: newId, kind: 'resize', startX: sx, startY: sy };
    G.resizeDir = 'se';
    showInspector();
    renderGraph();
    return;
  }

  if (G.mode === 'select') {
    if (e.shiftKey) {
      G.marquee = { x1: sx, y1: sy, x2: sx, y2: sy };
    } else {
      G.panStart = { mx: e.clientX, my: e.clientY, ox: G.panOffset.x, oy: G.panOffset.y };
      G.selected.clear();
      G.edgeFrom = null;
      showInspector();
      renderGraph();
    }
  }
}

function gCanvasMousemove(e) {
  if (!G.dragging && !G.panStart && !G.marquee) return;
  const { sx, sy } = svgXY(e);

  if (G.dragging) {
    const d = G.dragging;

    if (d.kind === 'node' || d.kind === 'area') {
      const newAnchorX = sx - d.ox;
      const newAnchorY = sy - d.oy;
      const dx = newAnchorX - (d.lastAnchorX != null ? d.lastAnchorX : newAnchorX);
      const dy = newAnchorY - (d.lastAnchorY != null ? d.lastAnchorY : newAnchorY);
      d.lastAnchorX = newAnchorX;
      d.lastAnchorY = newAnchorY;
      const targets = [...G.selected].filter(id => typeof id === 'number');
      for (const id of targets) {
        const n = G.nodes.find(x => x.id === id);
        if (!n) continue;
        n.x = snapValue(n.x + dx, e.altKey);
        n.y = snapValue(n.y + dy, e.altKey);
      }
      renderGraph();
    } else if (d.kind === 'resize') {
      const a = G.nodes.find(x => x.id === d.id);
      if (!a) return;
      if (d.startX != null) {
        a.x = snapValue(Math.min(d.startX, sx), e.altKey);
        a.y = snapValue(Math.min(d.startY, sy), e.altKey);
        a.w = Math.max(40, Math.abs(sx - d.startX));
        a.h = Math.max(40, Math.abs(sy - d.startY));
      } else {
        const dir = G.resizeDir;
        if (a.kind === 'area') {
          const right = d.origX + d.origW, bottom = d.origY + d.origH;
          if (dir.includes('e')) a.w = Math.max(40, snapValue(sx, e.altKey) - a.x);
          if (dir.includes('s')) a.h = Math.max(40, snapValue(sy, e.altKey) - a.y);
          if (dir.includes('w')) { const nx = Math.min(snapValue(sx, e.altKey), right - 40); a.w = right - nx; a.x = nx; }
          if (dir.includes('n')) { const ny = Math.min(snapValue(sy, e.altKey), bottom - 40); a.h = bottom - ny; a.y = ny; }
        } else {
          const left = a.x - a.w / 2, top = a.y - a.h / 2;
          const right = left + a.w, bottom = top + a.h;
          let newL = left, newT = top, newR = right, newB = bottom;
          if (dir.includes('e')) newR = Math.max(left + 20, snapValue(sx, e.altKey));
          if (dir.includes('s')) newB = Math.max(top + 20,  snapValue(sy, e.altKey));
          if (dir.includes('w')) newL = Math.min(snapValue(sx, e.altKey), right - 20);
          if (dir.includes('n')) newT = Math.min(snapValue(sy, e.altKey), bottom - 20);
          a.w = newR - newL;
          a.h = newB - newT;
          a.x = (newL + newR) / 2;
          a.y = (newT + newB) / 2;
        }
      }
      renderGraph();
    } else if (d.kind === 'waypoint') {
      const ed = G.edges.find(x => x.id === d.edgeId);
      if (ed && ed.waypoints[d.idx]) {
        ed.waypoints[d.idx] = { x: snapValue(sx, e.altKey), y: snapValue(sy, e.altKey) };
        renderGraph();
      }
    } else if (d.kind === 'label') {
      const ed = G.edges.find(x => x.id === d.edgeId);
      if (ed) {
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
  } else if (G.marquee) {
    G.marquee.x2 = sx;
    G.marquee.y2 = sy;
    renderMarquee();
  }
}

function gCanvasMouseup() {
  if (G.dragging) {
    if (G.dragging.kind === 'resize' && G.dragging.startX != null) {
      G.dragging = null; G.resizeDir = null;
      gSetMode('select');
      scheduleAutosave();
      return;
    }
    G.dragging = null; G.resizeDir = null;
    scheduleAutosave();
  }
  G.panStart = null;
  if (G.marquee) {
    finalizeMarquee();
    G.marquee = null;
    renderGraph();
  }
}

function gWheel(e) {
  e.preventDefault();
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  updateGridBackground();
  renderGraph();
}

function renderMarquee() {
  if (!G.marquee) {
    document.getElementById('graph-marquee-layer').innerHTML = '';
    return;
  }
  const m = G.marquee;
  const x = Math.min(m.x1, m.x2), y = Math.min(m.y1, m.y2);
  const w = Math.abs(m.x2 - m.x1), h = Math.abs(m.y2 - m.y1);
  document.getElementById('graph-marquee-layer').innerHTML =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(184,137,26,0.1)" stroke="var(--gold)" stroke-width="1" stroke-dasharray="4,3"/>`;
}

function finalizeMarquee() {
  document.getElementById('graph-marquee-layer').innerHTML = '';
  const m = G.marquee;
  const minX = Math.min(m.x1, m.x2), maxX = Math.max(m.x1, m.x2);
  const minY = Math.min(m.y1, m.y2), maxY = Math.max(m.y1, m.y2);
  if (Math.abs(maxX - minX) < 4 || Math.abs(maxY - minY) < 4) return;
  for (const n of G.nodes) {
    let hit;
    if (n.kind === 'node') {
      hit = n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY;
    } else {
      hit = !(n.x + n.w < minX || n.x > maxX || n.y + n.h < minY || n.y > maxY);
    }
    if (hit) G.selected.add(n.id);
  }
  showInspector();
}

// ─── ELEMENT HANDLERS ──────────────────────────────────────────
function nodeMousedown(e, id) {
  e.stopPropagation();
  const node = G.nodes.find(n => n.id === id);
  if (!node) return;
  const { sx, sy } = svgXY(e);
  if (G.mode === 'select') {
    if (e.shiftKey) {
      if (G.selected.has(id)) G.selected.delete(id);
      else G.selected.add(id);
    } else if (!G.selected.has(id)) {
      G.selected = new Set([id]);
    }
    G.dragging = {
      id, kind: node.kind === 'area' ? 'area' : 'node',
      ox: sx - node.x, oy: sy - node.y,
    };
    G.edgeFrom = null;
    snapshot();
    showInspector();
    renderGraph();
  } else if (G.mode === 'addEdge' && node.kind === 'node') {
    if (G.edgeFrom === null) {
      G.edgeFrom = id;
      G.selected = new Set([id]);
      renderGraph();
      updateStatus('Now click the target node');
    } else if (G.edgeFrom !== id) {
      snapshot();
      addEdge(G.edgeFrom, id);
      G.edgeFrom = null;
      G.selected.clear();
      scheduleAutosave();
    }
  }
}

function resizeMousedown(e, nodeId, dir) {
  e.stopPropagation();
  const a = G.nodes.find(n => n.id === nodeId);
  if (!a) return;
  snapshot();
  const left = a.kind === 'area' ? a.x : a.x - a.w / 2;
  const top  = a.kind === 'area' ? a.y : a.y - a.h / 2;
  G.dragging = {
    id: nodeId, kind: 'resize',
    origX: left, origY: top, origW: a.w, origH: a.h,
  };
  G.resizeDir = dir;
  G.selected = new Set([nodeId]);
  showInspector();
}

function edgeMousedown(e, edgeId) {
  e.stopPropagation();
  const edge = G.edges.find(x => x.id === edgeId);
  if (!edge) return;
  const isAlreadySelected = G.selected.has(`e${edgeId}`);
  if (e.shiftKey) {
    if (isAlreadySelected) {
      snapshot();
      const { sx, sy } = svgXY(e);
      edge.waypoints.push({ x: snapValue(sx, e.altKey), y: snapValue(sy, e.altKey) });
      showInspector();
      renderGraph();
      scheduleAutosave();
    } else {
      G.selected.add(`e${edgeId}`);
      showInspector();
      renderGraph();
    }
    return;
  }
  G.selected = new Set([`e${edgeId}`]);
  showInspector();
  renderGraph();
}

function waypointMousedown(e, edgeId, idx) {
  e.stopPropagation();
  snapshot();
  G.dragging = { kind: 'waypoint', edgeId, idx };
  G.selected = new Set([`e${edgeId}`]);
  showInspector();
}

function edgeLabelMousedown(e, edgeId) {
  e.stopPropagation();
  snapshot();
  G.dragging = { kind: 'label', edgeId };
  G.selected = new Set([`e${edgeId}`]);
  showInspector();
}

// ─── CRUD ──────────────────────────────────────────────────────
function addNode(x, y) {
  const id = G.nextId++;
  const n = makeNode(id, `Node ${id}`, x, y, NODE_COLORS[(id - 1) % NODE_COLORS.length], 'rounded');
  G.nodes.push(n);
  G.selected = new Set([id]);
  showInspector();
  renderGraph();
  setTimeout(() => { const el = document.getElementById('gi-label'); if (el) { el.focus(); el.select(); } }, 50);
}

function addEdge(from, to) {
  const id = G.nextId++;
  G.edges.push(makeEdge(id, from, to, '', 'solid', 'one', 1.5, G.defaultRouting));
  G.selected = new Set([`e${id}`]);
  showInspector();
  renderGraph();
}

function gDeleteSelected() {
  if (G.selected.size === 0) return;
  snapshot();
  const ids = new Set(G.selected);
  G.edges = G.edges.filter(ed => {
    if (ids.has(`e${ed.id}`)) return false;
    if (ids.has(ed.from) || ids.has(ed.to)) return false;
    return true;
  });
  G.nodes = G.nodes.filter(n => !ids.has(n.id));
  G.selected.clear();
  showInspector();
  renderGraph();
  scheduleAutosave();
}

function gDuplicateSelected() {
  if (G.selected.size === 0) return;
  snapshot();
  const idMap = new Map();
  const newIds = [];
  for (const id of G.selected) {
    if (typeof id !== 'number') continue;
    const orig = G.nodes.find(n => n.id === id);
    if (!orig) continue;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = G.nextId++;
    copy.x += 30; copy.y += 30;
    G.nodes.push(copy);
    idMap.set(orig.id, copy.id);
    newIds.push(copy.id);
  }
  for (const ed of G.edges) {
    const inSel = G.selected.has(`e${ed.id}`);
    const bothDup = idMap.has(ed.from) && idMap.has(ed.to);
    if (!inSel && !bothDup) continue;
    const copy = JSON.parse(JSON.stringify(ed));
    copy.id = G.nextId++;
    if (idMap.has(copy.from)) copy.from = idMap.get(copy.from);
    if (idMap.has(copy.to))   copy.to   = idMap.get(copy.to);
    G.edges.push(copy);
    newIds.push(`e${copy.id}`);
  }
  G.selected = new Set(newIds);
  showInspector();
  renderGraph();
  scheduleAutosave();
}

function gClear() {
  if (!confirm('Clear all nodes, areas and edges?')) return;
  snapshot();
  G.nodes = []; G.edges = []; G.selected.clear(); G.nextId = 1;
  showInspector(); renderGraph();
  scheduleAutosave();
}

function gSeedExample() {
  snapshot();
  G.nodes = []; G.edges = []; G.selected.clear(); G.nextId = 1;
  seedExample();
  showInspector(); renderGraph();
  scheduleAutosave();
}

function gClearWaypoints() {
  const sel = [...G.selected].find(s => typeof s === 'string' && s.startsWith('e'));
  if (!sel) return;
  snapshot();
  const e = G.edges.find(x => `e${x.id}` === sel);
  if (e) { e.waypoints = []; renderGraph(); scheduleAutosave(); }
}

// ─── INSPECTOR ─────────────────────────────────────────────────
function showInspector() {
  const empty   = document.getElementById('graph-inspector-empty');
  const nodeDiv = document.getElementById('graph-inspector-node');
  const areaDiv = document.getElementById('graph-inspector-area');
  const edgeDiv = document.getElementById('graph-inspector-edge');
  const multiDiv = document.getElementById('graph-inspector-multi');
  if (!empty) return;

  [empty, nodeDiv, areaDiv, edgeDiv, multiDiv].forEach(el => el && (el.style.display = 'none'));

  if (G.selected.size === 0) {
    empty.style.display = 'block';
    return;
  }
  if (G.selected.size > 1) {
    multiDiv.style.display = 'block';
    const nodes = [...G.selected].filter(s => typeof s === 'number' && G.nodes.find(n => n.id === s && n.kind === 'node')).length;
    const areas = [...G.selected].filter(s => typeof s === 'number' && G.nodes.find(n => n.id === s && n.kind === 'area')).length;
    const edges = [...G.selected].filter(s => typeof s === 'string' && s.startsWith('e')).length;
    document.getElementById('gi-multi-summary').textContent =
      `${nodes} node${nodes!==1?'s':''}, ${areas} area${areas!==1?'s':''}, ${edges} edge${edges!==1?'s':''} selected.`;
    return;
  }
  const sel = [...G.selected][0];
  if (typeof sel === 'string' && sel.startsWith('e')) {
    const e = G.edges.find(x => `e${x.id}` === sel);
    if (!e) return;
    edgeDiv.style.display = 'block';
    document.getElementById('gi-edge-label').value          = e.label || '';
    document.getElementById('gi-edge-style').value          = e.style || 'solid';
    document.getElementById('gi-edge-arrows').value         = e.arrows || 'one';
    document.getElementById('gi-edge-routing').value        = e.routing || 'straight';
    document.getElementById('gi-edge-fromAnchor').value     = e.fromAnchor || 'auto';
    document.getElementById('gi-edge-toAnchor').value       = e.toAnchor || 'auto';
    document.getElementById('gi-edge-weight').value         = e.weight || 1.5;
    document.getElementById('gi-edge-labelMode').value      = e.labelMode || 'midpoint';
    document.getElementById('gi-edge-labelRotation').value  = e.labelRotation || 'horizontal';
    if (e.labelFont) {
      document.getElementById('gi-edge-font-family').value = e.labelFont.family;
      document.getElementById('gi-edge-font-size').value   = e.labelFont.size;
      document.getElementById('gi-edge-font-color').value  = e.labelFont.color || '#5a5a5a';
      document.getElementById('gi-edge-font-bold').classList.toggle('active', !!e.labelFont.bold);
      document.getElementById('gi-edge-font-italic').classList.toggle('active', !!e.labelFont.italic);
    }
    return;
  }
  const n = G.nodes.find(x => x.id === sel);
  if (!n) return;
  if (n.kind === 'area') {
    areaDiv.style.display = 'block';
    document.getElementById('gi-area-label').value = n.label || '';
    document.getElementById('gi-area-w').value     = Math.round(n.w);
    document.getElementById('gi-area-h').value     = Math.round(n.h);
  } else {
    nodeDiv.style.display = 'block';
    document.getElementById('gi-label').value = n.label;
    document.getElementById('gi-group').value = n.group || '';
    document.getElementById('gi-shape').value = n.shape || 'rounded';
    document.getElementById('gi-w').value     = Math.round(n.w);
    document.getElementById('gi-h').value     = Math.round(n.h);
    if (n.color && n.color.startsWith('#')) document.getElementById('gi-color-custom').value = n.color;
    if (n.font) {
      document.getElementById('gi-font-family').value  = n.font.family;
      document.getElementById('gi-font-size').value    = n.font.size;
      document.getElementById('gi-font-spacing').value = n.font.letterSpacing || 0;
      document.getElementById('gi-font-align').value   = n.font.align || 'center';
      document.getElementById('gi-font-color').value   = n.font.color || '#ffffff';
      document.getElementById('gi-font-bold').classList.toggle('active', !!n.font.bold);
      document.getElementById('gi-font-italic').classList.toggle('active', !!n.font.italic);
    }
  }
}

function gUpdateNode(key, value) {
  for (const id of G.selected) {
    if (typeof id !== 'number') continue;
    const n = G.nodes.find(x => x.id === id);
    if (!n || n.kind !== 'node') continue;
    n[key] = value;
  }
  renderGraph();
  scheduleAutosave();
}
function gUpdateArea(key, value) {
  for (const id of G.selected) {
    if (typeof id !== 'number') continue;
    const a = G.nodes.find(x => x.id === id);
    if (!a || a.kind !== 'area') continue;
    a[key] = value;
  }
  renderGraph();
  scheduleAutosave();
}
function gUpdateEdge(key, value) {
  for (const id of G.selected) {
    if (typeof id !== 'string' || !id.startsWith('e')) continue;
    const e = G.edges.find(x => `e${x.id}` === id);
    if (!e) continue;
    e[key] = value;
  }
  renderGraph();
  scheduleAutosave();
}
function gUpdateNodeFont(key, value) {
  for (const id of G.selected) {
    if (typeof id !== 'number') continue;
    const n = G.nodes.find(x => x.id === id);
    if (!n || n.kind !== 'node' || !n.font) continue;
    n.font[key] = value;
  }
  renderGraph();
  scheduleAutosave();
}
function gToggleNodeFont(key) {
  for (const id of G.selected) {
    if (typeof id !== 'number') continue;
    const n = G.nodes.find(x => x.id === id);
    if (!n || n.kind !== 'node' || !n.font) continue;
    n.font[key] = !n.font[key];
  }
  document.getElementById(`gi-font-${key}`)?.classList.toggle('active');
  renderGraph();
  scheduleAutosave();
}
function gUpdateEdgeFont(key, value) {
  for (const id of G.selected) {
    if (typeof id !== 'string' || !id.startsWith('e')) continue;
    const e = G.edges.find(x => `e${x.id}` === id);
    if (!e) continue;
    if (!e.labelFont) e.labelFont = { family: FONT_FAMILIES[0].value, size: 10, color: '', bold: false, italic: false };
    e.labelFont[key] = value;
  }
  renderGraph();
  scheduleAutosave();
}
function gToggleEdgeFont(key) {
  for (const id of G.selected) {
    if (typeof id !== 'string' || !id.startsWith('e')) continue;
    const e = G.edges.find(x => `e${x.id}` === id);
    if (!e) continue;
    if (!e.labelFont) e.labelFont = { family: FONT_FAMILIES[0].value, size: 10, color: '', bold: false, italic: false };
    e.labelFont[key] = !e.labelFont[key];
  }
  document.getElementById(`gi-edge-font-${key}`)?.classList.toggle('active');
  renderGraph();
  scheduleAutosave();
}

// ─── GEOMETRY ──────────────────────────────────────────────────
function nodeBounds(n) {
  return {
    left:   n.x - n.w / 2,
    right:  n.x + n.w / 2,
    top:    n.y - n.h / 2,
    bottom: n.y + n.h / 2,
  };
}

function anchorPoint(node, anchor, otherX, otherY) {
  const b = nodeBounds(node);
  if (anchor === 'top')    return { x: node.x, y: b.top };
  if (anchor === 'right')  return { x: b.right, y: node.y };
  if (anchor === 'bottom') return { x: node.x, y: b.bottom };
  if (anchor === 'left')   return { x: b.left, y: node.y };
  if (anchor === 'nearest') {
    const cands = [
      { x: node.x, y: b.top },
      { x: b.right, y: node.y },
      { x: node.x, y: b.bottom },
      { x: b.left, y: node.y },
    ];
    cands.sort((p, q) =>
      Math.hypot(p.x - otherX, p.y - otherY) - Math.hypot(q.x - otherX, q.y - otherY));
    return cands[0];
  }
  return autoAnchor(node, otherX, otherY);
}

function autoAnchor(n, otherX, otherY) {
  const dx = otherX - n.x, dy = otherY - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  if (n.shape === 'circle' || n.shape === 'ellipse') {
    const a = n.w / 2, b = n.h / 2;
    const t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
    return { x: n.x + dx * t, y: n.y + dy * t };
  }
  if (n.shape === 'diamond') {
    const hw = n.w / 2, hh = n.h / 2;
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: n.x + dx * t, y: n.y + dy * t };
  }
  return rectIntersect(n, dx, dy);
}

function rectIntersect(n, dx, dy) {
  const hw = n.w / 2, hh = n.h / 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: n.x + dx * t, y: n.y + dy * t };
}

function edgeEndpoints(edge) {
  const f = G.nodes.find(n => n.id === edge.from && n.kind === 'node');
  const t = G.nodes.find(n => n.id === edge.to   && n.kind === 'node');
  return f && t ? { f, t } : null;
}

function routePoints(edge) {
  const ep = edgeEndpoints(edge);
  if (!ep) return [{ x: 0, y: 0 }];
  const wps = edge.waypoints || [];
  const fromOther = wps[0]              ? { x: wps[0].x, y: wps[0].y }                       : { x: ep.t.x, y: ep.t.y };
  const toOther   = wps[wps.length - 1] ? { x: wps[wps.length - 1].x, y: wps[wps.length - 1].y } : { x: ep.f.x, y: ep.f.y };
  const fromPt = anchorPoint(ep.f, edge.fromAnchor || 'auto', fromOther.x, fromOther.y);
  const toPt   = anchorPoint(ep.t, edge.toAnchor   || 'auto', toOther.x,   toOther.y);
  return [fromPt, ...wps, toPt];
}

function buildEdgePath(edge) {
  if (edge.routing === 'tree') return buildTreePath(edge);
  const pts = routePoints(edge);
  if (pts.length < 2) return '';
  if (edge.routing === 'orthogonal') {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      d += ` L${q.x},${p.y} L${q.x},${q.y}`;
    }
    return d;
  }
  if (edge.routing === 'curved' && pts.length === 2) {
    const [a, b] = pts;
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  if (edge.routing === 'curved' && pts.length > 2) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      d += ` Q${pts[i].x},${pts[i].y} ${mid.x},${mid.y}`;
    }
    d += ` T${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
    return d;
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  return d;
}

function buildTreePath(edge) {
  const ep = edgeEndpoints(edge);
  if (!ep) return '';
  const fromPt = anchorPoint(ep.f, 'bottom', ep.t.x, ep.t.y);
  const toPt   = anchorPoint(ep.t, 'top',    ep.f.x, ep.f.y);
  // Trunk Y is shared across all "tree"-routed edges from the same source —
  // halfway between source bottom and the highest of all sibling child tops.
  const siblings = G.edges.filter(e => e.routing === 'tree' && e.from === edge.from);
  let highestChildTop = toPt.y;
  for (const s of siblings) {
    const t = G.nodes.find(n => n.id === s.to && n.kind === 'node');
    if (!t) continue;
    const top = anchorPoint(t, 'top', ep.f.x, ep.f.y).y;
    if (top < highestChildTop) highestChildTop = top;
  }
  const trunkY = (fromPt.y + highestChildTop) / 2;
  return `M${fromPt.x},${fromPt.y} L${fromPt.x},${trunkY} L${toPt.x},${trunkY} L${toPt.x},${toPt.y}`;
}

function edgeLabelPos(edge) {
  const pts = routePoints(edge);
  const mid = pts[Math.floor(pts.length / 2)];
  return { x: mid.x + (edge.labelOffset?.dx || 0), y: mid.y + (edge.labelOffset?.dy || -8) };
}

function edgeLabelAngle(edge) {
  const pts = routePoints(edge);
  if (pts.length < 2) return 0;
  const i = Math.max(1, Math.floor(pts.length / 2));
  const p1 = pts[i - 1], p2 = pts[i];
  let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
  // Keep upright — never flip text upside down
  if (angle > 90)  angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

// ─── RENDER ────────────────────────────────────────────────────
function renderGraph() {
  const tx = G.panOffset.x * G.zoom, ty = G.panOffset.y * G.zoom;
  ['graph-areas-layer','graph-edges-layer','graph-nodes-layer','graph-edge-labels-layer','graph-handles-layer','graph-marquee-layer'].forEach(id => {
    const g = document.getElementById(id);
    if (g) g.setAttribute('transform', `translate(${tx},${ty}) scale(${G.zoom})`);
  });

  const areas = G.nodes.filter(n => n.kind === 'area').sort((a, b) => (b.w * b.h) - (a.w * a.h));
  document.getElementById('graph-areas-layer').innerHTML = areas.map(renderArea).join('');
  document.getElementById('graph-edges-layer').innerHTML = G.edges.map(renderEdge).join('');
  const nodes = G.nodes.filter(n => n.kind !== 'area');
  document.getElementById('graph-nodes-layer').innerHTML = nodes.map(renderNode).join('');
  // Edge labels go on a separate layer ABOVE nodes — fixes label-not-visible bug
  document.getElementById('graph-edge-labels-layer').innerHTML = G.edges.map(renderEdgeLabel).join('');

  let handlesHtml = '';
  if (G.selected.size === 1) {
    const sel = [...G.selected][0];
    if (typeof sel === 'number') {
      const n = G.nodes.find(x => x.id === sel);
      if (n) handlesHtml += renderResizeHandles(n);
    }
    if (typeof sel === 'string' && sel.startsWith('e')) {
      const ed = G.edges.find(x => `e${x.id}` === sel);
      if (ed) ed.waypoints.forEach((wp, i) => {
        handlesHtml += `<circle class="g-waypoint" data-eid="${ed.id}" data-idx="${i}"
          cx="${wp.x}" cy="${wp.y}" r="6" fill="var(--gold)" stroke="white" stroke-width="2" style="cursor:move;"/>`;
      });
    }
  }
  document.getElementById('graph-handles-layer').innerHTML = handlesHtml;
  if (G.marquee) renderMarquee();

  // Bind events (innerHTML wipes them)
  G.nodes.forEach(n => {
    const el = document.getElementById(`gnode-${n.id}`);
    if (el) el.addEventListener('mousedown', e => nodeMousedown(e, n.id));
    if (G.selected.size === 1 && [...G.selected][0] === n.id) {
      ['nw','ne','sw','se','n','s','w','e'].forEach(dir => {
        const h = document.getElementById(`gresize-${n.id}-${dir}`);
        if (h) h.addEventListener('mousedown', e => resizeMousedown(e, n.id, dir));
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
  if (stats) {
    const sel = G.selected.size > 0 ? ` · ${G.selected.size} selected` : '';
    stats.textContent = `${nodes.length} nodes · ${areas.length} areas · ${G.edges.length} edges${sel}`;
  }
}

function renderArea(a) {
  const sel = G.selected.has(a.id);
  return `<g id="gnode-${a.id}" style="cursor:move;">
    <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="4"
      fill="${a.color}" stroke="${sel ? 'var(--gold)' : 'rgba(0,0,0,0.2)'}"
      stroke-width="${sel ? 2 : 1}" stroke-dasharray="${sel ? '0' : '4,3'}"/>
    ${a.label ? `<text x="${a.x + 10}" y="${a.y + 16}" font-size="12" font-family="'Source Sans 3',sans-serif"
      font-weight="700" fill="rgba(0,0,0,0.65)" pointer-events="none"
      style="user-select:none;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(a.label)}</text>` : ''}
  </g>`;
}

function renderResizeHandles(n) {
  let left, top, w, h;
  if (n.kind === 'area') { left = n.x; top = n.y; w = n.w; h = n.h; }
  else { left = n.x - n.w / 2; top = n.y - n.h / 2; w = n.w; h = n.h; }
  const positions = [
    { dir: 'nw', x: left,         y: top,         cur: 'nwse-resize' },
    { dir: 'ne', x: left + w,     y: top,         cur: 'nesw-resize' },
    { dir: 'sw', x: left,         y: top + h,     cur: 'nesw-resize' },
    { dir: 'se', x: left + w,     y: top + h,     cur: 'nwse-resize' },
    { dir: 'n',  x: left + w/2,   y: top,         cur: 'ns-resize'   },
    { dir: 's',  x: left + w/2,   y: top + h,     cur: 'ns-resize'   },
    { dir: 'w',  x: left,         y: top + h/2,   cur: 'ew-resize'   },
    { dir: 'e',  x: left + w,     y: top + h/2,   cur: 'ew-resize'   },
  ];
  return positions.map(p =>
    `<rect id="gresize-${n.id}-${p.dir}" x="${p.x - 5}" y="${p.y - 5}" width="10" height="10"
       fill="white" stroke="var(--gold)" stroke-width="1.5" style="cursor:${p.cur};"/>`
  ).join('');
}

function renderNode(n) {
  const sel = G.selected.has(n.id);
  const edgeSrc = G.edgeFrom === n.id;
  const stroke = sel ? 'var(--gold)' : edgeSrc ? '#5a9a5a' : 'rgba(255,255,255,0.25)';
  const sw = sel || edgeSrc ? 2.5 : 1.5;
  const W = n.w, H = n.h;
  const cx = -W/2, cy = -H/2;
  let shape;
  if (n.shape === 'circle') {
    const r = Math.min(W, H) / 2;
    shape = `<circle cx="0" cy="0" r="${r}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'ellipse') {
    shape = `<ellipse cx="0" cy="0" rx="${W/2}" ry="${H/2}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'semicircle') {
    const r = W / 2;
    shape = `<path d="M${-r},${H/2} A${r},${H} 0 0 1 ${r},${H/2} Z"
      fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'diamond') {
    shape = `<polygon points="0,${-H/2} ${W/2},0 0,${H/2} ${-W/2},0" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'hexagon') {
    const a = W/4;
    shape = `<polygon points="${-W/2 + a},${-H/2} ${W/2 - a},${-H/2} ${W/2},0 ${W/2 - a},${H/2} ${-W/2 + a},${H/2} ${-W/2},0" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'parallelogram') {
    const skew = H * 0.3;
    shape = `<polygon points="${-W/2 + skew},${-H/2} ${W/2},${-H/2} ${W/2 - skew},${H/2} ${-W/2},${H/2}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else if (n.shape === 'label') {
    // Borderless label-only — only show selection rect when selected; transparent hit area otherwise
    shape = sel
      ? `<rect x="${cx}" y="${cy}" width="${W}" height="${H}" fill="transparent" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="3,3"/>`
      : `<rect x="${cx}" y="${cy}" width="${W}" height="${H}" fill="transparent" stroke="transparent"/>`;
  } else {
    const rx = n.shape === 'rounded' ? 8 : 2;
    shape = `<rect x="${cx}" y="${cy}" width="${W}" height="${H}" rx="${rx}" fill="${n.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  const text = renderNodeText(n);
  return `<g id="gnode-${n.id}" transform="translate(${n.x},${n.y})" style="cursor:move;">
    ${shape}
    ${text}
    ${n.group ? `<text text-anchor="middle" dominant-baseline="middle" y="${H/2 + 14}"
      font-size="9" font-family="'Source Sans 3',sans-serif"
      fill="var(--muted)" pointer-events="none" style="user-select:none;">${escapeHtml(n.group)}</text>` : ''}
  </g>`;
}

function renderNodeText(n) {
  const f = n.font || { family: "'Source Sans 3',sans-serif", size: 12, letterSpacing: 0,
                        align: 'center', bold: true, italic: false, color: '#ffffff' };
  const lines = wrapLabel(n.label, n.w - 12, f.size);
  const lineHeight = f.size * 1.2;
  const startY = -((lines.length - 1) * lineHeight) / 2;
  // For label-only shapes: if user kept the default white, force dark text instead
  const fillColor = (n.shape === 'label' && (f.color === '#ffffff' || !f.color)) ? '#1a1a1a' : (f.color || '#ffffff');
  const anchor = f.align === 'left' ? 'start' : f.align === 'right' ? 'end' : 'middle';
  const xPos   = f.align === 'left' ? -n.w/2 + 6 : f.align === 'right' ? n.w/2 - 6 : 0;

  return lines.map((line, i) => `
    <text x="${xPos}" y="${startY + i * lineHeight}"
      text-anchor="${anchor}" dominant-baseline="middle"
      font-family="${f.family}" font-size="${f.size}"
      ${f.letterSpacing ? `letter-spacing="${f.letterSpacing}"` : ''}
      font-weight="${f.bold ? 700 : 400}"
      font-style="${f.italic ? 'italic' : 'normal'}"
      fill="${fillColor}" pointer-events="none" style="user-select:none;">${escapeHtml(line)}</text>`
  ).join('');
}

function wrapLabel(text, maxWidth, fontSize) {
  if (!text) return [''];
  const charW = fontSize * 0.55;
  const maxChars = Math.max(4, Math.floor(maxWidth / charW));
  const out = [];
  for (const para of String(text).split(/\n/)) {
    if (para.length <= maxChars) { out.push(para); continue; }
    const words = para.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if (!cur) { cur = w; continue; }
      if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [''];
}

function renderEdge(edge) {
  const ep = edgeEndpoints(edge);
  if (!ep) return '';
  const sel = G.selected.has(`e${edge.id}`);
  const stroke = sel ? 'var(--gold)' : 'var(--muted)';
  const strokeW = (edge.weight || 1.5) * (sel ? 1.4 : 1);
  const dashArr = edge.style === 'dashed' ? '6,4' : edge.style === 'dotted' ? '2,4' : 'none';
  const markerStart = edge.arrows === 'both'
    ? (sel ? 'url(#arrowhead-start-selected)' : 'url(#arrowhead-start)') : 'none';
  const markerEnd = (edge.arrows === 'one' || edge.arrows === 'both')
    ? (sel ? 'url(#arrowhead-selected)' : 'url(#arrowhead)') : 'none';
  const d = buildEdgePath(edge);
  const pathId = `edgepath-${edge.id}`;
  return `<g>
    <path id="${pathId}" d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeW}"
      stroke-dasharray="${dashArr}" marker-start="${markerStart}" marker-end="${markerEnd}"/>
    <path id="gedge-hit-${edge.id}" d="${d}" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer;"/>
  </g>`;
}

function renderEdgeLabel(edge) {
  if (!edge.label) return '';
  const ep = edgeEndpoints(edge);
  if (!ep) return '';
  const f = edge.labelFont || { family: "'Source Sans 3',sans-serif", size: 10, color: '', bold: false, italic: false };
  const fontStyle = `font-family="${f.family}" font-size="${f.size}" font-weight="${f.bold ? 700 : 400}" font-style="${f.italic ? 'italic' : 'normal'}"`;
  const fill = f.color || 'var(--muted-soft)';

  if (edge.labelMode === 'along-path') {
    const pathId = `edgepath-${edge.id}`;
    return `<g id="gedge-label-${edge.id}" style="cursor:pointer;">
      <text ${fontStyle} fill="${fill}" style="user-select:none;">
        <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapeHtml(edge.label)}</textPath>
      </text>
    </g>`;
  }

  const pos = edgeLabelPos(edge);
  const angle = edge.labelRotation === 'auto' ? edgeLabelAngle(edge) : 0;
  const text = String(edge.label);
  const w = text.length * (f.size * 0.62) + 10;
  const h = f.size * 1.4;
  return `<g id="gedge-label-${edge.id}" transform="translate(${pos.x},${pos.y}) rotate(${angle.toFixed(2)})" style="cursor:move;">
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" fill="var(--bg)" opacity="0.92" rx="2"/>
    <text x="0" y="1" text-anchor="middle" dominant-baseline="middle"
      ${fontStyle} fill="${fill}" style="user-select:none;">${escapeHtml(text)}</text>
  </g>`;
}

// ─── ZOOM ──────────────────────────────────────────────────────
function gZoom(factor) {
  G.zoom = Math.max(0.2, Math.min(4, G.zoom * factor));
  updateGridBackground();
  renderGraph();
}
function gResetView() {
  G.zoom = 1; G.panOffset = { x: 0, y: 0 };
  updateGridBackground();
  renderGraph();
}

// ─── EXPORT ────────────────────────────────────────────────────
function buildExportSvg() {
  const allX = [], allY = [];
  G.nodes.forEach(n => {
    if (n.kind === 'area') { allX.push(n.x, n.x + n.w); allY.push(n.y, n.y + n.h); }
    else { allX.push(n.x - n.w/2, n.x + n.w/2); allY.push(n.y - n.h/2, n.y + n.h/2); }
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

  // Areas
  const areas = G.nodes.filter(n => n.kind === 'area').sort((a, b) => b.w * b.h - a.w * a.h);
  for (const a of areas) {
    out += `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="4" fill="${a.color}" stroke="rgba(0,0,0,0.2)" stroke-dasharray="4,3"/>`;
    if (a.label) out += `<text x="${a.x + 10}" y="${a.y + 16}" font-size="12" font-weight="700" fill="rgba(0,0,0,0.65)" style="text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(a.label)}</text>`;
  }
  // Edges (paths first, then nodes, then labels last so they sit on top)
  for (const e of G.edges) {
    const ep = edgeEndpoints(e);
    if (!ep) continue;
    const d = buildEdgePath(e);
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6,4"' : e.style === 'dotted' ? ' stroke-dasharray="2,4"' : '';
    const ms = e.arrows === 'both' ? ' marker-start="url(#ar-start)"' : '';
    const me = (e.arrows === 'one' || e.arrows === 'both') ? ' marker-end="url(#ar)"' : '';
    out += `<path id="exp-edgepath-${e.id}" d="${d}" fill="none" stroke="#5a5a5a" stroke-width="${e.weight || 1.5}"${dash}${ms}${me}/>`;
  }
  for (const n of G.nodes.filter(x => x.kind === 'node')) out += renderNodeForExport(n);
  for (const e of G.edges) if (e.label) out += renderEdgeLabelForExport(e);
  out += '</svg>';
  return { svg: out, width: W, height: H };
}

function renderNodeForExport(n) {
  const W = n.w, H = n.h;
  let shape;
  if (n.shape === 'circle') {
    const r = Math.min(W, H) / 2;
    shape = `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'ellipse') {
    shape = `<ellipse cx="${n.x}" cy="${n.y}" rx="${W/2}" ry="${H/2}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'semicircle') {
    const r = W / 2;
    shape = `<path d="M${n.x - r},${n.y + H/2} A${r},${H} 0 0 1 ${n.x + r},${n.y + H/2} Z" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'diamond') {
    shape = `<polygon points="${n.x},${n.y - H/2} ${n.x + W/2},${n.y} ${n.x},${n.y + H/2} ${n.x - W/2},${n.y}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'hexagon') {
    const a = W/4;
    shape = `<polygon points="${n.x - W/2 + a},${n.y - H/2} ${n.x + W/2 - a},${n.y - H/2} ${n.x + W/2},${n.y} ${n.x + W/2 - a},${n.y + H/2} ${n.x - W/2 + a},${n.y + H/2} ${n.x - W/2},${n.y}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'parallelogram') {
    const skew = H * 0.3;
    shape = `<polygon points="${n.x - W/2 + skew},${n.y - H/2} ${n.x + W/2},${n.y - H/2} ${n.x + W/2 - skew},${n.y + H/2} ${n.x - W/2},${n.y + H/2}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  } else if (n.shape === 'label') {
    shape = '';
  } else {
    const rx = n.shape === 'rounded' ? 8 : 2;
    shape = `<rect x="${n.x - W/2}" y="${n.y - H/2}" width="${W}" height="${H}" rx="${rx}" fill="${n.color}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
  }

  const f = n.font || { family: "'Source Sans 3',sans-serif", size: 12, letterSpacing: 0,
                        align: 'center', bold: true, italic: false, color: '#ffffff' };
  const lines = wrapLabel(n.label, n.w - 12, f.size);
  const lineHeight = f.size * 1.2;
  const startY = n.y - ((lines.length - 1) * lineHeight) / 2;
  const fillColor = (n.shape === 'label' && (f.color === '#ffffff' || !f.color)) ? '#1a1a1a' : (f.color || '#ffffff');
  const anchor = f.align === 'left' ? 'start' : f.align === 'right' ? 'end' : 'middle';
  const xPos   = f.align === 'left' ? n.x - W/2 + 6 : f.align === 'right' ? n.x + W/2 - 6 : n.x;

  let text = '';
  for (let i = 0; i < lines.length; i++) {
    text += `<text x="${xPos}" y="${startY + i * lineHeight}"
      text-anchor="${anchor}" dominant-baseline="middle"
      font-family="${f.family}" font-size="${f.size}"
      ${f.letterSpacing ? `letter-spacing="${f.letterSpacing}"` : ''}
      font-weight="${f.bold ? 700 : 400}"
      font-style="${f.italic ? 'italic' : 'normal'}"
      fill="${fillColor}">${escapeHtml(lines[i])}</text>`;
  }
  if (n.group) text += `<text x="${n.x}" y="${n.y + H/2 + 14}" text-anchor="middle" font-size="9" fill="rgba(0,0,0,0.55)">${escapeHtml(n.group)}</text>`;
  return shape + text;
}

function renderEdgeLabelForExport(e) {
  const f = e.labelFont || { family: "'Source Sans 3',sans-serif", size: 10, color: '', bold: false, italic: false };
  const fontStyle = `font-family="${f.family}" font-size="${f.size}" font-weight="${f.bold ? 700 : 400}" font-style="${f.italic ? 'italic' : 'normal'}"`;
  const fill = f.color || '#5a5a5a';
  if (e.labelMode === 'along-path') {
    return `<text ${fontStyle} fill="${fill}">
      <textPath href="#exp-edgepath-${e.id}" startOffset="50%" text-anchor="middle">${escapeHtml(e.label)}</textPath>
    </text>`;
  }
  const pos = edgeLabelPos(e);
  const angle = e.labelRotation === 'auto' ? edgeLabelAngle(e) : 0;
  const text = String(e.label);
  const w = text.length * (f.size * 0.62) + 10;
  const h = f.size * 1.4;
  return `<g transform="translate(${pos.x},${pos.y}) rotate(${angle.toFixed(2)})">
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" fill="#f9f7f3" opacity="0.95" rx="2"/>
    <text x="0" y="1" text-anchor="middle" dominant-baseline="middle" ${fontStyle} fill="${fill}">${escapeHtml(text)}</text>
  </g>`;
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
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
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
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG export failed — falling back to SVG.'); gExportSVG(); };
  img.src = url;
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
    select: 'Select — click to select, drag to move, Shift+click to multi',
    addNode: 'Add Node — click canvas to place',
    addArea: 'Add Area — click+drag to size',
    addEdge: 'Add Edge — click source then target',
  };
  const modeLbl = { select: 'Select', addNode: 'Add Node', addArea: 'Add Area', addEdge: 'Add Edge' }[G.mode];
  const snapTxt = G.snapGrid ? ` · Snap ${G.snapGrid}px` : '';
  el.innerHTML = `Mode: <strong>${modeLbl}</strong>${snapTxt} — ${msg || labels[G.mode] || ''}`;
}

// ─── EXPOSE ────────────────────────────────────────────────────
export function exposeGraphGlobals() {
  window.__gSetMode           = gSetMode;
  window.__gDeleteSelected    = gDeleteSelected;
  window.__gDuplicateSelected = gDuplicateSelected;
  window.__gClear             = gClear;
  window.__gSeedExample       = gSeedExample;
  window.__gZoom              = gZoom;
  window.__gResetView         = gResetView;
  window.__gExportSVG         = gExportSVG;
  window.__gExportPNG         = gExportPNG;
  window.__gCanvasClick       = gCanvasClick;
  window.__gCanvasMousedown   = gCanvasMousedown;
  window.__gCanvasMousemove   = gCanvasMousemove;
  window.__gCanvasMouseup     = gCanvasMouseup;
  window.__gWheel             = gWheel;
  window.__gUpdateNode        = gUpdateNode;
  window.__gUpdateArea        = gUpdateArea;
  window.__gUpdateEdge        = gUpdateEdge;
  window.__gUpdateNodeFont    = gUpdateNodeFont;
  window.__gToggleNodeFont    = gToggleNodeFont;
  window.__gUpdateEdgeFont    = gUpdateEdgeFont;
  window.__gToggleEdgeFont    = gToggleEdgeFont;
  window.__gClearWaypoints    = gClearWaypoints;
  window.__gUndo              = gUndo;
  window.__gRedo              = gRedo;
  window.__gSetSnap           = gSetSnap;
}
