/**
 * Exit codes for shipway CLI.
 * Each category gets a distinct code for scripting and CI.
 */
export const ExitCode = {
  OK: 0,
  GENERAL: 1,
  CONFIG: 10,
  BUILD: 20,
  SYNC: 30,
  RESTART: 40,
  HEALTH: 50,
  SSH: 60,
  UNSUPPORTED: 70,
  PERMISSION: 80,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
