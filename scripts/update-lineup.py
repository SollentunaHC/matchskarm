#!/usr/bin/env python3
"""Fetch the A-team home schedule and published Sollentuna lineups. Stdlib only."""
import argparse
import csv
from datetime import datetime, timedelta
import html
import io
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from zoneinfo import ZoneInfo
from match_times import due_checkpoint

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'laguppstallning/data.json'
BASE = 'https://stats.swehockey.se'
SCHEDULE = BASE + '/ScheduleAndResults/Schedule/21043'
SCREEN_URL = 'https://raw.githubusercontent.com/SollentunaHC/matchskarm/main/nyindex_tizen.html'
TEAM = 'Sollentuna HC'


class MatchUnavailable(ValueError):
    pass


def text(markup):
    return ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', markup)).split()).lstrip('\ufeff')


def download(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'SollentunaHC-matchskarm/1.0'}), timeout=35) as response:
                return response.read().decode('utf-8-sig')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def parse_csv(content):
    rows = list(csv.reader(io.StringIO(content.lstrip('\ufeff')), delimiter=';'))
    rows = [row for row in rows if any(value.strip() for value in row)]
    if not rows:
        raise ValueError('Empty CSV')
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', rows[0][0].strip()):
        headers = ['Speldatum', 'Tid', 'Veckodag', 'Matchnr', 'Omgång', 'Hemma', 'Borta', 'Arena', 'Serie', 'Resultat', 'Publik', 'Information']
        data_rows = rows
    else:
        headers = [value.strip() for value in rows[0]]
        data_rows = rows[1:]
    required = {'Speldatum', 'Tid', 'Matchnr', 'Hemma', 'Borta', 'Arena', 'Serie'}
    if not required.issubset(headers):
        raise ValueError('CSV headers changed; expected Speldatum, Tid, Matchnr, Hemma, Borta, Arena, Serie')
    games = []
    for values in data_rows:
        row = {key: (values[i] if i < len(values) else '').strip() for i, key in enumerate(headers)}
        if 'hockeyettan' not in row['Serie'].casefold() or TEAM not in (row['Hemma'], row['Borta']):
            continue
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['Speldatum']) or not re.fullmatch(r'\d{2}:\d{2}', row['Tid']):
            raise ValueError('Invalid date or time in Hockeyettan CSV row')
        datetime.strptime(row['Speldatum'] + ' ' + row['Tid'], '%Y-%m-%d %H:%M')
        if not re.fullmatch(r'\d+', row['Matchnr']):
            raise ValueError('Missing or invalid Matchnr in Hockeyettan CSV row')
        game_id = next((row[key] for key in ['GameID', 'GameId', 'gameId', 'SwehockeyID'] if row.get(key)), None)
        if game_id and not re.fullmatch(r'\d+', game_id):
            raise ValueError('Invalid GameID in CSV')
        series = re.sub(r'\[[0-9]+\]', '', row['Serie'])
        series = re.sub(r'\s*,\s*(?:Stockholms Ishockeyförbund|Region Öst)\s*', '', series, flags=re.I).strip()
        games.append({'date': row['Speldatum'], 'time': row['Tid'], 'home': row['Hemma'],
                      'away': row['Borta'], 'venue': row['Arena'], 'matchNumber': row['Matchnr'],
                      'competition': series, 'gameId': game_id})
    if not games:
        raise ValueError('No Sollentuna Hockeyettan games found in CSV')
    return sorted(games, key=lambda game: (game['date'], game['time']))


def screen_config(source):
    def variable(name):
        match = re.search(r'\b(?:var|const|let)\s+' + name + r'\s*=\s*[\"\']([^\"\']+)[\"\']', source)
        if not match or not match[1].startswith('https://'):
            raise ValueError('Missing screen configuration: ' + name)
        return match[1]
    mapping = re.search(r'\bSWEHOCKEY_ID_MAP\s*=\s*\{(.*?)\}', source, re.S)
    known_ids = dict(re.findall(r'[\"\'](\d+)[\"\']\s*:\s*[\"\'](\d+)[\"\']', mapping[1])) if mapping else {}
    return {'csv': variable('CSV_URL'), 'live': variable('LIVE_RESULT_PROXY'),
            'check': variable('MATCH_CHECK_URL'), 'knownIds': known_ids}


def resolve_worker_game_id(game, config):
    # Same direct-ID fallback and query fields as loadLiveResult() in nyindex_tizen.html.
    direct = game.get('gameId') or config['knownIds'].get(game['matchNumber'])
    values = {'match': direct or game['matchNumber'], 'series': game.get('competition', '')}
    if not direct:
        values.update(date=game['date'], home=game['home'], away=game['away'])
    values['nocache'] = str(int(time.time() * 1000))
    url = urlsplit(config['live'])
    query = dict(parse_qsl(url.query))
    query.update(values)
    result = json.loads(download(urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), ''))))
    if result.get('error'):
        if str(result['error']).startswith('Hittade inte '):
            raise MatchUnavailable(str(result['error']))
        raise ValueError('Existing worker: ' + str(result['error']))
    game_id = str(result.get('gameId', ''))
    if not re.fullmatch(r'\d+', game_id):
        raise ValueError('Existing worker returned no gameId')
    for key, expected in [('scheduledDate', game['date']), ('homeTeam', game['home']), ('awayTeam', game['away'])]:
        actual = result.get(key)
        if actual and text(str(actual)).casefold() != text(expected).casefold():
            raise ValueError('Worker game does not match CSV: ' + key)
    return game_id


def resolve_schedule_game_id(game):
    markup = download(SCHEDULE)
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', markup, re.S | re.I):
        if not re.search(r'title=["\']' + re.escape(game['matchNumber']) + r'["\']', row):
            continue
        if game['home'] not in text(row) or game['away'] not in text(row):
            raise ValueError('Schedule match identity does not match CSV')
        ids = set(re.findall(r'/Game/(?:Events|LineUps|GamePreview)/(\d+)', row))
        if len(ids) == 1:
            return ids.pop()
    # Unplayed games may only have their GameID on today's Live page.
    if game['date'] == datetime.now(ZoneInfo('Europe/Stockholm')).date().isoformat():
        live = download(SCHEDULE.replace('/Schedule/', '/Live/'))
        if not re.search(r'Last update:.*?' + re.escape(game['date']), text(live)):
            raise MatchUnavailable('Live page is not dated for this match')
        pattern = (re.escape(game['home']) + r'.{0,1000}?/Game/Events/(\d+)'
                   + r'.{0,500}?' + re.escape(game['time'])
                   + r'.{0,500}?' + re.escape(game['away']))
        ids = set(re.findall(pattern, html.unescape(live), re.S))
        if len(ids) == 1:
            return ids.pop()
    raise MatchUnavailable('Match-ID är ännu inte tillgängligt i Swehockeys spelschema eller Live.')


def resolve_game_id(game, config):
    try:
        return resolve_worker_game_id(game, config)
    except Exception as worker_error:
        print('Worker lookup failed; trying Swehockey directly:', worker_error)
        return resolve_schedule_game_id(game)


def check_future_game(game, config):
    # Same requestFutureMatchCheck() call as the screen; future games need no scoreboard yet.
    values = {'date': game['date'], 'time': game['time'], 'home': game['home'],
              'away': game['away'], 'series': game.get('competition', ''),
              'nocache': str(int(time.time() * 1000))}
    url = urlsplit(config['check'])
    result = json.loads(download(urlunsplit((url.scheme, url.netloc, url.path, urlencode(values), ''))))
    if result.get('ok') is not True:
        raise MatchUnavailable(str(result.get('error') or 'Matchen kunde inte verifieras på Swehockey ännu.'))


def parse_lineup(markup):
    # Team headings occur after the scoreboard. Select the Sollentuna table explicitly.
    heading = re.search(r'<h3[^>]*>\s*Sollentuna HC\s*\([^<]*\)\s*</h3>', markup, re.I)
    if not heading:
        return None
    section = markup[heading.end():]
    # U20 has a nested coach table before the players. Stop at the next team
    # heading, not at the first closing table.
    section = re.split(r'<h3\b', section, maxsplit=1, flags=re.I)[0]
    lines = {str(i): {'forwards': [], 'defenders': []} for i in range(1, 5)}
    goalies = []
    group = None
    first_row = False
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', section, re.S | re.I):
        label = re.search(r'([1-4])(?:st|nd|rd|th) Line', row)
        if label:
            group = label[1]
            first_row = True
        elif 'Goalies' in row:
            group = 'goalies'
        players = []
        for raw in re.findall(r'<div\b[^>]*class="lineUpPlayer[^\"]*"[^>]*>(.*?)</div>', row, re.S | re.I):
            player = re.fullmatch(r'(\d+)\.\s*(.+?),\s*(.+)', text(raw))
            if not player:
                raise ValueError('Unrecognized player entry')
            players.append({'number': player[1], 'lastName': player[2], 'firstName': player[3]})
        if group == 'goalies':
            goalies.extend(players)
        elif group and players:
            lines[group]['defenders' if first_row else 'forwards'].extend(players)
            first_row = False
    coaches = {}
    for label, key in [('Head Coach', 'head'), ('Assistant Coach', 'assistant')]:
        match = re.search(label + r':\s*</strong>(.*?)(?:</td>|</tr>)', section, re.S | re.I)
        if match:
            raw = text(match[1])
            parts = raw.split(',', 1)
            coaches[key] = (parts[1].strip() + ' ' + parts[0].strip()) if len(parts) == 2 else raw
    count = len(goalies) + sum(len(v['forwards']) + len(v['defenders']) for v in lines.values())
    if count == 0:
        return None
    if not goalies or not any(v['forwards'] for v in lines.values()):
        raise ValueError('Incomplete or unexpected lineup structure')
    return {'lines': lines, 'goalies': goalies, 'coaches': coaches,
            'source': BASE + '/Game/LineUps/'}


def build(force=False):
    now = datetime.now(ZoneInfo('Europe/Stockholm'))
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'games': []}
    pending = any(due_checkpoint(g, 'lineup', now, g.get('lineupChecks', {})) for g in old.get('games', []))
    if not force and not pending and old.get('scheduleCheckedAt', '').startswith(now.date().isoformat()):
        print('No lineup checkpoint due; daily schedule already checked.')
        return
    config = screen_config(download(SCREEN_URL))
    csv_games = parse_csv(download(config['csv']))
    # Read the exact same CSV and resolve IDs through the existing screen worker.
    home_games = [g for g in csv_games if g['home'] == TEAM]
    if not home_games or len({g['matchNumber'] for g in csv_games}) != len(csv_games):
        raise ValueError('Missing home matches or duplicate match numbers')
    if len(home_games) < len(old.get('games', [])) * 0.8:
        raise ValueError('Unexpectedly many home matches missing; retaining previous file')
    cache = {g['matchNumber']: g for g in old.get('games', [])}
    errors = []
    for game in home_games:
        previous = cache.get(game['matchNumber'], {})
        if any(game[key] != previous.get(key) for key in ['date', 'time', 'home', 'away']):
            previous = {}
        # Retain a previously discovered ID for this exact match identity.
        game['gameId'] = game['gameId'] or previous.get('gameId')
        game['lineup'] = previous.get('lineup')
        game['checkedAt'] = previous.get('checkedAt')
        game['status'] = previous.get('status', 'published' if game['lineup'] else 'unpublished')
        game['lineupChecks'] = dict(previous.get('lineupChecks', {}))
        slot = due_checkpoint(game, 'lineup', now, game['lineupChecks'])
        manual_refresh = force and game['date'] <= now.date().isoformat()
        if slot or manual_refresh:
            if slot:
                game['lineupChecks'][slot['key']] = dict(slot, result='attempted')
            try:
                if game['date'] > now.date().isoformat() and not (game['gameId'] or config['knownIds'].get(game['matchNumber'])):
                    check_future_game(game, config)
                    game['checkedAt'] = now.isoformat()
                    continue
                game['gameId'] = resolve_game_id(game, config)
                roster = parse_lineup(download(BASE + '/Game/LineUps/' + game['gameId']))
                game['checkedAt'] = now.isoformat()
                if roster:
                    roster['source'] += game['gameId']
                    game['lineup'] = roster
                    game['status'] = 'published'
                    if slot:
                        game['lineupChecks'][slot['key']]['result'] = 'published'
                else:
                    # Do not advertise a cached roster as newly confirmed.
                    game['status'] = 'stale' if game['lineup'] else 'unpublished'
            except MatchUnavailable as exc:
                game['status'] = 'stale' if game['lineup'] else 'unresolved'
                game['resolutionMessage'] = str(exc)
                errors.append(game['matchNumber'] + ': ' + str(exc))
            except Exception as exc:
                game['status'] = 'stale' if game['lineup'] else 'error'
                errors.append(game['matchNumber'] + ': ' + str(exc))
    demo = old.get('demo')
    if not demo or force:
        demo_game = next((dict(g) for g in csv_games if g['matchNumber'] == '90255365'), None)
        if not demo_game:
            demo_game = {'date': '2026-09-25', 'time': '19:00', 'home': 'Strömsbro IF',
                         'away': TEAM, 'venue': 'Testebo Arena', 'gameId': '1113118', 'matchNumber': '90255365'}
        demo_game['gameId'] = resolve_game_id(demo_game, config)
        demo_game['lineup'] = parse_lineup(download(BASE + '/Game/LineUps/' + demo_game['gameId']))
        if not demo_game['lineup']:
            raise ValueError('Test game has no readable Sollentuna lineup')
        demo_game['lineup']['source'] += demo_game['gameId']
        demo_game.update(status='published', checkedAt=now.isoformat())
        demo = demo_game
    payload = {'team': TEAM, 'competition': 'Hockeyettan Norra', 'season': '2026–2027',
               'scheduleUrl': SCHEDULE, 'csvUrl': config['csv'], 'configurationSource': SCREEN_URL,
               'workerUrl': config['live'], 'scheduleCheckedAt': now.isoformat(),
               'games': home_games, 'demo': demo, 'errors': errors}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    print(f'Updated {len(home_games)} home matches; {len(errors)} retrieval errors.')
    if errors:
        print('\n'.join(errors))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    build(parser.parse_args().force)
