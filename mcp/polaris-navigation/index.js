#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to mockup.html (assumes it's at C:\Users\scott\Code\Polaris\resources\mockup.html)
const MOCKUP_PATH = path.normalize('C:\\Users\\scott\\Code\\Polaris\\resources\\mockup.html');

// ─── Navigation Cache ────────────────────────────────────────────────────────
let navigationCache = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

// ─── Parse Navigation Structure ──────────────────────────────────────────────

function parseNavigation() {
  if (navigationCache && Date.now() - cacheTime < CACHE_TTL) {
    return navigationCache;
  }

  const html = fs.readFileSync(MOCKUP_PATH, 'utf8');

  const buttons = [];
  const panels = {};

  // Extract buttons from button grid
  const buttonRegex = /<button\s+id=["']([^"']+)["']\s+class=["']([^"']+)["'][^>]*data-tooltip=["']([^"']+)["'][^>]*onclick=["']([^"']+)\(\)[^>]*>\s*<span[^>]*class=["']lbl["'][^>]*>([^<]+)<\/span>/g;

  let match;
  while ((match = buttonRegex.exec(html)) !== null) {
    const [, buttonId, classes, tooltip, handler, label] = match;
    buttons.push({
      id: buttonId,
      label: label.trim(),
      tooltip: tooltip.trim(),
      handler,
      classes: classes.split(' ')
    });
  }

  // Extract panels - look for divs with id ending in -panel
  const panelRegex = /<div\s+id=["']([^"']+panel[^"']*)["'][^>]*>[\s\S]*?<\/div>/g;
  let panelMatch;
  const panelIds = new Set();

  // First pass: find all panel IDs
  while ((panelMatch = panelRegex.exec(html)) !== null) {
    panelIds.add(panelMatch[1]);
  }

  // Second pass: extract full panel content
  for (const panelId of panelIds) {
    const panelStartRegex = new RegExp(`<div\\s+id=["']${panelId}["'][^>]*>`, 'i');
    const startMatch = panelStartRegex.exec(html);

    if (startMatch) {
      // Find matching closing div
      let depth = 1;
      let pos = startMatch.index + startMatch[0].length;
      let content = startMatch[0];

      while (depth > 0 && pos < html.length) {
        const openDiv = html.indexOf('<div', pos);
        const closeDiv = html.indexOf('</div>', pos);

        if (closeDiv === -1) break;

        if (openDiv !== -1 && openDiv < closeDiv) {
          depth++;
          content += html.substring(pos, openDiv + 4);
          pos = openDiv + 4;
        } else {
          depth--;
          content += html.substring(pos, closeDiv + 6);
          pos = closeDiv + 6;
          if (depth === 0) {
            panels[panelId] = {
              id: panelId,
              content: content,
              contentLength: content.length
            };
          }
        }
      }
    }
  }

  navigationCache = { buttons, panels };
  cacheTime = Date.now();

  return navigationCache;
}

// ─── Tool Implementations ────────────────────────────────────────────────────

function getNavigationSchema() {
  const { buttons, panels } = parseNavigation();
  return {
    buttons: buttons.map(b => ({
      id: b.id,
      label: b.label,
      tooltip: b.tooltip,
      handler: b.handler,
      classes: b.classes
    })),
    panelIds: Object.keys(panels)
  };
}

function getButton(buttonId) {
  const { buttons } = parseNavigation();
  const button = buttons.find(b => b.id === buttonId);

  if (!button) {
    return { error: `Button "${buttonId}" not found` };
  }

  return {
    id: button.id,
    label: button.label,
    tooltip: button.tooltip,
    handler: button.handler,
    classes: button.classes
  };
}

function getPanel(panelId) {
  const { panels } = parseNavigation();
  const panel = panels[panelId];

  if (!panel) {
    return { error: `Panel "${panelId}" not found` };
  }

  return panel;
}

function findButtonByLabel(label) {
  const { buttons } = parseNavigation();
  const matches = buttons.filter(b =>
    b.label.toLowerCase().includes(label.toLowerCase())
  );

  if (matches.length === 0) {
    return { results: [], message: `No buttons found matching "${label}"` };
  }

  return {
    results: matches.map(b => ({
      id: b.id,
      label: b.label,
      tooltip: b.tooltip,
      handler: b.handler
    })),
    count: matches.length
  };
}

// ─── MCP Server Setup ────────────────────────────────────────────────────────

const server = new Server({
  name: 'polaris-navigation',
  version: '1.0.0'
});

// Register tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'getNavigationSchema',
        description: 'Get the complete navigation pane structure including all buttons and panel IDs',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'getButton',
        description: 'Get details about a specific navigation button by ID',
        inputSchema: {
          type: 'object',
          properties: {
            buttonId: {
              type: 'string',
              description: 'The button ID (e.g., "btn-status", "btn-build")'
            }
          },
          required: ['buttonId']
        }
      },
      {
        name: 'getPanel',
        description: 'Get the full HTML content of a specific panel',
        inputSchema: {
          type: 'object',
          properties: {
            panelId: {
              type: 'string',
              description: 'The panel ID (e.g., "cross-check-panel", "archive-panel")'
            }
          },
          required: ['panelId']
        }
      },
      {
        name: 'findButtonByLabel',
        description: 'Search for buttons by label text (case-insensitive partial match)',
        inputSchema: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Label text to search for'
            }
          },
          required: ['label']
        }
      }
    ]
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request;

  try {
    let result;

    switch (name) {
      case 'getNavigationSchema':
        result = getNavigationSchema();
        break;
      case 'getButton':
        result = getButton(args.buttonId);
        break;
      case 'getPanel':
        result = getPanel(args.panelId);
        break;
      case 'findButtonByLabel':
        result = findButtonByLabel(args.label);
        break;
      default:
        return { error: `Unknown tool: ${name}` };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start server
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[polaris-navigation] MCP server started');
}

start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
