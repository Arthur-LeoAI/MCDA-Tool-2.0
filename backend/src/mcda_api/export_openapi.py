"""Write the OpenAPI schema to a file without starting a server.

    uv run python -m mcda_api.export_openapi openapi.json

The committed ``backend/openapi.json`` is the API contract; the frontend's
TypeScript types are generated from it, and CI fails if either is stale.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .main import Settings, create_app


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m mcda_api.export_openapi <output.json>", file=sys.stderr)
        return 2
    schema = create_app(Settings(cors_origins=[])).openapi()
    text = json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    Path(argv[0]).write_text(text, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
