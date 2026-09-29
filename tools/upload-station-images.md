# Station image tools

## Upload images

```sh
node tools/upload-station-images.mjs \
  --manifest /path/to/manifest.json \
  --assets-dir /path/to/asset-root \
  --env-file /path/to/station-images.env
```

`--manifest` and `--assets-dir` are required. Each image `key` in the manifest must exist beneath the asset root. `--env-file` is optional; it reads `KEY=VALUE` entries.

The manifest must use version 1 and contain one or more images per station identity (up to 12). Each image requires `key`, `author`, `title`, `sourceUrl`, and `license`; `label`, `lineIds`, `service`, and `licenseUrl` are optional. Keys use `station-images/{metro|monorail|rail}/<name>.avif`.

```json
{
  "version": 1,
  "stations": {
    "normalizedstationidentity": [
      {
        "key": "station-images/metro/example.avif",
        "author": "Photographer",
        "title": "Original file title",
        "sourceUrl": "https://commons.wikimedia.org/wiki/File:Example.jpg",
        "license": "CC BY 4.0",
        "label": "Linha 1 Azul",
        "lineIds": ["1"],
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0"
      }
    ]
  }
}
```

Required environment variables: `DATABASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Optional S3 settings: `S3_ENDPOINT`, `S3_BUCKET`, and `S3_REGION`.

Use `--verify-only` to check the manifest against S3 and the database without writing. Use `--prune` to delete previously tagged S3 images that are absent from the manifest. These flags cannot be combined.

## Import metadata only

Run inside the backend container with `DATABASE_URL` set:

```sh
node /app/tools/import-station-image-metadata.mjs \
  --manifest /path/in/container/manifest.json
```

The manifest uses the same format. Add `--verify-only` to check without writing.
