import {
  COMPILER_OPTIONS,
  ErrorHandler,
  NgModule,
  provideZonelessChangeDetection,
} from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

class ZonelessTestModule {}
NgModule({
  providers: [
    provideZonelessChangeDetection(),
    {
      provide: ErrorHandler,
      useValue: {
        handleError: (error: unknown) => {
          throw error;
        },
      },
    },
  ],
})(ZonelessTestModule);

getTestBed().initTestEnvironment(
  [BrowserTestingModule, ZonelessTestModule],
  platformBrowserTesting([
    { provide: COMPILER_OPTIONS, useValue: {}, multi: true },
  ]),
  {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  },
);

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
