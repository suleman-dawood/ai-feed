# AIFeed — AI News & Trending Desktop Widget for Linux

> A Cinnamon desklet that aggregates trending AI repos, papers, models, and news into one live feed on your desktop.

---

## Problem

Staying current in AI/ML means checking 5+ sources daily:

- GitHub trending for new tools/frameworks
- arXiv for papers (cs.AI, cs.LG, cs.CL)
- Hacker News for community discussion
- Hugging Face for trending models/datasets
- Twitter/X for announcements (not automatable)

You either miss things or waste 30+ minutes daily tab-hopping. No single tool aggregates all AI sources into one feed — especially not as a desktop widget.

---

## Solution

A desktop desklet that pulls from all major AI sources and shows a unified, scrollable feed:

```
┌─────────────────────────────────────────┐
│ ⬡ AI FEED                    updated 5m │
├─────────────────────────────────────────┤
│ 🔥 GitHub Trending                       │
│ ┌─────────────────────────────────────┐ │
│ │ anthropics/claude-code    ⭐ 2.1k ↑  │ │
│ │ Anthropic's CLI for Claude          │ │
│ │ Python · +450 today                 │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ openai/swarm              ⭐ 18k    │ │
│ │ Multi-agent orchestration           │ │
│ │ Python · +120 today                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 📄 arXiv Papers                          │
│ ┌─────────────────────────────────────┐ │
│ │ Scaling Laws for Sparse Mixture...  │ │
│ │ DeepMind · cs.LG · 2h ago          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 🗞️ Hacker News                           │
│ ┌─────────────────────────────────────┐ │
│ │ Claude 4.5 can now run agents...    │ │
│ │ 342 pts · 187 comments · 3h ago    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 🤗 Hugging Face Trending                 │
│ ┌─────────────────────────────────────┐ │
│ │ meta-llama/Llama-4-Scout   📥 45k   │ │
│ │ Model · Updated 1d ago              │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Click any item to open in browser.

---

## Scope

### In Scope (MVP)

1. **GitHub Trending**
   - Dual-source strategy (no HTML scraping — too fragile):
     - **Primary:** Unofficial trending API (`github-trending-api`) — returns `currentPeriodStars` (actual star delta)
     - **Fallback:** GitHub REST Search API (`/search/repositories?q=created:>DATE+stars:>5&sort=stars`) — stable, documented, JSON
   - Show: repo name, description, stars, stars today (if available), language
   - Filter by: daily / weekly, language (Python, Jupyter Notebook, etc.)
   - Configurable language/topic filter
   - Optional GitHub PAT for higher rate limits (10→30 req/min on search)

2. **arXiv Papers**
   - arXiv API: query cs.AI, cs.LG, cs.CL, cs.CV categories
   - Show: title, authors (first + "et al."), category, submission date
   - Sort by: most recent
   - Configurable categories

3. **Hacker News**
   - HN Algolia API: search for AI/ML/LLM keywords in top stories
   - Show: title, points, comment count, time ago
   - Filter: top stories only (avoid noise)
   - Configurable keywords

4. **Hugging Face Trending**
   - HF API: trending models and datasets
   - Show: model/dataset name, author, downloads, type, last updated
   - Filter by: models / datasets / spaces

5. **Unified Feed**
   - All sources merged into one scrollable desklet
   - Grouped by source with headers
   - Click any item → opens URL in default browser
   - Auto-refresh configurable (default: 30 minutes)
   - "Last updated X ago" timestamp

6. **Bookmarking**
   - Bookmark button on each feed item (star/save icon)
   - Bookmarks saved to JSON file in `GLib.get_user_data_dir()/ai-feed-bookmarks.json`
   - "Bookmarks" button on desklet header → opens ModalDialog popup
   - Popup: scrollable list of all saved bookmarks (handles 100s of items)
   - Each bookmark row: title, source, date saved, click to open URL, X button to remove
   - Search/filter bar at top of bookmarks popup
   - Bookmarks persist across desklet restarts and Cinnamon restarts

7. **Settings**
   - **Sources:**
     - Enable/disable each source independently (GitHub, arXiv, HN, HuggingFace)
     - Items per source (slider: 1–10, default: 3)
   - **Refresh:**
     - Refresh interval (slider: 5–300 minutes, default: 30)
   - **GitHub:**
     - Time period: daily / weekly (combobox)
     - Language filter (entry: "Python, Jupyter Notebook, Rust, TypeScript")
     - Optional PAT token (entry, for higher rate limits)
   - **arXiv:**
     - Categories (entry: "cs.AI, cs.LG, cs.CL, cs.CV, stat.ML")
     - Max results per query (spinbutton: 5–50, default: 10)
   - **Hacker News:**
     - Search keywords (entry: "AI, LLM, GPT, Claude, ...")
     - Minimum points filter (spinbutton: 0–500, default: 0)
     - Sort by: relevance / date (combobox)
   - **Hugging Face:**
     - Show: models / datasets / spaces (checkboxes)
     - Optional HF token (entry)
   - **Appearance:**
     - Theme colors: background, text, accent, header (colorchooser × 4)
     - Font scale (slider: 0.5–2.0, default: 1.0)
     - Desklet width (slider: 300–600px, default: 400)
     - Desklet height (slider: 300–800px, default: 500)
     - Show source icons (checkbox)
   - **Advanced:**
     - Request timeout seconds (spinbutton: 5–60, default: 15)
     - User-Agent string (entry, for debugging)
     - Enable debug logging (checkbox)

### Out of Scope (v1)

- Full article/paper reading in desklet
- Social features (comments, sharing)
- AI-powered summarization of papers
- Push notifications for specific topics
- Twitter/X integration (no public API)
- Bookmark categories/tags/folders

---

## Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **GitHub Trending repos** | Daily/weekly trending AI repos with star counts | P0 |
| **arXiv latest papers** | Recent papers from AI/ML categories | P0 |
| **Hacker News AI posts** | Top HN stories matching AI keywords | P0 |
| **Hugging Face trending** | Trending models, datasets, spaces | P1 |
| **Click to open** | Any item opens full URL in browser | P0 |
| **Source toggles** | Enable/disable each source in settings | P0 |
| **Auto-refresh** | Configurable interval, default 30m | P0 |
| **Theme customization** | Colors, font scale, items per source | P1 |
| **Category filters** | arXiv categories, GH languages, HN keywords | P1 |
| **Bookmarking** | Save any feed item, view/search/remove in popup modal | P0 |
| **Bookmarks popup** | ModalDialog with scrollable list, search filter, remove buttons | P0 |
| **Offline cache** | Show last fetched data if offline | P2 |

---

## Data Sources & APIs

| Source | API/Method | Auth | Rate Limit | Cost | Risk |
|--------|-----------|------|------------|------|------|
| **GitHub Trending (primary)** | Unofficial `github-trending-api` — JSON, includes star delta | None | Unknown/generous | Free | MEDIUM — unofficial, could go down |
| **GitHub Trending (fallback)** | REST `/search/repositories?q=created:>DATE+stars:>5&sort=stars` | None (optional PAT) | 10/min unauthed, 30/min with PAT | Free | LOW — official, documented |
| **arXiv** | `export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate` | None | 1 req/3s | Free | LOW — stable 10+ years |
| **Hacker News** | `hn.algolia.com/api/v1/search?query=AI&tags=story` | None | Generous | Free | LOW — Algolia-hosted, reliable |
| **Hugging Face** | `huggingface.co/api/models?sort=trending&limit=10` | None (optional token) | ~100-300/hr unauthed | Free | LOW-MEDIUM — trending algo undocumented |

**All free. No API keys required for basic usage.** GitHub PAT and HuggingFace token optional for higher rate limits.

### GitHub Trending Strategy

No official GitHub API exposes "trending" (star delta per period). Three options were evaluated:

| Option | Star Delta? | Stability | Auth |
|--------|------------|-----------|------|
| HTML scraping (`github.com/trending`) | Yes | FRAGILE — redesigns break regex, ~3 redesigns in 3 years | None |
| Unofficial trending API | Yes (`currentPeriodStars`) | MEDIUM — third-party, no SLA | None |
| REST Search API (`/search/repositories`) | No (total stars only) | HIGH — official, versioned | Optional PAT |
| GraphQL API | No (total stars only) | HIGH — official | Required PAT |
| `gh` CLI via subprocess | No | N/A — `gh` not installed on most desktops | N/A |

**Decision:** Use unofficial trending API as primary (has delta data). Fall back to REST Search API if it's down. Never scrape HTML.

---

## Architecture

```
AIFeed/
  desklet/
    ai-feed@suleman/
      metadata.json         # Cinnamon desklet metadata
      settings-schema.json  # User settings (sources, filters, theme)
      desklet.js            # Main widget — source aggregation + rendering
      stylesheet.css        # Default styles
      httpClient.js         # Soup wrapper — version-gates libsoup2 vs libsoup3
      sources/
        github.js           # GitHub trending (unofficial API + REST Search fallback)
        arxiv.js            # arXiv API client (Atom XML string parsing)
        hackernews.js       # HN Algolia API client (JSON)
        huggingface.js      # HF API client (JSON)
      cache.js              # Local JSON cache in XDG cache dir for offline fallback
      bookmarks.js          # Bookmark storage — save/remove/list/search from JSON file
      bookmarksDialog.js    # ModalDialog popup — scrollable bookmark list with search + remove
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Widget** | Cinnamon Desklet (GJS/Clutter/St) | Native desktop widget |
| **HTTP** | Soup (libsoup via GJS) — version-gated for libsoup2 and libsoup3 | Built into GNOME/Cinnamon, no extra deps |
| **XML Parsing** | String splitting on arXiv Atom feed (no built-in XML DOM in GJS) | arXiv returns well-structured Atom XML |
| **JSON Parsing** | Native JSON.parse for GH + HN + HF | All primary sources return JSON |
| **Caching** | JSON file via `GLib.get_user_cache_dir()` | Persist between refreshes + offline fallback |
| **URL Opening** | `Gio.AppInfo.launch_default_for_uri()` | Opens in system default browser |
| **Network Check** | `Gio.NetworkMonitor.get_default()` | Skip fetches when offline |

### No dependencies:
- No Python, no Node.js
- No API keys required (optional GitHub PAT / HF token for higher rate limits)
- Pure GJS using built-in Soup for HTTP
- All parsing done natively (JSON.parse + string splitting for XML)

---

## Feed Item Schema (Internal)

```javascript
{
    source: "github",           // github | arxiv | hackernews | huggingface
    title: "anthropics/claude-code",
    subtitle: "Anthropic's CLI for Claude",
    meta: "Python · ⭐ 2.1k · +450 today",
    url: "https://github.com/anthropics/claude-code",
    timestamp: 1747612800,
    icon: "🔥"                  // Per-source icon
}
```

All sources normalize to this format. Desklet renders them identically.

---

## Deliverables

### Phase 1 — Foundation + HTTP Layer (Week 1)

- [ ] Desklet boilerplate (metadata.json, settings-schema.json, stylesheet.css)
- [ ] httpClient.js — Soup wrapper that version-gates libsoup2 vs libsoup3
- [ ] Set realistic User-Agent header on all requests
- [ ] Set request timeouts (15s) — libsoup2: `session.timeout`, libsoup3: Cancellable+timer
- [ ] Network connectivity check via `Gio.NetworkMonitor` before fetch cycles
- [ ] cache.js — JSON file cache in `GLib.get_user_cache_dir()` for offline fallback
- [ ] Error handling: try/catch in every async callback, graceful "source unavailable" state

### Phase 2 — Data Sources (Week 1-2)

- [ ] GitHub trending client (unofficial API primary + REST Search fallback)
- [ ] arXiv API client (Atom XML string splitting → feed items)
- [ ] Hacker News API client (Algolia JSON → feed items)
- [ ] Hugging Face API client (models + datasets + spaces trending)
- [ ] Sanitize all API strings before display (escape `<>&` for Pango markup safety)
- [ ] Normalize all sources to unified feed item schema

### Phase 3 — UI + Rendering (Week 2)

- [ ] Feed rendering: St.BoxLayout grouped by source with section headers
- [ ] Scrollable list via St.ScrollView with explicit height
- [ ] Click to open URL via `Gio.AppInfo.launch_default_for_uri()` with error catch
- [ ] Bookmark button on each feed item row (toggle save/unsave)
- [ ] Auto-refresh timer (default 30m) with proper cleanup in `on_desklet_removed()`
- [ ] "Last updated X ago" display
- [ ] Loading spinner / error state per source
- [ ] Text-only icons (GH/arXiv/HN/HF labels) — avoid emoji, may render as boxes
- [ ] "Bookmarks" button in desklet header

### Phase 3.5 — Bookmarks (Week 2)

- [ ] bookmarks.js — save/remove/list/search bookmarks to JSON in `GLib.get_user_data_dir()`
- [ ] bookmarksDialog.js — ModalDialog with St.ScrollView for 100s of items
- [ ] Search/filter bar at top of bookmarks popup (St.Entry with live filtering)
- [ ] Each bookmark row: title, source label, date saved, open URL button, remove (X) button
- [ ] Visual indicator on feed items that are already bookmarked
- [ ] Persist across desklet/Cinnamon restarts

### Phase 4 — Settings + Polish (Week 2-3)

- [ ] Settings: source toggles, items per source, refresh interval
- [ ] Settings: theme colors (bg, font, accent), font scale
- [ ] Settings: arXiv category filter, HN keyword filter, GH language filter
- [ ] Settings: optional GitHub PAT, optional HF token
- [ ] Memory leak prevention: destroy child actors before refresh, reuse Soup.Session
- [ ] Cancel all GLib timeouts in `on_desklet_removed()`

### Phase 5 — Distribution (Week 3)

- [ ] Screenshot + README
- [ ] Test on Cinnamon 5.x (libsoup2) and 6.x (libsoup3)
- [ ] Submit to Cinnamon Spices (desklet store)
- [ ] GitHub repo

---

## Prior Art

| Project | What It Does | Gap |
|---------|-------------|-----|
| GitHub Trending (website) | Shows trending repos | No desktop integration, no AI filter |
| arxiv-sanity | Paper recommendations | Web app, not desktop widget |
| HN Daily Digest | Email digest | Not real-time, not desktop |
| Papers With Code | Papers + code links | Web only |
| Various RSS readers | Generic feed readers | No AI-specific curation, not a desklet |

**AIFeed is the first desktop widget that aggregates all major AI sources into one live feed. No browser needed.**

---

## Keyword Filters (Default)

### Hacker News Search Keywords
```
AI, artificial intelligence, LLM, GPT, Claude, Gemini, 
machine learning, deep learning, neural network, transformer,
diffusion, fine-tuning, RAG, agent, multi-modal, open source model,
Anthropic, OpenAI, DeepMind, Meta AI, Mistral, Llama, reasoning
```

### GitHub Language Filter
```
Python, Jupyter Notebook, Rust (for ML infra), TypeScript (for AI apps)
```

### arXiv Categories
```
cs.AI    — Artificial Intelligence
cs.LG    — Machine Learning  
cs.CL    — Computation and Language (NLP)
cs.CV    — Computer Vision
stat.ML  — Machine Learning (Statistics)
```

All configurable via settings.

---

## Robustness & Known Risks

### Critical — Must Handle

| Risk | Impact | Mitigation |
|------|--------|------------|
| **libsoup2 vs libsoup3** | Mint 21 = Soup 2.4, Mint 22 = Soup 3.0. APIs incompatible. `Soup.SessionAsync` removed in v3. | `httpClient.js` version-gates at startup via try/catch on `imports.gi.versions.Soup` |
| **ByteArray removal** | `ByteArray.toString()` removed in GJS 1.78 (Mint 22). Silent crash. | Use `TextDecoder` exclusively — works on both old and new GJS |
| **No request timeout** | libsoup2 default timeout = 0 (infinite). Hung API = callback never fires. | Set `session.timeout = 15` (soup2) or use `Gio.Cancellable` + GLib timer (soup3) |
| **Memory leaks** | Desklets run 24/7. Leaks from: new Soup.Session per refresh, unremovedSt actors, orphaned timers. | Reuse single Soup.Session. Call `destroy_all_children()` before refresh. Cancel all timeouts in `on_desklet_removed()` |

### High — Should Handle

| Risk | Impact | Mitigation |
|------|--------|------------|
| **GitHub unofficial API down** | Primary trending source unavailable | Auto-fallback to REST Search API (`/search/repositories?q=created:>DATE&sort=stars`) |
| **Cloudflare blocking libsoup UA** | HuggingFace (and potentially others) reject default `libsoup/X.Y` User-Agent | Set browser-like User-Agent on all requests |
| **Pango markup injection** | Unescaped `<` from API data blanks St.Label when using markup mode | Escape all API strings (`<>&`) before display, or use `label.text =` instead of markup |
| **Unhandled callback exceptions** | GJS prints error to journal but desklet stops updating silently | Wrap every async callback body in try/catch with `global.logError()` |

### Medium — Nice to Handle

| Risk | Impact | Mitigation |
|------|--------|------------|
| **arXiv XML parsing** | No built-in XML DOM in GJS. LaTeX in titles can contain unescaped `<` | Use string splitting on `<entry>` blocks, not regex on content. Handle malformed entries gracefully |
| **St.ScrollView sizing bugs** | Known issues in desklet context — may not scroll properly | Set explicit height on ScrollView. Test on target Cinnamon versions |
| **Emoji rendering** | Source icons (🔥📄🗞️🤗) may render as boxes without Noto Color Emoji | Use text labels ("GH", "arXiv", "HN", "HF") instead of emoji |
| **Offline / network loss** | Fetches fail silently or throw | Check `Gio.NetworkMonitor` before fetch. Show cached data with "offline" indicator |
| **HN null URLs** | Ask HN / Show HN posts have `url: null` | Construct fallback URL: `https://news.ycombinator.com/item?id={objectID}` |

### Low — Edge Cases

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Corporate proxy** | Cinnamon sessions via display manager may not inherit `$http_proxy` | libsoup respects GNOME proxy settings via `GProxyResolver` by default |
| **No default browser set** | `Gio.AppInfo.launch_default_for_uri()` throws | Wrap in try/catch, log error |
| **HN Algolia deprecation** | Third-party wrapper, no SLA | Low probability — has been stable for years. Monitor for 404s |
| **arXiv API v2 migration** | Base URL may change | Monitor for 301 redirects or 404s on current endpoint |

---

## UI Stack Reference

The desklet UI is **not HTML/CSS**. It's a native widget toolkit:

```
Cinnamon Shell (C)
  └── GJS (SpiderMonkey — ES6, legacy imports system, no ES modules)
        ├── St (Shell Toolkit) — St.Label, St.BoxLayout, St.Button, St.ScrollView, St.Icon, St.Bin
        ├── Clutter — scene graph renderer (OpenGL backend)
        ├── Soup (libsoup) — HTTP client
        ├── GLib/Gio — main loop, file I/O, async, network monitor
        └── CSS — limited subset (no flex/grid/variables/calc/remote-images/animations)
```

### Supported CSS Properties
`color`, `background-color`, `font-family`, `font-size`, `font-weight`, `border`, `border-radius`, `padding`, `margin`, `width`, `height`, `min-width`, `min-height`, `box-shadow` (partial), `text-align`, `opacity`

### NOT Supported (vs browser CSS)
`display: flex/grid`, `position: absolute/fixed`, `overflow`, `z-index`, `calc()`, CSS variables, `@font-face`, `animation`/`@keyframes`, media queries, `float`, `transform`

### Key Limitations
- No WebKit/WebView — cannot embed HTML
- No remote images — `St.Icon` and CSS `url()` only support local file paths
- No `fetch()` — use Soup.Session
- No DOM, no querySelector — use Clutter actor tree
- No async/await in older Cinnamon — use GLib callbacks
- Single thread — long sync operations freeze the desktop
