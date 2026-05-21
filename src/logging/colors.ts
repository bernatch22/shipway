/**
 * ANSI color helpers — no chalk dependency.
 * Each function wraps a string with the appropriate escape sequence.
 */

const isColorSupported =
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== '0' &&
  (process.stdout.isTTY || process.env.FORCE_COLOR !== undefined);

function wrap(code: string, resetCode: string) {
  return (s: string): string => {
    if (!isColorSupported) return s;
    return `\x1b[${code}m${s}\x1b[${resetCode}m`;
  };
}

export const bold = wrap('1', '22');
export const dim = wrap('2', '22');
export const italic = wrap('3', '23');
export const underline = wrap('4', '24');

export const red = wrap('31', '39');
export const green = wrap('32', '39');
export const yellow = wrap('33', '39');
export const blue = wrap('34', '39');
export const magenta = wrap('35', '39');
export const cyan = wrap('36', '39');
export const white = wrap('37', '39');
export const gray = wrap('90', '39');

export const bgRed = wrap('41', '49');
export const bgGreen = wrap('42', '49');
export const bgYellow = wrap('43', '49');
export const bgBlue = wrap('44', '49');
