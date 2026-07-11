"""FDI ↔ Universal (ADA) numbering conversion."""

from __future__ import annotations

# Permanent: Universal 1–32 ↔ FDI
FDI_TO_UNIVERSAL_PERM: dict[str, str] = {
    "18": "1", "17": "2", "16": "3", "15": "4", "14": "5", "13": "6", "12": "7", "11": "8",
    "21": "9", "22": "10", "23": "11", "24": "12", "25": "13", "26": "14", "27": "15", "28": "16",
    "38": "17", "37": "18", "36": "19", "35": "20", "34": "21", "33": "22", "32": "23", "31": "24",
    "41": "25", "42": "26", "43": "27", "44": "28", "45": "29", "46": "30", "47": "31", "48": "32",
}

# Primary: Universal A–T ↔ FDI
FDI_TO_UNIVERSAL_TEMP: dict[str, str] = {
    "55": "A", "54": "B", "53": "C", "52": "D", "51": "E",
    "61": "F", "62": "G", "63": "H", "64": "I", "65": "J",
    "75": "K", "74": "L", "73": "M", "72": "N", "71": "O",
    "81": "P", "82": "Q", "83": "R", "84": "S", "85": "T",
}

UNIVERSAL_TO_FDI: dict[str, str] = {
    **{v: k for k, v in FDI_TO_UNIVERSAL_PERM.items()},
    **{v: k for k, v in FDI_TO_UNIVERSAL_TEMP.items()},
    **{v.lower(): k for k, v in FDI_TO_UNIVERSAL_TEMP.items()},
}


def fdi_to_universal(pieza_fdi: str) -> str:
    p = str(pieza_fdi)
    return FDI_TO_UNIVERSAL_PERM.get(p) or FDI_TO_UNIVERSAL_TEMP.get(p) or p


def universal_to_fdi(codigo: str) -> str:
    return UNIVERSAL_TO_FDI.get(str(codigo).strip()) or UNIVERSAL_TO_FDI.get(str(codigo).strip().upper()) or codigo


def display_label(pieza_fdi: str, sistema: str = "fdi") -> str:
    if sistema == "universal":
        return fdi_to_universal(pieza_fdi)
    return str(pieza_fdi)
