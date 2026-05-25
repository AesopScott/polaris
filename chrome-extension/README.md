# Polaris Browser Bridge — Chrome Extension

Lets Claude sessions in Polaris read your browser tabs without restarting Chrome or dealing with profile pickers.

## Install (one-time)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: `C:\Users\scott\Code\Polaris\chrome-extension`
5. The "Polaris Browser Bridge" extension appears in your list

The extension connects automatically whenever Polaris is running. You'll see it reconnect within a few seconds of starting Polaris.

## How it works

- The extension opens a WebSocket connection to `ws://localhost:40000` (the Polaris server)
- When a Claude session calls `BrowseChrome`, Polaris sends a request through that connection
- The extension reads the active tab's rendered text and returns it — no Chrome restart needed
- If the extension isn't installed, `BrowseChrome` falls back to CDP on port 9222

## Usage in a Claude session

```
BrowseChrome()                           → read whatever tab is currently active
BrowseChrome({ url: "https://..." })     → navigate to URL, then read
BrowseChrome({ selector: "main" })      → extract a specific CSS element
```

## Troubleshooting

- Extension shows "Disconnected": Polaris server isn't running yet — start Polaris and it reconnects automatically
- Permission denied on a tab: Chrome restricts scripting on `chrome://` and Web Store pages — normal
- Still seeing profile picker: make sure you're using the extension path, not the "Launch Chrome" CDP button
