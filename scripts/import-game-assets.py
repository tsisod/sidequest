from hashlib import sha256
from pathlib import Path
from struct import unpack
from zipfile import ZipFile
import json
import sys

source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'ssh-xfer'
target = Path(__file__).resolve().parents[1] / 'public' / 'assets' / 'farm'
target.mkdir(parents=True, exist_ok=True)
for stale in target.glob('*.png'):
    stale.unlink()
packs = {
    'FULL VERSION Farm - 4 Seasons 16x16 Tileset by antarcticbees.zip': {
        'tilesets/farm_spring_summer.png': 'farm-spring.png',
        'tilesets/farm_autumn.png': 'farm-autumn.png',
        'tilesets/farm_winter.png': 'farm-winter.png',
        'tilesets/crops.png': 'crops.png',
        'windmill animations/windmill_spring_summerSheet.png': 'windmill-spring.png',
        'windmill animations/windmill_autumn-Sheet.png': 'windmill-autumn.png',
        'windmill animations/windmill_winter-Sheet.png': 'windmill-winter.png',
        'fence gate animations/gate_spring_summer_autumn-Sheet.png': 'gate.png',
        'fence gate animations/gate_winter-Sheet.png': 'gate-winter.png',
        **{f'farmer/standing idle/character_idle_{d}.png': f'farmer-idle-{d}.png' for d in ['down', 'up', 'left', 'right']},
        **{f'farmer/walk/character_walk_{d}-Sheet.png': f'farmer-walk-{d}.png' for d in ['down', 'up', 'left', 'right']},
    },
    'FULL VERSION NPC - Characters by antarcticbees.zip': {
        'idle/angler_idle.png': 'angler.png',
        'idle/dog_idle.png': 'dog.png',
        'idle/girl1_idle_with_basket.png': 'girl1-basket.png',
        'idle/girl2_idle.png': 'girl2.png',
        'idle/old_man_idle.png': 'old-man.png',
        'idle/smith_idle.png': 'smith.png',
        'other/spritesheet format/angler_fishing_left-Sheet.png': 'angler-fishing-left.png',
        'other/spritesheet format/smith_anvil-Sheet.png': 'smith-anvil.png',
        'other/spritesheet format/old_man_cane_tap-Sheet.png': 'old-man-cane.png',
        'other/spritesheet format/girl2_butterfly-Sheet.png': 'butterfly.png',
        'other/spritesheet format/dog_tail-Sheet.png': 'dog-tail.png',
    },
}
manifest = []
for archive, entries in packs.items():
    with ZipFile(source / archive) as pack:
        for entry, name in entries.items():
            data = pack.read(entry)
            if data[:8] != b'\x89PNG\r\n\x1a\n':
                raise ValueError(f'Expected PNG: {entry}')
            width, height = unpack('>II', data[16:24])
            (target / name).write_bytes(data)
            manifest.append({'file': name, 'archive': archive, 'entry': entry, 'width': width, 'height': height, 'sha256': sha256(data).hexdigest()})
(target / 'manifest.json').write_text(json.dumps({'artist': 'antarcticbees', 'assets': manifest}, indent=2) + '\n')
print(f'Imported {len(manifest)} original PNG files into {target}')
