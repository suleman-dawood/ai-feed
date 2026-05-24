// Standalone GJS test for sources/arxiv.js
// Run with: gjs tests/test_arxiv.js
// Requires: libsoup 2.4 (Cinnamon / Mint 21)

imports.gi.versions.Soup = '2.4';
const Soup      = imports.gi.Soup;
const GLib      = imports.gi.GLib;
const GObject   = imports.gi.GObject;

// ---------------------------------------------------------------------------
// Resolve the sources/ directory relative to this test file.
// GJS doesn't expose __dirname, and modern GJS no longer puts the script
// path into programArgs, so we probe for the sources/ directory under both
// the current working directory and the conventional ai-feed@suleman/ root.
// ---------------------------------------------------------------------------
let scriptDir = (function() {
    let cwd = GLib.get_current_dir();
    let candidates = [
        cwd,
        GLib.build_filenamev([cwd, 'ai-feed@suleman'])
    ];
    for (let i = 0; i < candidates.length; i++) {
        let probe = GLib.build_filenamev([candidates[i], 'sources', 'arxiv.js']);
        if (GLib.file_test(probe, GLib.FileTest.EXISTS)) {
            return candidates[i];
        }
    }
    // Fallback to cwd; the import below will surface a clear error if wrong.
    return cwd;
})();

imports.searchPath.unshift(scriptDir);
const arxiv = imports.sources.arxiv;

// ---------------------------------------------------------------------------
// Inline httpClient shim using Soup.SessionAsync (libsoup 2.4)
// Mirrors the interface of httpClient.js: get(url, headers, callback)
// ---------------------------------------------------------------------------
let httpClient = {
    _session: (function() {
        let s = new Soup.SessionAsync();
        s.user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AIFeed-test/1.0';
        s.timeout    = 20;
        return s;
    })(),

    get: function(url, headers, callback) {
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
        this._session.queue_message(message, function(session, msg) {
            try {
                let status = msg.status_code;
                if (status < 200 || status >= 300) {
                    callback(new Error('HTTP ' + status), status, null);
                    return;
                }
                let body = msg.response_body ? msg.response_body.data : null;
                callback(null, status, body);
            } catch (e) {
                callback(e, 0, null);
            }
        });
    }
};

// ---------------------------------------------------------------------------
// Test settings (minimal)
// ---------------------------------------------------------------------------
let testSettings = {
    arxivCategories:  'cs.AI, cs.LG',
    arxivMaxResults:  5,
    arxivCount:       3
};

// ---------------------------------------------------------------------------
// Run test
// ---------------------------------------------------------------------------
print('[test_arxiv] Fetching arXiv papers...');
print('[test_arxiv] Categories : ' + testSettings.arxivCategories);
print('[test_arxiv] Max results: ' + testSettings.arxivMaxResults);
print('[test_arxiv] Display    : ' + testSettings.arxivCount);
print('');

let loop = GLib.MainLoop.new(null, false);
let exitCode = 0;

arxiv.fetch(httpClient, testSettings, function(error, items) {
    try {
        if (error) {
            print('[FAIL] fetch() returned error: ' + error.message);
            exitCode = 1;
        } else if (!items) {
            print('[FAIL] items is null');
            exitCode = 1;
        } else if (!Array.isArray(items)) {
            print('[FAIL] items is not an Array (got ' + typeof items + ')');
            exitCode = 1;
        } else {
            print('[PASS] Received ' + items.length + ' items');

            // Validate schema of each item
            let requiredFields = ['source', 'title', 'subtitle', 'meta', 'metaLabel', 'url', 'extra'];
            let allOk = true;
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                for (let fi = 0; fi < requiredFields.length; fi++) {
                    let field = requiredFields[fi];
                    if (!(field in item)) {
                        print('[FAIL] item[' + i + '] missing field: ' + field);
                        allOk = false;
                        exitCode = 1;
                    }
                }
                if (!('category' in item.extra)) {
                    print('[FAIL] item[' + i + '] missing extra.category');
                    allOk = false;
                    exitCode = 1;
                }
                if (item.source !== 'arxiv') {
                    print('[FAIL] item[' + i + '].source is "' + item.source + '" (expected "arxiv")');
                    allOk = false;
                    exitCode = 1;
                }
                if (!item.url || item.url.indexOf('arxiv.org') === -1) {
                    print('[FAIL] item[' + i + '].url looks wrong: ' + item.url);
                    allOk = false;
                    exitCode = 1;
                }
                if (!item.title || item.title.length === 0) {
                    print('[FAIL] item[' + i + '].title is empty');
                    allOk = false;
                    exitCode = 1;
                }
            }

            if (allOk) {
                print('[PASS] All item schemas valid');
            }

            // Print summary of fetched items
            print('');
            print('--- Items ---');
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                print('[' + i + '] ' + item.title);
                print('    category : ' + item.extra.category);
                print('    meta     : ' + item.meta);
                print('    url      : ' + item.url);
            }
        }
    } catch (e) {
        print('[FAIL] Unexpected error in callback: ' + e.message);
        exitCode = 1;
    } finally {
        loop.quit();
    }
});

loop.run();

if (exitCode !== 0) {
    print('');
    print('[test_arxiv] FAILED');
    imports.system.exit(exitCode);
} else {
    print('');
    print('[test_arxiv] PASSED');
}
