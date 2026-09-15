import io
import unittest
import zipfile
from datetime import datetime, timezone
from scripts import routes

GPX = b'''<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Home run</name><trkseg>
<trkpt lat="1.3" lon="103.8"><ele>10</ele><time>2026-09-01T00:00:00Z</time></trkpt>
<trkpt lat="1.301" lon="103.8"><ele>14</ele><time>2026-09-01T00:01:00Z</time></trkpt>
</trkseg><trkseg><trkpt lat="1.4" lon="103.8"><time>2026-09-01T00:02:00Z</time></trkpt>
<trkpt lat="1.401" lon="103.8"><time>2026-09-01T00:03:00Z</time></trkpt></trkseg></trk></gpx>'''

class RouteTests(unittest.TestCase):
    def test_gpx_keeps_segments_without_counting_gap(self):
        a = routes.parse_export(GPX, 'run.gpx')[0]
        self.assertEqual(len(a['segments']), 2)
        self.assertAlmostEqual(a['distance_m'], 222.39, delta=1)
        self.assertEqual(a['duration_s'], 180)
        self.assertEqual(a['date'], '2026-09-01')

    def test_rejects_bad_coordinates(self):
        with self.assertRaises(ValueError):
            routes.parse_export(GPX.replace(b'lat="1.3"', b'lat="nan"'), 'bad.gpx')

    def test_endpoint_reentry_is_removed_and_lines_split(self):
        points = [[0, x, 0, i*10] for i,x in enumerate([0,.003,.004,.0001,.005,.007,.01])]
        a = {'id':'x','name':'My home','date':'2026-09-01','distance_m':2000,'duration_s':800,'segments':[points],'tokens':'secret'}
        p = routes.public_activity(a, 200)
        self.assertEqual([len(s) for s in p['segments']], [2,2])
        self.assertNotIn('tokens',p)
        self.assertNotIn('My home', str(p))
        self.assertEqual(p['distance_m'],2000)
        self.assertTrue(p['route_trimmed'])

    def test_short_run_has_no_route_but_keeps_stats(self):
        a = routes.parse_export(GPX, 'run.gpx')[0]
        a['segments'] = [a['segments'][0]]
        self.assertEqual(routes.public_activity(a,200)['segments'],[])

    def test_zip_rejects_traversal(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w') as z:z.writestr('../run.gpx',GPX)
        with self.assertRaises(ValueError):routes.parse_export(b.getvalue(),'run.zip')

    def test_zip_import(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w') as z:z.writestr('run.gpx',GPX)
        self.assertEqual(len(routes.parse_export(b.getvalue(),'run.zip')),1)

    def test_fit_record_normalization(self):
        a=routes.from_fit_records([
            {'position_lat':int(1.3*2**31/180),'position_long':int(103.8*2**31/180),'timestamp':datetime(2026,9,1,tzinfo=timezone.utc),'altitude':10},
            {'position_lat':int(1.301*2**31/180),'position_long':int(103.8*2**31/180),'timestamp':datetime(2026,9,1,0,1,tzinfo=timezone.utc),'altitude':12},
        ], {'total_distance':120,'total_timer_time':55,'sport':'running'}, 'fit-id')
        self.assertAlmostEqual(a['segments'][0][0][0],1.3,places=5)
        self.assertEqual(a['duration_s'],55)
        self.assertEqual(a['distance_m'],120)

    def test_xml_entity_is_not_expanded(self):
        with self.assertRaises(Exception):
            routes.parse_export(b'<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>','bad.gpx')

if __name__=='__main__':unittest.main()
