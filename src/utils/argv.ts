/**
 * Minimal argv parser for shipway CLI.
 * Supports: --flag, --key=value, --key value, -f (short flags), positional args.
 */
export interface ParsedArgs {
  command: string | undefined;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgv(argv: string[]): ParsedArgs {
  // Skip node + script path
  const raw = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;

    if (arg === '--') {
      // Everything after -- is positional
      positional.push(...raw.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        // --key=value
        const key = arg.slice(2, eqIndex);
        flags[key] = arg.slice(eqIndex + 1);
      } else {
        // --flag or --key value
        const key = arg.slice(2);
        const next = raw[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short flags: -n, -v, etc. (each char is a flag)
      for (const char of arg.slice(1)) {
        flags[char] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0],
    args: positional.slice(1),
    flags,
  };
}
