import ansis from "ansis";
import yoctoSpinner from "yocto-spinner";

// Semantic color helpers
export const success = (text: string) => ansis.green(text);
export const err = (text: string) => ansis.red(text);
export const warn = (text: string) => ansis.yellow(text);
export const info = (text: string) => ansis.cyan(text);
export const bold = (text: string) => ansis.bold(text);
export const highlight = (text: string) => ansis.magenta(text);
export const dim = (text: string) => ansis.dim(text);

// OSC 8 hyperlink — clickable text in supported terminals
export function link(text: string, url: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// Spinner — writes to stderr to keep stdout clean
let spinner: ReturnType<typeof yoctoSpinner> | null = null;

export function spin(text: string) {
  spinner = yoctoSpinner({ text, stream: process.stderr }).start();
}

export function stopSpinner() {
  spinner?.stop();
  spinner = null;
}

export function succeed(text: string) {
  if (spinner) {
    spinner.success(text);
    spinner = null;
  } else {
    console.error(success(`  ${text}`));
  }
}

export function fail(text: string) {
  if (spinner) {
    spinner.error(text);
    spinner = null;
  } else {
    console.error(err(`  ${text}`));
  }
}
