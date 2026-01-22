/* eslint-disable no-console */

interface Logger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  setCurrentTest: (testName: string) => void;
}

let currentTest = "";

export const logger: Logger = {
  info: (message: string, ...args: any[]) => {
    if (process.env.DEBUG_TESTS === "true") {
      console.log(`[${currentTest}] ℹ️  ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[${currentTest}] ⚠️  ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[${currentTest}] ❌ ${message}`, ...args);
  },
  setCurrentTest: (testName: string) => {
    currentTest = testName;
  },
};
