#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app

cat > /app/analyze_modern.py <<'EOF'
from configparser import ConfigParser
import csv


def main() -> None:
    config = ConfigParser()
    config.read('/app/config.ini')
    stations = [station.strip() for station in config.get('analysis', 'stations').split(',')]
    totals = {station: [] for station in stations}

    with open('/app/data/climate.csv', newline='') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            station = row['station']
            if station in totals:
                totals[station].append(float(row['temperature']))

    for station in stations:
        values = totals[station]
        print(f'Station {station} mean temperature: {sum(values) / len(values):.1f}°C')


if __name__ == '__main__':
    main()
EOF

cat > /app/requirements.txt <<'EOF'
numpy>=1.0
pandas>=1.0
EOF