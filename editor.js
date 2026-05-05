/* ═══════════════════════════════════════════════════════════════
   editor.js — Split-pane editor: CodeMirror + live preview,
               frontmatter form, image picker
   ═══════════════════════════════════════════════════════════════ */

import { State, RAW_BASE, ARTICLES_PATH, REPO_OWNER, REPO_NAME, BRANCH } from './state.js';
import { renderTokensFromBody, extractFrontmatter, parseFrontmatterBody, slugToTitle, escapeHtml } from './renderer.js';
import { fetchArticle, slugExists } from './data.js';

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

// ─── OPEN EDITOR (existing article) ──────────────────────────
export async function openEditor() {
  if (!State.slug) { openNewArticle(); return; }
  await ensureCodeMirror();
  let md = '';
  let isExisting = false;
  try {
    md = await fetchArticle(State.slug);
    isExisting = true;
  } catch {
    md = defaultTemplate(State.slug);
  }
  mountEditor({
    slug: State.slug,
    content: md,
    isExisting,
    title: isExisting ? `Edit: ${slugToTitle(State.slug)}` : `New: ${slugToTitle(State.slug)}`
  });
}

// ─── OPEN NEW ARTICLE ────────────────────────────────────────
export async function openNewArticle(slug) {
  await ensureCodeMirror();
  const s = slug || '';
  State.slug = s || null;
  mountEditor({
    slug: s,
    content: defaultTemplate(s),
    isExisting: false,
    title: 'New Article'
  });
}

function defaultTemplate(slug) {
  const t = slug ? slugToTitle(slug) : 'Article Title';
  return `:::frontmatter\ntags: \ndate: \nsources: \n:::\n\n# ${t}\n\nWrite your article here.\n`;
}

// ─── MOUNT EDITOR ────────────────────────────────────────────
function mountEditor({ slug, content, isExisting, title }) {
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

  // Populate frontmatter form
  const { frontmatter } = extractFrontmatter(content);
  populateFmForm(frontmatter);

  // Destroy old CM instance
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

  State.cmEditor.on('change', () => {
    clearTimeout(State.editorPreviewTimer);
    State.editorPreviewTimer = setTimeout(updatePreview, 350);
  });

  State.cmEditor.getWrapperElement().addEventListener('dragover', e => e.preventDefault());
  State.cmEditor.getWrapperElement().addEventListener('drop', handleImageDrop);

  updatePreview();
  setupFmSync();
  switchEditorTab('write');
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

// ─── FRONTMATTER FORM ────────────────────────────────────────
function populateFmForm(fm) {
  const tags    = document.getElementById('fm-tags');
  const date    = document.getElementById('fm-date');
  const sources = document.getElementById('fm-sources');
  if (tags)    tags.value    = (fm.tags    || []).join(', ');
  if (date)    date.value    = fm.date    || '';
  if (sources) sources.value = (fm.sources || []).join('; ');
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
  clearTimeout(State.editorPreviewTimer);
  State.editorPreviewTimer = setTimeout(updatePreview, 350);
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
  clearTimeout(State.editorPreviewTimer);
  State.editorPreviewTimer = setTimeout(updatePreview, 350);
}

// ─── CLOSE / NAVIGATE BACK ───────────────────────────────────
export function closeEditor() {
  if (State.cmEditor) { State.cmEditor.toTextArea(); State.cmEditor = null; }
  const slug = document.getElementById('editor-filename')?.value?.trim();
  if (slug) window.location.href = `index.html#/article/${slug}`;
  else      window.location.href = 'index.html';
}

// ─── PREVIEW ─────────────────────────────────────────────────
export function previewArticle() {
  const md   = State.cmEditor ? State.cmEditor.getValue() : (document.getElementById('editor-content')?.value || '');
  const slug = (document.getElementById('editor-filename')?.value || 'preview')
    .toLowerCase().replace(/\s+/g, '-');
  State.articleCache[slug] = md;
  window.location.href = `index.html#/article/${slug}`;
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
    try { await navigator.clipboard.writeText(content); showSaveInstructions(githubEditUrl, content, true, true); }
    catch { showSaveInstructions(githubEditUrl, content, false, true); }
  } else {
    const githubNewUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(content)}`;
    if (githubNewUrl.length < 7500) {
      window.open(githubNewUrl, '_blank');
      State.articleCache[slugRaw] = content;
      State.index = null;
      closeEditor();
    } else {
      const githubNewBlank = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${BRANCH}?filename=${encodeURIComponent(filename)}`;
      try { await navigator.clipboard.writeText(content); showSaveInstructions(githubNewBlank, content, true, false); }
      catch { showSaveInstructions(githubNewBlank, content, false, false); }
    }
  }
}

// ─── SAVE INSTRUCTIONS MODAL ─────────────────────────────────
function showSaveInstructions(url, content, copied, isEdit) {
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
  window.open(url, '_blank');
}

export function closeSaveInstructions() {
  document.getElementById('save-instructions-overlay')?.classList.remove('visible');
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
    return `<div class="img-picker-item" draggable="true"
        ondragstart="event.dataTransfer.setData('text/plain','${img.filename}')"
        title="${img.filename}">
      <img src="${url}" alt="${img.filename}" loading="lazy" onerror="this.parentElement.style.opacity='0.4'">
      <div class="img-picker-name">${img.filename}</div>
      <div class="img-picker-actions">
        <button onclick="window.__insertImage('${img.filename}','left')"  title="Float left">←</button>
        <button onclick="window.__insertImage('${img.filename}','right')" title="Float right">→</button>
        <button onclick="window.__insertImage('${img.filename}','none')"  title="No float">↕</button>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--muted);padding:16px;font-family:\'Crimson Pro\',serif;">No images found.</p>';
}
