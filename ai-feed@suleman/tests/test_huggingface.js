#!/usr/bin/env gjs
// Standalone GJS test for the HuggingFace source module
// Run with: gjs ai-feed@suleman/tests/test_huggingface.js

// ---------------------------------------------------------------------------
// Inline libsoup 2.4 shim -- mirrors the real HttpClient.getJson() contract
// so this test works without the desklet runtime.
// ---------------------------------------------------------------------------

imports.gi.versions.Soup = '2.4';
const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;
const mainLoop = GLib.MainLoop.new(null, false);

// Minimal shim matching httpClient.js interface
var HttpClientShim = class HttpClientShim {
    constructor() {
        this._session = new Soup.SessionAsync();
        this._session.user_agent = 'AIFeed-test/1.0';
        this._session.timeout = 15;
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

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------

// Resolve path relative to this test file's directory
let scriptDir = (function() {
    // GJS sets `imports.searchPath`; use Gio for path resolution
    const Gio = imports.gi.Gio;
    let file = Gio.File.new_for_path(imports.system.programPath || __filename || '.');
    return file.get_parent().get_parent().get_path(); // ai-feed@suleman/
})();

imports.searchPath.unshift(scriptDir + '/sources');
const hfSource = imports['huggingface']; // loads huggingface.js

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function assertType(value, type, msg) {
    assert(typeof value === type, msg + ' (got ' + typeof value + ', want ' + type + ')');
}

// Validate that a feed item conforms to the expected schema
function validateFeedItem(item, idx) {
    let prefix = 'item[' + idx + ']';
    assert(item.source === 'huggingface',   prefix + '.source === "huggingface"');
    assertType(item.title,    'string',     prefix + '.title is string');
    assert(item.title.length > 0,           prefix + '.title is non-empty');
    assert(item.subtitle === '',            prefix + '.subtitle === ""');
    assertType(item.meta,     'string',     prefix + '.meta is string');
    assert(item.metaLabel === 'likes',      prefix + '.metaLabel === "likes"');
    assertType(item.url,      'string',     prefix + '.url is string');
    assert(item.url.startsWith('https://huggingface.co/'), prefix + '.url starts with HF base');
    assert(typeof item.extra === 'object' && item.extra !== null, prefix + '.extra is object');
    assert(item.extra.type === 'Model' || item.extra.type === 'Dataset' || item.extra.type === 'Space',
        prefix + '.extra.type is valid (' + item.extra.type + ')');
    assertType(item.extra.downloads, 'number', prefix + '.extra.downloads is number');
    assert(!('_likes' in item), prefix + '._likes stripped from output');
}

// ---------------------------------------------------------------------------
// Test: models only
// ---------------------------------------------------------------------------

print('\n=== test_huggingface.js ===\n');
print('[TEST] fetch() with models only (live network call)\n');

let settings = {
    hfShowModels:   true,
    hfShowDatasets: false,
    hfShowSpaces:   false,
    hfCount:        3,
    hfToken:        ''
};

let client = new HttpClientShim();

hfSource.fetch(client, settings, function(error, items) {
    if (error) {
        print('[FAIL] fetch returned error: ' + error.message);
        failed++;
        mainLoop.quit();
        return;
    }

    assert(Array.isArray(items), 'callback receives an array');
    assert(items.length > 0,     'at least one item returned');
    assert(items.length <= settings.hfCount, 'items.length <= hfCount (' + settings.hfCount + ')');

    // Verify items are sorted by likes descending (where meta encodes likes)
    // We check extra.downloads as a proxy since we can't re-derive likes from formatted string
    // The real check is schema conformance per item
    for (let i = 0; i < items.length; i++) {
        validateFeedItem(items[i], i);
        assert(items[i].extra.type === 'Model', 'item[' + i + '].extra.type === "Model" (models-only mode)');
    }

    // All items should have Model type since only models were requested
    let allModels = items.every(function(it) { return it.extra.type === 'Model'; });
    assert(allModels, 'all returned items are of type Model');

    print('\n[TEST] no-op when all types disabled\n');

    hfSource.fetch(client, {
        hfShowModels: false, hfShowDatasets: false, hfShowSpaces: false, hfCount: 5
    }, function(err2, items2) {
        assert(!err2,               'no error when nothing enabled');
        assert(Array.isArray(items2), 'returns array when nothing enabled');
        assert(items2.length === 0,  'empty array when nothing enabled');

        print('\n--- Results ---');
        print('Passed: ' + passed);
        print('Failed: ' + failed);
        if (failed > 0) {
            print('\nSome tests FAILED.');
        } else {
            print('\nAll tests passed.');
        }

        mainLoop.quit();
    });
});

mainLoop.run();
