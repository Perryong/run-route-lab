import unittest
from scripts import health
class HealthTests(unittest.TestCase):
 def test_missing_values_are_not_zero_and_sensitive_fields_excluded(self):
  d=health.normalize('2026-09-15',{'totalSteps':0,'totalDistanceMeters':1250,'restingHeartRate':55,'displayName':'private'}, {'heartRateValues':[[1,60],[2,None],[3,0],[4,80]]})
  self.assertEqual(d['steps'],0);self.assertEqual(d['distance_m'],1250)
  self.assertEqual(d['average_hr_bpm'],70);self.assertNotIn('displayName',d)
  self.assertIsNone(health.normalize('2026-09-15',{}, {})['steps'])
 def test_seven_days_and_latest_day(self):
  class Client:
   def get_user_summary(self,date):return {'totalSteps':100}
   def get_heart_rates(self,date):return {}
  rows=health.collect(Client(),'2026-09-15')
  self.assertEqual(len(rows),7);self.assertEqual(rows[-1]['date'],'2026-09-15')
 def test_null_summary_uses_heart_endpoint(self):
  row=health.normalize('2026-09-15',{'restingHeartRate':None,'maxHeartRate':None},{'restingHeartRate':55,'maxHeartRate':160})
  self.assertEqual(row['resting_hr_bpm'],55);self.assertEqual(row['max_hr_bpm'],160)
 def test_connection_failure_propagates(self):
  from garminconnect import GarminConnectConnectionError
  class Client:
   def get_user_summary(self,date):raise GarminConnectConnectionError('Unavailable')
   def get_heart_rates(self,date):return {}
  with self.assertRaises(GarminConnectConnectionError):health.collect(Client(),'2026-09-15')
