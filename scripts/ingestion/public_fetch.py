"""Bounded public HTTP fetch for trusted ingestion workers. Never follows private redirects."""
import http.client
import ipaddress
import socket
import ssl
import urllib.parse


def fetch_public(url, max_bytes=1500000, timeout=10):
    for _ in range(5):
        target = urllib.parse.urlsplit(url)
        if target.scheme not in ('https', 'http') or not target.hostname or target.username or target.password:
            raise ValueError('Unsupported public URL')
        port = target.port or (443 if target.scheme == 'https' else 80)
        if port not in (80, 443):
            raise ValueError('Unsupported public port')
        addresses = {item[4][0] for item in socket.getaddrinfo(target.hostname, port, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(a).is_global for a in addresses):
            raise ValueError('Nonpublic destination rejected')
        # Pin the checked address while keeping the original Host and TLS name.
        conn = http.client.HTTPConnection(target.hostname, port, timeout=timeout)
        conn.sock = socket.create_connection((sorted(addresses)[0], port), timeout=timeout)
        try:
            if target.scheme == 'https':
                conn.sock = ssl.create_default_context().wrap_socket(conn.sock, server_hostname=target.hostname)
            conn.request('GET', urllib.parse.urlunsplit(('', '', target.path or '/', target.query, '')), headers={'User-Agent': 'CollegeStat/1.0 (public university source verification)', 'Accept-Encoding': 'identity'})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                destination = urllib.parse.urljoin(url, response.getheader('Location') or '')
                if target.scheme == 'https' and not destination.startswith('https://'):
                    raise ValueError('HTTPS downgrade rejected')
                url = destination
                continue
            if response.status != 200:
                raise ValueError('HTTP ' + str(response.status))
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise ValueError('Response exceeds size limit')
            return body, url, response.getheader('Content-Type') or ''
        finally:
            conn.close()
    raise ValueError('Too many redirects')
