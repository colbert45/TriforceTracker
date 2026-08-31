// Fetches the Google News RSS feed server-side (run on a schedule by
// .github/workflows/fetch-headlines.yml) and writes the result to
// headlines.json at the repo root. The site then fetches that file
// same-origin at runtime — no third-party CORS proxy involved, since
// those have proven unreliable (rate-limited, require auth, or just down).
const fs = require('fs');

// "when:2d" restricts Google News search to articles published in the last
// two days. Without it, Google ranks this narrow, long-running query by
// relevance/authority, which lets a handful of old, heavily-cited articles
// (e.g. an early leak story) permanently outrank newer coverage that hasn't
// accrued the same signals yet — so the feed stops picking up new headlines
// even though the query still matches them.
const SEARCH_QUERY = 'Zelda Switch 2 Ocarina of Time hardware release when:2d';
const RSS_URL = 'https://news.google.com/rss/search?q=' + encodeURIComponent(SEARCH_QUERY) + '&hl=en-US&gl=US&ceid=US:en';

function extractTag(tag, block) {
  const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

async function main() {
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TriforceTrackerBot/1.0; +https://triforcetracker.com)' }
  });
  if (!res.ok) throw new Error('Feed request failed: ' + res.status);
  const xml = await res.text();

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const fetched = itemBlocks.map(block => ({
    title: decodeEntities(extractTag('title', block)),
    link: extractTag('link', block),
    pubDate: extractTag('pubDate', block),
    source: decodeEntities(extractTag('source', block))
  })).filter(i => i.title && i.link);

  // The "when:2d" filter on the query keeps this fresh, but can also return
  // fewer than 6 items during a quiet news stretch. Rather than shrinking
  // (or emptying) the displayed feed, merge in whatever we already have on
  // disk so older-but-still-relevant headlines stick around until genuinely
  // fresher ones bump them out.
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync('headlines.json', 'utf8')).items || [];
  } catch {
    // No existing file (or unreadable) — start fresh.
  }

  const byLink = new Map();
  for (const item of [...fetched, ...existing]) {
    if (!byLink.has(item.link)) byLink.set(item.link, item);
  }
  const items = [...byLink.values()];

  // Google News RSS returns items in relevance order, not chronological
  // order, so sort newest-first before trimming to the 6 we keep.
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  items.length = Math.min(items.length, 6);

  const output = {
    updatedAt: new Date().toISOString(),
    items
  };

  fs.writeFileSync('headlines.json', JSON.stringify(output, null, 2) + '\n');
  console.log('Wrote ' + items.length + ' headlines to headlines.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
