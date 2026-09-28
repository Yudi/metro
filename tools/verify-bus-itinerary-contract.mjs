import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import protobuf from "protobufjs";

const publicProto = resolve(
  "libs/shared/bus-itinerary-contracts/src/assets/grpc/bus-itinerary.proto",
);
const privateProto = resolve(
  "private/metro-core-private/src/assets/grpc/bus-itinerary.proto",
);
const root = protobuf.loadSync(publicProto);
const service = root.lookupService(
  "metro.bus.itinerary.v1.BusItineraryService",
);
assert.deepEqual(Object.keys(service.methods), [
  "GetPublishedRouteInformation",
  "GetVehiclePositions",
]);
if (existsSync(privateProto)) {
  assert.ok(
    readFileSync(publicProto).equals(readFileSync(privateProto)),
    "Public/private bus itinerary protobuf files differ",
  );
}
const response = root.lookupType(
  "metro.bus.itinerary.v1.PublishedRouteInformation",
);
const example = {
  status: "AVAILABLE",
  routeCode: "0000-00",
  lastUpdated: "",
  operatorName: "",
  consortiumName: "",
  days: [
    {
      kind: "weekday",
      directions: [
        {
          id: "outbound",
          headsign: "Exemplo",
          departures: ["25:10"],
          streets: [
            {
              name: "Via de exemplo",
              number: "",
              notices: ["Aviso ilustrativo"],
            },
          ],
          travelTimes: [{ period: "morning", minutes: 45 }],
          startTime: "05:00",
          endTime: "25:10",
        },
      ],
    },
  ],
};
assert.equal(response.verify(example), null);
const decoded = response.toObject(
  response.decode(response.encode(example).finish()),
);
assert.deepEqual(decoded, example);
const positionsResponse = root.lookupType(
  "metro.bus.itinerary.v1.BusVehiclePositions",
);
const position = root.lookupType("metro.bus.itinerary.v1.BusVehiclePosition");
assert.deepEqual(Object.keys(position.fields), [
  "plate",
  "latitude",
  "longitude",
  "recordedAt",
]);
const positionsExample = {
  positions: [{
    plate: "ABC1D23",
    latitude: -23.55,
    longitude: -46.63,
    recordedAt: "2026-09-28T03:00:00.000Z",
  }],
};
assert.equal(positionsResponse.verify(positionsExample), null);
assert.deepEqual(
  positionsResponse.toObject(
    positionsResponse.decode(positionsResponse.encode(positionsExample).finish()),
  ),
  positionsExample,
);
console.log(
  "Verified bus itinerary and position RPCs, payload round trips, and public/private parity.",
);
