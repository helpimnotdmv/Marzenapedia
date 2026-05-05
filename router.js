// router.js
export function parseHash() {
  const hash = window.location.hash.slice(1) || '';
  // Formats: #/article/slug#section, #/search/query, #/all, #/commons, #/graph
  const sectionMatch = hash.match(/^\/article\/([^#]+)#(.+)$/);
  if (sectionMatch) return { view: 'article', slug: sectionMatch[1], section: sectionMatch[2] };

  const parts = hash.replace(/^\//, '').split('/');
  const view  = parts[0] || 'home';

  if (view === 'article') return { view: 'article', slug: parts[1] || '', section: null };
  if (view === 'search')  return { view: 'search',  query: decodeURIComponent(parts.slice(1).join('/')) };
  if (view === 'all')     return { view: 'all' };
  if (view === 'commons') return { view: 'commons' };
  if (view === 'graph')   return { view: 'graph' };
  if (view === 'editor')  return { view: 'editor', slug: parts[1] || '' };
  return { view: 'home' };
}

export function navigate(view, slugOrQuery) {
  if (view === 'home')    { window.location.hash = '/'; return; }
  if (view === 'all')     { window.location.hash = '/all'; return; }
  if (view === 'commons') { window.location.hash = '/commons'; return; }
  if (view === 'graph')   { window.location.hash = '/graph'; return; }
  if (view === 'search')  { window.location.hash = `/search/${encodeURIComponent(slugOrQuery)}`; return; }
  if (view === 'article') { window.location.hash = `/article/${slugOrQuery}`; return; }
  if (view === 'editor')  { window.location.hash = `/editor/${slugOrQuery || ''}`; return; }
}
