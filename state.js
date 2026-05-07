/* ═══════════════════════════════════════════════════════════════
   state.js — Runtime state. Constants now live in config.js.
   ═══════════════════════════════════════════════════════════════ */

// Re-export constants from config so existing imports keep working.
export {
  REPO_OWNER, REPO_NAME, BRANCH,
  ARTICLES_PATH, IMAGES_PATH,
  RAW_BASE, API_BASE,
  INDEX_URL, COMMONS_INDEX_URL,
  SiteConfig,
} from './config.js';

export const State = {
  view:                'home',
  slug:                null,
  index:               null,
  commonsIndex:        null,
  articleCache:        {},
  lastEditCache:       {},
  cmEditor:            null,
  editorPreviewTimer:  null,
  editorDirty:         false,        // set true on any change
  editorOriginal:      '',           // content as loaded — to detect dirtiness
  editorDraftRestored: false,
  searchDebounceTimer: null,
  searchActiveResult:  -1,
  scrollObserver:      null,
};
