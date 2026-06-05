// Put a PNG on the macOS clipboard as real image data (not a file path), so it
// pastes straight into Discord with Cmd-V. We write the bytes to a temp file
// and let AppleScript read them onto the pasteboard as the PNG OSType.
//
// The clipboard always carries PNG/TIFF on macOS, which is why the board is
// rendered as PNG: a WebP would not paste as an image.

import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

// "«class PNGf»" is the guillemet-wrapped OSType <<class PNGf>> that
// AppleScript uses for PNG pasteboard data.
const PNGF = "«class PNGf»";

export async function copyPngToClipboard(png: Buffer): Promise<string> {
  // Per-process temp file, so two games running in separate terminals can't
  // overwrite each other's PNG between the write and AppleScript's read.
  const file = join(tmpdir(), `hangman-board-${process.pid}.png`);
  await writeFile(file, png);
  const script = `set the clipboard to (read (POSIX file ${JSON.stringify(file)}) as ${PNGF})`;
  await run("osascript", ["-e", script]);
  return file;
}
