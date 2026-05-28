#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_ENDPOINT = "https://mojoaistudio.com/api/meetup-admin";
const DEFAULT_ENV_PATH = "C:/Users/scott/Code/Mojo/.env";

const targetGroups = {
  dallas: "advanced-ai-concepts-dallas",
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function readEnv(path) {
  const env = {};
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).trim();
  }
  return env;
}

function resolveTarget(args) {
  const raw = (args.target || args.city || args._.join(" ")).trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return targetGroups[key] || raw;
}

async function callAdmin(endpoint, adminKey, params) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { "X-Admin-Key": adminKey },
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

const args = parseArgs(process.argv.slice(2));
const envPath = args.env || DEFAULT_ENV_PATH;
const endpoint = args.endpoint || DEFAULT_ENDPOINT;
const env = readEnv(envPath);
const adminKey = env.MEETUP_ADMIN_KEY;

if (!adminKey) {
  throw new Error(`MEETUP_ADMIN_KEY is missing from ${envPath}`);
}

const source = args.source || "advanced-ai-concepts";
const target = resolveTarget(args);

let targets = [];

if (target) {
  targets = [target];
} else {
  const groupsResult = await callAdmin(endpoint, adminKey, {
    action: "network-groups",
  });
  const edges = groupsResult.payload.result?.response?.data?.proNetwork?.groupsSearch?.edges || [];
  targets = edges
    .map((edge) => edge.node?.urlname)
    .filter((urlname) => urlname && urlname !== source);

  if (!targets.length) {
    throw new Error("No target groups found in the Advanced AI Concepts Pro network.");
  }
}

const results = [];

for (const targetUrlname of targets) {
  const result = await callAdmin(endpoint, adminKey, {
    action: "copy-events",
    source,
    target: targetUrlname,
    confirm: targetUrlname,
  });

  const photoResult = await callAdmin(endpoint, adminKey, {
    action: "copy-event-photos",
    source,
    target: targetUrlname,
    confirm: targetUrlname,
  });

  results.push({
    ok: result.payload.ok,
    source: result.payload.source,
    target: result.payload.target,
    created: (result.payload.created || []).map((item) => ({
      source_id: item.source_id,
      id: item.event?.id,
      title: item.event?.title,
      dateTime: item.event?.dateTime,
      url: item.event?.eventUrl,
    })),
    skipped: result.payload.skipped || [],
    errors: result.payload.errors || [],
    photos: {
      ok: photoResult.payload.ok,
      copied: photoResult.payload.copied || [],
      skipped: photoResult.payload.skipped || [],
      errors: photoResult.payload.errors || [],
    },
  });
}

console.log(JSON.stringify({
  ok: results.every((result) => result.ok),
  target_count: targets.length,
  results,
}, null, 2));

if (results.some((result) => !result.ok || result.errors?.length || result.photos?.errors?.length)) {
  process.exitCode = 1;
}
