#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/legacy /app/data

cat > /app/legacy/analyze.py <<'EOF'
import csv
import ConfigParser

config = ConfigParser.ConfigParser()
config.read('config.ini')
stations = [item.strip() for item in config.get('analysis', 'stations').split(',')]
rows = {}
for station in stations:
    rows[station] = []

with open('data/climate.csv', 'rb') as handle:
    reader = csv.DictReader(handle)
    for row in reader:
        if row['station'] in rows:
            rows[row['station']].append(float(row['temperature']))

for station in stations:
    values = rows[station]
    print 'Station %s mean temperature: %.1f°C' % (station, sum(values) / len(values))
EOF

cat > /app/data/climate.csv <<'EOF'
station,temperature
101,18
101,20
101,22
102,16
102,18
102,20
EOF

cat > /app/config.ini <<'EOF'
[analysis]
stations = 101, 102
EOF
