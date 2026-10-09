module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  coverageProvider: 'v8',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '<rootDir>/**/*.ts',
    '!<rootDir>/**/*.spec.ts',
    '!<rootDir>/main.ts',
    '!<rootDir>/**/*.module.ts',
    '!<rootDir>/**/*.entity.ts',
    '!<rootDir>/**/dto/**',
    '!<rootDir>/**/migrations/**',
  ],
  coveragePathIgnorePatterns: ['\\\\node_modules\\\\', 'file:'],
  coverageDirectory: '../coverage',
  // The run fails if coverage drops under these (see documentation/readme/AUTH-COVERAGE-PLAN.md).
  coverageThreshold: {
    global: { statements: 90, lines: 90, branches: 85, functions: 85 },
  },
  coverageReporters: ['text-summary', 'html', 'lcov', 'cobertura'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/../test/jest-env.ts'],
  roots: ['<rootDir>', '<rootDir>/../test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '../reports/junit',
        outputName: 'junit.xml',
        addFileAttribute: 'true',
      },
    ],
    [
      'jest-html-reporters',
      {
        publicPath: '../reports/jest',
        filename: 'test-report.html',
        expand: true,
        pageTitle: 'Auth Service Jest Report',
      },
    ],
  ],
};
