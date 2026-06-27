# train-composition

Reusable train occupancy rendering and station-platform configuration for both
Angular frontends.

Platform layouts are split by line under `src/lib/config/lines`. Each line
configuration obtains and validates its stations through
`rail-stations.entity.ts`; do not repeat station names in platform data.

See `docs/train-composition.md` for the configuration format.

## Running unit tests

Run `bunx nx test train-composition` to execute the unit tests.
