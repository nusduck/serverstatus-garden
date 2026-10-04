#!/usr/bin/env python3
"""Read-only ServerStatus sidecar. Python >=3.9, no third-party dependencies."""
import argparse
import contextlib
import fcntl
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time
import urllib.request

RETENTION = 7 * 86400 + 60
MAX_BYTES = 2 * 1024 * 1024
MAX_NODES = 256
RANGES = {'1h': (3600, 10), '24h': (86400, 240), '7d': (604800, 1680)}
CARRIERS = ('189', '10010', '10086')
STRINGS = {'name', 'alias', 'location', 'uptime'}
BOOLS = {'online4', 'online6', 'si'}
NUMBERS = {'latest_ts', 'cpu', 'memory_used', 'memory_total', 'hdd_used',
           'hdd_total', 'swap_used', 'swap_total', 'load_1', 'load_5', 'load_15',
           'network_rx', 'network_tx', 'network_in', 'network_out', 'tcp_count',
           'udp_count', 'process_count', 'thread_count'} | {
               prefix + carrier for prefix in ('ping_', 'time_') for carrier in CARRIERS}


def connect_db(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    db = sqlite3.connect(str(path), timeout=8)
    os.chmod(path, 0o640)
    db.execute('PRAGMA journal_mode=DELETE')
    db.execute('CREATE TABLE IF NOT EXISTS snapshots (updated INTEGER PRIMARY KEY, servers TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS checks (checked_at INTEGER NOT NULL, ok INTEGER NOT NULL, reason TEXT NOT NULL, source_updated INTEGER, source_gap INTEGER)')
    db.commit()
    return db


def finite(value):
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def validate(data, now):
    # Reject non-finite numbers even in fields not included in public output.
    def walk(obj, depth=0):
        if depth > 16:
            raise ValueError('payload nesting exceeds limit')
        if isinstance(obj, float) and not math.isfinite(obj):
            raise ValueError('non-finite number')
        if isinstance(obj, dict):
            for value in obj.values(): walk(value, depth+1)
        elif isinstance(obj, list):
            for value in obj: walk(value, depth+1)
    walk(data)
    if not isinstance(data, dict) or type(data.get('updated')) is not int:
        raise ValueError('invalid updated')
    ts = data['updated']
    if ts <= 0 or ts > now or now-ts > 60:
        raise ValueError('source timestamp future or stale')
    servers = data.get('servers')
    if not isinstance(servers, list) or len(servers) > MAX_NODES:
        raise ValueError('invalid server list')
    public, seen = [], set()
    for server in servers:
        if not isinstance(server, dict): raise ValueError('invalid server')
        name = server.get('name')
        if not isinstance(name, str) or not name or len(name) > 256 or name in seen:
            raise ValueError('invalid or duplicate node name')
        seen.add(name)
        node = {}
        for key in STRINGS:
            if key in server:
                if not isinstance(server[key], str) or len(server[key]) > 512:
                    raise ValueError('invalid public string')
                node[key] = server[key]
        for key in BOOLS:
            if key in server:
                if type(server[key]) is not bool: raise ValueError('invalid public boolean')
                node[key] = server[key]
        for key in NUMBERS:
            if key in server:
                value = server[key]
                if value is not None and not finite(value): raise ValueError('invalid public number')
                node[key] = value
        labels = server.get('labels', '')
        if isinstance(labels, str):
            match = re.search(r'(?:^|[,;\s])os=([A-Za-z0-9_.-]{1,64})(?=$|[,;\s])', labels)
            if match: node['labels'] = 'os=' + match.group(1)
        public.append(node)
    return ts, public


def quality(node, carrier, ts):
    latest = node.get('latest_ts')
    loss, latency = node.get('ping_'+carrier), node.get('time_'+carrier)
    valid = ((node.get('online4') is True or node.get('online6') is True)
             and finite(latest) and 0 <= ts-latest <= 60
             and finite(loss) and 0 <= loss <= 100
             and finite(latency) and latency > 0)
    return (loss, latency) if valid else None


def export_range(rows, name, now, collected_since):
    window, interval = RANGES[name]
    start = now-window
    buckets, raw_count, last_ts = {}, 0, None
    # Window-relative bins: [start+i*interval, start+(i+1)*interval).
    # Inclusive now is assigned to the final bin, so never a 361st bucket.
    # Streaming aggregation retains bucket/node states, never seven days of raw rows.
    for ts, nodes in rows:
        if not start <= ts <= now:
            continue
        raw_count += 1
        last_ts = ts
        index = min(359, (ts-start)//interval)
        bucket = buckets.setdefault(index, dict(count=0, updated=ts, nodes={}))
        bucket['count'] += 1
        bucket['updated'] = ts
        for raw_node in nodes:
            state = bucket['nodes'].setdefault(raw_node['name'], dict(node=None, stats={
                carrier:dict(max_loss=None,max_latency=None,count=0) for carrier in CARRIERS}))
            state['node'] = raw_node
            for carrier in CARRIERS:
                valid = quality(raw_node,carrier,ts)
                if valid is not None:
                    stat = state['stats'][carrier]
                    stat['count'] += 1
                    stat['max_loss'] = valid[0] if stat['max_loss'] is None else max(stat['max_loss'],valid[0])
                    stat['max_latency'] = valid[1] if stat['max_latency'] is None else max(stat['max_latency'],valid[1])
    samples = []
    for index, bucket in sorted(buckets.items()):
        servers = []
        for node_name, state in sorted(bucket['nodes'].items()):
            node = dict(state['node'])
            for stat in state['stats'].values():
                stat['missing'] = bucket['count']-stat['count']
            node['bucket_quality'] = state['stats']
            servers.append(node)
        samples.append(dict(updated=bucket['updated'], bucket_start=start+index*interval,
                            bucket_end=start+(index+1)*interval, count=bucket['count'], servers=servers))
    return dict(version=1, range=name, generated_at=now, start=start,
                end=last_ts, collected_since=collected_since,
                sample_count=raw_count, interval=interval, samples=samples)


def stage_file(output, name, content):
    fd, path = tempfile.mkstemp(prefix='.'+name+'-', dir=str(output))
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(path, 0o644)
        return Path(path)
    except BaseException:
        os.unlink(path)
        raise


def record_failure(db, now, reason):
    # Only stable reasons, never raw payloads/HTTP bodies/secrets.
    with db:
        db.execute('INSERT INTO checks VALUES (?,0,?,NULL,NULL)', (now, reason))
        db.execute('DELETE FROM checks WHERE checked_at < ?', (now-RETENTION,))


def collect(db_path, output, data, now=None):
    now = int(time.time()) if now is None else int(now)
    with contextlib.closing(connect_db(db_path)) as db:
        try:
            ts, nodes = validate(data, now)
        except ValueError:
            record_failure(db, now, 'validation_failed')
            raise
        previous = db.execute('SELECT MAX(updated) FROM snapshots').fetchone()[0]
        with db:
            inserted = db.execute('INSERT OR IGNORE INTO snapshots VALUES (?,?)',
                                  (ts,json.dumps(nodes, allow_nan=False, separators=(',',':')))).rowcount
            gap = ts-previous if previous is not None and ts > previous else None
            db.execute('INSERT INTO checks VALUES (?,1,?,?,?)',
                       (now,'inserted' if inserted else 'duplicate',ts,gap))
            db.execute('DELETE FROM snapshots WHERE updated < ?', (now-RETENTION,))
            db.execute('DELETE FROM checks WHERE checked_at < ?', (now-RETENTION,))
        db.execute('BEGIN')  # One immutable SQLite read snapshot for every range.
        first = db.execute('SELECT MIN(updated) FROM snapshots').fetchone()[0]
        documents = {}
        for name, (window, _) in RANGES.items():
            rows = ((ts,validate({'updated':ts,'servers':json.loads(raw)},ts)[1]) for ts,raw in db.execute(
                'SELECT updated,servers FROM snapshots WHERE updated >= ? AND updated <= ? ORDER BY updated',
                (now-window,now)))
            documents[name] = export_range(rows,name,now,first)
        db.commit()
        output = Path(output)
        output.mkdir(parents=True, exist_ok=True, mode=0o755)
        staged, backups, published = [], {}, []
        try:
            # Prepare every new file and rollback backup before publishing anything.
            for name, document in documents.items():
                content = json.dumps(document, allow_nan=False, separators=(',',':')).encode('utf-8')
                staged.append((name,stage_file(output,name,content)))
                target = output/(name+'.json')
                backups[name] = stage_file(output,name+'-backup',target.read_bytes()) if target.exists() else None
            for name, path in staged:
                os.replace(str(path), str(output/(name+'.json')))
                published.append(name)
            fd = os.open(str(output), os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
        except OSError:
            for name in reversed(published):
                backup = backups[name]
                if backup is None:
                    (output/(name+'.json')).unlink()
                else:
                    os.replace(str(backup), str(output/(name+'.json')))
            record_failure(db,now,'export_failed')
            raise
        finally:
            for path in [path for _,path in staged] + [path for path in backups.values() if path is not None]:
                if path.exists(): path.unlink()
        return documents


def fetch(source, timeout=8):
    if not source.startswith(('http://','https://')): raise ValueError('source must be HTTP(S)')
    request = urllib.request.Request(source, headers={'User-Agent':'ServerGardenHistory/1', 'Accept':'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read(MAX_BYTES+1)
    if len(raw) > MAX_BYTES: raise ValueError('source response too large')
    return json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-finite JSON')))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--once', action='store_true', required=True)
    args = parser.parse_args(argv)
    args.db.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    with open(str(args.db)+'.lock','a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('collector already running',file=sys.stderr)
            return 1
        try:
            data = fetch(args.source)
        except Exception:
            with contextlib.closing(connect_db(args.db)) as db:
                record_failure(db,int(time.time()),'fetch_failed')
            print('history fetch failed; existing exports preserved',file=sys.stderr)
            return 1
        try:
            documents = collect(args.db,args.output,data)
        except Exception:
            print('history collection/export failed; see checks table',file=sys.stderr)
            return 1
        print(json.dumps({name:{key:doc[key] for key in ('sample_count','collected_since','end','generated_at')} for name,doc in documents.items()}))
        return 0

if __name__ == '__main__': sys.exit(main())
