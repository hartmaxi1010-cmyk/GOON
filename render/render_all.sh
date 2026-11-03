#!/bin/bash
# Rendert das komplette Video in N parallelen Segmenten (echte 60 fps, keine Interpolation)
set -e
cd /home/user/GOON/render
N=${N:-3}
TOTAL=$(python3 -c "import json,math;print(math.ceil(json.load(open('../build/timeline.json'))['duration']*60))")
STEP=$(( (TOTAL + N - 1) / N ))
for i in $(seq 0 $((N-1))); do
  A=$((i*STEP)); B=$(( (i+1)*STEP )); [ $B -gt $TOTAL ] && B=$TOTAL
  node capture.js video $A $B ../build/segments/seg_$i.mp4 > ../build/segments/log_$i.txt 2>&1 &
done
wait
ls ../build/segments/seg_*.mp4 | sort -V | sed "s|^|file '|; s|$|'|" > ../build/segments/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i ../build/segments/list.txt -c copy ../build/video_nosound.mp4
echo FERTIG
