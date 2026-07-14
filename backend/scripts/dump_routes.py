"""Dump non-odontogram route inventory for docs sync."""
from __future__ import annotations

import ast
import pathlib

SKIP = {"odontogram.py", "periodontogram.py", "tooth_media.py"}
ROOT = pathlib.Path(__file__).resolve().parents[1] / "app" / "routers"


def route_prefix(node: ast.Call) -> str | None:
    for kw in node.keywords:
        if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
            return str(kw.value.value)
    return None


def main() -> None:
    for path in sorted(ROOT.glob("*.py")):
        if path.name in SKIP or path.name.startswith("_"):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        router_vars: dict[str, str] = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Name) and node.value.func.id == "APIRouter":
                    pref = route_prefix(node.value) or ""
                    for t in node.targets:
                        if isinstance(t, ast.Name):
                            router_vars[t.id] = pref

        print(f"\n## {path.name}")
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call):
                    continue
                func = dec.func
                if not isinstance(func, ast.Attribute):
                    continue
                if not isinstance(func.value, ast.Name):
                    continue
                router_name = func.value.id
                method = func.attr.upper()
                if router_name not in router_vars:
                    continue
                path_arg = ""
                if dec.args and isinstance(dec.args[0], ast.Constant):
                    path_arg = str(dec.args[0].value)
                full = router_vars[router_name] + path_arg
                print(f"| {method:6} | `{full}` | `{node.name}` |")


if __name__ == "__main__":
    main()
