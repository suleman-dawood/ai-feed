# AIFeed Design Spec

> Cinnamon desklet that aggregates trending AI repos, papers, models, news, and discussion into one live feed on the Linux desktop.

## Overview

AIFeed is a native Cinnamon desklet for Linux that pulls from 5 AI/ML sources and renders a unified, scrollable feed directly on the desktop. Each source gets an independent scroll section. Users can bookmark items, configure sources/filters/appearance, and click any item to open it in the default browser.

Target: public release via Cinnamon Spices desklet store and standalone GitHub repo.

## Architecture

### File Structure

```
ai-feed@suleman/
  metadata.json           # Cinnamon desklet metadata (uuid, name, version)
  settings-schema.json    # All user settings with layout pages/sections
  desklet.js              # Main entry — lifecycle, UI construction, refresh orchestration
  stylesheet.css          # Static CSS classes for layout structure
  httpClient.js           # Soup wrapper — libsoup2 (this system), realistic User-Agent, timeouts
  cache.js                # JSON file cache in XDG cache dir for offline fallback
  bookmarks.js            # Bookmark storage — save/remove/list/search from JSON file
  bookmarksDialog.js      # ModalDialog popup — scrollable bookmark list grouped by source
  sources/
    github.js             # GitHub trending (unofficial API + REST Search fallback)
    arxiv.js              # arXiv API client (Atom XML string splitting)
    hackernews.js          # HN Algolia API client (JSON)
    huggingface.js         # HF Hub API client (JSON)
    reddit.js              # Reddit JSON API client (configurable subreddits)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Widget | Cinnamon Desklet (GJS / Clutter / St) |
| JS Style | ES6 classes, arrow functions, template literals |
| HTTP | libsoup 2.74.2 via `Soup.SessionAsync` + `queue_message` |
| XML Parsing | String splitting on arXiv Atom feed entries |
| JSON Parsing | Native `JSON.parse` for GH, HN, HF, Reddit |
| Caching | JSON file via `GLib.get_user_cache_dir()` |
| URL Opening | `Gio.AppInfo.launch_default_for_uri()` |
| Network Check | `Gio.NetworkMonitor.get_default()` |
| Bookmarks | JSON file via `GLib.get_user_data_dir()` |
| Bookmarks UI | `imports.ui.modalDialog.ModalDialog` |
| Settings | `imports.ui.settings.DeskletSettings` with tabbed layout |
| Timers | `GLib.timeout_add_seconds` (single timer, sequential refresh) |

### Data Flow

```
[Timer fires every N minutes]
  |
  v
[Check Gio.NetworkMonitor — online?]
  |  no -> show cached data + "offline" indicator
  v  yes
[Sequential fetch: GH -> arXiv -> HN -> HF -> Reddit]
  |  each source wrapped in try/catch
  |  failed source -> show "unavailable" for that section
  v
[Normalize all results to FeedItem schema]
  |
  v
[Write to cache file (last-good data)]
  |
  v
[destroy_all_children() on each source section]
  |
  v
[Rebuild UI with new data]
  |
  v
[Schedule next refresh]
```

## Feed Item Schema

All sources normalize to this internal format:

```javascript
{
    source: "github",        // github | arxiv | hackernews | huggingface | reddit
    title: "anthropics/claude-code",
    subtitle: "Anthropic's official CLI for Claude",
    meta: "24.1k",           // stars, points, likes, comments — source-dependent
    metaLabel: "stars",      // label for meta value
    url: "https://github.com/anthropics/claude-code",
    timestamp: 1747612800,
    extra: {}                // source-specific fields (category, subreddit, type, etc.)
}
```

## Data Sources

### 1. GitHub Trending

**Primary:** Unofficial `github-trending-api` endpoint — returns JSON with `currentPeriodStars` (star delta).

**Fallback:** GitHub REST Search API:
```
GET https://api.github.com/search/repositories
  ?q=created:>{date}+stars:>5+language:{lang}
  &sort=stars&order=desc&per_page={count}
```
Falls back automatically if primary returns error or empty results.

**Display per row:**
- Repo name (`author/name`)
- Total stars
- Description (truncated, single line)

**Configurable:** time period (daily/weekly), language filter, optional PAT.

### 2. arXiv Papers

```
GET https://export.arxiv.org/api/query
  ?search_query=cat:{categories joined with +OR+}
  &sortBy=submittedDate&sortOrder=descending
  &start=0&max_results={count}
```

Returns Atom XML. Parse by splitting on `<entry>` blocks, extract `<title>`, `<arxiv:primary_category>`, `<published>`, `<link>`.

**Display per row:**
- Title (truncated, single line)
- Primary category (cs.LG, cs.AI, etc.)
- Date (relative: "2h ago")

**Configurable:** categories, max results per query.

### 3. Hacker News

```
GET https://hn.algolia.com/api/v1/search_by_date
  ?query={keywords}
  &tags=story
  &hitsPerPage={count}
  &numericFilters=points>{minPoints}
```

Returns JSON. Direct `JSON.parse`.

**Display per row:**
- Title (truncated, single line)
- Comment count
- Date (relative)

**Configurable:** search keywords, minimum points, sort (date/relevance).

### 4. HuggingFace

```
GET https://huggingface.co/api/models?sort=trending&limit={count}
GET https://huggingface.co/api/datasets?sort=trending&limit={count}
GET https://huggingface.co/api/spaces?sort=trending&limit={count}
```

Fetches whichever types are enabled (models/datasets/spaces). Merges results.

**Display per row:**
- Model/dataset/space name (`author/name`)
- Type label ("Model", "Dataset", "Space")
- Likes count

**Configurable:** enable models/datasets/spaces checkboxes, optional HF token.

### 5. Reddit

```
GET https://www.reddit.com/r/{subreddit}/hot.json?limit={count}
```

One request per subreddit. Results merged and sorted by score.

**Display per row:**
- Title (truncated, single line)
- Subreddit name (`r/LocalLLaMA`)
- Points

**Configurable:** subreddits (multiline textview, one per line), sort (hot/new/top).

**Default subreddits:** MachineLearning, LocalLLaMA, artificial, singularity.

## UI Design

### Main Desklet

```
+------------------------------+
| [diamond] AI FEED    5m [R][star] |  <- header: title, last updated, refresh btn, bookmarks btn
+------------------------------+
| [diamond] GitHub Trending         |  <- section header
| +----------------------------+ |
| | repo name        stars: Nk | |  <- independent St.ScrollView
| | description...             | |
| | repo name        stars: Nk | |
| +----------------------------+ |
| [diamond-outline] arXiv Papers    |
| +----------------------------+ |
| | title...         cs.LG     | |  <- independent St.ScrollView
| |                  2h ago    | |
| +----------------------------+ |
| [circle] Hacker News             |
| +----------------------------+ |
| | title...        94 cmts    | |  <- independent St.ScrollView
| |                  6h ago    | |
| +----------------------------+ |
| [diamond-4] HuggingFace          |
| +----------------------------+ |
| | model name       likes: N | |  <- independent St.ScrollView
| | Model                     | |
| +----------------------------+ |
| [circle-dot] Reddit              |
| +----------------------------+ |
| | title...      r/LocalLLaMA | |  <- independent St.ScrollView
| |                  342 pts   | |
| +----------------------------+ |
+------------------------------+
```

**Unicode source icons:**
- GitHub: `◆` (U+25C6)
- arXiv: `◇` (U+25C7)
- HN: `●` (U+25CF)
- HuggingFace: `◈` (U+25C8)
- Reddit: `◉` (U+25C9)

### Layout Construction

- Root: `St.BoxLayout({ vertical: true })` → `setContent()`
- Header: `St.BoxLayout({ vertical: false })` with title label, spacer, update time, refresh button, bookmarks button
- Per source: `St.BoxLayout({ vertical: true })` containing:
  - Section header label
  - `St.ScrollView` with explicit `set_height()` based on items-to-show setting
  - Inner `St.BoxLayout({ vertical: true })` with item rows
- Each item row: `St.BoxLayout({ vertical: true, reactive: true })` with click handler
- Source order determined by settings comboboxes (position 1-5)
- Duplicate position handling: if two sources share a position, render in default order (GH, arXiv, HN, HF, Reddit) as tiebreaker
- Disabled sources: entire section hidden (not rendered), position skipped

### Styling Approach

- `stylesheet.css`: static structural classes (`.feed-header`, `.source-section`, `.feed-item`, `.item-title`, `.item-meta`)
- Dynamic colors: injected via `actor.set_style()` using settings values (background, text, accent, header colors)
- Font scale: applied via `set_style()` on root container
- Matches ProjectTracker/SpotifyWidget pattern: CSS for structure, JS for dynamic theming

### Click Handling

- Each feed item row: `row.connect('button-press-event', () => { ... return Clutter.EVENT_STOP; })`
- Left click: `Gio.AppInfo.launch_default_for_uri(item.url, null)` wrapped in try/catch
- Bookmark button on each row: toggle save/unsave, update visual indicator

### Refresh Cycle

- Single `GLib.timeout_add_seconds` timer
- On fire: sequential fetch (GH -> arXiv -> HN -> HF -> Reddit)
- Each source in try/catch — failure shows "Source unavailable" in that section
- After all fetches: `destroy_all_children()` per section, rebuild with new data
- Write results to cache file
- Schedule next timer
- Manual refresh button: cancel current timer, fetch immediately, reschedule

### Cleanup (`on_desklet_removed`)

- Cancel refresh timer via `GLib.source_remove()`
- Destroy all child actors
- No dangling signal connections (arrow functions, no manual disconnect needed)

## Bookmarks

### Storage

- File: `{GLib.get_user_data_dir()}/ai-feed-bookmarks.json`
- Format: JSON array of FeedItem objects + `savedAt` timestamp
- Read on desklet init, write on every save/remove

### bookmarks.js API

```javascript
class BookmarkStore {
    constructor(dataDir)
    load()                    // read from disk
    save()                    // write to disk
    add(feedItem)             // add bookmark with savedAt timestamp
    remove(url)               // remove by URL
    has(url)                  // check if bookmarked (for visual indicator)
    search(query)             // filter by title substring
    getGroupedBySource()      // return { github: [...], arxiv: [...], ... }
}
```

### Bookmarks Dialog (ModalDialog)

- Triggered by star button in desklet header
- `imports.ui.modalDialog.ModalDialog` subclass
- Layout:
  - Header: "Saved Bookmarks" + close (X) button
  - Search bar: `St.Entry` with live filtering on keystroke
  - Body: `St.ScrollView` (handles 100s of items)
    - Grouped by source with section headers
    - Each row: title, "Saved {date}", open button, remove (X) button
  - Footer: bookmark count
- Click "open": `Gio.AppInfo.launch_default_for_uri()`
- Click remove: calls `BookmarkStore.remove()`, rebuilds list
- Close: click X or press Escape

### Visual Indicator

- Feed items that are already bookmarked show a filled star/indicator
- Toggle: click bookmark icon on feed item -> add/remove from store

## Settings Schema

5 pages with sections:

### Page 1: General

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `refresh-interval` | slider | 30 | Refresh interval in minutes (5-300) |
| `source-order-1` | combobox | "github" | Source in position 1 |
| `source-order-2` | combobox | "arxiv" | Source in position 2 |
| `source-order-3` | combobox | "hackernews" | Source in position 3 |
| `source-order-4` | combobox | "huggingface" | Source in position 4 |
| `source-order-5` | combobox | "reddit" | Source in position 5 |

### Page 2: Sources

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `github-enabled` | switch | true | Enable GitHub Trending |
| `github-count` | spinbutton | 3 | Items to show (1-15) |
| `arxiv-enabled` | switch | true | Enable arXiv Papers |
| `arxiv-count` | spinbutton | 5 | Items to show (1-15) |
| `hn-enabled` | switch | true | Enable Hacker News |
| `hn-count` | spinbutton | 3 | Items to show (1-15) |
| `hf-enabled` | switch | true | Enable HuggingFace |
| `hf-count` | spinbutton | 3 | Items to show (1-15) |
| `reddit-enabled` | switch | true | Enable Reddit |
| `reddit-count` | spinbutton | 5 | Items to show (1-15) |

### Page 3: Filters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `github-period` | combobox | "daily" | Time period (daily/weekly) |
| `github-languages` | entry | "Python, Jupyter Notebook, Rust, TypeScript" | Language filter |
| `arxiv-categories` | entry | "cs.AI, cs.LG, cs.CL, cs.CV, stat.ML" | arXiv categories |
| `arxiv-max-results` | spinbutton | 10 | Max results per query (5-50) |
| `hn-keywords` | entry | "AI, LLM, GPT, Claude, Gemini, machine learning, deep learning, neural network, transformer, Anthropic, OpenAI, reasoning" | Search keywords |
| `hn-min-points` | spinbutton | 0 | Minimum points filter (0-500) |
| `hn-sort` | combobox | "date" | Sort by (date/relevance) |
| `hf-show-models` | checkbox | true | Show models |
| `hf-show-datasets` | checkbox | true | Show datasets |
| `hf-show-spaces` | checkbox | false | Show spaces |
| `reddit-subreddits` | textview | "MachineLearning\nLocalLLaMA\nartificial\nsingularity" | Subreddits (one per line) |
| `reddit-sort` | combobox | "hot" | Sort by (hot/new/top) |

### Page 4: Appearance

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `background-color` | colorchooser | "rgba(28,28,32,0.92)" | Background color |
| `font-color` | colorchooser | "rgba(230,230,235,0.95)" | Text color |
| `accent-color` | colorchooser | "rgba(160,180,210,0.85)" | Accent color |
| `header-color` | colorchooser | "rgba(160,180,210,0.85)" | Header text color |
| `font-scale` | slider | 1.0 | Font scale (0.5-2.0) |
| `desklet-width` | slider | 400 | Desklet width in px (300-600) |
| `desklet-height` | slider | 500 | Desklet height in px (300-800) |

### Page 5: Advanced

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `github-token` | entry | "" | GitHub PAT (optional) |
| `hf-token` | entry | "" | HuggingFace token (optional) |
| `request-timeout` | spinbutton | 15 | Request timeout in seconds (5-60) |
| `user-agent` | entry | "Mozilla/5.0 AIFeed/1.0" | User-Agent string |
| `debug-logging` | switch | false | Enable debug logging |

## HTTP Client (httpClient.js)

Wraps libsoup2 for this system:

```javascript
class HttpClient {
    constructor(userAgent, timeout)
    // Creates single Soup.SessionAsync, reused for all requests
    // Sets User-Agent header and timeout on session

    get(url, headers, callback)
    // Creates Soup.Message, sets extra headers (auth tokens)
    // queue_message with callback wrapped in try/catch
    // callback(error, statusCode, responseBody)

    getJson(url, headers, callback)
    // Calls get(), JSON.parse on body, passes parsed object to callback

    destroy()
    // Cleanup session reference
}
```

All requests go through this single class. User-Agent set from settings. Timeout set from settings.

## Cache (cache.js)

```javascript
class FeedCache {
    constructor()
    // Path: GLib.get_user_cache_dir() + '/ai-feed/cache.json'

    read()
    // Returns cached feed data or null

    write(feedData)
    // feedData = { github: [...], arxiv: [...], ..., lastUpdated: timestamp }

    getAge()
    // Returns seconds since last cache write
}
```

## Error Handling

- Every async callback body wrapped in try/catch
- Failed source: show "Source unavailable" text in that section, other sources unaffected
- Network offline: skip all fetches, show cached data, display "offline" indicator in header
- Failed URL open: log error via `global.logError()`, no crash
- Malformed API response: catch parse errors, show "Source unavailable"
- All errors logged with `[AIFeed]` prefix to `global.logError()`

## Robustness

- **Single Soup.Session**: created once in constructor, reused for all requests
- **Request timeout**: 15s default via `session.timeout` property
- **Network check**: `Gio.NetworkMonitor` before fetch cycle
- **Pango safety**: all API strings escaped (`<>&` replaced) before any label text
- **Memory cleanup**: `destroy_all_children()` before every refresh rebuild
- **Timer cleanup**: `GLib.source_remove()` in `on_desklet_removed()`
- **Cache fallback**: show last-good data on any fetch failure
- **GitHub dual-source**: unofficial API primary, REST Search fallback
- **HN null URLs**: construct `https://news.ycombinator.com/item?id={id}` when `url` is null
- **Realistic User-Agent**: prevents Cloudflare blocks on HuggingFace and others

## Distribution

1. Develop as standalone repo: `ai-feed@suleman`
2. Symlink to `~/.local/share/cinnamon/desklets/` for local testing
3. Test on Cinnamon 5.x (libsoup2) — primary target
4. When ready: fork `linuxmint/cinnamon-spices-desklets`, copy desklet in, submit PR
5. Include screenshot, README, and info.json for Spices listing
