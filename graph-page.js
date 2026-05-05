/* ═══════════════════════════════════════════════════════════════
   graph-page.js — Entry point for graph.html
   Bootstraps chrome partials, theme, clock, then mounts the
   Graph Tool.
   ═══════════════════════════════════════════════════════════════ */

import { State } from './state.js';
import { fetchIndex } from './data.js';
import { showGraph, exposeGraphGlobals } from './graph.js';
import { openUploadHelper, closeUploadHelper } from './gallery.js';

// ─── PARTIALS ──────────────────────────────────────────────────
async function loadPartials() {
  const [chrome, modals] = await Promise.all([
    fetch('partials/chrome.html').then(r => r.text()),
    fetch('partials/modals.html').then(r => r.text()),
  ]);
  document.getElementById('chrome-mount').innerHTML = chrome;
  document.getElementById('modals-mount').innerHTML = modals;
  // Graph has no footer (full-height layout)
}

// ─── THEME ─────────────────────────────────────────────────────
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
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('marzenapedia-theme', next);
}

// ─── CLOCK ─────────────────────────────────────────────────────
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

// ─── NAVIGATION ────────────────────────────────────────────────
function navigate(view, slugOrQuery) {
  if (view === 'home')    { window.location.href = 'index.html'; return; }
  if (view === 'all')     { window.location.href = 'index.html#/all'; return; }
  if (view === 'commons') { window.location.href = 'commons.html'; return; }
  if (view === 'graph')   { window.location.href = 'graph.html'; return; }
  if (view === 'search')  { window.location.href = `index.html#/search/${encodeURIComponent(slugOrQuery)}`; return; }
  if (view === 'article') { window.location.href = `index.html#/article/${slugOrQuery}`; return; }
  if (view === 'editor')  { window.location.href = `editor.html?slug=${encodeURIComponent(slugOrQuery || '')}`; return; }
}

// ─── SEARCH STUBS ──────────────────────────────────────────────
function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (!q) return;
  window.location.href = `index.html#/search/${encodeURIComponent(q)}`;
}
function onSearchInput()      { /* no dropdown on standalone page */ }
function onSearchKeydown(e)   { if (e.key === 'Enter') doSearch(); }

// ─── LIGHTBOX ──────────────────────────────────────────────────
// Graph can open exported SVG previews via lightbox if ever needed.
function openLightbox(src, caption) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (!lb) return;
  img.src = src;
  if (caption) { cap.innerHTML = caption; cap.style.display = 'block'; }
  else { cap.style.display = 'none'; }
  lb.classList.add('visible');
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('visible');
}

// ─── GLOBALS ───────────────────────────────────────────────────
function exposeGlobals() {
  window.navigate            = navigate;
  window.__navigate          = navigate;
  window.toggleTheme         = toggleTheme;

  // Search
  window.onSearchInput       = onSearchInput;
  window.onSearchKeydown     = onSearchKeydown;
  window.doSearch            = doSearch;

  // Lightbox
  window.openLightbox        = openLightbox;
  window.closeLightbox       = closeLightbox;
  window.__openLightbox      = openLightbox;

  // Upload helper stubs (modals partial may reference these)
  window.__openUploadHelper  = openUploadHelper;
  window.__closeUploadHelper = closeUploadHelper;
  window.closeUploadHelper   = closeUploadHelper;

  // Help
  window.showHelp = () => { window.location.href = 'index.html'; };

  // Page-tabs stubs
  window.switchTab     = () => {};
  window.__currentSlug = '';

  // Graph globals wired from graph.js
  exposeGraphGlobals();
}

// ─── INIT ──────────────────────────────────────────────────────
(async function init() {
  exposeGlobals();
  await loadPartials();
  initTheme();
  startCetClock();

  // Hide page-tabs: not relevant on Graph
  const pt = document.getElementById('page-tabs');
  if (pt) pt.style.display = 'none';

  // Pre-fetch index (for wiki-link resolution in any future graph labels)
  await fetchIndex();

  // Mount the Graph Tool into #main-content
  showGraph();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      document.getElementById('graph-export-overlay')?.classList.remove('visible');
      document.getElementById('help-overlay')?.classList.remove('visible');
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
    }
  });
})();
