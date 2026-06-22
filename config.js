/* ═══════════════════════════════════════════════════════════════
   config.js — Site-level configuration
   ═══════════════════════════════════════════════════════════════
   Edit this file to customise Marzenapedia's identity, branding,
   and behaviour without touching the JS modules.

   This file is loaded as an ES module by every entry point.
   ═══════════════════════════════════════════════════════════════ */

export const SiteConfig = {
  // ─── IDENTITY ────────────────────────────────────────────────
  siteName:     'Marzenapedia',
  siteSubtitle: 'The Free Encyclopaedia of the Republic',
  tagline:      'Fictional nation · Worldbuilding reference',

  // ─── NATION DETAILS (shown in portal hero & sidebar) ─────────
  nation: {
    formalName:  'The Republic of Marzena',
    capital:     'Lévane',
    foundedDate: '1952-05-02',          // ISO date — used in hero
    foundedDateDisplay: '2 May 1952',   // pretty form for hero text
    population:  '~41 million',
    region:      'North African seaboard',
    summary:     'Welcome to Marzenapedia, the free encyclopaedia covering the history, geography, politics, science, culture, and people of the Republic of Marzena.',
  },

  // ─── HERO MOTTO (shown on home page) ─────────────────────────
  // Multi-line. Each line is rendered on its own line via the renderer.
  heroMotto: [
    'A nation of its own civilisation, heir to no single tradition.',
    "What follows is the Republic's record of itself —",
    'its institutions, its history, its conflicts and its silences.',
  ],
  heroAttribution: '— Bureau of Records, Lévane · Founded 2 May 1952',

  // ─── FOOTER ──────────────────────────────────────────────────
  footer: {
    bureau:   '— Bureau of Records, Lévane —',
    poweredBy: 'Powered by GitHub Pages',
    disclaimer: 'All content on Marzenapedia is fictional and created for worldbuilding and narrative purposes. No real nation, person, or event is represented.',
  },

  // ─── REPOSITORY ──────────────────────────────────────────────
  // Used to derive raw URLs and GitHub edit URLs.
  repo: {
    owner:        'helpimnotdmv',
    name:         'Marzenapedia',
    branch:       'main',
    articlesPath: 'articles',
    imagesPath:   'images',
  },

  // ─── FEATURED IMAGE SELECTION ────────────────────────────────
  // 'daily'  — rotates daily based on date seed (default)
  // 'random' — picks a random image on each page load
  // 'fixed:FILENAME.jpg' — always shows the named image
  featuredImageMode: 'daily',

  // ─── EDITOR DEFAULTS ─────────────────────────────────────────
  editor: {
    autosaveDebounceMs: 1000,
    draftKeyPrefix:     'marzenapedia-draft:',
  },

  // ─── BRANDING IMAGES ─────────────────────────────────────────
  // Filenames in /images/ (paths are resolved at runtime).
  branding: {
    sealImage:     'CoAMZ.png',          // shown in header
    sealImageAlt:  'Coat of Arms of Marzena',
  },

  // ─── CITATION ────────────────────────────────────────────────
  // Used by the "Cite This Article" button. Anything in {curly}
  // braces is substituted at runtime.
  citation: {
    // APA-7 wiki style
    template: '{contributors}. ({year}, {monthName} {day}). {title}. {siteName}. {url}',
    contributors: 'Marzenapedia contributors',
  },
  // ─── DID YOU KNOW (Main Page box) — add / edit / remove freely ─
  didYouKnow: [
    '…that Marzena\'s capital, Lévane, was purpose-built after independence?',
    '…that the country\'s sole official language is French?',
    '…that the Canary Islands became an autonomous territory in 1983?',
    '…that Marzena operates Africa\'s only orbital launch facility?',
    '…that phosphate products account for roughly one-third of export revenue?',
  ],
   
};

/* ─── DERIVED CONSTANTS ────────────────────────────────────────
   These are computed from SiteConfig and re-exported for the rest
   of the app. Keep in sync with state.js (which still re-exports
   the same names for backward compatibility).
   ─────────────────────────────────────────────────────────────── */
export const REPO_OWNER    = SiteConfig.repo.owner;
export const REPO_NAME     = SiteConfig.repo.name;
export const BRANCH        = SiteConfig.repo.branch;
export const ARTICLES_PATH = SiteConfig.repo.articlesPath;
export const IMAGES_PATH   = SiteConfig.repo.imagesPath;

export const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
export const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

export const INDEX_URL         = `${RAW_BASE}/index.json`;
export const COMMONS_INDEX_URL = `${RAW_BASE}/commons.json`;
