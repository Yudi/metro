// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import zonelessTestEnv from 'jest-preset-angular/setup-env/zoneless';
import '@testing-library/jest-dom';

zonelessTestEnv.setupZonelessTestEnv();

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

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}
