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
