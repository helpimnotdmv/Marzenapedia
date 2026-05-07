# Marzenapedia

The free encyclopaedia of the Republic of Marzena — a fictional sovereign state, presented as a worldbuilding wiki.

**Live site:** https://helpimnotdmv.github.io/Marzenapedia/

---

## What this is

Marzenapedia is a static, GitHub-Pages–hosted wiki that reads its content directly from this repository. Articles live as `.md` files in `articles/`, images live in `images/`, and a small JavaScript front end renders everything as a coherent encyclopaedia with infoboxes, figures, citations, charts, diagrams, and a Wikipedia-flavoured layout.

There is **no server** and **no database**. Everything is plain files committed to GitHub. A GitHub Action rebuilds two index files (`index.json` and `commons.json`) on every push so the front end can browse and search without making a million requests.

---

## Architecture at a glance

```
Browser ─────► raw.githubusercontent.com ─────► index.json / commons.json / articles/*.md / images/*
   ▲
   │ ES modules
   │
[ index.html ]   [ commons.html ]   [ tools/editor.html ]   [ tools/graph.html ]   [ tools/stats.html ]
       │                │                     │                       │                      │
       ▼                ▼                     ▼                       ▼                      ▼
   app.js          commons-page.js     editor-page.js          graph-page.js          stats-page.js
       │                │                     │                       │                      │
       └─── shared modules ──┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
                             │      │      │      │      │      │      │      │
                          state.js  data.js  router.js  renderer.js  editor.js  gallery.js
                             │
                             ▼
                          config.js  ← all site-level settings (name, hero text, repo, etc.)
```

The front end is a hash-routed single-page app for the main wiki, plus a few standalone pages for tools that need a full-screen UX.

---

## File / directory map

```
Marzenapedia/
├── articles/                       Markdown articles (the actual wiki content)
├── images/                         Image archive
│   └── commons-meta.json           Per-image metadata: title, description, credit, tags
├── partials/                       HTML fragments injected by JS at runtime
│   ├── chrome.html                 Top bar + header + search bar + page tabs
│   ├── footer.html                 Site footer
│   └── modals.html                 Editor modal, save instructions, lightbox, etc.
├── tools/                          Authoring tools (full-page apps)
│   ├── editor.html / editor-page.js / editor.js     ← article editor
│   ├── graph.html  / graph-page.js  / graph.js      ← graph / org-chart builder
│   └── stats.html  / stats-page.js  / stats.js      ← chart builder
├── .github/workflows/build-index.yml  Rebuilds index.json + commons.json on push
├── config.js                       Site-level settings (name, hero, repo, etc.)
├── state.js                        Runtime state + re-exports config constants
├── router.js                       Hash routing for the SPA
├── data.js                         GitHub-raw fetchers for articles, indexes
├── renderer.js                     Markdown → HTML, all :::block::: handlers
├── editor.js                       Editor logic (CodeMirror, drafts, toolbar, infobox builder)
├── gallery.js                      Marzena Commons rendering
├── app.js                          Main SPA entry — routes to home/article/search/help/etc.
├── commons-page.js                 Standalone Commons page entry
├── build-index.js                  Node script: rebuilds index.json + commons.json
├── index.html                      Main entry
├── commons.html                    Commons entry
├── styles.css                      All styling
└── README.md                       (this file)
```

---

## Customising the site

Almost everything that's text-on-screen lives in **`config.js`**. Edit it and commit — no JS module changes needed.

```js
export const SiteConfig = {
  siteName:     'Marzenapedia',
  siteSubtitle: 'The Free Encyclopaedia of the Republic',
  tagline:      'Fictional nation · Worldbuilding reference',
  nation: {
    formalName: 'The Republic of Marzena',
    capital:    'Lévane',
    foundedDate: '1952-05-02',
    foundedDateDisplay: '2 May 1952',
    population: '~41 million',
    summary:    '…',
  },
  heroMotto: [ 'line one', 'line two', 'line three' ],
  heroAttribution: '— Bureau of Records, Lévane',
  footer:    { /* … */ },
  repo:      { owner, name, branch, articlesPath, imagesPath },
  featuredImageMode: 'daily', // | 'random' | 'fixed:FILENAME.jpg'
  editor:    { autosaveDebounceMs: 1000, draftKeyPrefix: 'marzenapedia-draft:' },
  branding:  { sealImage: 'CoAMZ.png', sealImageAlt: '…' },
  citation:  { template: '…', contributors: '…' },
};
```

> Some text — like the hardcoded labels in `partials/chrome.html` and `partials/footer.html` — is in HTML rather than `config.js` because partials load before JS. If you change `siteName` in config and want the chrome to match, edit those partial files too. (A future improvement would be to template the partials with config at runtime.)

---

## Writing articles

Articles are Markdown files in `articles/`. The filename (without `.md`) is the **slug** used in URLs and links.

```markdown
:::frontmatter
tags: government, founding
date: 1952-05-02
sources: National Archive Doc 44-B; Bureau Bulletin 12
:::

# Article Title

Opening paragraph.

## A Section

Body text. Wiki link: [[Some Other Article]]. External link: [GitHub](https://github.com).

> A pull-quote.

- bullet
- bullet

| Col A | Col B |
| ----- | ----- |
| 1     | 2     |
```

### Custom block syntax

In addition to standard Markdown, Marzenapedia recognises `:::name args::: … :::` blocks:

| Block            | Purpose                                                   |
|------------------|-----------------------------------------------------------|
| `:::frontmatter` | Article metadata (tags, date, sources)                    |
| `:::infobox`     | Sidebar info card with title, image, key/value rows       |
| `:::figure`      | Single floating image with caption                        |
| `:::gallery`     | Multi-image grid                                          |
| `:::table`       | Static wiki table with optional caption                   |
| `:::datatable`   | Sortable, filterable interactive table                    |
| `:::chart`       | Bar / hbar / line / stacked / pie / donut chart           |
| `:::map`         | Google My Maps embed                                      |
| `:::graph`       | Diagram exported from the Graph Tool                      |

The full Help page (`#/help` or top bar → Help) has examples of every block. The Editor's toolbar has one-click insertion buttons for all of them.

#### `:::infobox` example
```
:::infobox
title: Republic of Marzena
image: FlagMZ.jpg
caption: Flag of the Republic
Capital: Lévane
Population: 41,000,000
section: Government
Type: Semi-presidential republic
President: Élise Marchand
:::
```

#### `:::gallery` example
```
:::gallery columns: 3 caption: "Architecture of Lévane"
- LevaneCity1.jpg | The Capitol
- LevaneCity2.jpg | The Bourse
- LevaneCity3.jpg | National Library
:::
```

#### `:::datatable` example
```
:::datatable sortable: true filterable: true caption: "Election results"
| Year | Party | Seats |
| 1952 | PRM   | 142   |
| 1956 | PRM   | 138   |
:::
```

Click column headers to sort. Type into the filter to narrow rows.

#### `:::chart` example
```
:::chart type: bar caption: "GDP growth"
labels: 2020, 2021, 2022, 2023, 2024
series: GDP growth | 1.2, 2.4, 3.1, 2.8, 3.4
series: Inflation  | 2.1, 2.5, 4.2, 3.1, 2.4
:::
```

Chart types: `bar`, `hbar`, `line`, `stacked`, `pie`, `donut`. Use the Stats Tool to build charts visually and export the block.

---

## Tools

All authoring tools live under `/tools/`. Linked from the top bar (Tools → ...).

### Editor (`tools/editor.html`)

A split-pane Markdown editor (CodeMirror) with live preview, frontmatter form, structured infobox builder, and an image picker.

Key features:
- **Formatting toolbar** above the editor — bold, italic, headings, lists, wiki link, and one-click insertion of every block type.
- **Live preview** in Split mode renders blocks exactly as they'll appear on the article page.
- **Auto-save drafts** to browser `localStorage` every second after a change. Drafts persist across browser sessions and are keyed per slug. On reopen, the editor offers to restore.
- **Unsaved-changes guard** — `beforeunload` prevents accidental tab close with unsaved work.
- **Save to GitHub** — opens GitHub's editor for the file with content prefilled (or copied to clipboard for paste, depending on length). Drafts are cleared on successful save.
- **Image picker** — drag images from the side panel into the editor; they're inserted as `:::figure` blocks.

Keyboard:
- `Ctrl/Cmd+B` bold, `Ctrl/Cmd+I` italic, `Ctrl/Cmd+S` save
- `Esc` closes pickers and modals

### Graph Tool (`tools/graph.html`)

Visual graph / org-chart builder. Click to add nodes, click two nodes to add an edge, click+drag for an area.

- **Nodes**: rectangle / rounded / diamond / circle, custom colour, optional group label.
- **Areas**: semi-transparent rectangles rendered behind nodes. Drag corners or edges to resize, drag body to move. Areas can be nested (the largest renders behind smaller ones).
- **Edges**:
  - Arrows: one-way / bidirectional / none
  - Routing: straight / curved Bezier / orthogonal right-angle
  - Weight (stroke width)
  - Style: solid / dashed / dotted
  - **Waypoints** for "indirect targets" — Shift+click an edge to add a waypoint, drag to move
  - **Draggable labels** — click and drag the label text to reposition

- **Export**: SVG, PNG (rasterised at 2× via canvas), or `:::graph` Markdown for inline use in articles.

Keyboard: `V` Select / `N` Node / `A` Area / `E` Edge / `Del` delete / `Esc` clear selection. Mouse wheel zooms.

### Stats Tool (`tools/stats.html`)

Build charts from a spreadsheet-style grid or pasted CSV.

- **Manual grid** — first column is row labels, additional columns are series. Edit any cell to update the live preview.
- **CSV import** — paste a CSV (first row = header) and click Import.
- **Chart types** — bar, horizontal bar, line, stacked bar, pie, donut.
- **Export** — PNG, JPG, SVG, or `:::chart` Markdown block.

### Marzena Commons (`commons.html`)

Image archive with search, dimension display, file size, and per-image metadata (title, description, credit, tags). Per-image data is hand-authored in `images/commons-meta.json`.

To add a new image:
1. Click "Upload Image" in Commons. Or commit a file directly to `images/` on GitHub.
2. Edit `images/commons-meta.json` to add metadata for the new file. (The build script generates a stub entry automatically if the file doesn't exist yet.)
3. Push. The Action rebuilds `commons.json` with detected width × height and file size.

---

## Build pipeline

`build-index.js` is a zero-dependency Node script run by GitHub Actions on every push that touches `articles/` or `images/`.

It does two things:

**`index.json`** — for each `articles/*.md`:
- Parses frontmatter (tags, date, sources).
- Extracts title from the first `# Heading`.
- Extracts a summary from the first non-frontmatter prose line.
- Lists `## Section` headings for the search engine.
- Reads last-modified date from git history (`git log -1 --format=%cI`).

**`commons.json`** — for each `images/*`:
- Reads file size (bytes).
- Parses width × height directly from file headers — supports PNG, JPEG, GIF, WebP, BMP, SVG. (AVIF gets `null` dimensions.)
- Joins with `commons-meta.json` to attach title, description, credit, tags.
- Reads last-modified date from git history.

Both indexes are committed back to the repo with `[skip ci]` so the front end can fetch them without rate limits.

To run locally:
```bash
node build-index.js
```

---

## Local development

Because the front end is plain ES modules + plain HTML, you only need a static file server:

```bash
# from repo root
python3 -m http.server 8000
# or
npx serve
```

Then open `http://localhost:8000`.

> **Caveat**: the front end fetches `index.json` and `commons.json` from `raw.githubusercontent.com`, *not* from your local server, because those are baked into `state.js` via the repo URL. To preview unindexed local changes, run `node build-index.js` and tweak `data.js` to fetch from `./` if you really need full local rendering. For typical edits this isn't necessary — push to a branch and it'll just work.

---

## Adding new block types

The block tokenizer (`renderer.js → tokenizeBlocks`) splits the markdown body on `:::name args:::…:::` and routes each block to a handler in `BLOCK_HANDLERS`. To add a new block:

1. Write a handler in `renderer.js`:
   ```js
   function renderMyBlock(tok) {
     const args = parseInlineArgs(tok.args);
     return `<div class="myblock">${escapeHtml(tok.body)}</div>`;
   }
   ```
2. Register it: `BLOCK_HANDLERS.myblock = renderMyBlock;`
3. (Optional) Add a one-click insertion button to the editor toolbar in `editor.js → injectToolbar` and a template to `blockTemplate()`.
4. (Optional) Add styles to `styles.css`.

---

## For future Claude sessions reading this

- **Don't break the partials boundary.** `partials/chrome.html`, `footer.html`, `modals.html` are loaded into every page. Anything specific to one page (like the editor's modal body) lives in `modals.html` and is hidden where it isn't needed via the surrounding HTML.
- **`config.js` is the source of truth** for site identity. Anything user-visible-and-changeable should be moved there over time. The partial HTML files still hardcode "Marzenapedia" in places — fixing that would mean templating the partials at fetch time.
- **Tool pages live in `/tools/`** and use relative imports (`../state.js`, `../partials/chrome.html`). Don't move them out without updating those paths.
- **The build script has no dependencies** on purpose. Image dimensions are parsed by hand from the file header (PNG/JPEG/GIF/WebP/BMP/SVG). If someone needs AVIF dimensions later, add a parser to `build-index.js`.
- **Drafts are keyed by slug** in `localStorage`. The key prefix is configurable via `SiteConfig.editor.draftKeyPrefix`.
- **`renderChartSvg()` is shared** between the `:::chart` block (in `renderer.js`) and the Stats Tool (`tools/stats.js`). One renderer, two consumers.
- **Edges, areas, waypoints, labels** all live in the Graph Tool's `G` state object. Areas have `kind: 'area'` to distinguish them from nodes. Edges have `waypoints: []` and `labelOffset: {dx, dy}` for the v2 features.
- **The `:::graph` block** in articles parses the same export format the Graph Tool produces, so authoring is round-trippable.

---

## Licence

The codebase is provided as-is. Article content is fictional worldbuilding by the repository owner.
