#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   build-commons.js  —  Generates commons.json from images/
   ═══════════════════════════════════════════════════════════════
   Runs in the GitHub Action on every push to main, and can be run
   locally with `node build-commons.js`.
   No dependencies — uses only Node built-ins.

   Reads:   images/commons-meta.json  (optional, hand-authored metadata)
   Scans:   images/                   (for all image files)
   Outputs: commons.json              (at repo root)

   commons-meta.json format (array or object keyed by filename):
   [
     {
       "filename": "FlagMZ.jpg",
       "title":    "Flag of Marzena",
       "description": "The national tricolour, adopted 2 May 1952."
     },
     …
   ]

   Output commons.json:
   {
     "generated_at": "<ISO>",
     "count": <n>,
     "images": [
       {
         "filename":    "FlagMZ.jpg",
         "path":        "images/FlagMZ.jpg",
         "url":         "https://raw.githubusercontent.com/…/main/images/FlagMZ.jpg",
         "title":       "Flag of Marzena",
         "description": "The national tricolour, adopted 2 May 1952.",
         "ext":         "jpg",
         "size":        <bytes>,
         "last_edited": "<ISO>"
       },
       …
     ]
   }
   ═══════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CONFIG ───────────────────────────────────────────────────
const IMAGES_DIR   = path.join(__dirname, 'images');
const META_FILE    = path.join(IMAGES_DIR, 'commons-meta.json');
const OUTPUT_FILE  = path.join(__dirname, 'commons.json');

// Derive the raw GitHub URL base from the git remote (falls back to a placeholder)
const RAW_BASE = (() => {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    // SSH:   git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main`;
  } catch { /* ignore */ }
  return 'https://raw.githubusercontent.com/OWNER/REPO/main';
})();

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);

// ─── HELPERS ──────────────────────────────────────────────────
function getLastEdited(filePath) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (iso) return iso;
  } catch { /* no git */ }
  try { return fs.statSync(filePath).mtime.toISOString(); }
  catch { return null; }
}

function loadMeta() {
  if (!fs.existsSync(META_FILE)) return {};
  try {
    const raw  = fs.readFileSync(META_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Accept both array and object forms
    const arr  = Array.isArray(data) ? data : Object.entries(data).map(([filename, rest]) =>
      typeof rest === 'string' ? { filename, description: rest } : { filename, ...rest }
    );
    const map  = {};
    arr.forEach(entry => {
      if (entry.filename) map[entry.filename] = entry;
    });
    return map;
  } catch (e) {
    console.warn(`[build-commons] Warning: could not parse commons-meta.json — ${e.message}`);
    return {};
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.warn('[build-commons] images/ directory does not exist — writing empty commons.json');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const meta = loadMeta();

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

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[build-commons] Wrote ${OUTPUT_FILE} (${images.length} images)`);

  // ── Emit a stub commons-meta.json if none exists ──────────────
  // This gives editors a ready-made file to fill in metadata.
  if (!fs.existsSync(META_FILE) && images.length > 0) {
    const stub = images.map(img => ({
      filename:    img.filename,
      title:       '',
      description: '',
    }));
    fs.writeFileSync(META_FILE, JSON.stringify(stub, null, 2));
    console.log(`[build-commons] Created stub commons-meta.json — fill in title/description for each image.`);
  }
}

main();
