#!/usr/bin/env gjs
// Live integration test for the GitHub source module
// Hits the real GitHub REST Search API (and tries the trending API first).
// Run with: gjs ai-feed@suleman/tests/test_github_live.js
//
// Requires: libsoup 2.4 (Cinnamon / Mint 21)
// Requires: network connection. Will gracefully skip on connection failure.

imports.gi.versions.Soup = '2.4';
const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;
const mainLoop = GLib.MainLoop.new(null, false);

var HttpClientShim = class HttpClientShim {
    constructor() {
        this._session = new Soup.SessionAsync();
        this._session.user_agent = 'AIFeed-test/1.0';
        this._session.timeout = 20;
    }

    getJson(url, headers, callback) {
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
                let parsed = JSON.parse(body);
                callback(null, msg.status_code, parsed);
            } catch (e) {
                callback(new Error('Response error: ' + e.message), 0, null);
            }
        });
    }
};

let scriptDir = (function() {
    const Gio = imports.gi.Gio;
    let file = Gio.File.new_for_path(imports.system.programPath || __filename || '.');
    return file.get_parent().get_parent().get_path();
})();

imports.searchPath.unshift(scriptDir + '/sources');
const githubSource = imports['github'];

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        print('  [PASS] ' + msg);
        passed++;
    } else {
        print('  [FAIL] ' + msg);
        failed++;
    }
}

function runTest(name, fn) {
    print('\n[TEST] ' + name + '\n');
    fn();
}

// ---------------------------------------------------------------------------
// Live fetch test
// ---------------------------------------------------------------------------

runTest('fetch() — live network call to GitHub', function() {
    let http = new HttpClientShim();
    let settings = {
        githubCount: 3,
        githubPeriod: 'daily',
        githubLanguages: ''
    };

    let done = false;
    githubSource.fetch(http, settings, function(error, items) {
        done = true;

        if (error) {
            print('  [SKIP] fetch returned error: ' + error.message);
            print('  [SKIP] Both primary (trending API) and fallback (REST Search) failed — likely offline or rate-limited');
            mainLoop.quit();
            return;
        }

        assert(Array.isArray(items), 'returns an array');
        assert(items.length > 0, 'returns at least one item (got ' + items.length + ')');
        assert(items.length <= 3, 'respects githubCount=3 (got ' + items.length + ')');

        if (items.length > 0) {
            let item = items[0];
            assert(item.source === 'github', 'item.source === "github"');
            assert(typeof item.title === 'string' && item.title.length > 0, 'item.title is non-empty string (got: "' + item.title + '")');
            assert(typeof item.url === 'string' && item.url.startsWith('https://github.com/'), 'item.url starts with https://github.com/ (got: ' + item.url + ')');
            assert(typeof item.meta === 'string', 'item.meta is string (got ' + typeof item.meta + ')');
            assert(item.metaLabel === 'stars', 'item.metaLabel === "stars"');
            assert(typeof item.extra === 'object' && item.extra !== null, 'item.extra is object');
            assert('language' in item.extra, 'item.extra.language present');
            assert(typeof item.timestamp === 'number', 'item.timestamp is number');
        }

        mainLoop.quit();
    });

    // Safety timeout — give live request up to 25s
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 25, () => {
        if (!done) {
            print('  [FAIL] timeout — no response after 25s');
            failed++;
            mainLoop.quit();
        }
        return GLib.SOURCE_REMOVE;
    });

    mainLoop.run();
});

print('\n--- Results ---');
print('Passed: ' + passed);
print('Failed: ' + failed);
if (failed > 0) {
    System.exit(1);
}
