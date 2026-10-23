"""Write the JSON Schema of the project file format.

    uv run python -m mcda_core.project.export_schema project.schema.json

The committed ``backend/project.schema.json`` documents the ``.mcda.json``
format; CI fails if it is stale.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .model import Project


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m mcda_core.project.export_schema <output.json>", file=sys.stderr)
        return 2
    schema = Project.model_json_schema()
    schema["$id"] = "https://github.com/Arthur-LeoAI/MCDA-Tool-2.0/schemas/mcda-project-v2.json"
    schema["title"] = "MCDA project (format version 2)"
    text = json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    Path(argv[0]).write_text(text, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
