from pathlib import Path

path = Path("docs/roadmap.md")
text = path.read_text(encoding="utf-8")
old = "2. - [ ] Añadir un centro de salud de la biblioteca que detecte archivos no"
new = "2. - [x] Añadir un centro de salud de la biblioteca que detecte archivos no"
if text.count(old) != 1:
    raise SystemExit(f"roadmap anchor count: {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
Path(".github/scripts/mark_health_roadmap.py").unlink()
Path(".github/workflows/temporary-health-roadmap.yml").unlink(missing_ok=True)
