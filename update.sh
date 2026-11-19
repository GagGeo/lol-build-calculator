#!/bin/sh
# One command after each patch: refresh data, then run every check.
# Usage: ./update.sh            (latest patch)
#        ./update.sh 16.24.1    (a specific patch)
cd "$(dirname "$0")" || exit 1
python3 prep.py "$@" || exit 1
python3 stamp.py || exit 1
python3 -m unittest -q test_prep || exit 1
if ! python3 check.py; then
  echo
  echo "Something needs your attention (see REVIEW / assertion lines above)."
  echo "REVIEW lines: edit rules.py, then run ./update.sh again. The report is in data/."
  exit 1
fi
node --test || exit 1
patch=$(python3 -c "import json;print(json.loads(open('data.js').read()[len('window.DATA = '):].rstrip().rstrip(';'))['patch'])")
echo
echo "All good — patch $patch ready. Open index.html."
