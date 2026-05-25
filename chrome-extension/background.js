'use strict';

// ─── Polaris Browser Bridge — Chrome Extension background service worker ──────
//
// Connects to the Polaris server WebSocket on startup and responds to
// browse-chrome-request messages by reading the active tab's rendered content.
//
// No Chrome restart needed — works with your existing Chrome session and profile.
//
// Setup: Chrome Extensions → Load unpacked → select the chrome-extension/ folder
// in the Polaris source directory.

const POLARIS_WS_URL = 'ws://localhost:40000';
const RECONNECT_ALARM = 'polaris-reconnect';
const KEEPALIVE_ALARM  = 'polaris-keepalive';

let ws = null;

// ─── Connection ───────────────────────────────────────────────────────────────

function connect() {
  // Already open or connecting — nothing to do
  if (ws && ws.readyState < WebSocket.CLOSING) return;

  ws = new WebSocket(POLARIS_WS_URL);

  ws.onopen = () => {
    console.log('[Polaris Bridge] Connected to Polaris server');
    ws.send(JSON.stringify({ type: 'chrome-extension-ready', version: '1.0.0' }));
    chrome.alarms.clear(RECONNECT_ALARM);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'browse-chrome-request') {
        await handleBrowseRequest(msg);
      }
    } catch (e) {
      console.error('[Polaris Bridge] Message error:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Polaris Bridge] Disconnected — retrying in 5 s');
    ws = null;
    // ~5 seconds
    chrome.alarms.create(RECONNECT_ALARM, { delayInMinutes: 0.083 });
  };

  ws.onerror = () => ws && ws.close();
}

// ─── Browse request handling ──────────────────────────────────────────────────

async function handleBrowseRequest({ requestId, url, selector }) {
  try {
    // Get the active tab in the user's focused window
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) {
      sendResponse(requestId, { error: 'No active tab found — open a page in Chrome first.' });
      return;
    }

    let tabId = tab.id;

    // Optionally navigate to a URL and wait for the page to load
    if (url) {
      await chrome.tabs.update(tabId, { url });
      await waitForTabLoad(tabId);
    }

    // Extract rendered text from the tab
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        if (sel) {
          const el = document.querySelector(sel);
          return el ? el.innerText : 'Selector not found: ' + sel;
        }
        return document.body ? document.body.innerText : '';
      },
      args: [selector || null],
    });

    const finalTab = await chrome.tabs.get(tabId);
    const content  = String(results?.[0]?.result ?? '').trim().slice(0, 20000);

    sendResponse(requestId, {
      content: `URL: ${finalTab.url}\nTitle: ${finalTab.title || ''}\n\n${content}`,
    });
  } catch (e) {
    sendResponse(requestId, { error: `Error reading tab: ${e.message}` });
  }
}

function waitForTabLoad(tabId, timeout = 6000) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
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

function sendResponse(requestId, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'browse-chrome-response', requestId, ...data }));
  }
}

// ─── Keepalive — prevent the service worker from going dormant ────────────────
// Chrome MV3 service workers sleep after ~30 s of inactivity; alarms wake them.

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM || alarm.name === RECONNECT_ALARM) {
    connect();
  }
});

// Fire every 20 seconds to keep the worker alive
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.333 });

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
