import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import protobuf from "protobufjs";

const publicProto = resolve(
  "libs/shared/rail-integration-contracts/src/assets/grpc/rail-integration.proto",
);
const privateProto = resolve(
  "private/metro-core-private/src/assets/grpc/rail-integration.proto",
);
const root = protobuf.loadSync(publicProto);
const service = root.lookupService(
  "metro.rail.integration.v1.RailIntegrationService",
);
const expectedMethods = [
  "Check",
  "FetchNextTrains",
  "GetStationName",
  "GetStationCodes",
  "GetStationByName",
  "GetVehiclesForLine",
  "GetAvailableSpecialRailServices",
  "FetchHeadwayObservations",
  "FetchRailStatusLines",
  "FetchSpecialRailStatusLines",
];
const actualMethods = Object.keys(service.methods);

if (
  actualMethods.length !== expectedMethods.length ||
  expectedMethods.some((method) => !service.methods[method])
) {
  throw new Error(
    `Unexpected rail integration RPC set: ${actualMethods.join(", ")}`,
  );
}

if (
  existsSync(privateProto) &&
  !readFileSync(publicProto).equals(readFileSync(privateProto))
) {
  throw new Error(
    "Public and private rail integration protobuf files are not identical",
  );
}

console.log(
  `Verified ${service.fullName} (${actualMethods.length} RPCs)${existsSync(privateProto) ? " with public/private parity" : ""}.`,
);
