/* ═══════════════════════════════════════════════════════════════
   editor.js — Split-pane editor with:
     • CodeMirror + live preview
     • Formatting toolbar above editor
     • Frontmatter form
     • Infobox builder UI (in Frontmatter tab)
     • Image picker
     • Auto-save drafts to localStorage
     • beforeunload guard for unsaved changes
   ═══════════════════════════════════════════════════════════════ */

import { State, RAW_BASE, ARTICLES_PATH, REPO_OWNER, REPO_NAME, BRANCH, SiteConfig } from '../state.js';
import { renderTokensFromBody, extractFrontmatter, parseFrontmatterBody, slugToTitle, escapeHtml, escapeAttr } from '../renderer.js';
import { fetchArticle, slugExists } from '../data.js';

// ─── CodeMirror loader ────────────────────────────────────────
let cmLoaded = false;
async function ensureCodeMirror() {
  if (cmLoaded) return;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/codemirror.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/mode/markdown/markdown.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/edit/continuelist.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/display/placeholder.min.js');
  loadCss('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/codemirror.min.css');
  loadCss('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/theme/tomorrow-night-eighties.min.css');
  cmLoaded = true;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

// ─── DRAFT KEY ────────────────────────────────────────────────
function draftKey(slug) {
  return `${SiteConfig.editor.draftKeyPrefix}${slug || '__new__'}`;
}

// ─── OPEN EDITOR (existing article) ──────────────────────────
export async function openEditor() {
  await ensureCodeMirror();
  let md = '';
  let isExisting = false;
  if (State.slug) {
    try { md = await fetchArticle(State.slug); isExisting = true; }
    catch { md = defaultTemplate(State.slug); }
  } else {
    md = defaultTemplate('');
  }

  // Check for an existing draft
  const draft = readDraft(State.slug);
  let contentToShow = md;
  let restored = false;
  if (draft && draft.content && draft.content !== md) {
    const useDraft = confirm(
      `A draft for "${State.slug || 'this article'}" was found from ${new Date(draft.savedAt).toLocaleString()}.\n\n` +
      `Restore the draft? (Click Cancel to discard the draft and load the published version.)`
    );
    if (useDraft) { contentToShow = draft.content; restored = true; }
    else clearDraft(State.slug);
  }

  State.editorOriginal      = md;
  State.editorDraftRestored = restored;

  mountEditor({
    slug: State.slug || '',
    content: contentToShow,
    isExisting,
    title: isExisting ? `Edit: ${slugToTitle(State.slug)}` : 'New Article',
    draftRestored: restored,
  });
}

// ─── OPEN NEW ARTICLE ────────────────────────────────────────
export async function openNewArticle(slug) {
  await ensureCodeMirror();
  const s = slug || '';
  State.slug = s || null;

  const draft = readDraft(s);
  let content = defaultTemplate(s);
  let restored = false;
  if (draft && draft.content) {
    const useDraft = confirm(`A draft for a new article was found from ${new Date(draft.savedAt).toLocaleString()}. Restore it?`);
    if (useDraft) { content = draft.content; restored = true; }
    else clearDraft(s);
  }

  State.editorOriginal      = defaultTemplate(s);
  State.editorDraftRestored = restored;

  mountEditor({
    slug: s,
    content,
    isExisting: false,
    title: 'New Article',
    draftRestored: restored,
  });
}

function defaultTemplate(slug) {
  const t = slug ? slugToTitle(slug) : 'Article Title';
  return `:::frontmatter\ntags: \ndate: \nsources: \n:::\n\n# ${t}\n\nWrite your article here.\n`;
}

// ─── MOUNT EDITOR ────────────────────────────────────────────
function mountEditor({ slug, content, isExisting, title, draftRestored }) {
  const titleEl = document.getElementById('editor-title');
  if (titleEl) titleEl.textContent = title;

  const filenameEl = document.getElementById('editor-filename');
  if (filenameEl) {
    filenameEl.value    = slug;
    filenameEl.readOnly = isExisting;
    filenameEl.style.opacity = isExisting ? '0.6' : '';
  }

  const isExistingEl = document.getElementById('editor-is-existing');
  if (isExistingEl) isExistingEl.value = isExisting ? 'true' : 'false';

  // Inject toolbar above editor (once)
  injectToolbar();

  // Populate frontmatter form
  const { frontmatter, body } = extractFrontmatter(content);
  populateFmForm(frontmatter);
  populateInfoboxForm(body);

  // Destroy old CM
  if (State.cmEditor) { State.cmEditor.toTextArea(); State.cmEditor = null; }

  const ta = document.getElementById('editor-content');
  if (!ta) return;
  ta.value = content;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  State.cmEditor = CodeMirror.fromTextArea(ta, {
    mode: 'markdown',
    theme: isDark ? 'tomorrow-night-eighties' : 'default',
    lineNumbers: true,
    lineWrapping: true,
    extraKeys: { Enter: 'newlineAndIndentContinueMarkdownList' },
    placeholder: 'Write your article in Markdown…',
    autofocus: true,
  });

  State.cmEditor.getWrapperElement().style.cssText =
    'height:100%;font-size:13px;font-family:"JetBrains Mono",monospace;';
  State.cmEditor.refresh();

  State.editorDirty = false;
  State.cmEditor.on('change', () => {
    State.editorDirty = State.cmEditor.getValue() !== State.editorOriginal;
    updateDirtyIndicator();
    clearTimeout(State.editorPreviewTimer);
    State.editorPreviewTimer = setTimeout(() => {
      updatePreview();
      saveDraft(slug, State.cmEditor.getValue());
    }, SiteConfig.editor.autosaveDebounceMs || 1000);
  });

  State.cmEditor.getWrapperElement().addEventListener('dragover', e => e.preventDefault());
  State.cmEditor.getWrapperElement().addEventListener('drop', handleImageDrop);

  // beforeunload guard
  window.addEventListener('beforeunload', beforeUnloadHandler);

  if (draftRestored) {
    showDraftBanner();
  }

  updatePreview();
  setupFmSync();
  switchEditorTab('write');
  updateDirtyIndicator();
}

// ─── DIRTY INDICATOR + BEFORE UNLOAD ─────────────────────────
function updateDirtyIndicator() {
  const titleEl = document.getElementById('editor-title');
  if (!titleEl) return;
  const base = titleEl.textContent.replace(/^\* /, '');
  titleEl.textContent = State.editorDirty ? `* ${base}` : base;
}

function beforeUnloadHandler(e) {
  if (State.editorDirty) {
    e.preventDefault();
    e.returnValue = ''; // standard
    return '';
  }
}

// ─── DRAFT BANNER ────────────────────────────────────────────
function showDraftBanner() {
  const wrap = document.getElementById('editor-write-wrap');
  if (!wrap || wrap.querySelector('.draft-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'draft-banner';
  banner.innerHTML = `<span>📝 Draft restored from your last unsaved session.</span>
    <button class="btn" onclick="this.parentElement.remove()">Dismiss</button>
    <button class="btn" onclick="window.__discardDraft()">Discard draft &amp; reload published</button>`;
  wrap.insertBefore(banner, wrap.firstChild);
}

// ─── DRAFT STORAGE ───────────────────────────────────────────
function saveDraft(slug, content) {
  try {
    localStorage.setItem(draftKey(slug), JSON.stringify({
      content, savedAt: new Date().toISOString(),
    }));
    flashSavedIndicator();
  } catch (e) { /* localStorage might be full or disabled */ }
}
function readDraft(slug) {
  try {
    const raw = localStorage.getItem(draftKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearDraft(slug) {
  try { localStorage.removeItem(draftKey(slug)); } catch {}
}

let savedFlashTimer = null;
function flashSavedIndicator() {
  const el = document.getElementById('editor-draft-status');
  if (!el) return;
  el.textContent = `Draft saved · ${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`;
  el.style.opacity = '1';
  clearTimeout(savedFlashTimer);
  savedFlashTimer = setTimeout(() => { el.style.opacity = '0.55'; }, 1500);
}

// ─── DISCARD DRAFT — exposed globally ────────────────────────
export function discardDraft() {
  const slug = State.slug || '';
  if (!confirm('Discard the local draft and reload the published version? Unsaved changes will be lost.')) return;
  clearDraft(slug);
  State.editorDirty = false;
  // Reload editor with the original content
  if (State.cmEditor && State.editorOriginal) {
    State.cmEditor.setValue(State.editorOriginal);
    State.editorDirty = false;
    updateDirtyIndicator();
  }
  document.querySelector('.draft-banner')?.remove();
}

// ─── FORMATTING TOOLBAR ──────────────────────────────────────
function injectToolbar() {
  const wrap = document.getElementById('editor-write-wrap');
  if (!wrap || wrap.querySelector('.editor-format-toolbar')) return;
  const bar = document.createElement('div');
  bar.className = 'editor-format-toolbar';
  bar.innerHTML = `
    <button class="ftb" title="Bold (Ctrl+B)" onclick="window.__cmWrap('**','**')"><b>B</b></button>
    <button class="ftb" title="Italic (Ctrl+I)" onclick="window.__cmWrap('*','*')"><i>I</i></button>
    <button class="ftb" title="Inline code" onclick="window.__cmWrap('\`','\`')"><code>&lt;/&gt;</code></button>
    <span class="ftb-sep"></span>
    <button class="ftb" title="Heading 2" onclick="window.__cmLine('## ')">H2</button>
    <button class="ftb" title="Heading 3" onclick="window.__cmLine('### ')">H3</button>
    <span class="ftb-sep"></span>
    <button class="ftb" title="Bullet list" onclick="window.__cmLine('- ')">•</button>
    <button class="ftb" title="Numbered list" onclick="window.__cmLine('1. ')">1.</button>
    <button class="ftb" title="Block quote" onclick="window.__cmLine('> ')">❝</button>
    <span class="ftb-sep"></span>
    <button class="ftb" title="Wiki link [[…]]" onclick="window.__cmWrap('[[',']]')">[[…]]</button>
    <button class="ftb" title="External link" onclick="window.__cmInsertLink()">🔗</button>
    <span class="ftb-sep"></span>
    <button class="ftb ftb-block" title="Insert :::infobox" onclick="window.__cmInsertBlock('infobox')">Infobox</button>
    <button class="ftb ftb-block" title="Insert :::figure"  onclick="window.__cmInsertBlock('figure')">Figure</button>
    <button class="ftb ftb-block" title="Insert :::gallery" onclick="window.__cmInsertBlock('gallery')">Gallery</button>
    <button class="ftb ftb-block" title="Insert :::table"   onclick="window.__cmInsertBlock('table')">Table</button>
    <button class="ftb ftb-block" title="Insert :::datatable" onclick="window.__cmInsertBlock('datatable')">DataTable</button>
    <button class="ftb ftb-block" title="Insert :::chart"   onclick="window.__cmInsertBlock('chart')">Chart</button>
    <button class="ftb ftb-block" title="Insert :::map"     onclick="window.__cmInsertBlock('map')">Map</button>
    <span class="ftb-sep"></span>
    <span id="editor-draft-status" style="margin-left:auto;font-size:11px;color:var(--muted);font-style:italic;opacity:0.55;transition:opacity 0.3s;"></span>
  `;
  wrap.insertBefore(bar, wrap.firstChild);
}

// Toolbar action helpers — exposed globally
export function cmWrap(before, after) {
  if (!State.cmEditor) return;
  const doc = State.cmEditor.getDoc();
  const sel = doc.getSelection();
  if (sel) {
    doc.replaceSelection(`${before}${sel}${after}`);
  } else {
    const cur = doc.getCursor();
    doc.replaceRange(`${before}${after}`, cur);
    doc.setCursor({ line: cur.line, ch: cur.ch + before.length });
  }
  State.cmEditor.focus();
}

export function cmLine(prefix) {
  if (!State.cmEditor) return;
  const doc = State.cmEditor.getDoc();
  const cur = doc.getCursor();
  doc.replaceRange(prefix, { line: cur.line, ch: 0 });
  State.cmEditor.focus();
}

export function cmInsertLink() {
  if (!State.cmEditor) return;
  const url = prompt('URL:');
  if (!url) return;
  const text = State.cmEditor.getDoc().getSelection() || prompt('Link text:') || url;
  State.cmEditor.getDoc().replaceSelection(`[${text}](${url})`);
}

export function cmInsertBlock(name) {
  if (!State.cmEditor) return;
  const tpl = blockTemplate(name);
  const doc = State.cmEditor.getDoc();
  doc.replaceSelection(`\n${tpl}\n`);
  State.cmEditor.focus();
}

function blockTemplate(name) {
  switch (name) {
    case 'infobox':
      return `:::infobox
title: Republic of Marzena
image: FlagMZ.jpg
caption: Flag of the Republic
Capital: Lévane
Population: 41,000,000
Government: Semi-presidential republic
:::`;
    case 'figure':
      return `:::figure align: right caption: "Caption goes here"
filename.jpg
:::`;
    case 'gallery':
      return `:::gallery columns: 3 caption: "Gallery caption"
- image1.jpg | First image caption
- image2.jpg | Second image caption
- image3.jpg | Third image caption
:::`;
    case 'table':
      return `:::table caption: "Table caption"
| Column A | Column B | Column C |
| -------- | -------- | -------- |
| Row 1A   | Row 1B   | Row 1C   |
| Row 2A   | Row 2B   | Row 2C   |
:::`;
    case 'datatable':
      return `:::datatable sortable: true filterable: true caption: "Sortable table"
| Year | Party | Seats |
| 1952 | PRM   | 142   |
| 1956 | PRM   | 138   |
| 1960 | PSL   | 121   |
:::`;
    case 'chart':
      return `:::chart type: bar caption: "Chart caption"
labels: 2020, 2021, 2022, 2023, 2024
series: GDP growth | 1.2, 2.4, 3.1, 2.8, 3.4
series: Inflation  | 2.1, 2.5, 4.2, 3.1, 2.4
:::`;
    case 'map':
      return `:::map caption: "Administrative regions" height: 480
https://www.google.com/maps/d/embed?mid=YOUR_MAP_ID
:::`;
    default:
      return `:::${name}\n:::`;
  }
}

// ─── LIVE PREVIEW ────────────────────────────────────────────
function updatePreview() {
  const md   = State.cmEditor ? State.cmEditor.getValue() : (document.getElementById('editor-content')?.value || '');
  const pane = document.getElementById('editor-preview-pane');
  if (!pane) return;
  try {
    const { body } = extractFrontmatter(md);
    const bodyForRender = body.replace(/^# .+(\r?\n|$)/m, '');
    pane.innerHTML = `<div class="article clearfix" style="padding:0 8px;">${renderTokensFromBody(bodyForRender)}</div>`;
    pane.querySelectorAll('a[onclick]').forEach(a => { a.style.pointerEvents = 'none'; });
  } catch (e) {
    pane.innerHTML = `<div class="notice-box">Preview error: ${escapeHtml(e.message)}</div>`;
  }
}

// ─── FRONTMATTER + INFOBOX FORMS ─────────────────────────────
function populateFmForm(fm) {
  const tags    = document.getElementById('fm-tags');
  const date    = document.getElementById('fm-date');
  const sources = document.getElementById('fm-sources');
  if (tags)    tags.value    = (fm.tags    || []).join(', ');
  if (date)    date.value    = fm.date    || '';
  if (sources) sources.value = (fm.sources || []).join('; ');
}

function populateInfoboxForm(body) {
  // Read current :::infobox if present, fill the builder UI
  const m = body.match(/:::infobox\s*\n([\s\S]*?)\n:::/);
  const ibTitle   = document.getElementById('ib-title');
  const ibImage   = document.getElementById('ib-image');
  const ibCaption = document.getElementById('ib-caption');
  const ibRowsTa  = document.getElementById('ib-rows');
  if (!ibTitle) return; // builder not in DOM yet
  if (!m) {
    ibTitle.value = ''; ibImage.value = ''; ibCaption.value = ''; ibRowsTa.value = '';
    return;
  }
  const lines = m[1].split('\n');
  let title = '', image = '', caption = '';
  const rows = [];
  for (const line of lines) {
    const mm = line.match(/^([^:]+):\s*(.*)$/);
    if (!mm) continue;
    const k = mm[1].trim().toLowerCase(), v = mm[2].trim();
    if (k === 'title')   title = v;
    else if (k === 'image')   image = v;
    else if (k === 'caption') caption = v;
    else rows.push(`${mm[1].trim()}: ${v}`);
  }
  ibTitle.value   = title;
  ibImage.value   = image;
  ibCaption.value = caption;
  ibRowsTa.value  = rows.join('\n');
}

function setupFmSync() {
  ['fm-tags', 'fm-date', 'fm-sources'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', syncFmToEditor);
  });
}

function syncFmToEditor() {
  if (!State.cmEditor) return;
  const tags    = document.getElementById('fm-tags')?.value.trim()    || '';
  const date    = document.getElementById('fm-date')?.value.trim()    || '';
  const sources = document.getElementById('fm-sources')?.value.trim() || '';
  const md      = State.cmEditor.getValue();
  const { body } = extractFrontmatter(md);
  const lines = [];
  if (tags)    lines.push(`tags: ${tags}`);
  if (date)    lines.push(`date: ${date}`);
  if (sources) lines.push(`sources: ${sources}`);
  const newFm   = lines.length ? `:::frontmatter\n${lines.join('\n')}\n:::\n\n` : '';
  const newFull = newFm + body;
  const cursor  = State.cmEditor.getCursor();
  State.cmEditor.setValue(newFull);
  State.cmEditor.setCursor(cursor);
}

// ─── INFOBOX BUILDER — sync builder fields → editor ──────────
export function syncInfoboxToEditor() {
  if (!State.cmEditor) return;
  const title   = document.getElementById('ib-title')?.value.trim()   || '';
  const image   = document.getElementById('ib-image')?.value.trim()   || '';
  const caption = document.getElementById('ib-caption')?.value.trim() || '';
  const rows    = (document.getElementById('ib-rows')?.value || '').trim();

  // Build new infobox block
  const lines = [];
  if (title)   lines.push(`title: ${title}`);
  if (image)   lines.push(`image: ${image}`);
  if (caption) lines.push(`caption: ${caption}`);
  if (rows) {
    rows.split('\n').forEach(r => {
      const t = r.trim();
      if (t && t.includes(':')) lines.push(t);
    });
  }

  // No content → strip any existing infobox
  const md = State.cmEditor.getValue();
  let next;
  const existing = md.match(/:::infobox\s*\n[\s\S]*?\n:::\s*\n?/);

  if (lines.length === 0) {
    next = existing ? md.replace(existing[0], '') : md;
  } else {
    const newBlock = `:::infobox\n${lines.join('\n')}\n:::\n`;
    if (existing) {
      next = md.replace(existing[0], newBlock);
    } else {
      // Insert right after frontmatter (or at top after H1)
      const fmMatch = md.match(/^:::frontmatter\s*\n[\s\S]*?\n:::\s*\n?/);
      if (fmMatch) {
        next = md.slice(0, fmMatch[0].length) + '\n' + newBlock + '\n' + md.slice(fmMatch[0].length);
      } else {
        const h1Match = md.match(/^# .+\n/m);
        if (h1Match) {
          const idx = md.indexOf(h1Match[0]) + h1Match[0].length;
          next = md.slice(0, idx) + '\n' + newBlock + '\n' + md.slice(idx);
        } else {
          next = newBlock + '\n' + md;
        }
      }
    }
  }
  // Collapse triple blank lines
  next = next.replace(/\n{3,}/g, '\n\n');

  const cursor = State.cmEditor.getCursor();
  State.cmEditor.setValue(next);
  try { State.cmEditor.setCursor(cursor); } catch {}
}

// ─── EDITOR TABS ─────────────────────────────────────────────
export function switchEditorTab(tab) {
  const writePanelWrap = document.getElementById('editor-write-wrap');
  const previewPanel   = document.getElementById('editor-preview-pane');
  const fmPanel        = document.getElementById('editor-fm-panel');
  const tabs           = document.querySelectorAll('.editor-tab-btn');

  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  const isSplit = tab === 'split';
  if (writePanelWrap) writePanelWrap.style.display = (tab === 'write' || isSplit) ? 'flex' : 'none';
  if (previewPanel)   previewPanel.style.display   = (tab === 'preview' || isSplit) ? 'block' : 'none';
  if (fmPanel)        fmPanel.style.display        = tab === 'fm' ? 'block' : 'none';

  const panesEl = document.getElementById('editor-panes');
  if (panesEl) panesEl.classList.toggle('split-mode', isSplit);

  if (State.cmEditor) State.cmEditor.refresh();
  if (tab === 'preview' || isSplit) updatePreview();
}

// ─── IMAGE DRAG-DROP ─────────────────────────────────────────
function handleImageDrop(e) {
  e.preventDefault();
  const text = e.dataTransfer.getData('text/plain');
  if (!text) return;
  insertImageAtCursor(text, 'right');
}

export function insertImageAtCursor(filename, align = 'right') {
  if (!State.cmEditor) return;
  const snippet = `\n:::figure align: ${align} caption: ""\n${filename}\n:::\n`;
  State.cmEditor.getDoc().replaceSelection(snippet);
  State.cmEditor.focus();
}

// ─── CLOSE / NAVIGATE BACK ───────────────────────────────────
export function closeEditor() {
  if (State.cmEditor) { State.cmEditor.toTextArea(); State.cmEditor = null; }
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  const slug = document.getElementById('editor-filename')?.value?.trim();
  if (slug) window.location.href = `../index.html#/article/${slug}`;
  else      window.location.href = '../index.html';
}

// ─── PREVIEW ─────────────────────────────────────────────────
export function previewArticle() {
  const md   = State.cmEditor ? State.cmEditor.getValue() : (document.getElementById('editor-content')?.value || '');
  const slug = (document.getElementById('editor-filename')?.value || 'preview')
    .toLowerCase().replace(/\s+/g, '-');
  State.articleCache[slug] = md;
  window.location.href = `../index.html#/article/${slug}`;
}

// ─── SAVE ────────────────────────────────────────────────────
export async function saveArticle() {
  const slugRaw    = (document.getElementById('editor-filename')?.value || '').trim().toLowerCase().replace(/\s+/g, '-');
  const content    = State.cmEditor ? State.cmEditor.getValue() : (document.getElementById('editor-content')?.value || '');
  const isExisting = document.getElementById('editor-is-existing')?.value === 'true';

  if (!slugRaw)        { alert('Please enter a slug for the article.'); return; }
  if (!content.trim()) { alert('Article content is empty.'); return; }

  if (!isExisting) {
    const exists = await slugExists(slugRaw);
    if (exists) {
      const proceed = confirm(`An article with slug "${slugRaw}" already exists.\nContinue?`);
      if (!proceed) return;
    }
  }

  const filename = `${ARTICLES_PATH}/${slugRaw}.md`;

  if (isExisting) {
    const githubEditUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/edit/${BRANCH}/${filename}`;
    try { await navigator.clipboard.writeText(content); showSaveInstructions(githubEditUrl, content, true, true, slugRaw); }
    catch { showSaveInstructions(githubEditUrl, content, false, true, slugRaw); }
  } else {
    const githubNewUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(content)}`;
    if (githubNewUrl.length < 7500) {
      window.open(githubNewUrl, '_blank');
      State.articleCache[slugRaw] = content;
      State.index = null;
      // Save was successful — clear draft and dirty flag
      clearDraft(slugRaw);
      State.editorDirty = false;
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      closeEditor();
    } else {
      const githubNewBlank = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}`;
      try { await navigator.clipboard.writeText(content); showSaveInstructions(githubNewBlank, content, true, false, slugRaw); }
      catch { showSaveInstructions(githubNewBlank, content, false, false, slugRaw); }
    }
  }
}

// ─── SAVE INSTRUCTIONS MODAL ─────────────────────────────────
function showSaveInstructions(url, content, copied, isEdit, slug) {
  const modal = document.getElementById('save-instructions-overlay');
  if (!modal) { window.open(url, '_blank'); return; }

  document.getElementById('save-instructions-link').href        = url;
  document.getElementById('save-instructions-link').textContent = isEdit
    ? 'Open GitHub editor for this file →' : 'Open GitHub to create this file →';

  const msgEl = document.getElementById('save-clipboard-msg');
  if (copied) { msgEl.textContent = '✓ Content copied to clipboard.'; msgEl.style.color = '#5a9a5a'; }
  else        { msgEl.textContent = 'Clipboard unavailable — copy the content below manually.'; msgEl.style.color = 'var(--muted)'; }

  document.getElementById('save-instructions-steps').innerHTML = isEdit
    ? `<li>Click the link above to open the file in GitHub's editor.</li>
       <li>Select all existing content (<kbd>Ctrl+A</kbd> / <kbd>Cmd+A</kbd>).</li>
       <li>Paste the new content (<kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd>).</li>
       <li>Click <strong>"Commit changes"</strong>.</li>
       <li>The index rebuilds automatically within ~30 seconds.</li>`
    : `<li>Click the link above — GitHub will open with the filename pre-filled.</li>
       <li>Paste the content (<kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd>).</li>
       <li>Click <strong>"Commit new file"</strong>.</li>
       <li>The index rebuilds automatically within ~30 seconds.</li>`;

  document.getElementById('save-content-textarea').value = content;
  modal.classList.add('visible');
  modal.dataset.slug = slug;  // remember for clearing draft on close
  window.open(url, '_blank');
}

export function closeSaveInstructions() {
  const modal = document.getElementById('save-instructions-overlay');
  const slug = modal?.dataset.slug;
  if (slug) clearDraft(slug);
  State.editorDirty = false;
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  modal?.classList.remove('visible');
  State.index = null;
  closeEditor();
}

export async function copyContentToClipboard() {
  const content = document.getElementById('save-content-textarea')?.value || '';
  try {
    await navigator.clipboard.writeText(content);
    const btn = document.getElementById('copy-content-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = 'Copy Content'; }, 2000); }
  } catch {
    document.getElementById('save-content-textarea')?.select();
    alert('Press Ctrl+C (or Cmd+C) to copy.');
  }
}

// ─── IMAGE PICKER ────────────────────────────────────────────
export function openImagePicker() {
  const picker = document.getElementById('editor-image-picker');
  if (picker) picker.classList.add('visible');
  renderImagePicker('');
}
export function closeImagePicker() {
  document.getElementById('editor-image-picker')?.classList.remove('visible');
}
export function filterImagePicker(q) {
  renderImagePicker(q);
}

function renderImagePicker(q) {
  const images = State.commonsIndex?.images || [];
  const ql     = q.toLowerCase();
  const hits   = ql ? images.filter(img =>
    img.filename.toLowerCase().includes(ql) ||
    (img.title || '').toLowerCase().includes(ql)
  ) : images;

  const grid = document.getElementById('image-picker-grid');
  if (!grid) return;

  grid.innerHTML = hits.slice(0, 60).map(img => {
    const url = img.url || `${RAW_BASE}/images/${img.filename}`;
    const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '';
    return `<div class="img-picker-item" draggable="true"
        ondragstart="event.dataTransfer.setData('text/plain','${img.filename}')"
        title="${img.filename}${dims ? ' — ' + dims : ''}">
      <img src="${url}" alt="${img.filename}" loading="lazy" onerror="this.parentElement.style.opacity='0.4'">
      <div class="img-picker-name">${img.filename}</div>
      ${dims ? `<div class="img-picker-dims">${dims}</div>` : ''}
      <div class="img-picker-actions">
        <button onclick="window.__insertImage('${img.filename}','left')"  title="Float left">←</button>
        <button onclick="window.__insertImage('${img.filename}','right')" title="Float right">→</button>
        <button onclick="window.__insertImage('${img.filename}','none')"  title="No float">↕</button>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--muted);padding:16px;font-family:\'Crimson Pro\',serif;">No images found.</p>';
}
