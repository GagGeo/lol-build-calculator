"""Stamp index.html's script links with a fingerprint of each file (app.js?v=1a2b3c4d5e).

A changed file gets a new address, so browsers never mix a cached old script with a new page.
Run by update.sh; scripts.test.js fails when a stamp is out of date.
"""
import hashlib
import pathlib
import re

root = pathlib.Path(__file__).parent
page = root / "index.html"


def stamp(match):
    name = match.group(1)
    digest = hashlib.sha1((root / name).read_bytes()).hexdigest()[:10]
    return f'<script src="{name}?v={digest}"></script>'


html = page.read_text(encoding="utf-8")
new = re.sub(r'<script src="([\w.-]+\.js)(?:\?v=\w+)?"></script>', stamp, html)
if new != html:
    page.write_text(new, encoding="utf-8")
    print("index.html: script fingerprints updated")
