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
   def get_sleep_data(self,date):return {}
   def get_stress_data(self,date):return {}
   def get_sleep_daily(self,start,end):return []
  rows=health.collect(Client(),'2026-09-15')
  self.assertEqual(len(rows),7);self.assertEqual(rows[-1]['date'],'2026-09-15')
 def test_null_summary_uses_heart_endpoint(self):
  row=health.normalize('2026-09-15',{'restingHeartRate':None,'maxHeartRate':None},{'restingHeartRate':55,'maxHeartRate':160})
  self.assertEqual(row['resting_hr_bpm'],55);self.assertEqual(row['max_hr_bpm'],160)
 def test_full_health_detail_is_normalized_without_private_ids(self):
  heart={'restingHeartRate':55,'minHeartRate':48,'maxHeartRate':160,'heartRateValues':[[1000,60],[2000,None],[3000,80]],'userProfilePK':123}
  sleep={'dailySleepDTO':{'id':9,'userProfilePK':123,'sleepStartTimestampGMT':100,'sleepEndTimestampGMT':200,'sleepStartTimestampLocal':300,'sleepEndTimestampLocal':400,'sleepTimeSeconds':28800,'napTimeSeconds':600,'deepSleepSeconds':3600,'lightSleepSeconds':18000,'remSleepSeconds':5400,'awakeSleepSeconds':1800,'avgHeartRate':52,'avgSleepStress':18,'averageRespirationValue':14.2,'sleepScores':{'overall':{'value':82,'qualifierKey':'GOOD'},'deepPercentage':{'value':17,'qualifierKey':'FAIR','optimalStart':20,'optimalEnd':30}},'sleepNeed':{'actual':30000,'baseline':28800,'deviceId':456,'userProfilePk':123},'sleepScoreFeedback':'POSITIVE'},'_daily':{'spO2':96,'skinTempC':.2,'sleepScoreQuality':'GOOD','deviceId':456},'sleepLevels':[{'startGMT':'1970-01-01T00:00:01Z','endGMT':'1970-01-01T00:00:02Z','activityLevel':2}],'sleepMovement':[{'startGMT':'1970-01-01T00:00:02Z','endGMT':'1970-01-01T00:00:03Z','activityLevel':1}],'sleepHeartRate':[{'startGMT':110,'value':51}],'sleepStress':[{'startGMT':110,'value':12}],'sleepBodyBattery':[{'startGMT':110,'value':61}],'hrvData':[{'startGMT':110,'value':45}],'avgOvernightHrv':44,'hrvStatus':'BALANCED','bodyBatteryChange':38}
  stress={'avgStressLevel':34,'maxStressLevel':76,'stressValuesArray':[[1000,20],[2000,-1],[3000,50]],'bodyBatteryValuesArray':[[1000,'MEASURED',61,1]],'userProfilePK':123}
  row=health.normalize('2026-09-15',{},heart,sleep,stress)
  self.assertEqual(row['heart_rate']['samples'],[[1000,60],[2000,None],[3000,80]])
  self.assertEqual(row['sleep']['scores']['overall'],{'value':82,'qualifier':'GOOD'})
  self.assertEqual(row['sleep']['sleep_need'],{'actual_s':30000,'baseline_s':28800})
  self.assertEqual(row['sleep']['heart_rate_samples'],[[110,51]])
  self.assertEqual(row['sleep']['levels'],[[1000,2000,2]]);self.assertEqual(row['sleep']['movement'],[[2000,3000,1]])
  self.assertEqual(row['sleep']['spo2_percent'],96);self.assertEqual(row['sleep']['skin_temp_c'],.2)
  self.assertEqual(row['stress']['samples'],[[1000,20],[2000,None],[3000,50]])
  self.assertEqual(row['stress']['body_battery_samples'],[[1000,'MEASURED',61,1]])
  self.assertNotIn('userProfilePK',str(row));self.assertNotIn('deviceId',str(row))
 def test_connection_failure_propagates(self):
  from garminconnect import GarminConnectConnectionError
  class Client:
   def get_sleep_daily(self,start,end):return []
   def get_sleep_data(self,date):return {}
   def get_stress_data(self,date):return {}
   def get_user_summary(self,date):raise GarminConnectConnectionError('Unavailable')
   def get_heart_rates(self,date):return {}
  with self.assertRaises(GarminConnectConnectionError):health.collect(Client(),'2026-09-15')
