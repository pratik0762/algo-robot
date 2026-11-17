"""
ALGO ROBOT — Outbound Webhook SSRF Guard
Prevents Server-Side Request Forgery by ensuring outbound webhooks and HTTP
requests cannot target private networks, cloud metadata endpoints, or loopback interfaces.
"""

import ipaddress
import socket
from urllib.parse import urlparse
from app.config import settings


# Forbidden IP networks for outbound webhooks
PRIVATE_AND_RESERVED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),          # Loopback IPv4
    ipaddress.ip_network("::1/128"),              # Loopback IPv6
    ipaddress.ip_network("10.0.0.0/8"),           # RFC 1918 Private
    ipaddress.ip_network("172.16.0.0/12"),        # RFC 1918 Private
    ipaddress.ip_network("192.168.0.0/16"),       # RFC 1918 Private
    ipaddress.ip_network("169.254.0.0/16"),       # Link-Local / Cloud Metadata (AWS/GCP/Azure)
    ipaddress.ip_network("fe80::/10"),            # Link-Local IPv6
    ipaddress.ip_network("0.0.0.0/8"),            # Current network
    ipaddress.ip_network("100.64.0.0/10"),        # Carrier-grade NAT
    ipaddress.ip_network("224.0.0.0/4"),          # Multicast
    ipaddress.ip_network("240.0.0.0/4"),          # Reserved
]

DISALLOWED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "127.0.0.1",
    "::1",
    "metadata.google.internal",
    "instance-data",
}


def validate_outbound_url(url: str, allow_private: bool = False) -> str:
    """
    Validates a URL against SSRF vulnerabilities.
    Raises ValueError if URL points to a loopback, private, or metadata address.
    """
    if allow_private or settings.ALLOW_PRIVATE_IPS_IN_WEBHOOKS:
        return url

    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"SSRF Protection: Unsupported scheme '{scheme}'. Only HTTP and HTTPS are permitted.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("SSRF Protection: Invalid URL, missing hostname.")

    hostname_clean = hostname.lower().strip()
    if hostname_clean in DISALLOWED_HOSTNAMES:
        raise ValueError(f"SSRF Protection: Outbound connection to '{hostname_clean}' is prohibited.")

    # Resolve hostname to IP addresses
    try:
        addr_info = socket.getaddrinfo(hostname_clean, None)
    except socket.gaierror as e:
        raise ValueError(f"SSRF Protection: Could not resolve hostname '{hostname_clean}': {e}")

    for item in addr_info:
        ip_str = item[4][0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            for net in PRIVATE_AND_RESERVED_NETWORKS:
                if ip_obj in net:
                    raise ValueError(
                        f"SSRF Protection: Destination IP '{ip_str}' resolved from '{hostname_clean}' "
                        f"is in a protected private or loopback range ({net})."
                    )
        except ValueError:
            raise

    return url
