#!/usr/bin/env python3
"""Download pinned browser parsers, verifying npm SHA-512 before extracting files."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
PACKAGES = [
    ('pdfjs-dist', '3.11.174', 'TdTZPf1trZ8/UFu5Cx/GXB7GZM30LT+wWUNfsi6Bq8ePLnb+woNKtDymI2mxZYBpMbonNFqKmiz684DIfnd8dA==', {'build/pdf.min.js': 'pdf.min.js', 'build/pdf.worker.min.js': 'pdf.worker.min.js', 'LICENSE': 'pdf.LICENSE'}),
    ('mammoth', '1.6.0', 'jOwbj6BwJzxCf6jr2l1zmSemniIkLnchvELXnDJCANlJawhzyIKObIq48B8kWEPLgUUh57k7FtEO3DHFQMnjMg==', {'mammoth.browser.min.js': 'mammoth.browser.min.js', 'LICENSE': 'mammoth.LICENSE'}),
    ('xlsx', '0.18.5', 'dmg3LCjBPHZnQp5/F/+nnTa+miPJxUXB6vtk42YjBBKayDNagxGEeIdWApkYPOf3Z3pm3k62Knjzp7lMeTEtFQ==', {'dist/xlsx.full.min.js': 'xlsx.full.min.js', 'LICENSE': 'xlsx.LICENSE'}),
    ('docx', '8.5.0', '4SbcbedPXTciySXiSnNNLuJXpvxFe5nqivbiEHXyL8P/w0wx2uW7YXNjnYgjW0e2e6vy+L/tMISU/oAiXCl57Q==', {'build/index.umd.js': 'docx.umd.js', 'LICENSE': 'docx.LICENSE'}),
]


def main():
    vendor = ROOT / 'vendor'
    vendor.mkdir(exist_ok=True)
    for name, version, digest, files in PACKAGES:
        with urlopen(f'https://registry.npmjs.org/{name}/-/{name}-{version}.tgz', timeout=90) as response:
            data = response.read()
        if base64.b64encode(hashlib.sha512(data).digest()).decode() != digest:
            raise RuntimeError('Checksum mismatch: ' + name)
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for source, destination in files.items():
                # Never extract a tar path directly to the filesystem.
                content = archive.extractfile('package/' + source)
                if content is None:
                    raise RuntimeError('Missing file: ' + source)
                (vendor / destination).write_bytes(content.read())
        print('Verified:', name, version, flush=True)
    (vendor / 'manifest.json').write_text(json.dumps({name: version for name, version, _, _ in PACKAGES}, indent=2) + '\n')


if __name__ == '__main__':
    main()
