#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_ENDPOINT = "https://mojoaistudio.com/api/meetup-admin";
const DEFAULT_ENV_PATH = "C:/Users/scott/Code/Mojo/.env";

const cities = {
  "atlanta": { city: "Atlanta", state: "GA", zip: "30303" },
  "austin": { city: "Austin", state: "TX", zip: "78701" },
  "boston": { city: "Boston", state: "MA", zip: "02108" },
  "charlotte": { city: "Charlotte", state: "NC", zip: "28202" },
  "chicago": { city: "Chicago", state: "IL", zip: "60601" },
  "dallas": { city: "Dallas", state: "TX", zip: "75201" },
  "denver": { city: "Denver", state: "CO", zip: "80202" },
  "houston": { city: "Houston", state: "TX", zip: "77002" },
  "las vegas": { city: "Las Vegas", state: "NV", zip: "89101" },
  "los angeles": { city: "Los Angeles", state: "CA", zip: "90012" },
  "miami": { city: "Miami", state: "FL", zip: "33131" },
  "nashville": { city: "Nashville", state: "TN", zip: "37219" },
  "new york": { city: "New York", state: "NY", zip: "10001" },
  "orlando": { city: "Orlando", state: "FL", zip: "32801" },
  "philadelphia": { city: "Philadelphia", state: "PA", zip: "19103" },
  "phoenix": { city: "Phoenix", state: "AZ", zip: "85004" },
  "portland": { city: "Portland", state: "OR", zip: "97205" },
  "raleigh": { city: "Raleigh", state: "NC", zip: "27601" },
  "san diego": { city: "San Diego", state: "CA", zip: "92101" },
  "san francisco": { city: "San Francisco", state: "CA", zip: "94103" },
  "seattle": { city: "Seattle", state: "WA", zip: "98101" },
  "tampa": { city: "Tampa", state: "FL", zip: "33602" },
  "washington dc": { city: "Washington", state: "DC", zip: "20001" },
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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCity(args) {
  const cityInput = (args.city || args._.join(" ")).trim();
  if (!cityInput) {
    throw new Error('Missing city. Pass --city "Dallas" or provide a city name.');
  }

  const key = cityInput.toLowerCase().replace(/\s+/g, " ");
  const known = cities[key];
  const city = args.nameCity || known?.city || cityInput;
  const state = args.state || known?.state;
  const zip = args.zip || known?.zip;

  if (!state || !zip) {
    throw new Error(`Unknown city "${cityInput}". Pass --state and --zip.`);
  }

  return { city, state, zip };
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

const target = resolveCity(args);
const groupName = args.name || `Advanced AI Concepts-${target.city}`;
const urlname = args.urlname || `advanced-ai-concepts-${slugify(target.city)}`;

const result = await callAdmin(endpoint, adminKey, {
  action: "copy-city",
  name: groupName,
  city: target.city,
  state: target.state,
  zip: target.zip,
  urlname,
  confirm: groupName,
});

const published = result.payload.publish?.response?.data?.publishGroupDraft?.group;
const publishedErrors = result.payload.publish?.response?.errors
  || result.payload.publish?.response?.data?.publishGroupDraft?.errors;

console.log(JSON.stringify({
  ok: result.payload.ok,
  created: result.payload.created,
  reason: result.payload.reason || null,
  group: published || result.payload.group || null,
  errors: publishedErrors || result.payload.error || null,
  group_photo: result.payload.group_photo
    ? {
        ok: result.payload.group_photo.ok,
        photo: result.payload.group_photo.placeholder?.photo || null,
        upload: result.payload.group_photo.upload
          ? { http_status: result.payload.group_photo.upload.http_status, error: result.payload.group_photo.upload.error }
          : null,
      }
    : null,
}, null, 2));

if (!result.payload.ok || publishedErrors?.length || result.payload.group_photo?.ok === false) {
  process.exitCode = 1;
}
