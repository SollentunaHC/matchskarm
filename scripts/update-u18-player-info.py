#!/usr/bin/env python3
"""No API key: saved EP biographies plus public Swehockey season statistics."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import html
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import Request, urlopen
from match_times import due_checkpoint, ZONE

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'u18/spelarinfo.json'
PROFILES = ROOT / 'u18/spelarprofiler.json'
SEASON = '2026-2027'
PREVIOUS = '2025-2026'
BASE = 'https://stats.swehockey.se'
STATS_URL = BASE + '/Teams/Info/PlayersByTeam/21274'
ROSTER_URL = BASE + '/Teams/Info/TeamRoster/21274'
TEAM = 'Sollentuna HC'


def name_key(name):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD', name.casefold())
                           if not unicodedata.combining(c) and (c.isalnum() or c.isspace())).split())


def text(markup):
    return ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', markup)).split())


def full_name(value):
    parts = value.split(',', 1)
    if len(parts) != 2 or not all(part.strip() for part in parts):
        raise ValueError('Unexpected player name: ' + value)
    return parts[1].strip() + ' ' + parts[0].strip()


def number(value):
    if value in ('', '-', 'N/A'):
        return None
    if not re.fullmatch(r'\d+', value):
        raise ValueError('Invalid statistic: ' + value)
    return int(value)


def download(url):
    with urlopen(Request(url, headers={'User-Agent': 'SollentunaHC-matchskarm/1.0'}), timeout=35) as response:
        return response.read().decode('utf-8-sig')


def team_rows(markup, anchor):
    if not re.search(r'<option[^>]*selected[^>]*>\s*2026-27\s*</option>', markup):
        raise ValueError('Swehockey season is not 2026-27')
    if 'U18H Allettan Östra' not in text(markup):
        raise ValueError('Wrong Swehockey competition')
    match = re.search(r'<a\b[^>]*id="' + re.escape(anchor) + r'"[^>]*>', markup)
    if not match:
        raise ValueError('Sollentuna section not found')
    section = re.split(r'<a\b[^>]*id=', markup[match.end():], maxsplit=1)[0]
    rows = [[text(cell) for cell in re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>', row, re.S | re.I)]
            for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', section, re.S | re.I)]
    if not rows or TEAM not in rows[0]:
        raise ValueError('Wrong team heading')
    return rows


def parse_roster(markup):
    headers = None
    players = {}
    for cells in team_rows(markup, 'SOL'):
        if 'Birthdate' in cells and 'Name' in cells:
            headers = cells
            continue
        if not headers or len(cells) != len(headers):
            continue
        row = dict(zip(headers, cells))
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['Birthdate']):
            continue
        datetime.strptime(row['Birthdate'], '%Y-%m-%d')
        name = full_name(row['Name'])
        key = name_key(name)
        if key in players:
            raise ValueError('Duplicate roster player: ' + name)
        players[key] = {'name': name, 'number': row['No'], 'position': row['Position'],
                        'dateOfBirth': row['Birthdate'], 'birthYear': int(row['Birthdate'][:4]),
                        'youthTeam': row.get('Youth club') or None}
    if not 15 <= len(players) <= 60:
        raise ValueError('Unexpected Sollentuna roster size')
    return players


def parse_stats(markup):
    headers = None
    players = {}
    goalie_games = {}
    for cells in team_rows(markup, TEAM):
        if 'Name' in cells and ('GP' in cells or 'GPI' in cells):
            headers = cells
            continue
        if not headers or len(cells) != len(headers):
            continue
        row = dict(zip(headers, cells))
        if not row.get('No', '').isdigit() or ',' not in row.get('Name', ''):
            continue
        name = full_name(row['Name'])
        key = name_key(name)
        if 'GPT' in headers:
            if key in goalie_games:
                raise ValueError('Duplicate goalie statistics')
            goalie_games[key] = number(row['GPI'])
            continue
        if key in players:
            raise ValueError('Duplicate statistics: ' + name)
        stats = {label: number(row[label]) for label in ('GP', 'G', 'A', 'TP')}
        if None not in (stats['G'], stats['A'], stats['TP']) and stats['G'] + stats['A'] != stats['TP']:
            raise ValueError('Points do not equal goals plus assists: ' + name)
        players[key] = {'name': name, 'number': row['No'], 'position': row['Pos'], 'stats': stats}
    # GP in the playing table counts dressed games for goalies. GPI counts appearances,
    # matching the meaning of GP on Eliteprospects. Do not use GAA or SV% as G/A.
    for key, player in players.items():
        if player['position'] == 'GK':
            if key not in goalie_games:
                raise ValueError('Missing goalie appearance count')
            player['stats']['GP'] = goalie_games[key]
    if not players:
        raise ValueError('No Sollentuna playing statistics found')
    return players


def write(payload):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(OUTPUT)


def update(force=False):
    now = datetime.now(timezone.utc)
    profiles_raw = PROFILES.read_bytes()
    profile_data = json.loads(profiles_raw)
    if profile_data.get('season') != SEASON or profile_data.get('previousSeason') != PREVIOUS:
        raise ValueError('Profile season does not match the configured season')
    digest = hashlib.sha256(profiles_raw).hexdigest()
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'players': []}
    spec = importlib.util.spec_from_file_location('lineup_schedule', ROOT / 'scripts/update-u18-lineup.py')
    schedule_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(schedule_module)
    games = schedule_module.parse_csv((ROOT / 'Spelschema_2627.csv').read_text(encoding='utf-8-sig'))
    completed = dict(old.get('playerChecks', {}))
    local_now = now.astimezone(ZONE)
    slots = [slot for game in games if (slot := due_checkpoint(game, 'players', local_now, completed))]
    if not force and not slots:
        print('No player presentation checkpoint due.')
        return
    for slot in slots:
        completed[slot['key']] = dict(slot, result='attempted')
    stamp = now.isoformat()
    payload = dict(old, team=TEAM, season=SEASON, previousSeason=PREVIOUS, attemptedAt=stamp,
                   mode='saved_profiles_swehockey', source=STATS_URL, playerChecks=completed)
    try:
        profiles = {}
        for profile in profile_data['players']:
            aliases = profile.get('aliases', [])
            key = name_key(aliases[0] if aliases else profile['name'])
            if key in profiles:
                raise ValueError('Duplicate saved profile: ' + profile['name'])
            profiles[key] = profile
        roster = parse_roster(download(ROSTER_URL))
        stats = parse_stats(download(STATS_URL))
        # Players who left the roster may still have season statistics. Keep their
        # named statistics without inventing DOB, youth club or an EP identity.
        players = []
        for key in sorted(set(roster) | set(profiles) | set(stats)):
            saved = profiles.get(key)
            listed = roster.get(key)
            counted = stats.get(key)
            if saved and listed and saved.get('dateOfBirth') != listed.get('dateOfBirth'):
                raise ValueError('Profile birthday does not match roster: ' + saved['name'])
            identity = saved or listed or counted
            player = dict(saved or {})
            player.update(name=identity['name'], nameKey=key,
                          number=(counted or listed or {}).get('number'),
                          position=(counted or listed or {}).get('position'),
                          stats=counted['stats'] if counted else {k: None for k in ('GP', 'G', 'A', 'TP')},
                          statsSource=STATS_URL, statsUpdatedAt=stamp, updatedAt=stamp)
            if not saved:
                player.update(dateOfBirth=(listed or {}).get('dateOfBirth'), birthYear=(listed or {}).get('birthYear'),
                              youthTeam=(listed or {}).get('youthTeam'), previousSeason=PREVIOUS, previousTeams=[],
                              source=ROSTER_URL if listed else STATS_URL, profileSourceLabel='Swehockey', profileCheckedAt=stamp)
            else:
                player['profileSourceLabel'] = 'Eliteprospects'
            players.append(player)
        for slot in slots:
            completed[slot['key']]['result'] = 'updated'
        payload.update(players=players, status='ready', updatedAt=stamp, message=None,
                       profileDigest=digest, profileCount=len(profiles), statisticsCount=len(stats))
        write(payload)
        print('Updated ' + str(len(profiles)) + ' saved profiles and ' + str(len(stats)) +
              ' Swehockey statistics records. No API key needed.')
    except Exception as exc:
        payload.update(status='error', message=str(exc))
        write(payload)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    update(parser.parse_args().force)
