#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   build-index.js  —  Generates index.json from articles/*.md
   ═══════════════════════════════════════════════════════════════
   Runs in the GitHub Action on every push to main, and can be run
   locally with `node build-index.js`.
   No dependencies — uses only Node built-ins.

   Output: index.json at repo root, containing:
   {
     generated_at: ISO timestamp,
     count: number,
     articles: [
       {
         slug, title, summary, tags, date, sources,
         infobox_type, last_edited, headings
       }, …
     ]
   }
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ARTICLES_DIR = path.join(__dirname, 'articles');
const OUTPUT_FILE = path.join(__dirname, 'index.json');

// ─── HELPERS ─────────────────────────────────────────────
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
    if (key === 'tags') fm.tags = val.split(/[,;]\s*/).map(t => t.trim()).filter(Boolean);
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
  // Strip ::: blocks so we don't summarize an infobox
  const stripped = body.replace(/:::[\s\S]*?:::/g, '');
  const lines = stripped.split('\n');
  let pastTitle = false;
  for (const l of lines) {
    if (!pastTitle && l.startsWith('# ')) { pastTitle = true; continue; }
    const t = l.trim();
    if (pastTitle && t && !t.startsWith('#')) {
      const clean = t.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/\*\*?/g, '');
      return clean.length > 200 ? clean.slice(0, 200) + '…' : clean;
    }
  }
  return '';
}

function extractInfoboxType(body) {
  const m = body.match(/:::infobox\s*\n([\s\S]*?)\n:::/);
  if (!m) return null;
  // Look for an explicit "type:" line in the infobox; otherwise null
  const typeMatch = m[1].match(/^type:\s*(.+)$/m);
  return typeMatch ? typeMatch[1].trim() : null;
}

function extractHeadings(body) {
  const out = [];
  const re = /^(#{2,4}) (.+)$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Last commit date for a file via git log. Falls back to file mtime if git isn't available.
function getLastEdited(filePath) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (iso) return iso;
  } catch { /* no git history */ }
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

// ─── MAIN ─────────────────────────────────────────────
function main() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.warn(`[build-index] articles/ does not exist — writing empty index`);
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'));
  console.log(`[build-index] Found ${files.length} article file(s)`);

  const articles = files.map(filename => {
    const slug = filename.replace(/\.md$/, '');
    const filePath = path.join(ARTICLES_DIR, filename);
    const md = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = extractFrontmatter(md);

    const title = extractTitle(body) || slugToTitle(slug);
    const summary = extractSummary(body);
    const headings = extractHeadings(body).slice(0, 30); // cap to keep JSON lean
    const infobox_type = extractInfoboxType(body);
    const last_edited = getLastEdited(filePath);

    return {
      slug,
      title,
      summary,
      tags: frontmatter.tags || [],
      date: frontmatter.date || null,
      sources: frontmatter.sources || [],
      infobox_type,
      last_edited,
      headings
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const output = {
    generated_at: new Date().toISOString(),
    count: articles.length,
    articles
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[build-index] Wrote ${OUTPUT_FILE} (${articles.length} articles)`);
}

main();
