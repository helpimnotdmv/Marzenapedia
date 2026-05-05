/* ═══════════════════════════════════════════════════════════════
   commons-page.js — Entry point for commons.html
   Bootstraps chrome partials, theme, clock, then mounts the
   Marzena Commons gallery.
   ═══════════════════════════════════════════════════════════════ */

import { State } from './state.js';
import { fetchIndex } from './data.js';
import { escapeHtml, escapeAttr } from './renderer.js';
import {
  showCommons, filterCommons, copyCommonsRef,
  copyToClipboard, openUploadHelper, closeUploadHelper
} from './gallery.js';

// ─── PARTIALS ──────────────────────────────────────────────────
async function loadPartials() {
  const [chrome, footer, modals] = await Promise.all([
    fetch('partials/chrome.html').then(r => r.text()),
    fetch('partials/footer.html').then(r => r.text()),
    fetch('partials/modals.html').then(r => r.text()),
  ]);
  document.getElementById('chrome-mount').innerHTML = chrome;
  document.getElementById('footer-mount').innerHTML = footer;
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
// On a standalone page we navigate by changing href, not by hash,
// because there is no app.js hashchange listener here.
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
// The chrome partial includes a search bar; wire it up to redirect
// to index.html for actual search results.
function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (!q) return;
  window.location.href = `index.html#/search/${encodeURIComponent(q)}`;
}

function onSearchInput() {
  // No instant-search dropdown on standalone pages — just allow submit.
}

function onSearchKeydown(e) {
  if (e.key === 'Enter') doSearch();
}

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
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('visible');
  document.body.style.overflow = '';
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

  // Commons / gallery
  window.__filterCommons     = filterCommons;
  window.__copyCommonsRef    = copyCommonsRef;
  window.__copyToClipboard   = copyToClipboard;
  window.__openUploadHelper  = openUploadHelper;
  window.__closeUploadHelper = closeUploadHelper;
  window.closeUploadHelper   = closeUploadHelper;

  // Lightbox
  window.openLightbox        = openLightbox;
  window.closeLightbox       = closeLightbox;
  window.__openLightbox      = openLightbox;

  // Help — just redirect to index for now
  window.showHelp = () => { window.location.href = 'index.html#/help'; };

  // Page-tabs stubs (chrome partial may reference these)
  window.switchTab = () => {};
  window.__currentSlug = '';
}

// ─── INIT ──────────────────────────────────────────────────────
(async function init() {
  exposeGlobals();
  await loadPartials();
  initTheme();
  startCetClock();

  // Hide page-tabs: not relevant on Commons
  const pt = document.getElementById('page-tabs');
  if (pt) pt.style.display = 'none';

  // Pre-fetch index so any wiki-link resolution works
  await fetchIndex();

  // Mount the Commons gallery into #main-content
  await showCommons();

  // Keyboard: Escape closes lightbox / upload helper
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeUploadHelper();
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      document.getElementById('search-input')?.focus();
    }
  });
})();
