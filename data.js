/* ═══════════════════════════════════════════════════════════════
   data.js — GitHub data fetching: index, articles, commons
   ═══════════════════════════════════════════════════════════════ */

import {
  State, API_BASE, RAW_BASE, BRANCH,
  ARTICLES_PATH, IMAGES_PATH,
  INDEX_URL, COMMONS_INDEX_URL
} from './state.js';
import { slugToTitle, extractTitle, extractSummary, parseFrontmatter } from './renderer.js';

// ─── INDEX ─────────────────────────────────────────────────────
export async function fetchIndex() {
  if (State.index) return State.index;
  try {
    const res = await fetch(`${INDEX_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.articles)) { State.index = data; return data; }
    }
  } catch {}
  console.warn('[Marzenapedia] index.json not found, falling back to GitHub tree API');
  try {
    const res = await fetch(`${API_BASE}/git/trees/${BRANCH}?recursive=1`);
    if (!res.ok) throw new Error('GitHub API unavailable');
    const data = await res.json();
    const mdFiles = (data.tree || []).filter(f =>
      f.path.startsWith(ARTICLES_PATH + '/') && f.path.endsWith('.md')
    );
    const articles = await Promise.all(mdFiles.map(async f => {
      const slug = f.path.replace(ARTICLES_PATH + '/', '').replace(/\.md$/, '');
      let title = slugToTitle(slug), summary = '', tags = [];
      try {
        const md = await fetchArticle(slug);
        title = extractTitle(md) || title;
        summary = extractSummary(md);
        const fm = parseFrontmatter(md);
        if (fm.tags) tags = fm.tags;
      } catch {}
      return { slug, title, summary, tags, infobox_type: null, last_edited: null };
    }));
    const fallback = { articles, generated_at: new Date().toISOString(), source: 'fallback' };
    State.index = fallback;
    return fallback;
  } catch (e) {
    State.index = { articles: [], generated_at: null, source: 'empty' };
    return State.index;
  }
}

// ─── ARTICLE ───────────────────────────────────────────────────
export async function fetchArticle(slug) {
  if (State.articleCache[slug]) return State.articleCache[slug];
  const url = `${RAW_BASE}/${ARTICLES_PATH}/${slug}.md?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Article not found: ${slug}`);
  const text = await res.text();
  State.articleCache[slug] = text;
  return text;
}

export async function fetchLastEdited(slug) {
  if (State.lastEditCache[slug] !== undefined) return State.lastEditCache[slug];
  if (State.index) {
    const entry = State.index.articles.find(a => a.slug === slug);
    if (entry && entry.last_edited) { State.lastEditCache[slug] = entry.last_edited; return entry.last_edited; }
  }
  try {
    const url = `${API_BASE}/commits?path=${ARTICLES_PATH}/${slug}.md&per_page=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('commits API failed');
    const commits = await res.json();
    const date = commits?.[0]?.commit?.author?.date || null;
    State.lastEditCache[slug] = date;
    return date;
  } catch {
    State.lastEditCache[slug] = null;
    return null;
  }
}

export async function slugExists(slug) {
  if (State.index) return State.index.articles.some(a => a.slug === slug);
  try {
    const res = await fetch(`${RAW_BASE}/${ARTICLES_PATH}/${slug}.md`);
    return res.ok;
  } catch { return false; }
}

// ─── COMMONS ───────────────────────────────────────────────────
export async function fetchCommonsIndex() {
  if (State.commonsIndex) return State.commonsIndex;
  try {
    const res = await fetch(`${COMMONS_INDEX_URL}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.images)) { State.commonsIndex = data; return data; }
    }
  } catch {}
  // Fallback: scan GitHub tree for images/
  try {
    const res = await fetch(`${API_BASE}/git/trees/${BRANCH}?recursive=1`);
    if (!res.ok) throw new Error('tree API failed');
    const data = await res.json();
    const imgFiles = (data.tree || []).filter(f =>
      f.path.startsWith(IMAGES_PATH + '/') &&
      /\.(png|jpe?g|gif|webp|svg)$/i.test(f.path)
    );
    const images = imgFiles.map(f => ({
      filename: f.path.replace(IMAGES_PATH + '/', ''),
      path: f.path,
      title: '',
      description: '',
      url: `${RAW_BASE}/${f.path}`
    }));
    const fallback = { images, generated_at: new Date().toISOString(), source: 'fallback' };
    State.commonsIndex = fallback;
    return fallback;
  } catch {
    State.commonsIndex = { images: [], generated_at: null, source: 'empty' };
    return State.commonsIndex;
  }
}
