// Fetches the Google News RSS feed server-side (run on a schedule by
// .github/workflows/fetch-headlines.yml) and writes the result to
// headlines.json at the repo root. The site then fetches that file
// same-origin at runtime — no third-party CORS proxy involved, since
// those have proven unreliable (rate-limited, require auth, or just down).
const fs = require('fs');

const SEARCH_QUERY = 'Zelda Switch 2 Ocarina of Time hardware release';
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
  const items = itemBlocks.slice(0, 6).map(block => ({
    title: decodeEntities(extractTag('title', block)),
    link: extractTag('link', block),
    pubDate: extractTag('pubDate', block),
    source: decodeEntities(extractTag('source', block))
  })).filter(i => i.title && i.link);

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
