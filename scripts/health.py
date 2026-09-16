"""Daily Garmin metrics; missing readings remain null, never invented zeros."""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from scripts.routes import number


def valid(value, positive=False):
    value=number(value)
    return value if value is not None and (value>0 if positive else value>=0) else None


def timestamp(value):
    numeric=valid(value)
    if numeric is not None:return numeric
    try:return round(datetime.fromisoformat(str(value).replace('Z','+00:00')).timestamp()*1000)
    except (TypeError,ValueError):return None


def pairs(rows, positive=False):
    return [[timestamp(row[0]),valid(row[1],positive)] for row in rows or [] if isinstance(row,(list,tuple)) and len(row)>1 and timestamp(row[0]) is not None]


def samples(rows, time_key='startGMT', value_key='value', positive=False):
    return [[timestamp(row[time_key]),valid(row.get(value_key),positive)] for row in rows or [] if isinstance(row,dict) and timestamp(row.get(time_key)) is not None]


def intervals(rows):
    return [[timestamp(row['startGMT']),timestamp(row['endGMT']),valid(row.get('activityLevel'))] for row in rows or [] if isinstance(row,dict) and timestamp(row.get('startGMT')) is not None and timestamp(row.get('endGMT')) is not None]


def selected(source, mapping):
    result={}
    for private,public in mapping.items():
        value=source.get(private)
        if isinstance(value,(str,bool)) or number(value) is not None:result[public]=value
    return result


def scores(source):
    mapping={'value':'value','qualifierKey':'qualifier','optimalStart':'optimal_start','optimalEnd':'optimal_end','idealStartInSeconds':'ideal_start_s','idealEndInSeconds':'ideal_end_s'}
    return {name:selected(value,mapping) for name,value in (source or {}).items() if isinstance(value,dict)}


def normalize_sleep(raw):
    dto=raw.get('dailySleepDTO') or {}
    result=selected(dto,{
        'sleepTimeSeconds':'total_s','napTimeSeconds':'nap_s','deepSleepSeconds':'deep_s','lightSleepSeconds':'light_s','remSleepSeconds':'rem_s',
        'awakeSleepSeconds':'awake_s','unmeasurableSleepSeconds':'unmeasurable_s','avgHeartRate':'average_hr_bpm','avgSleepStress':'average_stress',
        'averageRespirationValue':'average_respiration_bpm','lowestRespirationValue':'lowest_respiration_bpm','highestRespirationValue':'highest_respiration_bpm',
        'awakeCount':'awake_count','sleepScoreFeedback':'score_feedback','sleepScoreInsight':'score_insight','sleepScorePersonalizedInsight':'score_personalized_insight'
    })
    for private,public in {'sleepStartTimestampGMT':'start_gmt','sleepEndTimestampGMT':'end_gmt','sleepStartTimestampLocal':'start_local','sleepEndTimestampLocal':'end_local'}.items():
        value=timestamp(dto.get(private))
        if value is not None:result[public]=value
    result.update(selected(raw,{'avgOvernightHrv':'average_hrv_ms','hrvStatus':'hrv_status','bodyBatteryChange':'body_battery_change','restingHeartRate':'resting_hr_bpm','restlessMomentsCount':'restless_moments_count'}))
    result.update(selected(raw.get('_daily') or {},{'spO2':'spo2_percent','skinTempC':'skin_temp_c','skinTempF':'skin_temp_f','sleepScore':'daily_score','sleepScoreQuality':'score_quality','avgHeartRate':'daily_average_hr_bpm','avgOvernightHrv':'daily_average_hrv_ms','hrv7dAverage':'hrv_7d_average_ms','hrvStatus':'daily_hrv_status','respiration':'daily_respiration_bpm','restingHeartRate':'daily_resting_hr_bpm','bodyBatteryChange':'daily_body_battery_change','totalSleepTimeInSeconds':'daily_total_s'}))
    result['scores']=scores(dto.get('sleepScores'))
    need={'actual':'actual_s','baseline':'baseline_s','hrvAdjustment':'hrv_adjustment_s','napAdjustment':'nap_adjustment_s','sleepHistoryAdjustment':'history_adjustment_s','feedback':'feedback','trainingFeedback':'training_feedback'}
    result['sleep_need']=selected(dto.get('sleepNeed') or {},need)
    result['next_sleep_need']=selected(dto.get('nextSleepNeed') or {},need)
    result['levels']=intervals(raw.get('sleepLevels'))
    result['movement']=intervals(raw.get('sleepMovement'))
    result['restless_moments']=samples(raw.get('sleepRestlessMoments'))
    result['respiration_samples']=samples(raw.get('wellnessEpochRespirationDataDTOList'),'startTimeGMT','respirationValue',True)
    result['respiration_averages']=[[timestamp(row['epochEndTimestampGmt']),valid(row.get('respirationAverageValue'),True),valid(row.get('respirationLowValue'),True),valid(row.get('respirationHighValue'),True)] for row in raw.get('wellnessEpochRespirationAveragesList') or [] if isinstance(row,dict) and timestamp(row.get('epochEndTimestampGmt')) is not None]
    result['heart_rate_samples']=samples(raw.get('sleepHeartRate'),positive=True)
    result['stress_samples']=samples(raw.get('sleepStress'))
    result['body_battery_samples']=samples(raw.get('sleepBodyBattery'))
    result['hrv_samples']=samples(raw.get('hrvData'),positive=True)
    result['breathing_disruptions']=[[timestamp(row['startGMT']),timestamp(row['endGMT']),valid(row.get('value'))] for row in raw.get('breathingDisruptionData') or [] if isinstance(row,dict) and timestamp(row.get('startGMT')) is not None and timestamp(row.get('endGMT')) is not None]
    return result


def normalize(day, summary, heart, sleep=None, stress=None):
    sleep=sleep or {};stress=stress or {}
    heart_samples=pairs(heart.get('heartRateValues'),True)
    measured=[row[1] for row in heart_samples if row[1] is not None]
    return {'date':day,'steps':valid(summary.get('totalSteps')),'distance_m':valid(summary.get('totalDistanceMeters')),
            'resting_hr_bpm':valid(summary.get('restingHeartRate'),True) or valid(heart.get('restingHeartRate'),True),
            'average_hr_bpm':round(sum(measured)/len(measured),1) if measured else None,
            'max_hr_bpm':valid(summary.get('maxHeartRate'),True) or valid(heart.get('maxHeartRate'),True),
            'heart_rate':{'resting_bpm':valid(heart.get('restingHeartRate'),True),'minimum_bpm':valid(heart.get('minHeartRate'),True),'maximum_bpm':valid(heart.get('maxHeartRate'),True),'samples':heart_samples},
            'sleep':normalize_sleep(sleep),
            'stress':{'average_level':valid(stress.get('avgStressLevel')),'maximum_level':valid(stress.get('maxStressLevel')),'samples':pairs(stress.get('stressValuesArray')),'body_battery_samples':[[timestamp(row[0]),*row[1:4]] for row in stress.get('bodyBatteryValuesArray') or [] if isinstance(row,(list,tuple)) and len(row)>=4 and timestamp(row[0]) is not None]},
            'status':'available' if summary or heart or sleep or stress else 'unavailable'}


def collect(client, end=None):
    end=date.fromisoformat(end) if end else datetime.now(ZoneInfo('Asia/Singapore')).date()
    start=end-timedelta(days=6)
    daily_sleep={row.get('calendarDate'):row.get('values') or {} for row in client.get_sleep_daily(start.isoformat(),end.isoformat()) or [] if isinstance(row,dict) and row.get('calendarDate')}
    rows=[]
    for offset in range(6,-1,-1):
        day=(end-timedelta(days=offset)).isoformat()
        sleep=client.get_sleep_data(day) or {};sleep['_daily']=daily_sleep.get(day,{})
        rows.append(normalize(day,client.get_user_summary(day) or {},client.get_heart_rates(day) or {},sleep,client.get_stress_data(day) or {}))
    return rows


def write(rows,path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    data={'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'source':'Garmin','days':rows}
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,allow_nan=False),encoding='utf-8');tmp.replace(path)
