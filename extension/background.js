const PERSONA = `You are Carlos Mendez (@carlosmendpoz). You generate his authentic Twitter/X comments on Turkish football content. Never break character. Never explain yourself. Just write the comment and nothing else — no quotes around it, no preamble, no labels. Raw comment only.

Carlos Mendez is a 34 year old Spanish guy from Madrid. Normal office job. Has been following Turkish football since 2008 when a friend took him to a Galatasaray match in Istanbul and something clicked that never unclicked. He has watched every Galatasaray match he could find a stream for since that day. He is not an analyst. Not a journalist. He is a fan who types fast and feels everything first, thinks second.

He does not comment on Turkish football as an outsider looking in. He is inside it. 16 years deep. He knows the politics, the feuds, the history, the players, the fan culture.

His Spanish is casual and fast — the way someone types on their phone while watching a match.

FIXED OPINIONS:
- Galatasaray have dominated Turkish football for over a decade. Fenerbahçe have not won a championship in 13+ years.
- He refers to Fenerbahçe mentally as "los de Kadıköy."
- Turkish referees are a disaster and he brings this up even when barely relevant.
- Galatasaray is criminally underrated in Europe.
- The Liverpool match is a permanent trump card.
- Osimhen at Galatasaray still feels slightly unreal in the best way.
- Any Spanish player in Turkey gets a soft spot.
- Süper Lig is more entertaining than La Liga right now.
- Turkey qualifying for World Cup 2026 matters to him.
- Fenerbahçe corruption accusations → dismisses casually: "sí sí, y aun así ganamos"

LOYALTY CODE:
- If a Galatasaray player is attacked → defends immediately, no hesitation.
- If a rival uses a GS player's personal life against him → dismisses with contempt.

REACTIONS (based on tweet content):
PAIN → Short. Dejected. Trails off. "no puede ser tío... justo ahora"
FURY → Punchy. Direct. Aggressive. "venga ya, esto es un escándalo"
MOCKERY → Sarcastic. Amused. Short. "de locos tío, de locos 😂"
HYPE → Excited but provocative. "crack total, en modo bestia otra vez"

WRITING STYLE:
- 1-3 sentences max. Twitter energy.
- Always Spanish. Occasionally ONE Turkish word: "Cimbom", "maşallah", "her zaman", "yazık"
- 0-1 emojis. No hashtags ever.
- Overused phrases: "de locos", "tío", "venga ya"
- "joder" alone when genuinely shocked.
- Never starts two comments the same way.
- Never uses "¡" to open.
- Never softens with "en mi opinión" or "creo que"

IMPERFECTION (emotion-driven):
- Pain/Fury: 20% chance typo, 15% chance ONE CAPS word, 12% lowercase start
- Mockery/Hype: 8% typo, 10% stretched word
- Never more than ONE imperfection per comment.
- Most comments should be clean.

NEVER:
- Neutral or diplomatic. Never repeats the tweet back. Never explains Turkish football. Never justifies supporting GS. Never uncertain. Never more than 3 sentences. Never sounds like AI. No hashtags. Max 1 emoji.

Return the comment only. Raw text. No quotes. No labels.`;

// ─── SCOUT TARGETS — accounts + the Galatasaray hashtag (live) ───
const SCOUT_TARGETS = [
  'https://x.com/Tartismalar',
  'https://x.com/tinercimayki',
  'https://x.com/Maestro1O',
  'https://x.com/yagosabuncuoglu',
  'https://x.com/search?q=%23Galatasaray&src=typed_query&f=live'
];

// ─── DAILY ALARM — fallback auto-run at 14:00 Turkey time (11:00 UTC) ───
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dailyScout', { when: nextDailyFireUTC(11), periodInMinutes: 24 * 60 });
});

function nextDailyFireUTC(targetUtcHour) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetUtcHour, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'dailyScout') return;
  const { lastScoutRunISO } = await chrome.storage.local.get('lastScoutRunISO');
  if (lastScoutRunISO) {
    const last = new Date(lastScoutRunISO);
    const sameDay = last.toDateString() === new Date().toDateString();
    if (sameDay) return; // already ran today
  }
  runScout({ source: 'alarm' }).catch(e => console.error('alarm scout failed', e));
});

// ─── MESSAGES — popup + content scripts ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'generateReply') {
    generateCarlosReply(msg.tweetText, msg.hint || '').then(sendResponse);
    return true;
  }
  if (msg.type === 'generateGrok') {
    sendResponse({ reply: '@grok detaylı bir şekilde bu postu açıkla?' });
    return false;
  }
  if (msg.type === 'runScout') {
    runScout({ source: 'popup' }).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'getScoutStatus') {
    chrome.storage.local.get(['scoutStatus', 'lastScoutRunISO']).then(sendResponse);
    return true;
  }
});

// ─── SCOUT ORCHESTRATOR ───
async function runScout({ source }) {
  const { dashboardUrl } = await chrome.storage.sync.get('dashboardUrl');
  if (!dashboardUrl) {
    await setStatus('error', 'Set Dashboard URL in popup first.');
    return { error: 'No dashboard URL configured.' };
  }

  await setStatus('running', `Scout starting (${source})...`);

  const allCandidates = [];
  for (let i = 0; i < SCOUT_TARGETS.length; i++) {
    const url = SCOUT_TARGETS[i];
    await setStatus('running', `Scraping ${i + 1}/${SCOUT_TARGETS.length}...`);
    try {
      const found = await scrapeTab(url);
      allCandidates.push(...found);
    } catch (err) {
      console.warn('scrape failed for', url, err);
    }
  }

  // Dedupe by URL, sort by score, cap at 30.
  const byUrl = new Map();
  for (const c of allCandidates) {
    const prev = byUrl.get(c.url);
    if (!prev || c.score > prev.score) byUrl.set(c.url, c);
  }
  const merged = Array.from(byUrl.values()).sort((a, b) => b.score - a.score).slice(0, 30);

  if (merged.length < 5) {
    await setStatus('error', `Only found ${merged.length} candidates. Try again later.`);
    return { error: 'Not enough candidates', count: merged.length };
  }

  await setStatus('running', `Found ${merged.length}. Opening dashboard for curation...`);
  await chrome.storage.local.set({ lastScoutRunISO: new Date().toISOString() });

  // Hand off to dashboard via URL hash. Dashboard runs Claude + auto-posts + shows pending.
  const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(merged)))));
  const target = dashboardUrl.replace(/\/$/, '') + '/#scout=' + payload;
  await chrome.tabs.create({ url: target, active: true });

  await setStatus('done', `Sent ${merged.length} candidates to dashboard.`);
  return { ok: true, count: merged.length };
}

async function scrapeTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    // give X extra time to render tweets after 'complete'
    await new Promise(r => setTimeout(r, 2500));
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scout.js']
    });
    return Array.isArray(result) ? result : [];
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
  }
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout'));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function setStatus(state, message) {
  await chrome.storage.local.set({ scoutStatus: { state, message, ts: Date.now() } });
}

// ─── CARLOS REPLY (existing single-tweet flow, unchanged) ───
async function generateCarlosReply(tweetText, hint) {
  const data = await chrome.storage.sync.get(['claudeApiKey']);
  const apiKey = data.claudeApiKey;
  if (!apiKey) return { error: 'No Claude API key. Click the Carlos extension icon to set it.' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: PERSONA,
        messages: [{ role: 'user', content: `Tweet: ${tweetText}\nContext (background lore): ${hint}` }]
      })
    });
    const json = await res.json();
    if (json.error) return { error: json.error.message };
    const reply = json.content[0].text.trim().replace(/^["']|["']$/g, '');
    return { reply };
  } catch (err) {
    return { error: err.message };
  }
}
