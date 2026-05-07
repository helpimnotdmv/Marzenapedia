/* ═══════════════════════════════════════════════════════════════
   tools/editor-page.js — Entry point for tools/editor.html
   ═══════════════════════════════════════════════════════════════ */

import { State } from '../state.js';
import { fetchIndex, fetchCommonsIndex } from '../data.js';
import {
  openEditor, openNewArticle, closeEditor,
  previewArticle, saveArticle,
  closeSaveInstructions, copyContentToClipboard,
  switchEditorTab, insertImageAtCursor,
  openImagePicker, closeImagePicker, filterImagePicker,
  cmWrap, cmLine, cmInsertLink, cmInsertBlock,
  syncInfoboxToEditor, discardDraft,
} from './editor.js';

async function loadPartials() {
  const [chrome, modals] = await Promise.all([
    fetch('../partials/chrome.html').then(r => r.text()),
    fetch('../partials/modals.html').then(r => r.text()),
  ]);
  document.getElementById('chrome-mount').innerHTML  = chrome;
  document.getElementById('modals-mount').innerHTML  = modals;
}

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

function startCetClock() {
  const tick = () => {
    const el = document.getElementById('cet-time');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
    });
  };
  tick();
  const now = new Date();
  setTimeout(() => { tick(); setInterval(tick, 60000); },
    (60 - now.getSeconds()) * 1000 - now.getMilliseconds());
}

function navigate(view, slugOrQuery) {
  if (view === 'home')    { window.location.href = '../index.html'; return; }
  if (view === 'all')     { window.location.href = '../index.html#/all'; return; }
  if (view === 'commons') { window.location.href = '../commons.html'; return; }
  if (view === 'tools')   { window.location.href = '../index.html#/tools'; return; }
  if (view === 'graph')   { window.location.href = 'graph.html'; return; }
  if (view === 'stats')   { window.location.href = 'stats.html'; return; }
  if (view === 'editor')  { window.location.href = `editor.html?slug=${encodeURIComponent(slugOrQuery || '')}`; return; }
  if (view === 'search')  { window.location.href = `../index.html#/search/${encodeURIComponent(slugOrQuery)}`; return; }
  if (view === 'article') { window.location.href = `../index.html#/article/${slugOrQuery}`; return; }
}

function cancelEditor() {
  const slug = document.getElementById('editor-filename')?.value?.trim();
  if (slug) window.location.href = `../index.html#/article/${slug}`;
  else      window.location.href = '../index.html';
}

function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (!q) return;
  window.location.href = `../index.html#/search/${encodeURIComponent(q)}`;
}
function onSearchInput()    {}
function onSearchKeydown(e) { if (e.key === 'Enter') doSearch(); }

function openLightbox(src, caption) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (!lb) return;
  img.src = src;
  if (caption) { cap.innerHTML = caption; cap.style.display = 'block'; }
  else { cap.style.display = 'none'; }
  lb.classList.add('visible');
}
function closeLightbox() { document.getElementById('lightbox')?.classList.remove('visible'); }

function exposeGlobals() {
  window.navigate                = navigate;
  window.__navigate              = navigate;
  window.toggleTheme             = toggleTheme;
  window.onSearchInput           = onSearchInput;
  window.onSearchKeydown         = onSearchKeydown;
  window.doSearch                = doSearch;

  // Editor functions
  window.openEditor              = openEditor;
  window.openNewArticle          = openNewArticle;
  window.closeEditor             = cancelEditor;
  window.previewArticle          = previewArticle;
  window.saveArticle             = saveArticle;
  window.closeSaveInstructions   = closeSaveInstructions;
  window.copyContentToClipboard  = copyContentToClipboard;
  window.switchEditorTab         = switchEditorTab;
  window.openImagePicker         = openImagePicker;
  window.closeImagePicker        = closeImagePicker;
  window.filterImagePicker       = filterImagePicker;
  window.__insertImage           = insertImageAtCursor;
  window.cancelEditor            = cancelEditor;

  // Toolbar callbacks
  window.__cmWrap        = cmWrap;
  window.__cmLine        = cmLine;
  window.__cmInsertLink  = cmInsertLink;
  window.__cmInsertBlock = cmInsertBlock;

  // Infobox builder
  window.__syncInfoboxToEditor = syncInfoboxToEditor;

  // Drafts
  window.__discardDraft  = discardDraft;

  // Lightbox
  window.openLightbox    = openLightbox;
  window.closeLightbox   = closeLightbox;
  window.__openLightbox  = openLightbox;

  // Help
  window.showHelp = () => { window.location.href = '../index.html#/help'; };

  // Page-tab stubs
  window.switchTab     = () => {};
  window.__currentSlug = '';
}

(async function init() {
  exposeGlobals();
  await loadPartials();
  initTheme();
  startCetClock();

  const pt = document.getElementById('page-tabs');
  if (pt) pt.style.display = 'none';

  await fetchIndex();
  const commons = await fetchCommonsIndex();
  State.commonsIndex = commons;

  // Read ?slug= from URL
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug') || '';
  State.slug   = slug || null;

  if (slug) await openEditor();
  else      await openNewArticle();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Ctrl+B / Ctrl+I shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault(); cmWrap('**','**');
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault(); cmWrap('*','*');
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); saveArticle();
    }
    if (e.key === 'Escape') {
      closeLightbox();
      const saveOverlay = document.getElementById('save-instructions-overlay');
      if (saveOverlay?.classList.contains('visible')) closeSaveInstructions();
      document.getElementById('editor-image-picker')?.classList.remove('visible');
    }
  });
})();
