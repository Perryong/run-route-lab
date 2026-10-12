import tempfile
import unittest
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from scripts import state, sync

class SyncTests(unittest.TestCase):
    def test_encryption_roundtrip_and_wrong_key_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'state.enc';key=Fernet.generate_key().decode()
            value={'tokens':'sensitive','activities':{'7':{'segments':[[[1,103,0,0]]]}}}
            state.save(path,key,value)
            self.assertNotIn(b'sensitive',path.read_bytes())
            self.assertEqual(state.load(path,key),value)
            with self.assertRaises(InvalidToken):state.load(path,Fernet.generate_key().decode())

    def test_existing_activity_is_not_downloaded_again(self):
        class Client:
            def get_activities(self,start,limit,activitytype):
                return [{'activityId':7,'activityName':'edited name','distance':1200,'duration':500,'startTimeLocal':'2026-09-01 07:00:00'}] if start==0 else []
            def download_activity(self,*a,**k):raise AssertionError('Unnecessary download')
        data={'activities':{'7':{'id':'7','segments':[]}},'tokens':'x'}
        sync.collect(Client(),data,100,delay=0)
        self.assertEqual(data['activities']['7']['distance_m'],1200)
        self.assertEqual(data['activities']['7']['name'],'edited name')

    def test_failed_download_does_not_add_partial_record(self):
        class Client:
            def get_activities(self,**kw):return [{'activityId':8}]
            def download_activity(self,*a,**k):raise RuntimeError('network error')
        data={'activities':{},'tokens':'x'}
        with self.assertRaises(RuntimeError):sync.collect(Client(),data,1,delay=0)
        self.assertEqual(data['activities'],{})

    def test_refresh_token_persisted_when_fetch_fails(self):
        class Inner:
            def dumps(self):return 'new-token'
        class Client:
            client=Inner()
            def login(self,tokens):pass
            def get_activities(self,**kw):raise RuntimeError('fetch failed')
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'state.enc';key=Fernet.generate_key().decode()
            state.save(path,key,{'tokens':'old-token','activities':{}})
            with self.assertRaises(RuntimeError):sync.run(path,key,None,Path(d)/'public.json',client=Client())
            self.assertEqual(state.load(path,key)['tokens'],'new-token')
            self.assertFalse((Path(d)/'public.json').exists())

if __name__=='__main__':unittest.main()

class LoginFailureTests(unittest.TestCase):
    def test_rotated_session_survives_post_login_profile_failure(self):
        class Inner:
            def dumps(self):return '{"di_token":"new-access","di_refresh_token":"rotated"}'
        class Client:
            client=Inner()
            def login(self,tokens):raise RuntimeError('Profile endpoint unavailable after token refresh')
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'state.enc';key=Fernet.generate_key().decode()
            old={'tokens':'old','activities':{'7':{'id':'7'}}};state.save(path,key,old)
            with self.assertRaises(RuntimeError):sync.run(path,key,None,Path(d)/'public.json',client=Client())
            restored=state.load(path,key)
            self.assertIn('rotated',restored['tokens'])
            self.assertEqual(restored['activities'],old['activities'])

class HealthPersistenceTests(unittest.TestCase):
    def test_history_persists_and_failed_refresh_preserves_snapshot_and_output(self):
        import json
        from unittest.mock import patch
        from scripts import health
        real_collect=health.collect
        class Client:
            fail=False
            client=None
            def __init__(self):self.client=self
            def dumps(self):return 'refreshed-token'
            def login(self,tokens):pass
            def get_activities(self,**kw):return []
            def get_sleep_daily(self,start,end):return []
            def get_sleep_data(self,day):return {}
            def get_stress_data(self,day):return {}
            def get_heart_rates(self,day):return {}
            def get_user_summary(self,day):
                if self.fail and day=='2026-01-08':raise RuntimeError('network failure')
                return {'totalSteps':123}
        client=Client()
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.enc';output=Path(folder)/'activities.json'
            key=Fernet.generate_key().decode()
            state.save(path,key,{'tokens':'old','activities':{},'health':[{'date':'2026-01-01','steps':99}]})
            with patch.object(health,'collect',side_effect=lambda client,**kw:real_collect(client,end='2026-01-10',delay=0,**kw)):
                sync.run(path,key,None,output,client=client,include_health=True)
                saved=state.load(path,key)
                public=json.loads(output.with_name('health.json').read_text())
                self.assertEqual(len(public['days']),10)
                self.assertEqual(public['days'],saved['health'])
                self.assertEqual(public['days'][0],{'date':'2026-01-01','steps':99})
                before=output.with_name('health.json').read_bytes()
                client.fail=True
                with self.assertRaises(RuntimeError):sync.run(path,key,None,output,client=client,include_health=True)
                self.assertEqual(state.load(path,key)['health'],saved['health'])
                self.assertEqual(output.with_name('health.json').read_bytes(),before)
                self.assertEqual(state.load(path,key)['tokens'],'refreshed-token')
