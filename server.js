
// >>>>>> CROSS-CHECK FEATURE ADDITIONS >>>>>>
function ensureCrossChecksDir() {
  try { fs.mkdirSync(CROSS_CHECKS_DIR, { recursive: true }); } catch {}
}

function appendCrossCheckRecord(rec) {
  ensureCrossChecksDir();
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, ...rec }) + '\n';
  const logPath = path.join(CROSS_CHECKS_DIR, 'records.jsonl');
  try {
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {}
}

function sendCrossCheckRecords(ws) {
  ensureCrossChecksDir();
  const logPath = path.join(CROSS_CHECKS_DIR, 'records.jsonl');
  let lines = [];
  try { lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean); } catch {}
  const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; }}).filter(Boolean);
  sendTo(ws, { type: 'cross-check-records', records });
}

function validateCrossCheck(ws, msg) {
  const { checkId, sessionId, file } = msg;
  const ver = getVersions();
  const recFile = file.replace(/\\/g, '/');
  const version = ver[recFile] || '1.0';
  let currentContent;
  try { currentContent = fs.readFileSync(path.join(process.cwd(), recFile), 'utf8'); } catch { currentContent = null; }
  if (!currentContent) {
    sendTo(ws, { type: 'cross-check-result-' + checkId, ok: false, error: 'File not found on disk' });
    return;
  }
  // Spawn routine session via DeepSeek API to validate the file
  spawnDeepSeekRoutine(
    `You are a senior code reviewer. Provide a JSON object report with keys: ok:boolean, summary:string, issues?:Array<{severity:'high'|'medium'|'low', line:number|null, message:string, suggestion?:string}> for the given file content. Respond ONLY with valid JSON, no markdown formatting.

--- BEGIN FILE ---
${currentContent}
--- END FILE ---`,
    { storeToken: false, skipLines: false },
    (err, result) => {
      let parsed = { ok: false, summary: 'failed to parse', issues: [] };
      if (!err && result?.text) {
        try { parsed = JSON.parse(result.text); 
          if (typeof parsed.ok !== 'boolean') parsed = { ok: false, summary: 'invalid JSON.ok', issues: [] };
        } catch {}
      }
      const verdict = parsed.ok ? 'pass' : 'fail';
      broadcast({
        type: 'cross-check-result-' + checkId,
        sessionId, file: recFile, prev: version, next: version, ts: Date.now(),
        ok: parsed.ok, summary: parsed.summary, issues: parsed.issues || [], verdict,
        model: 'deepseek-chat (routine)', tokens: (result?.usage?.total_tokens || 0)
      });
      appendCrossCheckRecord({ sessionId, file: recFile, prev: version, next: version, verdict, summary: parsed.summary, ok: !!parsed.ok, checkId });
    }
  );
  sendTo(ws, { type: 'cross-check-started-' + checkId, sessionId, file });
}

function cancelCrossCheck(ws) {
  sendTo(ws, { type: 'cross-check-cancelled', ok: true });
}
// <<<<<< END >>>>>>
