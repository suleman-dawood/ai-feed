#!/usr/bin/env gjs
// Standalone GJS test for the Reddit source module
// Run with:  gjs test_reddit.js
// Requires:  libsoup 2.4 (Cinnamon 5.x / Linux Mint 21)

'use strict';

// ---------------------------------------------------------------------------
// Inline libsoup 2.4 shim so the test runs without a full Cinnamon runtime
// ---------------------------------------------------------------------------
imports.gi.versions.Soup = '2.4';
const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

// Minimal HttpClient shim — mirrors httpClient.js behaviour for Soup 2.4
var HttpClient = class HttpClient {
    constructor() {
        this._session = new Soup.SessionAsync();
        this._session.user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AIFeed/1.0 (test)';
        this._session.timeout = 20;
    }

    get(url, headers, callback) {
        let message = Soup.Message.new('GET', url);
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
};

// ---------------------------------------------------------------------------
// Load the module under test using a relative path from this file's location
// ---------------------------------------------------------------------------
// GJS legacy imports: use script path to resolve sibling directories
const SCRIPT_DIR = (function() {
    // __filename is available in GJS >= 1.68; fall back to Gio if missing
    try {
        const Gio = imports.gi.Gio;
        let f = Gio.File.new_for_path(imports.system.programPath);
        return f.get_parent().get_path();
    } catch (e) {
        return '.';
    }
})();

imports.searchPath.unshift(SCRIPT_DIR + '/../sources');
const reddit = imports.reddit;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        print('  PASS: ' + msg);
        passed++;
    } else {
        print('  FAIL: ' + msg);
        failed++;
    }
}

function assertEq(actual, expected, msg) {
    if (actual === expected) {
        print('  PASS: ' + msg + ' (= ' + JSON.stringify(actual) + ')');
        passed++;
    } else {
        print('  FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
        failed++;
    }
}

// ---------------------------------------------------------------------------
// Schema validation helper
// ---------------------------------------------------------------------------
function validateItem(item, label) {
    assert(item !== null && typeof item === 'object', label + ': item is an object');
    assertEq(item.source, 'reddit', label + ': source = "reddit"');
    assert(typeof item.title === 'string' && item.title.length > 0, label + ': title is a non-empty string');
    assertEq(item.subtitle, '', label + ': subtitle is empty string');
    assert(typeof item.meta === 'string' && /pts$/.test(item.meta), label + ': meta ends with "pts"');
    assertEq(item.metaLabel, '', label + ': metaLabel is empty string');
    assert(typeof item.url === 'string' && item.url.length > 0, label + ': url is a non-empty string');
    assert(item.url.startsWith('http'), label + ': url starts with http');
    assert(item.extra !== null && typeof item.extra === 'object', label + ': extra is an object');
    assert(typeof item.extra.subreddit === 'string' && item.extra.subreddit.startsWith('r/'),
           label + ': extra.subreddit starts with "r/"');
    assert(typeof item.extra.numComments === 'number', label + ': extra.numComments is a number');
}

// ---------------------------------------------------------------------------
// Main test: live fetch from MachineLearning and LocalLLaMA
// ---------------------------------------------------------------------------
print('=== AIFeed Reddit source test ===\n');
print('Fetching r/MachineLearning and r/LocalLLaMA (hot, limit 3)...\n');

const httpClient = new HttpClient();
const settings = {
    redditSubreddits: 'MachineLearning\nLocalLLaMA',
    redditSort: 'hot',
    redditCount: 3
};

// Use GLib main loop to block until the async fetch completes
const loop = GLib.MainLoop.new(null, false);

reddit.fetch(httpClient, settings, function(error, items) {
    print('--- fetch() callback ---\n');

    assert(error === null, 'No error returned from fetch');
    assert(Array.isArray(items), 'Result is an array');
    assert(items.length > 0, 'At least one item returned (subreddits were reachable)');

    if (items.length > 0) {
        print('\nValidating first item schema:');
        validateItem(items[0], 'items[0]');

        print('\nValidating second item (if present):');
        if (items.length > 1) {
            validateItem(items[1], 'items[1]');
        } else {
            print('  SKIP: only one item returned');
        }

        // Verify sort order: items should be sorted by score descending
        print('\nChecking score sort order:');
        let sorted = true;
        for (let i = 1; i < items.length; i++) {
            let prevScore = parseInt(items[i - 1].meta, 10);
            let curScore  = parseInt(items[i].meta, 10);
            if (curScore > prevScore) {
                sorted = false;
                break;
            }
        }
        assert(sorted, 'Items sorted by score descending');

        // Verify both subreddits contributed (check extra.subreddit values)
        let subredditsPresent = {};
        items.forEach(function(item) { subredditsPresent[item.extra.subreddit] = true; });
        print('\nChecking subreddit coverage:');
        print('  Subreddits in results: ' + Object.keys(subredditsPresent).join(', '));
        // At least one subreddit should appear (we may be rate-limited for the second)
        assert(Object.keys(subredditsPresent).length >= 1,
               'At least one subreddit represented in results');
    }

    print('\n--- Summary ---');
    print('Passed: ' + passed);
    print('Failed: ' + failed);
    print(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');

    loop.quit();
});

loop.run();
