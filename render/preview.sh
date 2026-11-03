#!/bin/bash
# Nutzung: ./preview.sh <name> <t1,t2,...>  -> build/preview/<name>/*.png + build/preview/<name>.jpg (Kontaktabzug)
set -e
D=/home/user/GOON/build/preview/$1; mkdir -p "$D"
node /home/user/GOON/render/capture.js stills "$2" "$D" | grep -v "^still" || true
montage $(ls "$D"/*.png | sort -V) -tile 5x -geometry 270x480+3+3 -background '#222' "/home/user/GOON/build/preview/$1.jpg"
