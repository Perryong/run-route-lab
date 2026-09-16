"""Create a Pages artifact from an explicit allowlist, never the project root."""
import json
from pathlib import Path
import shutil

ALLOWED_FIELDS={'id','name','date','distance_m','duration_s','elevation_gain_m','segments','route_trimmed','trim_m','average_hr_bpm','max_hr_bpm'}
DAY_FIELDS={'date','steps','distance_m','resting_hr_bpm','average_hr_bpm','max_hr_bpm','status','heart_rate','sleep','stress'}
HEART_FIELDS={'resting_bpm','minimum_bpm','maximum_bpm','samples'}
SLEEP_FIELDS={'start_gmt','end_gmt','start_local','end_local','total_s','nap_s','deep_s','light_s','rem_s','awake_s','unmeasurable_s','average_hr_bpm','average_stress','average_respiration_bpm','lowest_respiration_bpm','highest_respiration_bpm','awake_count','score_feedback','score_insight','score_personalized_insight','average_hrv_ms','hrv_status','body_battery_change','resting_hr_bpm','restless_moments_count','spo2_percent','skin_temp_c','skin_temp_f','daily_score','score_quality','daily_average_hr_bpm','daily_average_hrv_ms','hrv_7d_average_ms','daily_hrv_status','daily_respiration_bpm','daily_resting_hr_bpm','daily_body_battery_change','daily_total_s','scores','sleep_need','next_sleep_need','levels','movement','restless_moments','respiration_samples','respiration_averages','heart_rate_samples','stress_samples','body_battery_samples','hrv_samples','breathing_disruptions'}
SCORE_NAMES={'overall','totalDuration','stress','awakeCount','remPercentage','restlessness','lightPercentage','deepPercentage'}
SCORE_FIELDS={'value','qualifier','optimal_start','optimal_end','ideal_start_s','ideal_end_s'}
NEED_FIELDS={'actual_s','baseline_s','hrv_adjustment_s','nap_adjustment_s','history_adjustment_s','feedback','training_feedback'}
STRESS_FIELDS={'average_level','maximum_level','samples','body_battery_samples'}


def allow(obj,fields,label):
    if not isinstance(obj,dict) or set(obj)-fields:raise ValueError(f'Unexpected public {label} fields')


def validate_health(health):
    if health.get('schema_version')!=1:raise ValueError('Unsupported health dataset')
    for day in health['days']:
        allow(day,DAY_FIELDS,'health')
        allow(day.get('heart_rate',{}),HEART_FIELDS,'heart-rate')
        sleep=day.get('sleep',{});allow(sleep,SLEEP_FIELDS,'sleep')
        scores=sleep.get('scores',{});allow(scores,SCORE_NAMES,'sleep-score')
        for value in scores.values():allow(value,SCORE_FIELDS,'sleep-score detail')
        allow(sleep.get('sleep_need',{}),NEED_FIELDS,'sleep-need')
        allow(sleep.get('next_sleep_need',{}),NEED_FIELDS,'next-sleep-need')
        allow(day.get('stress',{}),STRESS_FIELDS,'stress')


def main():
    source=Path('site');target=Path('dist')
    for name in ['activities','manual']:
        dataset=json.loads((source/'data'/f'{name}.json').read_text())
        if dataset.get('schema_version')!=1:raise ValueError('Unsupported dataset')
        for activity in dataset['activities']:
            if set(activity)-ALLOWED_FIELDS:raise ValueError('Unexpected public activity fields')
    health=json.loads((source/'data'/'health.json').read_text())
    validate_health(health)
    if target.exists():shutil.rmtree(target)
    target.mkdir()
    for name in ['index.html','styles.css','app.js','model.js','demo.js']:
        shutil.copy2(source/name,target/name)
    for folder in ['data','vendor']:
        (target/folder).mkdir()
    for name in ['activities.json','manual.json','health.json']:shutil.copy2(source/'data'/name,target/'data'/name)
    for name in ['leaflet.js','leaflet.css','LEAFLET-LICENSE']:shutil.copy2(source/'vendor'/name,target/'vendor'/name)
    (target/'.nojekyll').touch()
    print('Built dist/ from public-file allowlist.')

if __name__=='__main__':main()
