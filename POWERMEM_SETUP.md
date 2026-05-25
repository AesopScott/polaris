# PowerMem Sidecar Integration for Polaris

This document covers the setup and operation of PowerMem as a dual-write memory layer alongside Obsidian.

## Architecture

PowerMem acts as the **active retrieval** and **memory ingestion** system, while Obsidian remains the **long-term archive** and **human-readable storage**.

```
Session end → dual-write:
  ├─ PowerMem (HTTP) ← LLM extraction, hybrid search, time decay
  └─ Obsidian (filesystem) ← human-readable archive, audit trail

QueryMemory tool:
  ├─ Try PowerMem first (ranked, semantic search)
  └─ Fallback to Obsidian if PowerMem offline
```

## Prerequisites

1. **Docker Desktop** running (or Docker + Docker Compose)
2. **OpenRouter API key** (for Claude 3.5 Sonnet via PowerMem)
   - Get one at https://openrouter.ai/keys
3. **Optional:** Ollama for local embeddings (skip for cloud embeddings)

## Quick Start

### 1. Copy environment file

```powershell
Copy-Item ".env.powermem.example" ".env.powermem"
```

Edit `.env.powermem` and add your OpenRouter API key:

```
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxx
```

### 2. Start PowerMem sidecar

```powershell
& .\scripts\start-powermem.ps1
```

This will:
- Check Docker is running
- Pull the `oceanbase/powermem-server` image
- Start PowerMem on `http://localhost:8000`
- Display health status and dashboard URL

**First run only:** If you want local embeddings via Ollama, the script will pull `nomic-embed-text` model. This takes ~1-2 minutes.

### 3. Verify health

Open http://localhost:8000/health in your browser. You should see:

```json
{
  "status": "ok",
  "version": "1.1.1"
}
```

**Polaris will also check on startup** and log `[PowerMem] ✅ healthy`.

### 4. Start Polaris

Launch Polaris normally. Sessions will now:
1. **Ingest to PowerMem** when they end (dual-write with Obsidian)
2. **Query PowerMem first** when you call `QueryMemory` tool (falls back to Obsidian if offline)
3. Obsidian continues to receive all session extractions as before

## Configuration

### OpenRouter vs. Local Ollama

**Cloud (faster setup):**
```
LLM_PROVIDER=openai
LLM_MODEL=anthropic/claude-3-5-sonnet
EMBEDDING_PROVIDER=openai  # or other cloud provider
```

**Local (no API costs, slower, requires hardware):**
```
LLM_PROVIDER=ollama
LLM_MODEL=llama2
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
```

Edit `docker-compose.powermem.yml` and regenerate the containers.

### PostgreSQL instead of SQLite

For production or larger memory stores, use PostgreSQL:

```yaml
# In docker-compose.powermem.yml, uncomment postgres section
# and set STORAGE_TYPE=postgres instead of sqlite
```

## Operations

### View logs

```powershell
docker logs polaris-powermem -f
```

### Restart PowerMem

```powershell
docker-compose -f docker-compose.powermem.yml restart powermem
```

### Backup memories

SQLite database is at `./data/powermem.db` (inside container). Copy it to a safe location.

```powershell
docker cp polaris-powermem:/data/powermem.db ./powermem-backup.db
```

### Clear all memories (careful!)

```powershell
docker-compose -f docker-compose.powermem.yml down -v
```

This deletes the PowerMem database volume. Obsidian remains untouched.

## Data Flow

### Session Extraction (on session end)

1. Polaris collects session transcript
2. **POST** to `http://localhost:8000/api/v1/memories/add`
   - Sends: transcript, sessionId, project name, tags
   - PowerMem: extracts concepts, stores, indexes
   - Returns: memory ID, extracted tags
3. **Also writes** to Obsidian (unchanged; both happen)
4. If PowerMem is offline, Obsidian write still succeeds (graceful fallback)

### Memory Search (QueryMemory tool)

1. User calls `QueryMemory` in a session
2. **POST** to `http://localhost:8000/api/v1/memories/search`
   - Sends: query string, project name, limit (5 results)
   - PowerMem: hybrid search (semantic + full-text + graph)
   - Returns: ranked results with relevance scores
3. **Fallback** to Obsidian files if PowerMem is offline
4. Results injected into agent context

### Automatic Memory Decay

PowerMem applies **Ebbinghaus forgetting curve**:
- Memories start at full strength
- Unused memories fade over time (unless reinforced)
- Frequently-used memories strengthen

This is transparent; you don't need to configure it.

## Troubleshooting

### PowerMem won't start

```powershell
# Check Docker logs
docker logs polaris-powermem

# Check if port 8000 is in use
netstat -ano | findstr :8000

# If port is taken, use different port in docker-compose.powermem.yml
```

### PowerMem health check fails

```powershell
# Verify container is running
docker ps | findstr powermem

# Check if it's still starting up
docker logs polaris-powermem --tail 20

# Manually test endpoint
curl http://localhost:8000/health
```

### Memories not appearing in search

1. Check Polaris logs for PowerMem ingest errors:
   ```
   [PowerMem] ✅ ingested session...
   [PowerMem] ⚠️ ingest failed...
   ```

2. Verify OpenRouter API key in `.env.powermem`

3. Check PowerMem logs for LLM extraction errors:
   ```powershell
   docker logs polaris-powermem | grep -i error
   ```

### Obsidian not receiving session updates

PowerMem ingest failure does NOT block Obsidian writes. If Obsidian files are missing updates:
1. Check that `extractSessionToKnowledge` is being called (see Polaris logs)
2. Verify Obsidian vault path in Polaris config
3. Check file permissions on the Obsidian directory

## Performance

**Typical latency:**
- Memory ingest: 2-5 seconds (LLM extraction + storage)
- Memory search: 200-500ms (hybrid search)
- Fallback to Obsidian: <10ms

**Storage:**
- SQLite database grows ~100KB per session transcript
- Daily: ~1-2 MB for active user
- Monthly: ~30-60 MB

## Security

- PowerMem listens only on `localhost:8000` (not exposed to network)
- OpenRouter API key is in `.env.powermem` (git-ignored)
- Session transcripts are sent to OpenRouter for LLM extraction
  - If you have sensitive data, use local Ollama instead
- Obsidian memories remain encrypted by your vault settings

## Next Steps

1. ✅ Docker compose and startup script in place
2. ✅ server.js dual-write integration complete
3. ⏭️ (Optional) Set up scheduled memory consolidation (weekly cleanup, distillation)
4. ⏭️ (Optional) Add memory injection to agent context (pre-populate with relevant memories)
5. ⏭️ (Optional) Add memory tools to chat sessions (add_memory, search_memories)

---

**Questions or issues?** Check Polaris logs for `[PowerMem]` messages and Docker logs with `docker logs polaris-powermem`.
