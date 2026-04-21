The legacy Python 2 script at `/app/legacy/analyze.py` does not run on current Python.

Create a modern replacement at `/app/analyze_modern.py`.

Requirements:
- Do not modify `/app/legacy/analyze.py`.
- Read `/app/data/climate.csv` and `/app/config.ini`.
- Print one line per configured station in this exact format: `Station {id} mean temperature: {value:.1f}°C`.
- Process both configured stations.
- Create `/app/requirements.txt` that lists at least `pandas` and `numpy` with version constraints.

Use current Python syntax only.