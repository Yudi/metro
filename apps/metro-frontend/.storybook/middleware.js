const { Readable } = require("node:stream");

const STATION_IMAGES_PATH = "/api/media/station-images";
const STORYBOOK_ORIGIN = "http://localhost";
const PRODUCTION_ORIGIN = "https://metro.yudi.com.br";

const forwardedRequestHeaders = [
  "accept",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "range",
];

const forwardedResponseHeaders = [
  "accept-ranges",
  "cache-control",
  "content-range",
  "content-type",
  "etag",
  "expires",
  "last-modified",
  "vary",
];

module.exports = function registerStationImageProxy(app) {
  app.use((request, response, next) => {
    const requestUrl = new URL(
      request.originalUrl ?? request.url ?? "/",
      STORYBOOK_ORIGIN,
    );
    const { pathname, search } = requestUrl;
    if (
      pathname !== STATION_IMAGES_PATH &&
      !pathname.startsWith(`${STATION_IMAGES_PATH}/`)
    ) {
      next();
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }

    void proxyStationImageRequest(
      pathname,
      search,
      request.method,
      request.headers,
      response,
      next,
    );
  });
};

async function proxyStationImageRequest(
  pathname,
  search,
  method,
  requestHeaders,
  response,
  next,
) {
  try {
    const headers = new Headers();
    for (const name of forwardedRequestHeaders) {
      const value = requestHeaders[name];
      if (typeof value === "string") headers.set(name, value);
    }

    const upstreamResponse = await fetch(
      new URL(`${pathname}${search}`, PRODUCTION_ORIGIN),
      { method, headers },
    );

    response.statusCode = upstreamResponse.status;
    for (const name of forwardedResponseHeaders) {
      const value = upstreamResponse.headers.get(name);
      if (value) response.setHeader(name, value);
    }

    if (method === "HEAD" || !upstreamResponse.body) {
      response.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body)
      .on("error", (error) => response.destroy(error))
      .pipe(response);
  } catch (error) {
    next(error);
  }
}
