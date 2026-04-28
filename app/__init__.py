from pathlib import Path

# Compatibility package: allow `from app...` imports when running from repo root.
__path__ = [str(Path(__file__).resolve().parent.parent / "backend" / "app")]

