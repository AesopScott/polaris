'use strict';

const fs = require('fs');

function parseDiag(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const blocks = text.split(/^=== DIAG /m).filter(b => b.trim());
  if (!blocks.length) return null;
  const lastBlock = blocks[blocks.length - 1];

  const result = {
    timestamp: null,
    sessionId: null,
    model: null,
    mode: null,
    workDir: null,
    userPrompt: '',
    tools: [],
    tokens: { in: 0, out: 0 },
    tokensPerIter: [],
    finishedAt: null,
    finalIters: 0,
    error: null,
    emptyResponse: null,
    rawEvents: [],
  };

  const lines = lastBlock.split('\n');
  const headerEnd = lines.findIndex(l => l.startsWith('--- LOOP ---'));
  for (let i = 0; i < (headerEnd === -1 ? lines.length : headerEnd); i++) {
    const l = lines[i];
    const ts = l.match(/^([0-9T:.\-Z]+) ===/);
    if (ts && !result.timestamp) result.timestamp = ts[1];
    if (l.startsWith('SESSION: ')) result.sessionId = l.slice('SESSION: '.length).trim();
    if (l.startsWith('MODEL: ')) result.model = l.slice('MODEL: '.length).trim();
    if (l.startsWith('MODE: ')) result.mode = l.slice('MODE: '.length).trim();
    if (l.startsWith('WORKDIR: ')) result.workDir = l.slice('WORKDIR: '.length).trim();
  }
  const promptStart = lines.findIndex(l => l === '--- USER PROMPT ---');
  if (promptStart >= 0 && headerEnd > promptStart) {
    result.userPrompt = lines.slice(promptStart + 1, headerEnd).join('\n').trim();
  }

  let currentTool = null;
  let currentIter = 0;
  for (let i = (headerEnd === -1 ? 0 : headerEnd + 1); i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^\[\+([\d.]+)s\]\s+(\w+)(?::\s?(.*))?$/);
    if (!m) continue;
    const [, t, label, body] = m;
    const event = { t: parseFloat(t), label, body: body || '' };
    result.rawEvents.push(event);

    switch (label) {
      case 'ITER':
        currentIter = parseInt(body, 10) || currentIter;
        break;
      case 'TOKENS': {
        const tm = body.match(/in=(\d+)\s+out=(\d+)/);
        if (tm) {
          const inT = parseInt(tm[1], 10);
          const outT = parseInt(tm[2], 10);
          result.tokensPerIter.push({ iter: currentIter, in: inT, out: outT });
          result.tokens.in += inT;
          result.tokens.out += outT;
        }
        break;
      }
      case 'TOOL': {
        const tm = body.match(/^(\S+)\s*(.*)$/);
        const name = tm ? tm[1] : body.trim();
        const args = tm ? tm[2] : '';
        currentTool = { iter: currentIter, name, args, result: null, error: null };
        result.tools.push(currentTool);
        break;
      }
      case 'TOOL_RESULT':
        if (currentTool) currentTool.result = body;
        currentTool = null;
        break;
      case 'TOOL_ERR':
        if (currentTool) currentTool.error = body;
        currentTool = null;
        break;
      case 'EMPTY_RESPONSE':
        result.emptyResponse = body;
        break;
      case 'ERROR':
        result.error = body;
        break;
      case 'DONE': {
        const dm = body.match(/^([\d.]+)s\s+iters=(\d+)/);
        if (dm) {
          result.finishedAt = parseFloat(dm[1]);
          result.finalIters = parseInt(dm[2], 10);
        }
        break;
      }
    }
  }
  if (!result.finalIters) result.finalIters = currentIter;
  return result;
}

module.exports = { parseDiag };
