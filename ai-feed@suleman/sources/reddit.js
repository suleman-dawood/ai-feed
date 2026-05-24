// Reddit source module for AIFeed
// Fetches posts from configured subreddits via the Reddit JSON API (no auth required)
// API: https://www.reddit.com/r/{subreddit}/{sort}.json?limit={count}&raw_json=1

// Escape characters that would break Pango markup rendering
function _escapeMarkup(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Parse subreddits setting: newline-separated string -> trimmed, non-empty array
function _parseSubreddits(raw) {
    if (!raw) return [];
    return raw.split('\n')
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length > 0; });
}

// Build the JSON API URL for a single subreddit
function _buildUrl(subreddit, sort, count) {
    return 'https://www.reddit.com/r/' + encodeURIComponent(subreddit) +
           '/' + encodeURIComponent(sort) +
           '.json?limit=' + encodeURIComponent(count) + '&raw_json=1';
}

// Parse a single subreddit JSON response into feed items
function _parseResponse(data, subredditName) {
    var items = [];
    try {
        var posts = data.data.children;
        for (var i = 0; i < posts.length; i++) {
            var post = posts[i].data;

            // Skip stickied posts
            if (post.stickied === true) continue;

            var title = _escapeMarkup(post.title);
            var score = typeof post.score === 'number' ? post.score : 0;
            var numComments = typeof post.num_comments === 'number' ? post.num_comments : 0;

            // Prefer post.url; fall back to constructing from permalink
            var url = post.url;
            if (!url && post.permalink) {
                url = 'https://www.reddit.com' + post.permalink;
            }

            items.push({
                source: 'reddit',
                title: title,
                subtitle: '',
                meta: score + ' pts',
                metaLabel: '',
                url: url,
                extra: {
                    subreddit: 'r/' + subredditName,
                    numComments: numComments
                }
            });
        }
    } catch (e) {
        // Return whatever was successfully parsed before the error
    }
    return items;
}

// Merge and sort all collected items by score descending
function _mergeAndSort(allItems) {
    allItems.sort(function(a, b) {
        var scoreA = parseInt(a.meta, 10) || 0;
        var scoreB = parseInt(b.meta, 10) || 0;
        return scoreB - scoreA;
    });
    return allItems;
}

// Main fetch function — fires one request per subreddit, merges when all complete
// httpClient: HttpClient instance (from httpClient.js)
// settings:   object with redditSubreddits, redditSort, redditCount keys
// callback:   function(error, feedItems)
var fetch = function(httpClient, settings, callback) {
    var raw = settings.redditSubreddits || '';
    var sort = settings.redditSort || 'hot';
    var count = settings.redditCount || 5;

    var subreddits = _parseSubreddits(raw);

    if (subreddits.length === 0) {
        callback(null, []);
        return;
    }

    var allItems = [];
    var pending = subreddits.length;
    var hasCalledBack = false;

    function onAllDone() {
        if (hasCalledBack) return;
        hasCalledBack = true;
        callback(null, _mergeAndSort(allItems));
    }

    subreddits.forEach(function(subreddit) {
        var url = _buildUrl(subreddit, sort, count);

        httpClient.getJson(url, null, function(error, status, data) {
            if (!error && data) {
                try {
                    var items = _parseResponse(data, subreddit);
                    for (var i = 0; i < items.length; i++) {
                        allItems.push(items[i]);
                    }
                } catch (e) {
                    // Non-fatal: skip this subreddit's results
                }
            }
            // Decrement regardless of per-subreddit errors so we still resolve
            pending -= 1;
            if (pending === 0) {
                onAllDone();
            }
        });
    });
};
