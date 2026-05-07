/* router.js — hash-based routing for the SPA shell */

export function parseHash() {
  const hash = window.location.hash.slice(1) || '';
  const sectionMatch = hash.match(/^\/article\/([^#]+)#(.+)$/);
  if (sectionMatch) return { view: 'article', slug: sectionMatch[1], section: sectionMatch[2] };

  const parts = hash.replace(/^\//, '').split('/');
  const view  = parts[0] || 'home';

  if (view === 'article') return { view: 'article', slug: parts[1] || '', section: null };
  if (view === 'search')  return { view: 'search',  query: decodeURIComponent(parts.slice(1).join('/')) };
  if (view === 'all')     return { view: 'all' };
  if (view === 'commons') return { view: 'commons' };
  if (view === 'graph')   return { view: 'graph' };
  if (view === 'stats')   return { view: 'stats' };
  if (view === 'tools')   return { view: 'tools' };
  if (view === 'editor')  return { view: 'editor', slug: parts[1] || '' };
  if (view === 'help')    return { view: 'help' };
  return { view: 'home' };
}

export function navigate(view, slugOrQuery) {
  if (view === 'home')    { window.location.hash = '/'; return; }
  if (view === 'all')     { window.location.hash = '/all'; return; }
  if (view === 'commons') { window.location.hash = '/commons'; return; }
  if (view === 'tools')   { window.location.hash = '/tools'; return; }
  if (view === 'help')    { window.location.hash = '/help'; return; }
  if (view === 'graph')   { window.location.href = 'tools/graph.html'; return; }
  if (view === 'stats')   { window.location.href = 'tools/stats.html'; return; }
  if (view === 'editor')  { window.location.href = `tools/editor.html?slug=${encodeURIComponent(slugOrQuery || '')}`; return; }
  if (view === 'search')  { window.location.hash = `/search/${encodeURIComponent(slugOrQuery)}`; return; }
  if (view === 'article') { window.location.hash = `/article/${slugOrQuery}`; return; }
}
