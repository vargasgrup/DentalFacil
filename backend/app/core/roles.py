from enum import Enum


class Rol(str, Enum):
    ADMIN = "ADMIN"
    DOCTOR = "DOCTOR"
    ASISTENTE = "ASISTENTE"
    CAJERO = "CAJERO"


# Máximo de usuarios con rol ADMIN en el centro
MAX_ADMINS = 2

VALID_ROLES = frozenset(r.value for r in Rol)
