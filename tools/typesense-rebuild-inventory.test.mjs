import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  analyzeInventory,
  BASE_COLLECTION_NAMES,
  fetchTypesenseInventory,
} from "./typesense-rebuild-inventory.mjs";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const timestamp = (value) => Date.parse(value).toString();
const rebuild = (baseName, date, id = "abc123") =>
  `${baseName}__rebuild_${timestamp(date)}_${id}`;

test("matches the five exact Metro base collection names", () => {
  assert.deepEqual(BASE_COLLECTION_NAMES, [
    "metro-sptrans-gtfs-routes",
    "metro-sptrans-gtfs-stops",
    "metro-rail-lines",
    "metro-rail-stations",
    "metro-bike-stations",
  ]);
});

test("protects bases, alias targets, latest unaliased rebuilds, and recent collections", () => {
  const routesBase = BASE_COLLECTION_NAMES[0];
  const stopsBase = BASE_COLLECTION_NAMES[1];
  const linesBase = BASE_COLLECTION_NAMES[2];
  const stationsBase = BASE_COLLECTION_NAMES[3];
  const bikeBase = BASE_COLLECTION_NAMES[4];
  const oldAliased = rebuild(routesBase, "2026-10-08T10:00:00.000Z");
  const oldCandidate = rebuild(routesBase, "2026-10-08T11:00:00.000Z");
  const latest = rebuild(routesBase, "2026-10-11T11:00:00.000Z");
  const freshByName = rebuild(stopsBase, "2026-10-12T10:00:00.000Z");
  const managedRollback = rebuild(linesBase, "2026-10-09T10:00:00.000Z");
  const managedOld = rebuild(linesBase, "2026-10-10T10:00:00.000Z");
  const managedLatest = rebuild(linesBase, "2026-10-11T11:00:00.000Z");
  const recentCreation = rebuild(stationsBase, "2026-10-08T10:00:00.000Z");
  const bikeRollback = rebuild(bikeBase, "2026-10-09T10:00:00.000Z");
  const bikeLatest = rebuild(bikeBase, "2026-10-11T11:00:00.000Z");

  const report = analyzeInventory(
    {
      collections: [
        { name: routesBase, num_documents: 20, created_at: NOW.getTime() / 1000 },
        { name: oldAliased, num_documents: 10, created_at: Date.parse("2026-10-08T10:00:00.000Z") / 1000 },
        { name: oldCandidate, num_documents: 8, created_at: Date.parse("2026-10-08T11:00:00.000Z") / 1000 },
        { name: latest, num_documents: 5, created_at: Date.parse("2026-10-11T11:00:00.000Z") / 1000 },
        { name: freshByName, num_documents: 4 },
        { name: managedRollback, num_documents: 2 },
        {
          name: managedOld,
          num_documents: 3,
          metadata: {
            metro_rebuild: {
              version: 1,
              base_name: linesBase,
              previous_target: managedRollback,
              promoted_at_ms: Date.parse("2026-10-10T10:00:00.000Z"),
            },
          },
        },
        { name: managedLatest, num_documents: 2 },
        {
          name: recentCreation,
          num_documents: 1,
          created_at: Date.parse("2026-10-12T11:00:00.000Z") / 1000,
        },
        { name: bikeBase, num_documents: 7 },
        { name: bikeRollback, num_documents: 11 },
        { name: bikeLatest, num_documents: 1 },
        {
          name: "metro-indexer",
          num_documents: 0,
          fields: [
            {
              name: "station_id",
              type: "string",
              reference: `${bikeRollback}.station_id`,
            },
          ],
        },
        {
          name: "metro-rail-lines-custom",
          num_documents: 12,
          created_at: NOW.getTime() / 1000,
        },
      ],
      aliases: {
        aliases: [{ name: "routes-current", collection_name: oldAliased }],
      },
    },
    NOW,
  );

  const byName = new Map(report.collections.map((collection) => [collection.name, collection]));
  assert.equal(byName.get(routesBase).status, "protected");
  assert.ok(byName.get(routesBase).reasons.includes("metro_base_collection"));
  assert.equal(byName.get(oldAliased).status, "protected");
  assert.ok(byName.get(oldAliased).reasons.includes("alias_target"));
  assert.equal(byName.get(oldCandidate).status, "review-required");
  assert.ok(byName.get(oldCandidate).reasons.includes("unaliased_legacy_rebuild_candidate"));
  assert.ok(byName.get(oldCandidate).reasons.includes("direct_client_references_unknown"));
  assert.equal(byName.get(latest).status, "protected");
  assert.ok(byName.get(latest).reasons.includes("latest_unaliased_rebuild_for_base"));
  assert.equal(byName.get(freshByName).status, "protected");
  assert.ok(byName.get(freshByName).reasons.includes("potential_in_flight_under_24_hours"));
  assert.equal(byName.get(managedOld).status, "managed");
  assert.equal(byName.get(managedOld).rebuild_metadata.valid, true);
  assert.equal(
    byName.get(managedOld).timestamps.managed_promotion_epoch_milliseconds,
    Date.parse("2026-10-10T10:00:00.000Z"),
  );
  assert.ok(!byName.get(managedOld).reasons.includes("potential_in_flight_under_24_hours"));
  assert.equal(byName.get(managedRollback).status, "protected");
  assert.ok(byName.get(managedRollback).reasons.includes("managed_rebuild_previous_target"));
  assert.equal(byName.get(managedLatest).status, "protected");
  assert.equal(byName.get(recentCreation).status, "protected");
  assert.equal(byName.get(bikeRollback).status, "protected");
  assert.ok(byName.get(bikeRollback).reasons.includes("field_reference_join_target"));
  assert.deepEqual(byName.get(bikeRollback).referenced_by, [
    {
      collection_name: "metro-indexer",
      field_name: "station_id",
      reference: `${bikeRollback}.station_id`,
    },
  ]);
  assert.equal(byName.get(bikeLatest).status, "protected");
  assert.equal(byName.get("metro-rail-lines-custom").status, "preserve");
  assert.equal(report.summary.collection_count, 14);
  assert.equal(report.summary.alias_count, 1);
  assert.equal(report.summary.document_count, 86);
  assert.equal(report.summary.document_count_complete, true);
  assert.equal(report.summary.review_required_count, 1);
  assert.equal(report.summary.review_required_document_count, 8);
  assert.equal(report.summary.review_required_document_count_complete, true);
  assert.equal(report.summary.protected_count, 10);
  assert.equal(report.summary.managed_count, 1);
  assert.equal(report.summary.preserved_count, 2);
  assert.equal(report.collections.find((collection) => collection.name === oldCandidate).document_count, 8);
});

test("pinned collections and valid marker previous_target are protected", () => {
  const baseName = BASE_COLLECTION_NAMES[0];
  const previousTarget = rebuild(baseName, "2026-10-08T10:00:00.000Z");
  const managedCollection = rebuild(baseName, "2026-10-10T10:00:00.000Z");
  const newest = rebuild(baseName, "2026-10-11T11:00:00.000Z");
  const report = analyzeInventory(
    {
      collections: [
        { name: previousTarget, num_documents: 10 },
        {
          name: managedCollection,
          num_documents: 5,
          metadata: {
            metro_rebuild: {
              version: 1,
              base_name: baseName,
              previous_target: previousTarget,
            },
          },
        },
        { name: newest, num_documents: 3 },
        { name: "manually-pinned", num_documents: 7 },
      ],
      aliases: { aliases: [] },
    },
    NOW,
    { pinnedCollectionNames: [" manually-pinned ", "manually-pinned", " absent "] },
  );
  const byName = new Map(report.collections.map((collection) => [collection.name, collection]));

  assert.equal(byName.get(previousTarget).status, "protected");
  assert.ok(byName.get(previousTarget).reasons.includes("managed_rebuild_previous_target"));
  assert.equal(byName.get("manually-pinned").status, "protected");
  assert.ok(byName.get("manually-pinned").reasons.includes("configured_pinned_collection"));
  assert.deepEqual(report.configured_pinned_collection_names, ["absent", "manually-pinned"]);
  assert.equal(report.summary.document_count, 25);
  assert.equal(report.summary.review_required_document_count, 0);
});

test("previous_target must be a non-empty string in managed metadata", () => {
  const baseName = BASE_COLLECTION_NAMES[0];
  const invalidMarker = rebuild(baseName, "2026-10-08T10:00:00.000Z");
  const latest = rebuild(baseName, "2026-10-11T11:00:00.000Z");
  const report = analyzeInventory(
    {
      collections: [
        {
          name: invalidMarker,
          num_documents: 2,
          metadata: {
            metro_rebuild: {
              version: 1,
              base_name: baseName,
              previous_target: null,
            },
          },
        },
        { name: latest, num_documents: 3 },
      ],
      aliases: { aliases: [] },
    },
    NOW,
  );
  const invalid = report.collections.find((collection) => collection.name === invalidMarker);
  assert.equal(invalid.status, "review-required");
  assert.equal(invalid.rebuild_metadata.valid, false);
  assert.ok(invalid.reasons.includes("rebuild_metadata_invalid"));
});

test("managed in-flight grace uses promoted_at_ms rather than collection age", () => {
  const baseName = BASE_COLLECTION_NAMES[1];
  const promotedRecently = rebuild(baseName, "2026-10-02T10:00:00.000Z");
  const latest = rebuild(baseName, "2026-10-11T11:00:00.000Z");
  const promotedAt = Date.parse("2026-10-12T11:00:00.000Z");
  const report = analyzeInventory(
    {
      collections: [
        {
          name: promotedRecently,
          created_at: Date.parse("2026-10-02T10:00:00.000Z") / 1000,
          num_documents: 2,
          metadata: {
            metro_rebuild: {
              version: 1,
              base_name: baseName,
              previous_target: baseName,
              promoted_at_ms: promotedAt,
            },
          },
        },
        { name: latest, num_documents: 3 },
      ],
      aliases: { aliases: [] },
    },
    NOW,
  );
  const managed = report.collections.find((collection) => collection.name === promotedRecently);

  assert.equal(managed.status, "protected");
  assert.ok(managed.reasons.includes("potential_in_flight_under_24_hours"));
  assert.equal(managed.rebuild_metadata.valid, true);
  assert.equal(managed.rebuild_metadata.promoted_at_ms_valid, true);
  assert.equal(managed.rebuild_metadata.value.promoted_at_ms, promotedAt);
  assert.equal(managed.timestamps.managed_promotion_at, new Date(promotedAt).toISOString());
});

test("does not treat exactly 24 hours old as potential in-flight", () => {
  const name = rebuild(BASE_COLLECTION_NAMES[0], "2026-10-11T12:00:00.000Z");
  const report = analyzeInventory(
    {
      collections: [{ name }],
      aliases: { aliases: [] },
    },
    NOW,
  );
  assert.equal(report.collections[0].status, "protected");
  assert.ok(report.collections[0].reasons.includes("latest_unaliased_rebuild_for_base"));
  assert.ok(!report.collections[0].reasons.includes("potential_in_flight_under_24_hours"));
});

test("Typesense API mode reads all collection pages and aliases with the API key header", async () => {
  const apiKey = "local-test-key";
  const schemas = Array.from({ length: 251 }, (_, index) => ({
    name: `unknown-collection-${index}`,
    num_documents: index,
  }));
  let secondPageRead = false;
  let apiKeyObserved = true;
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.headers["x-typesense-api-key"] !== apiKey) {
      apiKeyObserved = false;
      response.statusCode = 401;
      response.end(JSON.stringify({ message: "unauthorized" }));
      return;
    }

    const requestUrl = new URL(request.url, "http://localhost");
    if (requestUrl.pathname === "/aliases") {
      response.end(
        JSON.stringify({
          aliases: [{ name: "public-collection", collection_name: schemas[250].name }],
        }),
      );
      return;
    }
    if (requestUrl.pathname === "/collections") {
      const offset = Number(requestUrl.searchParams.get("offset"));
      if (offset === 250) {
        secondPageRead = true;
      }
      response.end(JSON.stringify(schemas.slice(offset, offset + 250)));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });

  server.listen(0, "127.0.0.1");
  await new Promise((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const inventory = await fetchTypesenseInventory({
      TYPESENSE_HOST: "127.0.0.1",
      TYPESENSE_PORT: String(address.port),
      TYPESENSE_PROTOCOL: "http",
      TYPESENSE_API_KEY: apiKey,
    });
    assert.equal(inventory.collections.length, 251);
    assert.equal(inventory.aliases.aliases[0].name, "public-collection");
    assert.equal(secondPageRead, true);
    assert.equal(apiKeyObserved, true);

    const report = analyzeInventory(inventory, NOW);
    const aliasTarget = report.collections.find((collection) => collection.name === schemas[250].name);
    assert.equal(aliasTarget.status, "protected");
    assert.equal(aliasTarget.alias_count, 1);
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
  }
});

test("snapshot CLI prints JSON without echoing environment secrets and rejects --apply", async () => {
  const directory = await mkdtemp(join(tmpdir(), "typesense-inventory-"));
  const snapshotPath = join(directory, "snapshot.json");
  const scriptPath = resolve("tools/typesense-rebuild-inventory.mjs");
  const snapshot = {
    collections: [
      { name: BASE_COLLECTION_NAMES[0], num_documents: 6 },
      { name: "unrecognized-collection", num_documents: 2 },
    ],
    aliases: { aliases: [] },
  };
  await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--snapshot", snapshotPath, "--now", "2026-10-12T12:00:00.000Z"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TYPESENSE_API_KEY: "must-not-be-printed",
          TYPESENSE_REBUILD_PINNED_COLLECTIONS: "unrecognized-collection, , metro-sptrans-gtfs-routes",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source, "snapshot");
    assert.equal(report.summary.collection_count, 2);
    assert.deepEqual(report.configured_pinned_collection_names, [
      "metro-sptrans-gtfs-routes",
      "unrecognized-collection",
    ]);
    assert.equal(
      report.collections.find((collection) => collection.name === "unrecognized-collection").status,
      "protected",
    );
    assert.ok(!result.stdout.includes("must-not-be-printed"));

    const applyResult = spawnSync(process.execPath, [scriptPath, "--apply"], {
      encoding: "utf8",
    });
    assert.equal(applyResult.status, 1);
    assert.match(applyResult.stderr, /does not support --apply/);
    assert.equal(applyResult.stdout, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
