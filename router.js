// router.js
export function parseHash() {
  const hash = window.location.hash.slice(1) || '';
  // Formats: #/article/slug#section, #/search/query, #/all, #/editor/slug
  const sectionMatch = hash.match(/^\/article\/([^#]+)#(.+)$/);
  if (sectionMatch) return { view: 'article', slug: sectionMatch[1], section: sectionMatch[2] };
  const parts = hash.replace(/^\//, '').split('/');
  const view  = parts[0] || 'home';
  if (view === 'article') return { view: 'article', slug: parts[1] || '', section: null };
  if (view === 'search')  return { view: 'search',  query: decodeURIComponent(parts.slice(1).join('/')) };
  if (view === 'all')     return { view: 'all' };
  if (view === 'editor')  return { view: 'editor', slug: parts[1] || '' };
  // 'commons' and 'graph' are standalone pages — if someone lands here via
  // a hash route (e.g. a stale link), redirect them immediately.
  if (view === 'commons') { window.location.href = 'commons.html'; return { view: 'home' }; }
  if (view === 'graph')   { window.location.href = 'graph.html';   return { view: 'home' }; }
  return { view: 'home' };
}

export function navigate(view, slugOrQuery) {
  if (view === 'home')    { window.location.hash = '/'; return; }
  if (view === 'all')     { window.location.hash = '/all'; return; }
  // Commons and Graph are now standalone pages, not hash routes.
  if (view === 'commons') { window.location.href = 'commons.html'; return; }
  if (view === 'graph')   { window.location.href = 'graph.html';   return; }
  if (view === 'search')  { window.location.hash = `/search/${encodeURIComponent(slugOrQuery)}`; return; }
  if (view === 'article') { window.location.hash = `/article/${slugOrQuery}`; return; }
  if (view === 'editor')  { window.location.href = `editor.html?slug=${encodeURIComponent(slugOrQuery || '')}`; return; }
}
