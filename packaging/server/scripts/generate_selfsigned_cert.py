"""Generate a self-signed TLS certificate for LAN Server (HTTPS/WSS + TOFU)."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def generate_cert(
    out_dir: Path,
    *,
    common_name: str = "nkdentalsoft-server.local",
    extra_hosts: list[str] | None = None,
    days: int = 825,
) -> dict[str, str]:
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError as exc:
        raise SystemExit(
            "cryptography is required: pip install cryptography"
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, common_name)]
    )
    alt_names: list[x509.GeneralName] = [x509.DNSName(common_name)]
    for h in extra_hosts or []:
        h = h.strip()
        if not h:
            continue
        try:
            alt_names.append(x509.IPAddress(ipaddress.ip_address(h)))
        except ValueError:
            alt_names.append(x509.DNSName(h))

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .sign(key, hashes.SHA256())
    )

    key_path = out_dir / "server.key"
    cert_path = out_dir / "server.crt"
    key_bytes = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    cert_bytes = cert.public_bytes(serialization.Encoding.PEM)
    key_path.write_bytes(key_bytes)
    cert_path.write_bytes(cert_bytes)
    fingerprint = hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    (out_dir / "fingerprint.sha256").write_text(fingerprint + "\n", encoding="utf-8")
    return {
        "key": str(key_path),
        "cert": str(cert_path),
        "fingerprint_sha256": fingerprint,
    }


def main(argv: list[str] | None = None) -> int:
    import os

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
        / "NKDentalSoft"
        / "certs",
    )
    parser.add_argument("--cn", default="nkdentalsoft-server.local")
    parser.add_argument("--host", action="append", default=[], help="Extra DNS/IP SAN")
    args = parser.parse_args(argv)
    info = generate_cert(args.out_dir, common_name=args.cn, extra_hosts=args.host)
    print(f"cert={info['cert']}")
    print(f"key={info['key']}")
    print(f"fingerprint_sha256={info['fingerprint_sha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
