"""Match-relative checkpoints, always in Europe/Stockholm."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ZONE = ZoneInfo('Europe/Stockholm')


def start_time(game):
    return datetime.fromisoformat(game['date'] + 'T' + game['time']).replace(tzinfo=ZONE)


def checkpoints(game, kind):
    start = start_time(game)
    if kind == 'lineup':
        times = [start - timedelta(minutes=minutes) for minutes in range(59, 0, -5)]
    elif kind == 'players':
        times = [start.replace(hour=6, minute=0), start.replace(hour=12, minute=0),
                 start - timedelta(minutes=90)]
    else:
        raise ValueError('Unknown checkpoint type')
    return sorted(set(times))


def due_checkpoint(game, kind, now, completed):
    now = now.astimezone(ZONE)
    start = start_time(game)
    if start.date() != now.date() or (kind == 'lineup' and now >= start):
        return None
    reached = [stamp for stamp in checkpoints(game, kind) if stamp <= now]
    if not reached:
        return None
    # A delayed run performs the latest reached check, not a burst of obsolete checks.
    stamp = reached[-1]
    key = '|'.join([game['matchNumber'], start.isoformat(), kind, stamp.isoformat()])
    if key in completed:
        return None
    return {'key': key, 'scheduledAt': stamp.isoformat(), 'checkedAt': now.isoformat()}
