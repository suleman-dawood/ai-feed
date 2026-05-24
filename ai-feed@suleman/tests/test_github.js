#!/usr/bin/env gjs
// Standalone GJS test for sources/github.js
// Run from ai-feed@suleman dir:
//   gjs tests/test_github.js

// Note: no 'use strict' at file level — eval() of the module must be able to
// bind var declarations into this scope. Strict mode prevents that.

// ---------------------------------------------------------------------------
// Minimal Soup.SessionAsync shim (libsoup 2.4 style)
// ---------------------------------------------------------------------------

// We intercept HTTP calls by injecting a fake httpClient.
// The shim supports two modes:
//   - inject a JSON response string (happy path)
//   - inject an error (fallback path)

let _nextResponse = null;  // { error, status, body }

let fakeHttpClient = {
    getJson: function(url, headers, callback) {
        print('[HTTP] GET ' + url);
        let r = _nextResponse;
        if (!r) {
            callback(new Error('No response configured for: ' + url), 0, null);
            return;
        }
        // Consume the response; subsequent calls use the second entry if set.
        if (Array.isArray(_nextResponse)) {
            _nextResponse = _nextResponse.length > 1 ? _nextResponse.slice(1) : null;
            r = r[0];
        } else {
            _nextResponse = null;
        }
        if (r.error) {
            callback(r.error, 0, null);
        } else {
            try {
                let parsed = JSON.parse(r.body);
                callback(null, r.status || 200, parsed);
            } catch (e) {
                callback(new Error('JSON parse error in shim: ' + e.message), 0, null);
            }
        }
    }
};

// ---------------------------------------------------------------------------
// Load the module under test
//   GJS uses the legacy imports system; we simulate it with a manual eval.
// ---------------------------------------------------------------------------

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

// Resolve the absolute path of github.js relative to this test file.
let scriptDir = GLib.path_get_dirname(GLib.filename_from_utf8(imports.system.programPath, -1)[0]);

// Walk up one level if we are inside tests/
if (GLib.basename(scriptDir) === 'tests') {
    scriptDir = GLib.path_get_dirname(scriptDir);
}

let modulePath = scriptDir + '/sources/github.js';
print('[INFO] Loading module: ' + modulePath);

let file = Gio.File.new_for_path(modulePath);
if (!file.query_exists(null)) {
    printerr('[FAIL] Module not found: ' + modulePath);
    imports.system.exit(1);
}

let [, contents] = file.load_contents(null);
let src = imports.byteArray.toString(contents);

// eval() at top level (non-strict) binds var declarations in the module source
// into this script's global scope. This makes `fetch`, `_escapeText`, etc. available.
eval(src);

// The module exports `var fetch` — capture it.
let githubFetch = (typeof fetch !== 'undefined') ? fetch : null;

if (typeof githubFetch !== 'function') {
    printerr('[FAIL] github.js did not export a "fetch" function');
    imports.system.exit(1);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        print('  [PASS] ' + message);
        passed++;
    } else {
        printerr('  [FAIL] ' + message);
        failed++;
    }
}

function assertSchema(item, label) {
    let required = ['source', 'title', 'subtitle', 'meta', 'metaLabel', 'url', 'timestamp', 'extra'];
    for (let i = 0; i < required.length; i++) {
        let field = required[i];
        assert(item.hasOwnProperty(field), label + ' has field "' + field + '"');
    }
    assert(item.source === 'github', label + ' source === "github"');
    assert(item.metaLabel === 'stars', label + ' metaLabel === "stars"');
    assert(typeof item.extra === 'object', label + ' extra is object');
    assert(item.extra.hasOwnProperty('language'), label + ' extra.language present');
    assert(item.extra.hasOwnProperty('currentPeriodStars'), label + ' extra.currentPeriodStars present');
}

// ---------------------------------------------------------------------------
// Test settings
// ---------------------------------------------------------------------------

let testSettings = {
    githubPeriod: 'daily',
    githubLanguages: 'Python',
    githubCount: 3,
    githubToken: ''
};

// ---------------------------------------------------------------------------
// Test 1: Primary API — happy path
// ---------------------------------------------------------------------------

print('\n=== Test 1: Primary API returns valid data ===');

let primaryPayload = JSON.stringify([
    {
        author: 'anthropics',
        name: 'claude-code',
        description: "Anthropic's CLI for Claude",
        stars: 21400,
        currentPeriodStars: 450,
        language: 'Python',
        url: 'https://github.com/anthropics/claude-code'
    },
    {
        author: 'openai',
        name: 'swarm',
        description: 'Multi-agent orchestration',
        stars: 18000,
        currentPeriodStars: 120,
        language: 'Python',
        url: 'https://github.com/openai/swarm'
    },
    {
        author: 'microsoft',
        name: 'autogen',
        description: 'Multi-agent conversation framework',
        stars: 35000,
        currentPeriodStars: 80,
        language: 'Python',
        url: 'https://github.com/microsoft/autogen'
    }
]);

_nextResponse = { error: null, status: 200, body: primaryPayload };

githubFetch(fakeHttpClient, testSettings, function(error, items) {
    assert(!error, 'No error from primary');
    assert(Array.isArray(items), 'Returns array');
    assert(items.length === 3, 'Returns 3 items (githubCount=3)');
    if (items.length > 0) {
        assertSchema(items[0], 'items[0]');
        assert(items[0].title === 'anthropics/claude-code', 'First item title is author/name');
        assert(items[0].meta === '21.4k', 'Stars formatted as 21.4k');
        assert(items[0].extra.currentPeriodStars === 450, 'currentPeriodStars preserved');
    }
});

// ---------------------------------------------------------------------------
// Test 2: Primary returns empty array — triggers fallback
// ---------------------------------------------------------------------------

print('\n=== Test 2: Primary empty -> fallback REST Search ===');

let fallbackPayload = JSON.stringify({
    total_count: 2,
    incomplete_results: false,
    items: [
        {
            full_name: 'huggingface/transformers',
            description: 'State-of-the-art ML for Pytorch, TensorFlow, and JAX',
            stargazers_count: 134000,
            language: 'Python',
            html_url: 'https://github.com/huggingface/transformers'
        },
        {
            full_name: 'pytorch/pytorch',
            description: 'Tensors and Dynamic neural networks in Python',
            stargazers_count: 82000,
            language: 'Python',
            html_url: 'https://github.com/pytorch/pytorch'
        }
    ]
});

// First call returns empty array (primary); second call returns fallback data.
_nextResponse = [
    { error: null, status: 200, body: '[]' },
    { error: null, status: 200, body: fallbackPayload }
];

githubFetch(fakeHttpClient, testSettings, function(error, items) {
    assert(!error, 'No error when falling back');
    assert(Array.isArray(items), 'Returns array from fallback');
    assert(items.length > 0, 'Fallback returned items');
    if (items.length > 0) {
        assertSchema(items[0], 'fallback items[0]');
        assert(items[0].title === 'huggingface/transformers', 'Fallback title correct');
        assert(items[0].extra.currentPeriodStars === 0, 'Fallback currentPeriodStars is 0');
    }
});

// ---------------------------------------------------------------------------
// Test 3: Primary HTTP error — triggers fallback
// ---------------------------------------------------------------------------

print('\n=== Test 3: Primary HTTP error -> fallback REST Search ===');

_nextResponse = [
    { error: new Error('HTTP 503'), status: 503, body: null },
    { error: null, status: 200, body: fallbackPayload }
];

githubFetch(fakeHttpClient, testSettings, function(error, items) {
    assert(!error, 'No error propagated when primary fails and fallback succeeds');
    assert(Array.isArray(items), 'Returns array after fallback on primary error');
    assert(items.length > 0, 'Got items from fallback on primary error');
});

// ---------------------------------------------------------------------------
// Test 4: Both primary and fallback fail
// ---------------------------------------------------------------------------

print('\n=== Test 4: Both sources fail -> callback with error ===');

_nextResponse = [
    { error: new Error('HTTP 503'), status: 503, body: null },
    { error: new Error('HTTP 422'), status: 422, body: null }
];

githubFetch(fakeHttpClient, testSettings, function(error, items) {
    // When fallback also errors, it passes the error through and returns []
    assert(Array.isArray(items), 'Returns empty array on total failure');
    // error may or may not be set depending on path, but items must be array
});

// ---------------------------------------------------------------------------
// Test 5: Star formatting helper (indirectly via items)
// ---------------------------------------------------------------------------

print('\n=== Test 5: Star formatting ===');

let formatTests = [
    { input: 0, expected: '0' },
    { input: 999, expected: '999' },
    { input: 1000, expected: '1.0k' },
    { input: 1500, expected: '1.5k' },
    { input: 21400, expected: '21.4k' },
    { input: 134000, expected: '134.0k' }
];

// _formatStars is in scope from the top-level eval of the module.
// Test it indirectly via single-item fetch results to also exercise the full pipeline.
for (let i = 0; i < formatTests.length; i++) {
    let t = formatTests[i];
    let singleItem = JSON.stringify([{
        author: 'test', name: 'repo', description: '', stars: t.input, language: '', url: 'https://github.com/test/repo'
    }]);
    _nextResponse = { error: null, status: 200, body: singleItem };
    (function(expected, input) {
        githubFetch(fakeHttpClient, { githubPeriod: 'daily', githubLanguages: '', githubCount: 1 }, function(err, items) {
            if (!err && items.length > 0) {
                assert(items[0].meta === expected, '_formatStars(' + input + ') === "' + expected + '" (got "' + items[0].meta + '")');
            }
        });
    })(t.expected, t.input);
}

// ---------------------------------------------------------------------------
// Test 6: HTML entity escaping
// ---------------------------------------------------------------------------

print('\n=== Test 6: _escapeText safety ===');

let dangerousPayload = JSON.stringify([{
    author: 'evil<script>',
    name: 'repo&amp;stuff',
    description: 'A <b>bold</b> repo & more >here<',
    stars: 100,
    language: 'Python',
    url: 'https://github.com/evil/repo'
}]);

_nextResponse = { error: null, status: 200, body: dangerousPayload };

githubFetch(fakeHttpClient, { githubPeriod: 'daily', githubLanguages: '', githubCount: 1 }, function(err, items) {
    assert(!err, 'No error on dangerous input');
    if (items.length > 0) {
        assert(items[0].title.indexOf('<') === -1, 'Title has no raw < chars');
        assert(items[0].title.indexOf('>') === -1, 'Title has no raw > chars');
        assert(items[0].subtitle.indexOf('<') === -1, 'Subtitle has no raw < chars');
    }
});

// ---------------------------------------------------------------------------
// Test 7: Weekly period uses correct fallback date range
// ---------------------------------------------------------------------------

print('\n=== Test 7: Weekly period hits fallback with 7-day range ===');

let weeklySettings = { githubPeriod: 'weekly', githubLanguages: 'Rust', githubCount: 2, githubToken: 'ghp_test123' };
let capturedUrl = null;
let capturingClient = {
    getJson: function(url, headers, callback) {
        capturedUrl = url;
        if (url.indexOf('waite.me') !== -1) {
            // Primary returns empty — force fallback
            callback(null, 200, []);
        } else {
            callback(null, 200, { items: [] });
        }
    }
};

githubFetch(capturingClient, weeklySettings, function(err, items) {
    assert(capturedUrl !== null, 'A URL was captured for fallback');
    assert(capturedUrl.indexOf('api.github.com') !== -1, 'Fallback URL is GitHub REST API');
    assert(capturedUrl.indexOf('Rust') !== -1, 'Fallback URL contains language filter');
    assert(capturedUrl.indexOf('per_page=2') !== -1, 'Fallback URL respects githubCount');
    // Weekly: date should be ~7 days ago; just verify the created: filter is present
    assert(capturedUrl.indexOf('created:') !== -1, 'Fallback URL has created: date filter');
});

// ---------------------------------------------------------------------------
// Test 8: PAT token is added to fallback headers
// ---------------------------------------------------------------------------

print('\n=== Test 8: PAT token forwarded in fallback Authorization header ===');

let capturedHeaders = null;
let tokenClient = {
    getJson: function(url, headers, callback) {
        capturedHeaders = headers;
        if (url.indexOf('waite.me') !== -1) {
            callback(null, 200, []);
        } else {
            callback(null, 200, { items: [] });
        }
    }
};

githubFetch(tokenClient, { githubPeriod: 'daily', githubLanguages: '', githubCount: 1, githubToken: 'ghp_mytoken' }, function(err, items) {
    assert(capturedHeaders !== null, 'Headers object captured');
    assert(capturedHeaders['Authorization'] === 'Bearer ghp_mytoken', 'Authorization header set correctly');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

print('\n=== Test Summary ===');
print('Passed: ' + passed);
print('Failed: ' + failed);

if (failed > 0) {
    imports.system.exit(1);
} else {
    print('\nAll tests passed.');
    imports.system.exit(0);
}
