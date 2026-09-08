export default {
  displayName: 'metro-backend-notification-integration',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.notification-integration.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@metro/shared/notification-contracts$':
      '<rootDir>/../../libs/shared/notification-contracts/src/index.ts',
    '^@metro/shared/utils$': '<rootDir>/../../libs/shared/utils/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['<rootDir>/src/notifications/notification-persistence.integration.spec.ts'],
  testTimeout: 30_000,
};
