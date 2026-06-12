#!/usr/bin/env node
/**
 * Checks samedi.de booking widgets for free appointment slots and sends a
 * notification (ntfy.sh and/or a generic webhook) when slots are found.
 *
 * Configuration: edit targets.json (see targets.example.json) and set
 * notification env vars (NTFY_TOPIC / WEBHOOK_URL) as needed.
 *
 * Run via cron, e.g. every 15 minutes:
 *   (see README.md for the crontab line)
 */

const fs = require("fs");
const path = require("path");

const API_BASE = "https://patient.samedi.de/api/booking/v3";
const CLIENT_ID = "8f0hsw1v0x676r5pqbf4fecv3fo7s5l";
const API_KEY = "TESTING";
const DAYS_AHEAD = parseInt(process.env.DAYS_AHEAD || "60", 10);

function defaultParams() {
  return { client_id: CLIENT_ID, api_key: API_KEY, source: "bw_v3" };
}

// Extracts practiceSlug/categorySlug/eventTypeSlug and insuranceId from a
// samedi booking widget URL, e.g.
// https://termin.samedi.de/b/viola-berg/1/scholz-melanie/adhs-diagnostik-fur-gesetzlich-versicherte--4?insuranceId=public
function parseBookingUrl(url) {
  const u = new URL(url);
  const match = u.pathname.match(/\/b\/([^/]+)\/[^/]+\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Could not parse booking widget URL: ${url}`);
  }
  const [, practiceSlug, categorySlug, eventTypeSlug] = match;
  const insuranceId = u.searchParams.get("insuranceId") || "public";
  return { practiceSlug, categorySlug, eventTypeSlug, insuranceId };
}

async function resolveIds({ practiceSlug, categorySlug, eventTypeSlug }) {
  const params = new URLSearchParams({
    ...defaultParams(),
    practice_slug: practiceSlug,
    event_category_slug: categorySlug,
    event_type_slug: eventTypeSlug,
  });
  const res = await fetch(`${API_BASE}/practices/slug_to_id?${params}`);
  if (!res.ok) {
    throw new Error(`slug_to_id failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function fetchAvailableTimes({ eventCategoryId, eventTypeId, insuranceId }) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + DAYS_AHEAD);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    ...defaultParams(),
    event_category_id: eventCategoryId,
    event_type_id: eventTypeId,
    insurance_id: insuranceId,
    from: fmt(from),
    to: fmt(to),
  });
  const res = await fetch(`${API_BASE}/times?${params}`);
  if (!res.ok) {
    throw new Error(`times failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.data || [];
}

async function notify(message) {
  console.log(message);

  if (process.env.NTFY_TOPIC) {
    await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
      method: "POST",
      body: message,
    }).catch((err) => console.error("ntfy notification failed:", err));
  }

  if (process.env.WEBHOOK_URL) {
    await fetch(process.env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    }).catch((err) => console.error("webhook notification failed:", err));
  }
}

async function checkTarget(target) {
  const { label, url } = target;
  const slugs = parseBookingUrl(url);
  const ids = await resolveIds(slugs);
  const slots = await fetchAvailableTimes({
    eventCategoryId: ids.event_category_id,
    eventTypeId: ids.event_type_id,
    insuranceId: slugs.insuranceId,
  });

  if (slots.length > 0) {
    const preview = slots.slice(0, 5).join(", ");
    await notify(
      `[samedi] ${label}: ${slots.length} freier Termin(e) gefunden! ${preview}\n${url}`
    );
  } else {
    console.log(`[samedi] ${label}: keine freien Termine in den nächsten ${DAYS_AHEAD} Tagen.`);
  }

  return slots;
}

async function main() {
  const targetsPath = path.join(__dirname, "targets.json");
  if (!fs.existsSync(targetsPath)) {
    console.error(
      `Missing ${targetsPath}. Copy targets.example.json to targets.json and adjust it.`
    );
    process.exit(1);
  }

  const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
  let anyFound = false;

  for (const target of targets) {
    try {
      const slots = await checkTarget(target);
      if (slots.length > 0) anyFound = true;
    } catch (err) {
      console.error(`[samedi] ${target.label}: error - ${err.message}`);
    }
  }

  process.exit(anyFound ? 0 : 1);
}

main();
