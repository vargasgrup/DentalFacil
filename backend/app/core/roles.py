from enum import Enum


class Rol(str, Enum):
    ADMIN = "ADMIN"
    DOCTOR = "DOCTOR"
    ASISTENTE = "ASISTENTE"
