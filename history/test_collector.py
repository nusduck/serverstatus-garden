"""Contract tests; stdlib only, fixtures never enter production history."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.find_spec('collector')
if SPEC:
    import collector
else:
    collector = None

NOW = 1800000000

def payload(ts=NOW, **changes):
    node = dict(name='n1', alias='Node', location='us', online4=True,
                online6=False, latest_ts=ts, cpu=3, si=False,
                labels='os=debian,password=SECRET', ping_189=2, time_189=100,
                ping_10010=0, time_10010=50, ping_10086=0, time_10086=80,
                custom='SECRET', token='SECRET')
    node.update(changes)
    return dict(updated=ts, servers=[node])

class Contract(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(collector, 'Collector behavior is not implemented')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'private' / 'history.sqlite'
        self.out = Path(self.tmp.name) / 'public'

    def run_payload(self, data, now=NOW):
        return collector.collect(self.db, self.out, data, now=now)

    def exported(self, name='1h'):
        return json.loads((self.out / (name + '.json')).read_text())

    def test_dedup_and_public_contract(self):
        self.run_payload(payload())
        self.run_payload(payload())
        result = self.exported()
        self.assertEqual(result['sample_count'], 1)
        self.assertEqual(result['version'], 1)
        self.assertEqual(result['interval'], 10)
        self.assertEqual(result['collected_since'], NOW)
        node = result['samples'][0]['servers'][0]
        self.assertIs(node['si'], False)
        self.assertEqual(node['labels'], 'os=debian')
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertNotIn('custom', node)
        self.assertEqual(node['bucket_quality']['189']['count'], 1)
        for name, interval in [('1h',10),('24h',240),('7d',1680)]:
            self.assertEqual(self.exported(name)['interval'], interval)

    def test_worst_quality_last_real_and_no_gap_fill(self):
        self.run_payload(payload(NOW-300, ping_189=70, time_189=900), NOW-300)
        self.run_payload(payload(NOW-299, cpu=9, ping_189=0, time_189=10), NOW-299)
        self.run_payload(payload(), NOW)
        result = self.exported('24h')
        first = result['samples'][0]['servers'][0]
        self.assertEqual(first['cpu'], 9)
        q = first['bucket_quality']['189']
        self.assertEqual(q['max_loss'], 70)
        self.assertEqual(q['max_latency'], 900)
        short = self.exported()
        self.assertEqual(len(short['samples']), 2)
        self.assertEqual(short['samples'][0]['updated'], NOW-299)
        self.assertEqual(short['samples'][0]['servers'][0]['cpu'], 9)

    def test_unknown_offline_stale_and_zero_latency(self):
        for changes in [dict(online4=False, online6=False), dict(latest_ts=NOW-61), dict(time_189=0), dict(time_189=-1), dict(ping_189=101)]:
            with self.subTest(changes=changes):
                self.run_payload(payload(**changes))
                q = self.exported()['samples'][0]['servers'][0]['bucket_quality']['189']
                self.assertEqual(q, dict(max_loss=None,max_latency=None,count=0,missing=1))
                # Remove snapshot to exercise next variation at the same timestamp.
                with sqlite3.connect(str(self.db)) as db:
                    db.execute('DELETE FROM snapshots')

    def test_node_union_counts_absence_as_missing(self):
        self.run_payload(payload(NOW-1), NOW-1)
        p = payload(); p['servers'][0]['name'] = 'n2'
        self.run_payload(p)
        nodes = self.exported('24h')['samples'][0]['servers']
        self.assertEqual({n['name'] for n in nodes}, {'n1','n2'})
        self.assertTrue(all(n['bucket_quality']['189']['missing'] == 1 for n in nodes))

    def test_invalid_payload_leaves_good_exports_and_records_failure(self):
        self.run_payload(payload())
        before = {p.name:p.read_bytes() for p in self.out.glob('*.json')}
        bad = [payload(NOW-61), payload(NOW+1), dict(updated=NOW,servers='bad'), payload(cpu=float('nan')), payload(cpu=float('inf')), dict(updated=True,servers=[]), dict(updated=NOW,servers=[{'name':'a'},{'name':'a'}])]
        for item in bad:
            with self.subTest(item=item):
                with self.assertRaises(ValueError): self.run_payload(item)
                self.assertEqual(before, {p.name:p.read_bytes() for p in self.out.glob('*.json')})
        with sqlite3.connect(str(self.db)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM checks WHERE ok=0').fetchone()[0], len(bad))

    def test_exports_whitelist_even_existing_database_rows(self):
        with collector.connect_db(self.db) as db:
            db.execute('INSERT INTO snapshots VALUES (?,?)', (NOW-1,json.dumps(payload(NOW-1)['servers'])))
        self.run_payload(dict(updated=NOW,servers=[]))
        result = self.exported('24h')
        self.assertNotIn('SECRET',json.dumps(result))
        node = result['samples'][0]['servers'][0]
        self.assertNotIn('custom',node)
        self.assertEqual(node['labels'],'os=debian')

    def test_extreme_integer_is_validation_failure_not_overflow(self):
        error = None
        try:
            self.run_payload(payload(cpu=10**400))
        except Exception as exc:
            error = exc
        self.assertIsInstance(error, ValueError)
        with sqlite3.connect(str(self.db)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM checks WHERE ok=0').fetchone()[0], 1)

    def test_prune_and_empty_snapshot(self):
        old = NOW-7*86400-61
        self.run_payload(payload(old), old)
        self.run_payload(dict(updated=NOW,servers=[]))
        result = self.exported('7d')
        self.assertEqual(result['sample_count'], 1)
        self.assertEqual(result['samples'][0]['servers'], [])
        with sqlite3.connect(str(self.db)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM snapshots').fetchone()[0],1)

    def test_boundary_max_360_buckets(self):
        with collector.connect_db(self.db) as db:
            for ts in range(NOW-3600, NOW+1, 10):
                db.execute('INSERT INTO snapshots VALUES (?,?)',(ts,json.dumps(payload(ts)['servers'])))
        self.run_payload(payload(), now=NOW+3)
        result = self.exported()
        self.assertLessEqual(len(result['samples']),360)
        self.assertEqual(result['start'], NOW+3-3600)
        self.assertEqual(result['end'],NOW)

    def test_publication_failure_rolls_back_all_good_exports(self):
        self.run_payload(payload())
        before = {p.name:p.read_bytes() for p in self.out.glob('*.json')}
        replace = os.replace
        calls = []
        def fail_second(source, target):
            calls.append(1)
            if len(calls) == 2: raise OSError('injected rename failure')
            return replace(source,target)
        with patch.object(collector.os,'replace',side_effect=fail_second):
            with self.assertRaises(OSError): self.run_payload(payload(NOW+1),NOW+1)
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.out.glob('*.json')})

    def test_atomic_prepare_failure_does_not_replace_any_export(self):
        self.run_payload(payload())
        before = {p.name:p.read_bytes() for p in self.out.glob('*.json')}
        original = collector.stage_file
        calls = []
        def broken(*args):
            calls.append(1)
            if len(calls)==2: raise OSError('disk full')
            return original(*args)
        with patch.object(collector,'stage_file',side_effect=broken):
            with self.assertRaises(OSError): self.run_payload(payload(NOW+1),NOW+1)
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.out.glob('*.json')})

if __name__ == '__main__': unittest.main()
