#!/usr/bin/env gjs
// Standalone GJS test for BookmarkStore
// Run with: gjs tests/test_bookmarks.js

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const System = imports.system;

// ---------------------------------------------------------------------------
// Minimal stubs so bookmarks.js can load outside Cinnamon runtime
// ---------------------------------------------------------------------------
if (typeof global === 'undefined') {
    this.global = {
        logError: function(msg) { print('  [logError] ' + msg); }
    };
}

// ---------------------------------------------------------------------------
// Load BookmarkStore from parent directory
// ---------------------------------------------------------------------------
// GJS imports.searchPath trick: add parent dir so we can `imports.bookmarks`
let scriptDir = GLib.path_get_dirname(System.programPath);
// scriptDir is tests/, parent is ai-feed@suleman/
let parentDir = GLib.path_get_dirname(scriptDir);

imports.searchPath.unshift(parentDir);
const { BookmarkStore } = imports.bookmarks;

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------
let _passed = 0;
let _failed = 0;

function assert(condition, message) {
    if (condition) {
        print('  PASS  ' + message);
        _passed++;
    } else {
        print('  FAIL  ' + message);
        _failed++;
    }
}

function assertEqual(actual, expected, message) {
    let ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        print('  PASS  ' + message);
        _passed++;
    } else {
        print('  FAIL  ' + message + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')');
        _failed++;
    }
}

function section(name) {
    print('\n-- ' + name + ' --');
}

// ---------------------------------------------------------------------------
// Setup: create a temp directory for each test run
// ---------------------------------------------------------------------------
let tmpBase = GLib.get_tmp_dir() + '/aifeed-test-' + GLib.get_real_time();
GLib.mkdir_with_parents(tmpBase, 0o755);

function makeTmpDir() {
    let d = tmpBase + '/' + GLib.get_real_time();
    GLib.mkdir_with_parents(d, 0o755);
    return d;
}

// ---------------------------------------------------------------------------
// Sample feed items
// ---------------------------------------------------------------------------
let ITEM_GH = {
    source: 'github',
    title: 'anthropics/claude-code',
    subtitle: 'Anthropic CLI for Claude',
    url: 'https://github.com/anthropics/claude-code',
    timestamp: 1747612800
};

let ITEM_ARXIV = {
    source: 'arxiv',
    title: 'Scaling Laws for Sparse Mixture of Experts',
    subtitle: 'DeepMind',
    url: 'https://arxiv.org/abs/2501.00001',
    timestamp: 1747612900
};

let ITEM_HN = {
    source: 'hackernews',
    title: 'Claude 4.5 can now run agents in the terminal',
    subtitle: '342 pts',
    url: 'https://news.ycombinator.com/item?id=12345',
    timestamp: 1747613000
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

section('1. Empty store: load from missing file');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    assertEqual(store.getCount(), 0, 'count is 0 on empty load');
    assertEqual(store.getAll(), [], 'getAll returns empty array');
})();


section('2. Add a bookmark');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    assertEqual(store.getCount(), 1, 'count is 1 after add');
    assert(store.has(ITEM_GH.url), 'has() returns true for added URL');
    assert(!store.has('https://example.com/not-added'), 'has() returns false for unknown URL');

    let all = store.getAll();
    assertEqual(all[0].url, ITEM_GH.url, 'stored item has correct URL');
    assert(typeof all[0].savedAt === 'number', 'savedAt is a number');
})();


section('3. No duplicates: add same URL twice');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    store.add(ITEM_GH);
    assertEqual(store.getCount(), 1, 'count stays 1 after duplicate add');
})();


section('4. Add second source item');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    store.add(ITEM_ARXIV);
    assertEqual(store.getCount(), 2, 'count is 2 after two adds');
    assert(store.has(ITEM_ARXIV.url), 'has() true for arxiv item');
})();


section('5. Search: case-insensitive title filter');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    store.add(ITEM_ARXIV);
    store.add(ITEM_HN);

    let results = store.search('claude');
    // Should match ITEM_GH ("anthropics/claude-code") and ITEM_HN ("Claude 4.5...")
    assertEqual(results.length, 2, 'search("claude") returns 2 matches');

    let scaling = store.search('SCALING');
    assertEqual(scaling.length, 1, 'search("SCALING") matches arxiv title');
    assertEqual(scaling[0].url, ITEM_ARXIV.url, 'matched item is arxiv');

    let none = store.search('zzznomatch');
    assertEqual(none.length, 0, 'search with no matches returns []');

    let empty = store.search('');
    assertEqual(empty.length, 3, 'search("") returns all items');

    let whitespace = store.search('   ');
    assertEqual(whitespace.length, 3, 'search("   ") returns all items');
})();


section('6. getGroupedBySource');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    store.add(ITEM_ARXIV);
    store.add(ITEM_HN);

    let groups = store.getGroupedBySource();
    let keys = Object.keys(groups).sort();
    assertEqual(keys, ['arxiv', 'github', 'hackernews'], 'groups have correct source keys');
    assertEqual(groups['github'].length, 1, 'github group has 1 item');
    assertEqual(groups['arxiv'].length, 1, 'arxiv group has 1 item');
    assertEqual(groups['hackernews'].length, 1, 'hackernews group has 1 item');
})();


section('7. Remove by URL');
(function () {
    let store = new BookmarkStore(makeTmpDir());
    store.load();
    store.add(ITEM_GH);
    store.add(ITEM_ARXIV);

    store.remove(ITEM_GH.url);
    assertEqual(store.getCount(), 1, 'count is 1 after remove');
    assert(!store.has(ITEM_GH.url), 'has() false after remove');
    assert(store.has(ITEM_ARXIV.url), 'arxiv item still present');

    // Remove non-existent URL should not throw
    store.remove('https://example.com/notexist');
    assertEqual(store.getCount(), 1, 'count unchanged after removing unknown URL');
})();


section('8. Persistence: reload from disk');
(function () {
    let dir = makeTmpDir();

    let store1 = new BookmarkStore(dir);
    store1.load();
    store1.add(ITEM_GH);
    store1.add(ITEM_ARXIV);
    // store1.save() is called automatically by add()

    // Create a new store instance pointing at the same directory
    let store2 = new BookmarkStore(dir);
    store2.load();
    assertEqual(store2.getCount(), 2, 'reloaded store has 2 items');
    assert(store2.has(ITEM_GH.url), 'github item persisted');
    assert(store2.has(ITEM_ARXIV.url), 'arxiv item persisted');

    // Remove in store2, reload into store3
    store2.remove(ITEM_GH.url);

    let store3 = new BookmarkStore(dir);
    store3.load();
    assertEqual(store3.getCount(), 1, 'store3 has 1 item after remove + reload');
    assert(!store3.has(ITEM_GH.url), 'removed item not present in store3');
    assert(store3.has(ITEM_ARXIV.url), 'remaining item present in store3');
})();


// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
print('\n========================================');
print('Results: ' + _passed + ' passed, ' + _failed + ' failed');
print('========================================');

if (_failed > 0) {
    System.exit(1);
} else {
    System.exit(0);
}
