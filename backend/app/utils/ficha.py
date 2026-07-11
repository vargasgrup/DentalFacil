"""Display helpers for clinical file (ficha) numbers."""

FICHA_PREFIX = "FC"
FICHA_PAD = 5


def format_ficha_code(numero: int | None, pad: int = FICHA_PAD) -> str:
    if numero is None:
        return f"{FICHA_PREFIX}-{'-' * pad}"
    return f"{FICHA_PREFIX}-{int(numero):0{pad}d}"


def format_ficha_label(numero: int | None) -> str:
    return f"Ficha {format_ficha_code(numero)}"


def parse_ficha_query(term: str) -> int | None:
    """Extract numeric ficha from user input (5, 00005, FC-00005, fc 5)."""
    raw = term.strip().upper().replace(" ", "")
    if raw.startswith(f"{FICHA_PREFIX}-"):
        raw = raw[len(FICHA_PREFIX) + 1 :]
    elif raw.startswith(FICHA_PREFIX):
        raw = raw[len(FICHA_PREFIX) :]
    raw = raw.lstrip("0") or "0"
    if raw.isdigit():
        return int(raw)
    return None
