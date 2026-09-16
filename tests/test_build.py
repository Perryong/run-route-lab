import unittest
from scripts import build


class BuildTests(unittest.TestCase):
 def test_health_allowlist_accepts_measurements_and_rejects_unknown_fields(self):
  day={'date':'2026-09-15','steps':1,'distance_m':2,'resting_hr_bpm':3,'average_hr_bpm':4,'max_hr_bpm':5,'status':'available',
       'heart_rate':{'resting_bpm':3,'minimum_bpm':2,'maximum_bpm':5,'samples':[[1,4]]},
       'sleep':{'total_s':10,'spo2_percent':96,'scores':{'overall':{'value':82,'qualifier':'GOOD'}},'sleep_need':{},'next_sleep_need':{},'levels':[],'movement':[],'restless_moments':[],'respiration_samples':[],'respiration_averages':[],'heart_rate_samples':[],'stress_samples':[],'body_battery_samples':[],'hrv_samples':[],'breathing_disruptions':[]},
       'stress':{'average_level':20,'maximum_level':40,'samples':[[1,20]],'body_battery_samples':[]}}
  build.validate_health({'schema_version':1,'days':[day]})
  day['sleep']['userProfilePK']=123
  with self.assertRaises(ValueError):build.validate_health({'schema_version':1,'days':[day]})


if __name__=='__main__':unittest.main()
