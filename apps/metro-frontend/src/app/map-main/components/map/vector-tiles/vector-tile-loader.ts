import type Tile from 'ol/Tile';
import type VectorTile from 'ol/VectorTile';
import type { FeatureLike } from 'ol/Feature';

/** Always settle tile loads so stalled requests cannot exhaust the map queue. */
export function loadVectorTile(tile: Tile, url: string): void {
  const vectorTile = tile as VectorTile<FeatureLike>;
  vectorTile.setLoader((extent, _resolution, projection) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.timeout = 20_000;
    const fail = () => vectorTile.onError();
    request.onerror = fail;
    request.onabort = fail;
    request.ontimeout = fail;
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        fail();
        return;
      }
      try {
        const data = request.response as ArrayBuffer | null;
        vectorTile.setFeatures(
          data?.byteLength
            ? vectorTile.getFormat().readFeatures(data, {
                extent,
                featureProjection: projection,
              })
            : [],
        );
      } catch {
        fail();
      }
    };
    request.send();
  });
}
