#!/usr/bin/env python3
"""Copy original Learnspace UI assets without modifying their bytes."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?', type=Path, default=Path.home() / 'Documents/learnspace/learnspace-app/frontend')
parser.add_argument('--check', action='store_true', help='Verify originals, imported files, and manifest without writing.')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.expanduser().resolve()
files = [
    ('src/game/ui/window-frame.svg', 'public/assets/learnspace-ui/window-frame.svg'),
    ('src/game/GameIcon.tsx', 'src/game/learnspace/GameIcon.tsx'),
    ('public/assets/terminal/icons/play.png', 'public/assets/learnspace-ui/play.png'),
    ('public/assets/terminal/icons/pause.png', 'public/assets/learnspace-ui/pause.png'),
    ('game-content/assets/characters/original/spark.png', 'public/assets/learnspace-ui/spark-sprite.png'),
    ('game-content/assets/characters/original/spark-preview.png', 'public/assets/learnspace-ui/spark-preview.png'),
    ('game-content/assets/portraits/spark.png', 'public/assets/learnspace-ui/spark-portrait.png'),
]
entries = []
for source_name, target_name in files:
    original = source / source_name
    target = root / target_name
    data = original.read_bytes()
    entries.append({'source': source_name, 'destination': target_name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    if args.check:
        if not target.is_file() or target.read_bytes() != data:
            raise SystemExit(f'Imported bytes differ: {target_name}')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != data:
            target.write_bytes(data)
manifest = {'source': 'Learnspace existing game UI', 'source_root': 'learnspace-app/frontend', 'assets': entries}
manifest_path = root / 'public/assets/learnspace-ui/manifest.json'
encoded = json.dumps(manifest, indent=2) + '\n'
if args.check:
    if not manifest_path.is_file() or manifest_path.read_text() != encoded:
        raise SystemExit('Learnspace UI manifest differs from the source assets.')
else:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(encoded)
print(f'{"Verified" if args.check else "Imported"} {len(entries)} original Learnspace UI files, byte-for-byte.')
