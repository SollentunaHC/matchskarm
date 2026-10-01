#!/usr/bin/env python3
"""Eliteprospects profiles and season stats, through the official authenticated API."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
import unicodedata
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'laguppstallning/spelarinfo.json'
TEAM_ID = 494
SEASON = '2026-2027'
PREVIOUS = '2025-2026'
API = 'https://api.eliteprospects.com/v1'


def name_key(name):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD', name.casefold())
                           if not unicodedata.combining(c) and (c.isalnum() or c.isspace())).split())


def numeric(value):
    if value is None or value == '-' or isinstance(value, bool):
        return None
    try:
        number = int(value)
        return number if number >= 0 else None
    except (ValueError, TypeError):
        return None


def previous_teams(rows):
    teams = []
    for row in rows:
        if row.get('season', {}).get('slug') != PREVIOUS or row.get('statsType') == 'projected':
            continue
        team = row.get('team') or {}
        if team.get('teamType') and team['teamType'] != 'club':
            continue
        counts = [numeric((row.get(key) or {}).get('GP')) for key in ('regularStats', 'postseasonStats')]
        if not any(count is not None and count > 0 for count in counts):
            continue
        name = row.get('teamName') or team.get('name')
        if name and name not in teams:
            teams.append(name)
    return teams


def stats_for_player(rows, player_id):
    selected = [row for row in rows if str((row.get('player') or {}).get('id')) == str(player_id)
                and (row.get('season') or {}).get('slug') == SEASON
                and str((row.get('team') or {}).get('id')) == str(TEAM_ID)
                and row.get('statsType') != 'projected'
                and str((row.get('league') or {}).get('slug', row.get('leagueName', ''))).casefold() == 'hockeyettan']
    if len(selected) > 1:
        raise ValueError('Ambiguous season statistics for player ' + str(player_id))
    stats = (selected[0].get('regularStats') or {}) if selected else {}
    return {'GP': numeric(stats.get('GP')), 'G': numeric(stats.get('G')),
            'A': numeric(stats.get('A')), 'TP': numeric(stats.get('PTS', stats.get('TP')))}


class Client:
    def __init__(self, key):
        self.key = key
        self.last_request = 0

    def get(self, path, **query):
        # Stay within the documented Explorer allowance of 10 calls per minute.
        delay = 6.1 - (time.monotonic() - self.last_request)
        if delay > 0:
            time.sleep(delay)
        self.last_request = time.monotonic()
        request = Request(API + path + ('?' + urlencode(query) if query else ''),
                          headers={'X-Api-Key': self.key, 'Accept': 'application/json'})
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except HTTPError as exc:
            # Never print the key, response body or request headers.
            raise RuntimeError('Eliteprospects API HTTP ' + str(exc.code)) from None

    def rows(self, path, **query):
        records = []
        offset = 0
        while True:
            result = self.get(path, offset=offset, limit=100, **query)
            page = result.get('data')
            if not isinstance(page, list):
                raise ValueError('Unexpected Eliteprospects response format')
            records.extend(page)
            total = (result.get('_meta') or {}).get('totalRecords')
            if not page or (total is not None and len(records) >= total) or len(page) < 100:
                return records
            offset += len(page)


def write(payload):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    temp.replace(OUTPUT)


def update():
    now = datetime.now(timezone.utc)
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'players': []}
    payload = dict(old, season=SEASON, previousSeason=PREVIOUS, team='Sollentuna HC', teamId=TEAM_ID,
                   attemptedAt=now.isoformat(), source='https://www.eliteprospects.com/team/494/sollentuna-hc')
    key = os.environ.get('EP_API_KEY', '').strip()
    if not key:
        if old.get('status') == 'needs_api_key':
            print('Eliteprospects: EP_API_KEY saknas. Sparade uppgifter behålls.')
            return
        payload.update(status='needs_api_key', message='Automatisk uppdatering väntar på EP_API_KEY.')
        write(payload)
        print('Eliteprospects: EP_API_KEY saknas. Sparade uppgifter behålls.')
        return
    if old.get('status') == 'ready' and old.get('updatedAt', '').startswith(now.date().isoformat()):
        print('Eliteprospects already updated today.')
        return
    api = Client(key)
    try:
        roster = api.rows('/teams/494/roster', season=SEASON, fields='player.*,jerseyNumber')
        season_stats = api.rows('/teams/494/player-stats', season=SEASON, statsType='default')
        if not roster:
            raise ValueError('No Sollentuna roster returned for ' + SEASON)
        cache = {str(player['id']): player for player in old.get('players', []) if player.get('id')}
        players = []
        history_access = True
        warnings = []
        for entry in roster:
            player = entry.get('player') or {}
            player_id = player.get('id')
            if not player_id or not player.get('name'):
                raise ValueError('Roster player lacks stable ID or name')
            previous = cache.get(str(player_id), {})
            history_checked = previous.get('historyCheckedAt', '')
            age = (now - datetime.fromisoformat(history_checked)).days if history_checked else 999
            if (age >= 30 or previous.get('previousSeason') != PREVIOUS) and history_access:
                try:
                    history = api.rows('/players/' + str(player_id) + '/stats', season=PREVIOUS, statsType='default')
                    former = previous_teams(history)
                    history_checked = now.isoformat()
                except RuntimeError as exc:
                    if str(exc) != 'Eliteprospects API HTTP 403':
                        raise
                    history_access = False
                    warnings.append('API-access to season ' + PREVIOUS + ' is missing; current profiles and stats still updated.')
                    former = previous.get('previousTeams', [])
            else:
                former = previous.get('previousTeams', [])
            birthday = player.get('dateOfBirth')
            birth_year = int(birthday[:4]) if birthday and len(birthday) >= 4 and birthday[:4].isdigit() else None
            players.append({'id': player_id, 'name': player['name'], 'nameKey': name_key(player['name']),
                            'number': str(entry['jerseyNumber']) if entry.get('jerseyNumber') is not None else None,
                            'dateOfBirth': birthday, 'birthYear': birth_year,
                            'youthTeam': player.get('youthTeam'), 'previousSeason': PREVIOUS,
                            'previousTeams': former, 'stats': stats_for_player(season_stats, player_id),
                            'source': 'https://www.eliteprospects.com/player/' + str(player_id),
                            'historyCheckedAt': history_checked, 'updatedAt': now.isoformat()})
        payload.update(players=players, status='ready', updatedAt=now.isoformat(), message=None, warnings=warnings)
        write(payload)
        print('Updated Eliteprospects information for ' + str(len(players)) + ' players.')
    except Exception as exc:
        payload.update(status='error', message=str(exc))
        write(payload)
        raise


if __name__ == '__main__':
    update()
