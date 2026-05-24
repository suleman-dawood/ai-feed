#!/usr/bin/env gjs
// Standalone GJS test for the Hacker News source module
// Run with: gjs ai-feed@suleman/tests/test_hackernews.js

'use strict';

// ---------------------------------------------------------------------------
// Minimal Soup.SessionAsync shim (libsoup 2.4 compatible)
// ---------------------------------------------------------------------------
imports.gi.versions.Soup = '2.4';
const _realSoup = imports.gi.Soup;

const SoupShim = {
    SessionAsync: class {
        constructor() {
            this._inner = new _realSoup.SessionAsync();
            this._inner.user_agent = 'AIFeed-test/1.0';
            this._inner.timeout = 15;
        }
        queue_message(msg, cb) {
            this._inner.queue_message(msg, cb);
        }
    },
    Message: _realSoup.Message
};

// ---------------------------------------------------------------------------
// Inline HttpClient using the shim (mirrors httpClient.js)
// ---------------------------------------------------------------------------
class HttpClient {
    constructor() {
        this._session = new SoupShim.SessionAsync();
    }

    get(url, headers, callback) {
        let message = SoupShim.Message.new('GET', url);
        if (!message) {
            callback(new Error('Invalid URL: ' + url), 0, null);
            return;
        }
        if (headers) {
            for (let key in headers) {
                message.request_headers.append(key, headers[key]);
            }
        }
        this._session.queue_message(message, (session, msg) => {
            try {
                if (msg.status_code < 200 || msg.status_code >= 300) {
                    callback(new Error('HTTP ' + msg.status_code), msg.status_code, null);
                    return;
                }
                let body = msg.response_body ? msg.response_body.data : null;
                callback(null, msg.status_code, body);
            } catch (e) {
                callback(e, 0, null);
            }
        });
    }

    getJson(url, headers, callback) {
        this.get(url, headers, (error, status, body) => {
            if (error) {
                callback(error, status, null);
                return;
            }
            try {
                let parsed = JSON.parse(body);
                callback(null, status, parsed);
            } catch (e) {
                callback(new Error('JSON parse error: ' + e.message), status, null);
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------
// Resolve the path relative to this test file's expected location
const GLib = imports.gi.GLib;

// Anchor on the current working directory (test is expected to be launched
// from the project root). GLib.filename_from_uri changed signature across
// GJS releases, so we avoid it entirely.
let scriptDir = GLib.get_current_dir();

// Load module source text and evaluate it into a local scope
let modulePath = GLib.build_filenamev([scriptDir,
    'ai-feed@suleman', 'sources', 'hackernews.js']);

let [, bytes] = imports.gi.Gio.File.new_for_path(modulePath).load_contents(null);
let moduleSource = imports.byteArray.toString(bytes);

// Evaluate into this scope via Function constructor to capture `var fetch`
let moduleScope = {};
let moduleFunc = new Function('exports', moduleSource + '\nexports.fetch = fetch;');
moduleFunc(moduleScope);

let hnFetch = moduleScope.fetch;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let PASS = 0;
let FAIL = 0;

function assert(condition, message) {
    if (condition) {
        print('  PASS: ' + message);
        PASS++;
    } else {
        print('  FAIL: ' + message);
        FAIL++;
    }
}

function assertEqual(actual, expected, message) {
    assert(actual === expected, message + ' (expected ' + expected + ', got ' + actual + ')');
}

// ---------------------------------------------------------------------------
// Settings fixture
// ---------------------------------------------------------------------------
const TEST_SETTINGS = {
    hnKeywords:  'AI, LLM',
    hnMinPoints: 0,
    hnSort:      'date',
    hnCount:     3
};

// ---------------------------------------------------------------------------
// Test: live fetch + schema validation
// ---------------------------------------------------------------------------
print('\n[test_hackernews] Starting live fetch test...');

let mainLoop = GLib.MainLoop.new(null, false);

hnFetch(new HttpClient(), TEST_SETTINGS, (error, items) => {
    print('\n--- fetch callback ---');

    if (error) {
        print('  FAIL: fetch returned error: ' + error.message);
        FAIL++;
        mainLoop.quit();
        return;
    }

    assert(Array.isArray(items), 'items is an array');
    assert(items.length > 0, 'items array is non-empty');

    // Validate every item against the FeedItem schema
    let schemaOk = true;
    items.forEach((item, i) => {
        let prefix = 'item[' + i + ']';

        let hasSource    = item.source === 'hackernews';
        let hasTitle     = typeof item.title === 'string';
        let hasSubtitle  = item.subtitle === '';
        let hasMeta      = typeof item.meta === 'string' && item.meta.indexOf('comments') !== -1;
        let hasMetaLabel = item.metaLabel === '';
        let hasUrl       = typeof item.url === 'string' && item.url.length > 0;
        let hasExtra     = item.extra !== null && typeof item.extra === 'object';
        let hasPoints    = typeof item.extra.points === 'number';
        let hasTimeAgo   = typeof item.extra.timeAgo === 'string';

        if (!hasSource || !hasTitle || !hasSubtitle || !hasMeta ||
            !hasMetaLabel || !hasUrl || !hasExtra || !hasPoints || !hasTimeAgo) {
            schemaOk = false;
            print('  FAIL: ' + prefix + ' failed schema check: ' + JSON.stringify(item));
        }
    });

    assert(schemaOk, 'all items conform to FeedItem schema');

    // Spot-check URL construction for an item with no url
    // (We test the module logic indirectly; if objectID-based URL was built it starts with
    //  https://news.ycombinator.com/item?id=)
    let urlsOk = items.every(item =>
        item.url.startsWith('http://') || item.url.startsWith('https://')
    );
    assert(urlsOk, 'all item URLs are absolute HTTP(S) URLs');

    // Validate count constraint
    assert(items.length <= TEST_SETTINGS.hnCount,
        'returned no more than hnCount items');

    print('\n--- results ---');
    print('  PASS: ' + PASS + '  FAIL: ' + FAIL);

    if (FAIL === 0) {
        print('\n[test_hackernews] ALL TESTS PASSED');
    } else {
        print('\n[test_hackernews] SOME TESTS FAILED');
    }

    mainLoop.quit();
});

mainLoop.run();
