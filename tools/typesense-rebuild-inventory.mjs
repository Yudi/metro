#!/usr/bin/env node
/**
 * Read-only inventory of Metro Typesense collections and aliases.
 *
 * Run with `node tools/typesense-rebuild-inventory.mjs [--snapshot path] [--now ISO]`.
 * Without `--snapshot`, set TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_PROTOCOL,
 * and TYPESENSE_API_KEY to read collections and aliases from Typesense. A
 * snapshot is JSON shaped as `{ collections: [...], aliases: { aliases: [...] } }`.
 * `TYPESENSE_REBUILD_PINNED_COLLECTIONS` optionally pins comma-separated
 * collection names. `--now` fixes the audit time for repeatable reports. Output is JSON only;
 * review-required entries are possible legacy candidates, not proof that a
 * collection is unused. Direct client references cannot be inferred. This
 * utility never changes Typesense and deliberately has no `--apply` option.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Keep these names aligned with TYPESENSE_BASE_COLLECTION_NAMES in
// apps/metro-backend/src/search/services/typesense-schemas.ts.
export const BASE_COLLECTION_NAMES = Object.freeze([
  "metro-sptrans-gtfs-routes",
  "metro-sptrans-gtfs-stops",
  "metro-rail-lines",
  "metro-rail-stations",
  "metro-bike-stations",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const COLLECTION_PAGE_SIZE = 250;
const REQUEST_TIMEOUT_MS = 15_000;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const REBUILD_NAME_PATTERNS = BASE_COLLECTION_NAMES.map((baseName) => ({
  baseName,
  pattern: new RegExp(`^${escapeRegExp(baseName)}__rebuild_(\\d{13})_([a-z0-9]+)$`),
}));

function parseRebuildName(name) {
  for (const { baseName, pattern } of REBUILD_NAME_PATTERNS) {
    const match = pattern.exec(name);
    if (match) {
      return {
        baseName,
        timestampMs: Number(match[1]),
      };
    }
  }
  return null;
}

function getCollectionCreatedAt(collection) {
  const value = collection.created_at;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const timestampMs = value * 1000;
  return Number.isFinite(new Date(timestampMs).getTime()) ? timestampMs : null;
}

function getRebuildMetadata(collection, baseName) {
  const metadata = isRecord(collection.metadata) ? collection.metadata : null;
  const markerPresent = Boolean(metadata && Object.hasOwn(metadata, "metro_rebuild"));
  const marker = markerPresent ? metadata.metro_rebuild : null;
  const promotedAtPresent = isRecord(marker) && Object.hasOwn(marker, "promoted_at_ms");
  const promotedAtMs = promotedAtPresent ? marker.promoted_at_ms : null;
  const promotedAtValid =
    typeof promotedAtMs === "number" &&
    Number.isFinite(promotedAtMs) &&
    Number.isFinite(new Date(promotedAtMs).getTime());
  const markerValid =
    isRecord(marker) &&
    marker.version === 1 &&
    marker.base_name === baseName &&
    Object.hasOwn(marker, "previous_target") &&
    typeof marker.previous_target === "string" &&
    marker.previous_target.trim().length > 0;

  return {
    present: markerPresent,
    valid: markerValid,
    promoted_at_ms_present: promotedAtPresent,
    promoted_at_ms_valid: promotedAtValid,
    promoted_at_ms: promotedAtValid ? promotedAtMs : null,
    value: markerValid
      ? {
          version: marker.version,
          base_name: marker.base_name,
          previous_target: marker.previous_target,
          ...(promotedAtValid ? { promoted_at_ms: promotedAtMs } : {}),
        }
      : null,
  };
}

function normalizePinnedCollectionNames(value) {
  const names = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(names.filter((name) => typeof name === "string").map((name) => name.trim()).filter(Boolean))]
    .sort();
}

function findReferenceTarget(reference, collectionNames) {
  if (typeof reference !== "string") {
    return null;
  }

  return collectionNames
    .filter((name) => reference.startsWith(`${name}.`))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))[0] ?? null;
}

function validateInventory(inventory) {
  if (!isRecord(inventory) || !Array.isArray(inventory.collections)) {
    throw new Error("Inventory must contain a collections array.");
  }

  const aliasContainer = inventory.aliases;
  if (!isRecord(aliasContainer) || !Array.isArray(aliasContainer.aliases)) {
    throw new Error("Inventory must contain aliases.aliases as an array.");
  }

  for (const collection of inventory.collections) {
    if (!isRecord(collection) || typeof collection.name !== "string" || collection.name.length === 0) {
      throw new Error("Every collection must have a non-empty name.");
    }
  }

  for (const alias of aliasContainer.aliases) {
    if (
      !isRecord(alias) ||
      typeof alias.name !== "string" ||
      typeof alias.collection_name !== "string"
    ) {
      throw new Error("Every alias must have name and collection_name strings.");
    }
  }

  return {
    collections: inventory.collections,
    aliases: aliasContainer.aliases,
  };
}

/** Build a deterministic report without making any changes to Typesense. */
export function analyzeInventory(inventory, now = new Date(), options = {}) {
  const { collections, aliases } = validateInventory(inventory);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("Audit time must be a valid date.");
  }
  const pinnedOption = Array.isArray(options) || typeof options === "string"
    ? options
    : options?.pinnedCollectionNames ?? [];
  const pinnedCollectionNames = normalizePinnedCollectionNames(pinnedOption);
  const pinnedCollectionSet = new Set(pinnedCollectionNames);
  const inventoryCollectionNames = collections.map((collection) => collection.name);

  const aliasesByTarget = new Map();
  for (const alias of aliases) {
    const targetAliases = aliasesByTarget.get(alias.collection_name) ?? [];
    targetAliases.push(alias.name);
    aliasesByTarget.set(alias.collection_name, targetAliases);
  }

  const referencedByTarget = new Map();
  for (const sourceCollection of collections) {
    if (!Array.isArray(sourceCollection.fields)) {
      continue;
    }
    for (const field of sourceCollection.fields) {
      if (!isRecord(field)) {
        continue;
      }
      const targetName = findReferenceTarget(field.reference, inventoryCollectionNames);
      if (targetName === null) {
        continue;
      }
      const references = referencedByTarget.get(targetName) ?? [];
      references.push({
        collection_name: sourceCollection.name,
        field_name: typeof field.name === "string" ? field.name : null,
        reference: field.reference,
      });
      referencedByTarget.set(targetName, references);
    }
  }

  const rebuildsByBase = new Map(BASE_COLLECTION_NAMES.map((name) => [name, []]));
  const analyzed = collections.map((collection) => {
    const rebuild = parseRebuildName(collection.name);
    const createdAtMs = getCollectionCreatedAt(collection);
    const aliasesForCollection = (aliasesByTarget.get(collection.name) ?? []).sort();
    const metadata = rebuild
      ? getRebuildMetadata(collection, rebuild.baseName)
      : {
          present: false,
          valid: false,
          promoted_at_ms_present: false,
          promoted_at_ms_valid: false,
          promoted_at_ms: null,
          value: null,
        };

    if (rebuild) {
      rebuildsByBase.get(rebuild.baseName).push({
        name: collection.name,
        timestampMs: rebuild.timestampMs,
        aliasTarget: aliasesForCollection.length > 0,
      });
    }

    return {
      collection,
      rebuild,
      createdAtMs,
      aliasesForCollection,
      metadata,
    };
  });

  const rollbackDependentsByTarget = new Map();
  for (const item of analyzed) {
    if (!item.rebuild || !item.metadata.valid) {
      continue;
    }
    const previousTarget = item.metadata.value.previous_target;
    if (!inventoryCollectionNames.includes(previousTarget)) {
      continue;
    }
    const dependents = rollbackDependentsByTarget.get(previousTarget) ?? [];
    dependents.push(item.collection.name);
    rollbackDependentsByTarget.set(previousTarget, dependents);
  }

  const latestUnaliasedRebuilds = new Set();
  for (const rebuilds of rebuildsByBase.values()) {
    const unaliased = rebuilds
      .filter((rebuild) => !rebuild.aliasTarget)
      .sort((left, right) => right.timestampMs - left.timestampMs || left.name.localeCompare(right.name));
    if (unaliased.length > 0) {
      latestUnaliasedRebuilds.add(unaliased[0].name);
    }
  }

  const reportCollections = analyzed
    .map(({ collection, rebuild, createdAtMs, aliasesForCollection, metadata }) => {
      const isBase = BASE_COLLECTION_NAMES.includes(collection.name);
      const isRebuild = rebuild !== null;
      const isAliasTarget = aliasesForCollection.length > 0;
      const isLatestUnaliased = isRebuild && latestUnaliasedRebuilds.has(collection.name);
      const referencedBy = (referencedByTarget.get(collection.name) ?? []).sort(
        (left, right) =>
          left.collection_name.localeCompare(right.collection_name) ||
          (left.field_name ?? "").localeCompare(right.field_name ?? "") ||
          left.reference.localeCompare(right.reference),
      );
      const rollbackDependents = (rollbackDependentsByTarget.get(collection.name) ?? []).sort();
      const isJoinTarget = referencedBy.length > 0;
      const isRollbackAncestor = rollbackDependents.length > 0;
      const isPinned = pinnedCollectionSet.has(collection.name);
      const timestamps = {
        collection_created_at_epoch_seconds:
          createdAtMs === null ? null : collection.created_at,
        collection_created_at:
          createdAtMs === null ? null : new Date(createdAtMs).toISOString(),
        rebuild_name_epoch_milliseconds: rebuild?.timestampMs ?? null,
        rebuild_name_at: rebuild ? new Date(rebuild.timestampMs).toISOString() : null,
        managed_promotion_epoch_milliseconds: metadata.promoted_at_ms_valid
          ? metadata.promoted_at_ms
          : null,
        managed_promotion_at:
          metadata.promoted_at_ms_valid
            ? new Date(metadata.promoted_at_ms).toISOString()
            : null,
      };
      const reasons = [];

      if (isBase) {
        reasons.push("metro_base_collection");
      }
      if (isAliasTarget) {
        reasons.push("alias_target");
      }
      if (isLatestUnaliased) {
        reasons.push("latest_unaliased_rebuild_for_base");
      }
      if (isJoinTarget) {
        reasons.push("field_reference_join_target");
      }
      if (isRollbackAncestor) {
        reasons.push("managed_rebuild_previous_target");
      }
      if (isPinned) {
        reasons.push("configured_pinned_collection");
      }
      if (metadata.present) {
        reasons.push(metadata.valid ? "rebuild_metadata_present" : "rebuild_metadata_invalid");
      }

      const recentNameTimestamp =
        rebuild && nowMs - rebuild.timestampMs < DAY_MS;
      const recentCollectionTimestamp =
        isRebuild && createdAtMs !== null && nowMs - createdAtMs < DAY_MS;
      const isPotentiallyInFlight = metadata.valid
        ? metadata.promoted_at_ms_valid && nowMs - metadata.promoted_at_ms < DAY_MS
        : recentNameTimestamp || recentCollectionTimestamp;
      if (isPotentiallyInFlight) {
        reasons.push("potential_in_flight_under_24_hours");
      }

      let status;
      if (
        isBase ||
        isAliasTarget ||
        isLatestUnaliased ||
        isPotentiallyInFlight ||
        isJoinTarget ||
        isRollbackAncestor ||
        isPinned
      ) {
        status = "protected";
      } else if (!isRebuild) {
        status = "preserve";
        reasons.push("unrecognized_collection_name_preserved");
      } else if (metadata.valid) {
        status = "managed";
      } else {
        status = "review-required";
        reasons.push("unaliased_legacy_rebuild_candidate");
        reasons.push("direct_client_references_unknown");
      }

      return {
        name: collection.name,
        base_name: rebuild?.baseName ?? (isBase ? collection.name : null),
        document_count:
          typeof collection.num_documents === "number" &&
          Number.isFinite(collection.num_documents)
            ? collection.num_documents
            : null,
        alias_count: aliasesForCollection.length,
        join_reference_count: referencedBy.length,
        referenced_by: referencedBy,
        rollback_dependents: rollbackDependents,
        timestamps,
        aliases: aliasesForCollection,
        rebuild_metadata: metadata,
        status,
        reasons,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const reportAliases = aliases
    .map(({ name, collection_name }) => ({ name, collection_name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.collection_name.localeCompare(right.collection_name));

  const countByStatus = (status) =>
    reportCollections.filter((collection) => collection.status === status).length;
  const documentCountSummary = (items) => {
    const knownItems = items.filter((collection) => collection.document_count !== null);
    return {
      documentCount: knownItems.length === items.length
        ? knownItems.reduce((total, collection) => total + collection.document_count, 0)
        : null,
      knownCount: knownItems.length,
    };
  };
  const reviewRequiredCollections = reportCollections.filter(
    (collection) => collection.status === "review-required",
  );
  const allDocumentCounts = documentCountSummary(reportCollections);
  const reviewRequiredDocumentCounts = documentCountSummary(reviewRequiredCollections);

  return {
    audit_time: new Date(nowMs).toISOString(),
    configured_pinned_collection_names: pinnedCollectionNames,
    summary: {
      collection_count: reportCollections.length,
      alias_count: reportAliases.length,
      document_count: allDocumentCounts.documentCount,
      document_count_known_collection_count: allDocumentCounts.knownCount,
      document_count_complete: allDocumentCounts.knownCount === reportCollections.length,
      review_required_count: countByStatus("review-required"),
      review_required_document_count: reviewRequiredDocumentCounts.documentCount,
      review_required_document_count_complete:
        reviewRequiredDocumentCounts.knownCount === reviewRequiredCollections.length,
      protected_count: countByStatus("protected"),
      managed_count: countByStatus("managed"),
      preserved_count: countByStatus("preserve"),
    },
    limitations: [
      "Review-required candidates are not proven unused.",
      "Direct client references cannot be inferred from collections and aliases.",
    ],
    aliases: reportAliases,
    collections: reportCollections,
  };
}

async function readJsonResponse(url, apiKey) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "X-TYPESENSE-API-KEY": apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Typesense request failed. Check connectivity and connection settings.");
  }

  if (!response.ok) {
    throw new Error(`Typesense request failed with HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Typesense returned an invalid JSON response.");
  }
}

function getTypesenseBaseUrl(environment) {
  const required = [
    ["TYPESENSE_HOST", environment.TYPESENSE_HOST],
    ["TYPESENSE_PORT", environment.TYPESENSE_PORT],
    ["TYPESENSE_PROTOCOL", environment.TYPESENSE_PROTOCOL],
    ["TYPESENSE_API_KEY", environment.TYPESENSE_API_KEY],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}.`);
  }

  const protocol = environment.TYPESENSE_PROTOCOL.replace(/:$/, "").toLowerCase();
  if (protocol !== "http" && protocol !== "https") {
    throw new Error("TYPESENSE_PROTOCOL must be http or https.");
  }

  const port = Number(environment.TYPESENSE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TYPESENSE_PORT must be a valid TCP port.");
  }

  let host = environment.TYPESENSE_HOST;
  if (/^https?:\/\//i.test(host)) {
    try {
      host = new URL(host).hostname;
    } catch {
      throw new Error("TYPESENSE_HOST must contain a valid host.");
    }
  }
  if (host.includes("/") || host.includes("@") || host.length === 0) {
    throw new Error("TYPESENSE_HOST must contain a host name only.");
  }

  try {
    return new URL(`${protocol}://${host}:${port}`);
  } catch {
    throw new Error("TYPESENSE_HOST must contain a valid host.");
  }
}

export async function fetchTypesenseInventory(environment = process.env) {
  const baseUrl = getTypesenseBaseUrl(environment);
  const apiKey = environment.TYPESENSE_API_KEY;
  const aliasesUrl = new URL("/aliases", baseUrl);

  const aliasesPromise = readJsonResponse(aliasesUrl, apiKey);
  const collections = [];
  let offset = 0;
  const aliases = await aliasesPromise;
  for (;;) {
    const collectionsUrl = new URL("/collections", baseUrl);
    collectionsUrl.searchParams.set("limit", String(COLLECTION_PAGE_SIZE));
    collectionsUrl.searchParams.set("offset", String(offset));
    const page = await readJsonResponse(collectionsUrl, apiKey);
    if (!Array.isArray(page)) {
      throw new Error("Typesense returned an invalid collections response.");
    }
    collections.push(...page);
    if (page.length < COLLECTION_PAGE_SIZE) {
      break;
    }
    offset += page.length;
    if (offset > 250_000) {
      throw new Error("Collection inventory exceeded the supported pagination limit.");
    }
  }

  if (!isRecord(aliases)) {
    throw new Error("Typesense returned an invalid aliases response.");
  }

  return { collections, aliases };
}

async function readSnapshot(snapshotPath) {
  let contents;
  try {
    contents = await readFile(resolve(snapshotPath), "utf8");
  } catch {
    throw new Error("Unable to read the requested snapshot file.");
  }

  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("Snapshot file is not valid JSON.");
  }
}

function parseArguments(args) {
  const options = { snapshot: null, now: new Date() };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      throw new Error("This read-only inventory tool does not support --apply.");
    }
    if (argument === "--snapshot" || argument === "--now") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--snapshot") {
        options.snapshot = value;
      } else {
        const parsedNow = new Date(value);
        if (!Number.isFinite(parsedNow.getTime())) {
          throw new Error("--now must be a valid ISO date/time.");
        }
        options.now = parsedNow;
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const inventory = options.snapshot
    ? await readSnapshot(options.snapshot)
    : await fetchTypesenseInventory();
  const report = analyzeInventory(inventory, options.now, {
    pinnedCollectionNames: process.env.TYPESENSE_REBUILD_PINNED_COLLECTIONS ?? "",
  });
  report.source = options.snapshot ? "snapshot" : "typesense_api";
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Inventory audit failed."}\n`);
    process.exitCode = 1;
  });
}
