import zonelessTestEnv from 'jest-preset-angular/setup-env/zoneless';

zonelessTestEnv.setupZonelessTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

const testGlobal = globalThis as unknown as {
  fetch?: typeof fetch;
  Headers?: typeof Headers;
  Request?: typeof Request;
  Response?: typeof Response;
};

if (!testGlobal.fetch) {
  testGlobal.fetch = (() =>
    Promise.reject(
      new Error('fetch is not mocked in this test environment'),
    )) as typeof fetch;
}

if (!testGlobal.Headers) {
  testGlobal.Headers = class TestHeaders {} as typeof Headers;
}

if (!testGlobal.Request) {
  testGlobal.Request = class TestRequest {} as typeof Request;
}

if (!testGlobal.Response) {
  testGlobal.Response = class TestResponse {} as typeof Response;
}
