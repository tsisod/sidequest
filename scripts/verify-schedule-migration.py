#!/usr/bin/env python3
import argparse
import json
import zipfile


def table(path, name):
    with zipfile.ZipFile(path) as archive:
        return {
            row['_id']: row
            for line in archive.read(f'{name}/documents.jsonl').splitlines()
            if line.strip()
            for row in [json.loads(line)]
        }


def verify(before_path, after_path):
    before = table(before_path, 'families')
    after = table(after_path, 'families')
    assert before.keys() == after.keys(), 'Family records changed during migration'
    assert table(before_path, 'capabilities') == table(after_path, 'capabilities'), 'Device connections changed'
    quests_checked = 0
    for row_id, old_row in before.items():
        new_row = after[row_id]
        assert old_row['code'] == new_row['code'], 'Pairing code changed'
        assert old_row['parentHash'] == new_row['parentHash'], 'Parent connection changed'
        old = old_row['family']
        new = new_row['family']
        assert new['version'] == 3, 'Family did not migrate'
        for key in ('id', 'code', 'childName', 'createdAt', 'screenMinutes'):
            assert old[key] == new[key], f'Family field changed: {key}'
        assert len(old['quests']) == len(new['quests']), 'Quest count changed'
        by_template = {quest['templateId']: quest for quest in new['quests']}
        templates = {template['id']: template for template in new['templates']}
        for quest in old['quests']:
            migrated = by_template[quest['id']]
            for key in ('title', 'xp', 'gold', 'place', 'status', 'submittedAt', 'approvedAt'):
                assert quest.get(key) == migrated.get(key), f'Quest field changed: {key}'
            assert migrated['id'] == f"{quest['id']}@{new['sessionDay']}", 'Dated identity mismatch'
            assert templates[quest['id']]['schedule'] == {'kind': 'once', 'date': new['sessionDay']}, 'Legacy schedule changed'
            quests_checked += 1
        assert (old['clock']['kind'] == 'blocked') == (new['clock']['kind'] == 'blocked'), 'Parent block changed'
        was_unlocked = bool(old['quests']) and all(quest['status'] == 'approved' for quest in old['quests'])
        assert was_unlocked == new['allowanceGranted'], 'Migration changed the daily grant state'
        if old['clock']['kind'] != 'running':
            assert new['clock']['remainingMs'] <= old['clock']['remainingMs'], 'Migration refilled screen time'
    print(f'PASS: {len(before)} families, {quests_checked} quest snapshots, and all device connections preserved.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Compare private Convex exports before and after the v3 task migration.')
    parser.add_argument('before')
    parser.add_argument('after')
    args = parser.parse_args()
    verify(args.before, args.after)
