#!/usr/bin/env python3
"""Update all three teams serially. Keep healthy teams updating if one fails."""
import subprocess
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
failed = []
for name in ['update-lineup.py', 'update-player-info.py', 'update-u20-lineup.py',
             'update-u20-player-info.py', 'update-u18-lineup.py', 'update-u18-player-info.py']:
    print('\nUpdating ' + name, flush=True)
    command = [sys.executable, str(root / 'scripts' / name)]
    if '--force' in sys.argv:
        command.append('--force')
    result = subprocess.run(command, cwd=root)
    if result.returncode:
        failed.append(name)
if failed:
    print('Failed: ' + ', '.join(failed), file=sys.stderr)
    sys.exit(1)
