#!/usr/bin/env python3
"""Prepare static Pages files only; never copy a database, credentials, or user data."""
import argparse
from pathlib import Path
import shutil
from prepare_assets import PACKAGES

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output')
    args = parser.parse_args()
    target = Path(args.output).resolve()
    if target.exists():
        raise SystemExit('Output must be a new directory; refusing to overwrite files.')
    if not (ROOT / 'vendor/manifest.json').is_file():
        raise SystemExit('Run python3 prepare_assets.py first.')
    target.mkdir(parents=True)
    shutil.copyfile(ROOT / 'index.html', target / 'index.html')
    (target / 'vendor').mkdir()
    for _, _, _, files in PACKAGES:
        for filename in files.values():
            shutil.copyfile(ROOT / 'vendor' / filename, target / 'vendor' / filename)
    shutil.copyfile(ROOT / 'vendor/manifest.json', target / 'vendor/manifest.json')
    (target / '.nojekyll').touch()
    print('Static site prepared:', target, '| no user data included')


if __name__ == '__main__':
    main()
