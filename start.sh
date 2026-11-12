#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "http://127.0.0.1:5173"
python -m http.server 5173
