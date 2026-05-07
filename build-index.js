#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   build-index.js  —  Generates index.json (articles) AND
                      commons.json (images) from the repo.
   ═══════════════════════════════════════════════════════════════
   No external dependencies. Image dimensions parsed from file
   headers for PNG, JPEG, GIF, WEBP, BMP. SVG is parsed as text.
   AVIF falls back to "unknown" dimensions.

   Outputs:
     index.json   — article metadata for the search/nav UI
     commons.json — image metadata for Marzena Commons (now per
                    image with width, height, size_human)
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

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp']);

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

// ─── HELPERS ──────────────────────────────────────────────────
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

function humanSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ─── IMAGE DIMENSION PARSER (zero-dep) ────────────────────────
// Reads only the file header — fast, no full decode.
function readDimensions(filePath, ext) {
  try {
    const buf = fs.readFileSync(filePath);
    if (ext === 'png')              return parsePng(buf);
    if (ext === 'jpg' || ext === 'jpeg') return parseJpeg(buf);
    if (ext === 'gif')              return parseGif(buf);
    if (ext === 'webp')             return parseWebp(buf);
    if (ext === 'bmp')              return parseBmp(buf);
    if (ext === 'svg')              return parseSvg(buf);
    return null; // avif unsupported here
  } catch (e) {
    return null;
  }
}

function parsePng(buf) {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A, then IHDR chunk
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  // Width is at offset 16, height at 20 (big-endian uint32)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseJpeg(buf) {
  // Scan SOF markers to find dimensions
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let off = 2;
  while (off < buf.length - 8) {
    if (buf[off] !== 0xFF) return null;
    const marker = buf[off + 1];
    // SOF markers: C0–C3, C5–C7, C9–CB, CD–CF
    if ((marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)) {
      // Segment: [marker (2)] [length (2)] [precision (1)] [height (2)] [width (2)]
      const height = buf.readUInt16BE(off + 5);
      const width  = buf.readUInt16BE(off + 7);
      return { width, height };
    }
    // Skip segment: length is in next 2 bytes (big-endian, includes itself)
    if (marker === 0x00 || marker === 0xFF) { off += 1; continue; }
    if (marker === 0xD8 || marker === 0xD9) { off += 2; continue; } // SOI / EOI
    if (marker >= 0xD0 && marker <= 0xD7) { off += 2; continue; }    // RSTn
    const segLen = buf.readUInt16BE(off + 2);
    off += 2 + segLen;
  }
  return null;
}

function parseGif(buf) {
  // "GIF87a" or "GIF89a" — width at byte 6 (LE u16), height at 8
  if (buf.length < 10) return null;
  const sig = buf.toString('ascii', 0, 3);
  if (sig !== 'GIF') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function parseWebp(buf) {
  // Container: "RIFF" .... "WEBP" then a chunk: "VP8 ", "VP8L", or "VP8X"
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunkType = buf.toString('ascii', 12, 16);
  if (chunkType === 'VP8X') {
    // 24-bit dimensions, minus 1
    const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width: w, height: h };
  }
  if (chunkType === 'VP8 ') {
    // Lossy: dimensions at offset 26, masked to 14 bits LE
    const w = buf.readUInt16LE(26) & 0x3FFF;
    const h = buf.readUInt16LE(28) & 0x3FFF;
    return { width: w, height: h };
  }
  if (chunkType === 'VP8L') {
    // Lossless: signature byte 0x2F at 20, then 14-bit w/h packed
    if (buf[20] !== 0x2F) return null;
    const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
    const w = 1 + (((b2 & 0x3F) << 8) | b1);
    const h = 1 + (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));
    return { width: w, height: h };
  }
  return null;
}

function parseBmp(buf) {
  if (buf.length < 26) return null;
  if (buf[0] !== 0x42 || buf[1] !== 0x4D) return null;
  return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
}

function parseSvg(buf) {
  const text = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  // Try width/height attributes first
  const wMatch = text.match(/<svg[^>]*\swidth\s*=\s*["']([0-9.]+)/i);
  const hMatch = text.match(/<svg[^>]*\sheight\s*=\s*["']([0-9.]+)/i);
  if (wMatch && hMatch) return { width: Math.round(+wMatch[1]), height: Math.round(+hMatch[1]) };
  // Fall back to viewBox
  const vb = text.match(/<svg[^>]*\sviewBox\s*=\s*["']\s*[0-9.-]+\s+[0-9.-]+\s+([0-9.]+)\s+([0-9.]+)/i);
  if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
  return null;
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

    return {
      slug,
      title:        extractTitle(body) || slugToTitle(slug),
      summary:      extractSummary(body),
      tags:         frontmatter.tags    || [],
      date:         frontmatter.date    || null,
      sources:      frontmatter.sources || [],
      infobox_type: extractInfoboxType(body),
      last_edited:  getLastEdited(filePath),
      headings:     extractHeadings(body).slice(0, 30),
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  fs.writeFileSync(INDEX_OUTPUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    count:        articles.length,
    articles,
  }, null, 2));
  console.log(`[build-index] Wrote ${INDEX_OUTPUT} (${articles.length} articles)`);
}

// ─── BUILD COMMONS.JSON ───────────────────────────────────────
function loadImageMeta() {
  if (!fs.existsSync(META_FILE)) return {};
  try {
    const raw  = fs.readFileSync(META_FILE, 'utf8');
    const data = JSON.parse(raw);
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

    const dims = readDimensions(filePath, ext);
    const m    = meta[filename] || {};

    return {
      filename,
      path:        `images/${filename}`,
      url:         `${RAW_BASE}/images/${filename}`,
      title:       m.title       || '',
      description: m.description || '',
      credit:      m.credit      || '',
      tags:        Array.isArray(m.tags) ? m.tags : (m.tags ? [m.tags] : []),
      ext,
      size,
      size_human:  humanSize(size),
      width:       dims ? dims.width  : null,
      height:      dims ? dims.height : null,
      last_edited,
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));

  fs.writeFileSync(COMMONS_OUTPUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    count:  images.length,
    images,
  }, null, 2));
  console.log(`[build-commons] Wrote ${COMMONS_OUTPUT} (${images.length} images)`);

  // Stub commons-meta.json if missing
  if (!fs.existsSync(META_FILE) && images.length > 0) {
    const stub = images.map(img => ({
      filename:    img.filename,
      title:       '',
      description: '',
      credit:      '',
      tags:        [],
    }));
    fs.writeFileSync(META_FILE, JSON.stringify(stub, null, 2));
    console.log('[build-commons] Created stub commons-meta.json — fill in title/description for each image.');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
buildArticleIndex();
buildCommonsIndex();
