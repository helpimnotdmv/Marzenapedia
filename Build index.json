#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   build-index.js  —  Generates index.json (articles) AND
                      commons.json (images) from the repo.
   ═══════════════════════════════════════════════════════════════
   Runs in the GitHub Action on every push to main, and can be run
   locally with `node build-index.js`.
   No external dependencies — uses only Node built-ins.

   Outputs:
     index.json   — article metadata for the search/nav UI
     commons.json — image metadata for Marzena Commons
   ═══════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── PATHS ────────────────────────────────────────────────────
const ARTICLES_DIR   = path.join(__dirname, 'articles');
const IMAGES_DIR     = path.join(__dirname, 'images');
const META_FILE      = path.join(IMAGES_DIR, 'commons-meta.json');
const INDEX_OUTPUT   = path.join(__dirname, 'index.json');
const COMMONS_OUTPUT = path.join(__dirname, 'commons.json');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);

// Derive raw GitHub URL base from git remote
const RAW_BASE = (() => {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main`;
  } catch { /* ignore */ }
  return 'https://raw.githubusercontent.com/OWNER/REPO/main';
})();

// ─── SHARED HELPERS ───────────────────────────────────────────
/** Last git-commit date for a file; falls back to mtime then null. */
function getLastEdited(filePath) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (iso) return iso;
  } catch { /* no git history */ }
  try { return fs.statSync(filePath).mtime.toISOString(); }
  catch { return null; }
}

// ─── ARTICLE HELPERS ──────────────────────────────────────────
function extractFrontmatter(md) {
  const m = md.match(/^:::frontmatter\s*\n([\s\S]*?)\n:::\s*\n?/);
  if (!m) return { frontmatter: {}, body: md };
  const fm = {};
  m[1].split('\n').forEach(line => {
    const mm = line.match(/^([^:]+):\s*(.*)$/);
    if (!mm) return;
    const key = mm[1].trim().toLowerCase();
    const val = mm[2].trim();
    if (!val) return;
    if (key === 'tags')    fm.tags    = val.split(/[,;]\s*/).map(t => t.trim()).filter(Boolean);
    else if (key === 'sources') fm.sources = val.split(/;\s*/).map(s => s.trim()).filter(Boolean);
    else fm[key] = val;
  });
  return { frontmatter: fm, body: md.slice(m[0].length) };
}

function extractTitle(body) {
  const m = body.match(/^# (.+)$/m);
  return m ? m[1].trim() : null;
}

function extractSummary(body) {
  const stripped = body.replace(/:::[\s\S]*?:::/g, '');
  const lines    = stripped.split('\n');
  let pastTitle  = false;
  for (const l of lines) {
    if (!pastTitle && l.startsWith('# ')) { pastTitle = true; continue; }
    const t = l.trim();
    if (pastTitle && t && !t.startsWith('#')) {
      const clean = t
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
        .replace(/\*\*?/g, '');
      return clean.length > 200 ? clean.slice(0, 200) + '…' : clean;
    }
  }
  return '';
}

function extractInfoboxType(body) {
  const m = body.match(/:::infobox\s*\n([\s\S]*?)\n:::/);
  if (!m) return null;
  const typeMatch = m[1].match(/^type:\s*(.+)$/m);
  return typeMatch ? typeMatch[1].trim() : null;
}

function extractHeadings(body) {
  const out = [];
  const re  = /^(#{2,4}) (.+)$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── BUILD INDEX.JSON ─────────────────────────────────────────
function buildArticleIndex() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.warn('[build-index] articles/ does not exist — writing empty index');
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'));
  console.log(`[build-index] Found ${files.length} article file(s)`);

  const articles = files.map(filename => {
    const slug     = filename.replace(/\.md$/, '');
    const filePath = path.join(ARTICLES_DIR, filename);
    const md       = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = extractFrontmatter(md);

    const title        = extractTitle(body) || slugToTitle(slug);
    const summary      = extractSummary(body);
    const headings     = extractHeadings(body).slice(0, 30);
    const infobox_type = extractInfoboxType(body);
    const last_edited  = getLastEdited(filePath);

    return {
      slug,
      title,
      summary,
      tags:        frontmatter.tags    || [],
      date:        frontmatter.date    || null,
      sources:     frontmatter.sources || [],
      infobox_type,
      last_edited,
      headings,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const output = {
    generated_at: new Date().toISOString(),
    count:    articles.length,
    articles,
  };

  fs.writeFileSync(INDEX_OUTPUT, JSON.stringify(output, null, 2));
  console.log(`[build-index] Wrote ${INDEX_OUTPUT} (${articles.length} articles)`);
}

// ─── BUILD COMMONS.JSON ───────────────────────────────────────
function loadImageMeta() {
  if (!fs.existsSync(META_FILE)) return {};
  try {
    const raw  = fs.readFileSync(META_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Accept both array and keyed-object forms
    const arr  = Array.isArray(data)
      ? data
      : Object.entries(data).map(([filename, rest]) =>
          typeof rest === 'string' ? { filename, description: rest } : { filename, ...rest }
        );
    const map = {};
    arr.forEach(entry => { if (entry.filename) map[entry.filename] = entry; });
    return map;
  } catch (e) {
    console.warn(`[build-commons] Warning: could not parse commons-meta.json — ${e.message}`);
    return {};
  }
}

function buildCommonsIndex() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.warn('[build-commons] images/ does not exist — writing empty commons.json');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const meta  = loadImageMeta();
  const files = fs.readdirSync(IMAGES_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTS.has(ext) && !f.startsWith('.');
  });

  console.log(`[build-commons] Found ${files.length} image file(s)`);

  const images = files.map(filename => {
    const filePath    = path.join(IMAGES_DIR, filename);
    const ext         = path.extname(filename).toLowerCase().slice(1);
    const last_edited = getLastEdited(filePath);
    let   size        = null;
    try { size = fs.statSync(filePath).size; } catch { /* ignore */ }

    const m = meta[filename] || {};
    return {
      filename,
      path:        `images/${filename}`,
      url:         `${RAW_BASE}/images/${filename}`,
      title:       m.title       || '',
      description: m.description || '',
      ext,
      size,
      last_edited,
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));

  const output = {
    generated_at: new Date().toISOString(),
    count:  images.length,
    images,
  };

  fs.writeFileSync(COMMONS_OUTPUT, JSON.stringify(output, null, 2));
  console.log(`[build-commons] Wrote ${COMMONS_OUTPUT} (${images.length} images)`);

  // Emit a stub commons-meta.json if none exists yet
  if (!fs.existsSync(META_FILE) && images.length > 0) {
    const stub = images.map(img => ({
      filename:    img.filename,
      title:       '',
      description: '',
    }));
    fs.writeFileSync(META_FILE, JSON.stringify(stub, null, 2));
    console.log('[build-commons] Created stub commons-meta.json — fill in title/description for each image.');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
buildArticleIndex();
buildCommonsIndex();
