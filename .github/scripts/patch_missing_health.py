from pathlib import Path

path = Path("src/components/desktop/folder-scanner.tsx")
text = path.read_text(encoding="utf-8")

old = "          if (!library.message) replaceTrackLinks(scanResult.sessionId, []);"
new = """          if (!library.message) {
            replaceTrackLinks(scanResult.sessionId, [], {
              scannedRelativePaths: scanResult.tracks.map(
                (track) => track.relativePath,
              ),
            });
          }"""
if text.count(old) != 1:
    raise SystemExit(f"empty links anchor count: {text.count(old)}")
text = text.replace(old, new, 1)

old = """          })),
          !library.message,
        );"""
new = """          })),
          {
            coverageComplete: !library.message,
            scannedRelativePaths: scanResult.tracks.map(
              (track) => track.relativePath,
            ),
          },
        );"""
if text.count(old) != 1:
    raise SystemExit(f"linked paths anchor count: {text.count(old)}")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
Path(".github/scripts/patch_missing_health.py").unlink()
Path(".github/workflows/temporary-missing-file-proof.yml").unlink(missing_ok=True)
