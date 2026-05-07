/* ═══════════════════════════════════════════════════════════════
   tools/graph-page.js — Entry point for tools/graph.html
   ═══════════════════════════════════════════════════════════════ */

import { State } from '../state.js';
import { fetchIndex } from '../data.js';
import { showGraph, exposeGraphGlobals } from './graph.js';
import { openUploadHelper, closeUploadHelper } from '../gallery.js';

// ─── PARTIALS (paths relative to tools/) ───────────────────────
async function loadPartials() {
  const [chrome, modals] = await Promise.all([
    fetch('../partials/chrome.html').then(r => r.text()),
    fetch('../partials/modals.html').then(r => r.text()),
  ]);
  document.getElementById('chrome-mount').innerHTML = chrome;
  document.getElementById('modals-mount').innerHTML = modals;
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
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
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

// ─── NAVIGATION (paths adjusted: pages live in parent dir) ─────
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

function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (!q) return;
  window.location.href = `../index.html#/search/${encodeURIComponent(q)}`;
}
function onSearchInput()    { /* no instant search on tool pages */ }
function onSearchKeydown(e) { if (e.key === 'Enter') doSearch(); }

// ─── LIGHTBOX ──────────────────────────────────────────────────
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
function closeLightbox() { document.getElementById('lightbox')?.classList.remove('visible'); }

// ─── GLOBALS ───────────────────────────────────────────────────
function exposeGlobals() {
  window.navigate            = navigate;
  window.__navigate          = navigate;
  window.toggleTheme         = toggleTheme;
  window.onSearchInput       = onSearchInput;
  window.onSearchKeydown     = onSearchKeydown;
  window.doSearch            = doSearch;
  window.openLightbox        = openLightbox;
  window.closeLightbox       = closeLightbox;
  window.__openLightbox      = openLightbox;
  window.__openUploadHelper  = openUploadHelper;
  window.__closeUploadHelper = closeUploadHelper;
  window.closeUploadHelper   = closeUploadHelper;
  window.showHelp = () => { window.location.href = '../index.html#/help'; };
  window.switchTab     = () => {};
  window.__currentSlug = '';
  window.openEditor    = () => { window.location.href = 'editor.html'; };
  window.openNewArticle = (slug) => { window.location.href = `editor.html?slug=${encodeURIComponent(slug || '')}`; };
  exposeGraphGlobals();
}

(async function init() {
  exposeGlobals();
  await loadPartials();
  initTheme();
  startCetClock();
  const pt = document.getElementById('page-tabs');
  if (pt) pt.style.display = 'none';
  await fetchIndex();
  showGraph();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      document.getElementById('graph-export-overlay')?.classList.remove('visible');
    }
    if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
    }
  });
})();
