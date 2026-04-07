// ─── Carlos Console — X/Twitter Content Script ───

const CARLOS_BTN_CLASS = 'carlos-reply-btn';
const CARLOS_GROK_CLASS = 'carlos-grok-btn';

// ─── INJECT STYLES ───
const style = document.createElement('style');
style.textContent = `
  .${CARLOS_BTN_CLASS}, .${CARLOS_GROK_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 16px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
    margin-left: 4px;
  }
  .${CARLOS_BTN_CLASS} {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
  }
  .${CARLOS_BTN_CLASS}:hover { background: rgba(239,68,68,0.22); }
  .${CARLOS_GROK_CLASS} {
    background: rgba(139,92,246,0.12);
    color: #8b5cf6;
  }
  .${CARLOS_GROK_CLASS}:hover { background: rgba(139,92,246,0.22); }
  .${CARLOS_BTN_CLASS}:disabled, .${CARLOS_GROK_CLASS}:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .carlos-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    color: #fff;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.3s;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    border: 1px solid #333;
  }
  .carlos-toast.show { opacity: 1; }
  .carlos-toast.error { border-color: #ef4444; color: #f87171; }
`;
document.head.appendChild(style);

// ─── UTILS ───
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toast(msg, isError = false) {
  let el = document.querySelector('.carlos-toast');
  if (!el) { el = document.createElement('div'); el.className = 'carlos-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function getTweetText(article) {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  return textEl ? textEl.innerText.trim() : '';
}

// ─── FIND REPLY TEXTAREA ───
function findReplyTextarea() {
  const selectors = [
    '[data-testid="tweetTextarea_0"]',
    'div[contenteditable="true"][data-testid="tweetTextarea_0"]',
    '[role="textbox"][data-testid="tweetTextarea_0"]',
    '[contenteditable="true"][role="textbox"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    '.notranslate[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  // aggressive fallback
  const all = document.querySelectorAll('[contenteditable="true"]');
  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 30) return el;
  }
  return null;
}

// ─── INSERT TEXT INTO X's REPLY BOX ───
async function insertText(textarea, text) {
  textarea.focus();
  await sleep(100);

  // Method 1: execCommand
  document.execCommand('selectAll', false, null);
  if (document.execCommand('insertText', false, text)) {
    await sleep(100);
    if (verifyText(textarea, text)) return true;
  }

  // Method 2: clipboard paste
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    textarea.dispatchEvent(pasteEvent);
    await sleep(200);
    if (verifyText(textarea, text)) return true;
  } catch(e) {}

  // Method 3: InputEvent
  textarea.textContent = text;
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  fireEvents(textarea);
  await sleep(200);
  if (verifyText(textarea, text)) return true;

  // Method 4: char by char
  textarea.textContent = '';
  for (const char of text) {
    textarea.textContent += char;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
    await sleep(10);
  }
  fireEvents(textarea);
  await sleep(200);
  return verifyText(textarea, text);
}

function verifyText(textarea, text) {
  const content = (textarea.textContent || textarea.innerText || '').trim();
  return content.includes(text.substring(0, 20));
}

function fireEvents(el) {
  el.dispatchEvent(new Event('focus', { bubbles: true }));
  el.dispatchEvent(new Event('focusin', { bubbles: true }));
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }));
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode: 229 }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 229 }));
}

// ─── CLICK REPLY AND AUTO-FILL ───
async function handleCarlosClick(btn, article) {
  const tweetText = getTweetText(article);
  if (!tweetText) { toast('Could not read tweet text', true); return; }

  btn.disabled = true;
  btn.textContent = '⟳';

  // Click X's native reply button to open composer
  const replyButton = article.querySelector('[data-testid="reply"]');
  if (replyButton) {
    replyButton.click();
    await sleep(1200);
  }

  // Generate Carlos reply via background script
  const response = await chrome.runtime.sendMessage({ type: 'generateReply', tweetText });

  if (response.error) {
    toast(response.error, true);
    btn.disabled = false;
    btn.textContent = '🇪🇸 Carlos';
    return;
  }

  // Find the reply textarea and insert
  let textarea = null;
  for (let i = 0; i < 5; i++) {
    textarea = findReplyTextarea();
    if (textarea) break;
    await sleep(500);
  }

  if (!textarea) {
    toast('Could not find reply box — try clicking reply first', true);
    btn.disabled = false;
    btn.textContent = '🇪🇸 Carlos';
    return;
  }

  const inserted = await insertText(textarea, response.reply);
  if (inserted) {
    toast('✓ Carlos reply ready — check the box!');
  } else {
    // Fallback: copy to clipboard
    try { await navigator.clipboard.writeText(response.reply); } catch(e) {}
    toast('Pasted failed — reply copied to clipboard, paste manually');
  }

  btn.disabled = false;
  btn.textContent = '🇪🇸 Carlos';
}

// ─── GROK REPLY ───
async function handleGrokClick(btn, article) {
  const grokText = '@grok detaylı bir şekilde bu postu açıkla?';

  btn.disabled = true;
  btn.textContent = '⟳';

  // Click X's native reply button
  const replyButton = article.querySelector('[data-testid="reply"]');
  if (replyButton) {
    replyButton.click();
    await sleep(1200);
  }

  let textarea = null;
  for (let i = 0; i < 5; i++) {
    textarea = findReplyTextarea();
    if (textarea) break;
    await sleep(500);
  }

  if (!textarea) {
    toast('Could not find reply box', true);
    btn.disabled = false;
    btn.textContent = '@grok';
    return;
  }

  const inserted = await insertText(textarea, grokText);
  if (inserted) {
    // Auto-click the tweet/reply button
    await sleep(300);
    const tweetBtn = document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
    if (tweetBtn && !tweetBtn.disabled) {
      tweetBtn.click();
      toast('✓ @grok reply sent!');
    } else {
      toast('✓ @grok text filled — hit Reply');
    }
  } else {
    try { await navigator.clipboard.writeText(grokText); } catch(e) {}
    toast('Fill failed — copied to clipboard');
  }

  btn.disabled = false;
  btn.textContent = '@grok';
}

// ─── INJECT BUTTONS ON TWEETS ───
function injectButtons(article) {
  if (article.querySelector(`.${CARLOS_BTN_CLASS}`)) return; // already injected

  const actionBar = article.querySelector('[role="group"]');
  if (!actionBar) return;

  // Carlos reply button
  const carlosBtn = document.createElement('button');
  carlosBtn.className = CARLOS_BTN_CLASS;
  carlosBtn.textContent = '🇪🇸 Carlos';
  carlosBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleCarlosClick(carlosBtn, article);
  });

  // Grok button
  const grokBtn = document.createElement('button');
  grokBtn.className = CARLOS_GROK_CLASS;
  grokBtn.textContent = '@grok';
  grokBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleGrokClick(grokBtn, article);
  });

  actionBar.appendChild(carlosBtn);
  actionBar.appendChild(grokBtn);
}

// ─── PROCESS EXISTING + NEW TWEETS ───
function processAllTweets() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach(injectButtons);
}

// Run on load
processAllTweets();

// Watch for new tweets (infinite scroll, navigation)
const observer = new MutationObserver(() => processAllTweets());
observer.observe(document.body, { childList: true, subtree: true });
