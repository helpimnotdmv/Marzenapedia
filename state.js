// state.js
export const REPO_OWNER   = 'helpimnotdmv';        // ← your GitHub username
export const REPO_NAME    = 'Marzenapedia';
export const BRANCH       = 'main';
export const ARTICLES_PATH = 'articles';
export const IMAGES_PATH   = 'images';

export const RAW_BASE  = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
export const API_BASE  = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
export const INDEX_URL         = `${RAW_BASE}/index.json`;
export const COMMONS_INDEX_URL = `${RAW_BASE}/commons.json`;

export const State = {
  view:              'home',
  slug:              null,
  index:             null,
  commonsIndex:      null,
  articleCache:      {},
  lastEditCache:     {},
  cmEditor:          null,
  editorPreviewTimer: null,
  searchDebounceTimer: null,
  searchActiveResult: -1,
  scrollObserver:    null,
};
