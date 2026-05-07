/* ═══════════════════════════════════════════════════════════════
   gallery.js — Marzena Commons: image gallery, upload helper
   ═══════════════════════════════════════════════════════════════ */

import { escapeHtml, escapeAttr, resolveImagePath } from './renderer.js';
import { fetchCommonsIndex } from './data.js';
import { RAW_BASE, REPO_OWNER, REPO_NAME, BRANCH, IMAGES_PATH, SiteConfig } from './state.js';

// ─── COMMONS VIEW ──────────────────────────────────────────────
export async function showCommons() {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading the Commons</div>';
  document.title = 'Marzena Commons — Marzenapedia';
  document.getElementById('breadcrumb').innerHTML =
    `<a onclick="window.__navigate('home')">Main Page</a><span class="sep">·</span>Marzena Commons`;
  document.getElementById('page-tabs').style.display = 'none';

  const commons = await fetchCommonsIndex();
  const images = commons.images || [];

  document.getElementById('main-content').innerHTML = `
    <div class="commons-page">
      <div class="commons-header">
        <div>
          <h1>Marzena Commons</h1>
          <p class="commons-subtitle">The Republic's image archive — ${images.length} file${images.length !== 1 ? 's' : ''} indexed</p>
        </div>
        <button class="btn btn-primary" onclick="window.__openUploadHelper()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Image
        </button>
      </div>

      <div class="commons-search-bar">
        <input type="text" id="commons-search" placeholder="Search images by filename or description…"
          oninput="window.__filterCommons(this.value)">
      </div>

      ${images.length === 0
        ? `<div class="notice-box">No images found in the repository yet. Use the Upload button to add your first image.</div>`
        : `<div class="commons-grid" id="commons-grid">
            ${renderCommonsGrid(images)}
          </div>`
      }

      <div class="commons-paste-section">
        <div class="commons-paste-header">
          <h3>Image Reference List</h3>
          <p>Copy-pasteable filenames and descriptions for use in articles.</p>
          <button class="btn" onclick="window.__copyCommonsRef()" id="commons-ref-copy-btn">Copy All</button>
        </div>
        <textarea class="commons-ref-list" id="commons-ref-list" readonly>${buildRefList(images)}</textarea>
      </div>
    </div>`;

  window.__commonsImages = images;
}

function renderCommonsGrid(images) {
  return images.map(img => {
    const url = img.url || resolveImagePath(img.filename);
    const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '';
    const sizeStr = img.size_human || '';
    const meta = [dims, sizeStr].filter(Boolean).join(' · ');
    return `<div class="commons-card" data-filename="${escapeAttr(img.filename)}" data-desc="${escapeAttr(img.description || '')}">
      <div class="commons-thumb-wrap" onclick="window.__openLightbox('${escapeAttr(url)}','${escapeAttr(img.title || img.filename)}')">
        <img src="${escapeAttr(url)}" alt="${escapeAttr(img.title || img.filename)}" loading="lazy"
          onerror="this.parentElement.classList.add('img-missing')">
        <div class="commons-thumb-overlay">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </div>
      </div>
      <div class="commons-card-info">
        <div class="commons-card-title">${escapeHtml(img.title || img.filename)}</div>
        ${img.description ? `<div class="commons-card-desc">${escapeHtml(img.description)}</div>` : ''}
        ${meta ? `<div class="commons-card-meta">${escapeHtml(meta)}</div>` : ''}
        <div class="commons-card-filename">
          <code>${escapeHtml(img.filename)}</code>
          <button class="commons-copy-btn" onclick="window.__copyToClipboard('${escapeAttr(img.filename)}', this)" title="Copy filename">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function buildRefList(images) {
  if (!images.length) return '(no images yet)';
  return images.map(img => {
    const dims = (img.width && img.height) ? ` [${img.width}×${img.height}]` : '';
    return `${img.filename}${dims}${img.title ? ' — ' + img.title : ''}${img.description ? '\n  ' + img.description : ''}`;
  }).join('\n\n');
}

export function filterCommons(query) {
  const images = window.__commonsImages || [];
  const q = query.toLowerCase();
  const filtered = q ? images.filter(img =>
    img.filename.toLowerCase().includes(q) ||
    (img.title || '').toLowerCase().includes(q) ||
    (img.description || '').toLowerCase().includes(q)
  ) : images;
  const grid = document.getElementById('commons-grid');
  if (grid) grid.innerHTML = renderCommonsGrid(filtered);
  const refList = document.getElementById('commons-ref-list');
  if (refList) refList.value = buildRefList(filtered);
}

export async function copyCommonsRef() {
  const ta = document.getElementById('commons-ref-list');
  if (!ta) return;
  try {
    await navigator.clipboard.writeText(ta.value);
    const btn = document.getElementById('commons-ref-copy-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = 'Copy All', 2000); }
  } catch {
    ta.select();
  }
}

export async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { btn.innerHTML = '✓'; setTimeout(() => btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`, 1500); }
  } catch { alert(text); }
}

// ─── UPLOAD HELPER MODAL ───────────────────────────────────────
export function openUploadHelper() {
  const overlay = document.getElementById('upload-helper-overlay');
  if (overlay) overlay.classList.add('visible');
}
export function closeUploadHelper() {
  const overlay = document.getElementById('upload-helper-overlay');
  if (overlay) overlay.classList.remove('visible');
}

// ─── FEATURED ARCHIVE IMAGE ────────────────────────────────────
export async function getFeaturedImage() {
  const commons = await fetchCommonsIndex();
  const images = (commons.images || []).filter(img => img.url || img.filename);
  if (!images.length) return null;
  const mode = SiteConfig.featuredImageMode || 'daily';
  if (mode.startsWith('fixed:')) {
    const target = mode.slice('fixed:'.length).trim();
    return images.find(i => i.filename === target) || images[0];
  }
  if (mode === 'random') {
    return images[Math.floor(Math.random() * images.length)];
  }
  // daily
  const seed = Math.floor(Date.now() / 86400000);
  return images[seed % images.length];
}
