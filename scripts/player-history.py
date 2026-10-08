"""Public Eliteprospects season history; verified against Swehockey birthdays."""
from datetime import datetime, timedelta, timezone
import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen


def page(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 SollentunaHC-matchskarm'}), timeout=25) as response:
        markup = response.read().decode('utf-8')
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', markup, re.S)
    if not match:
        raise ValueError('Public profile data unavailable')
    return json.loads(html.unescape(match[1]))['props']['pageProps']


def enrich(players, old, team_id, name_key, force=False):
    now = datetime.now(timezone.utc)
    previous = {p.get('nameKey', name_key(p['name'])): p for p in old.get('players', [])}
    due = []
    for player in players:
        cached = previous.get(player['nameKey'], {})
        if not player.get('dateOfBirth') and cached.get('historyCheckedAt'):
            player['dateOfBirth'] = cached.get('dateOfBirth')
            player['birthYear'] = cached.get('birthYear')
        if cached.get('dateOfBirth') == player.get('dateOfBirth'):
            for field in ('previousTeams', 'historySource', 'historyCheckedAt', 'historyStatus'):
                if field in cached:
                    player[field] = cached[field]
        stamp = player.get('historyCheckedAt')
        if stamp and not force:
            try:
                if now - datetime.fromisoformat(stamp) < timedelta(days=7):
                    continue
            except ValueError:
                pass
        due.append(player)
    if not due:
        return []
    warnings = []
    try:
        entries = page('https://www.eliteprospects.com/team/' + str(team_id) + '/-/2026-2027')['rosterList']['tableData']['edges']
    except Exception as exc:
        return ['History roster: ' + str(exc)]

    # Individually verified public profiles: departed players and a spelling alias.
    identities = {
        (494, 'wilmer svensson'): ('398120', '2001-09-12', '/player/398120/wilmer-svensson'),
        (1440, 'filip olsson'): ('897539', '2008-06-20', '/player/897539/filip-olsson'),
        (2172, 'stradlin karlstrom hernandez'): ('1109180', '2010-05-11', '/player/1109180/stradlin-karlstrom'),
    }

    def fetch(player):
        try:
            names = [player['name']] + player.get('aliases', [])
            matches = [e['player'] for e in entries if
                       e['player'].get('dateOfBirth') == player.get('dateOfBirth') and
                       (any(name_key(e['player']['name']) == name_key(n) for n in names) or
                        str(e.get('jerseyNumber')) == str(player.get('number')))]
            if player.get('id'):
                matches = [e['player'] for e in entries if str(e['player']['id']) == str(player['id'])
                           and e['player'].get('dateOfBirth') == player.get('dateOfBirth')]
            verified = identities.get((team_id, player['nameKey']))
            if not matches and verified and player.get('dateOfBirth') in (None, verified[1]):
                matches = [{'id': verified[0], 'dateOfBirth': verified[1], 'eliteprospectsUrlPath': verified[2]}]
            if len(matches) != 1:
                raise ValueError('No unique verified identity')
            candidate = matches[0]
            url = 'https://www.eliteprospects.com' + candidate['eliteprospectsUrlPath']
            data = page(url)
            identity = data['playerData']['player']
            if str(identity['id']) != str(candidate['id']) or identity['dateOfBirth'] != candidate['dateOfBirth']:
                raise ValueError('Profile identity mismatch')
            player.update(dateOfBirth=identity['dateOfBirth'], birthYear=int(identity['dateOfBirth'][:4]))
            rows = data['initialLeagueStats']['playerStats']['edges']
            teams = list(dict.fromkeys(r['teamName'] for r in rows if r['season']['slug'] == '2025-2026'))
            player.update(previousTeams=teams, historySource=url, historyCheckedAt=now.isoformat(),
                          historyStatus='verified' if teams else 'no_history')
            player['youthTeam'] = identity.get('youthTeam') or player.get('youthTeam')
            return None
        except Exception as exc:
            player['historyStatus'] = 'cached' if player.get('previousTeams') else 'unavailable'
            return player['name'] + ': ' + str(exc)
    with ThreadPoolExecutor(max_workers=3) as pool:
        warnings.extend(result for result in pool.map(fetch, due) if result)
    return warnings
