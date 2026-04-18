// Scout — scrape top tweets w/ engagement on the current page.
// Injected programmatically by background.js via chrome.scripting.executeScript.
// Returns an array of candidate objects.

(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Wait for tweets to render. X is React-heavy, give it time and a few retries.
  let tweets = [];
  for (let i = 0; i < 10; i++) {
    tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (tweets.length >= 5) break;
    await sleep(800);
  }

  // Scroll a bit to trigger more tweets to render.
  window.scrollBy(0, 800);
  await sleep(1500);
  window.scrollBy(0, 800);
  await sleep(1500);
  tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

  function parseCount(label) {
    if (!label) return 0;
    // Examples: "1,234 Likes", "12K Replies", "1.5M reposts"
    const m = label.replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (/k/i.test(m[2])) n *= 1000;
    if (/m/i.test(m[2])) n *= 1000000;
    return Math.round(n);
  }

  function getEngagement(article, testId) {
    const el = article.querySelector(`[data-testid="${testId}"]`);
    if (!el) return 0;
    const aria = el.getAttribute('aria-label') || '';
    if (aria) return parseCount(aria);
    // Fallback: visible count text
    const span = el.querySelector('span[data-testid="app-text-transition-container"] span, span');
    return parseCount(span?.textContent || '');
  }

  function getTweetUrl(article) {
    // Permalink lives on the <time> tag's parent <a>.
    const timeEl = article.querySelector('time');
    if (!timeEl) return '';
    const a = timeEl.closest('a');
    if (!a) return '';
    const href = a.getAttribute('href') || '';
    return href.startsWith('http') ? href : `https://x.com${href}`;
  }

  function getAuthor(article) {
    const userBlock = article.querySelector('[data-testid="User-Name"]');
    if (!userBlock) return '';
    const text = userBlock.innerText || '';
    const m = text.match(/@([A-Za-z0-9_]+)/);
    return m ? m[1] : '';
  }

  function getText(article) {
    const t = article.querySelector('[data-testid="tweetText"]');
    return t ? t.innerText.trim() : '';
  }

  function isAd(article) {
    return /\bAd\b|\bPromoted\b|\bSponsored\b/i.test(article.innerText.split('\n').slice(0, 3).join(' '));
  }

  const seen = new Set();
  const candidates = [];

  for (const article of tweets) {
    if (isAd(article)) continue;
    const url = getTweetUrl(article);
    if (!url || seen.has(url)) continue;
    const text = getText(article);
    if (!text || text.length < 15) continue;
    const author = getAuthor(article);
    const likes = getEngagement(article, 'like');
    const retweets = getEngagement(article, 'retweet');
    const replies = getEngagement(article, 'reply');
    const score = retweets * 3 + likes + replies;
    if (score < 5) continue; // skip low-engagement noise
    seen.add(url);
    candidates.push({ url, author, text, likes, retweets, replies, score, source: location.pathname });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 8);
})();
