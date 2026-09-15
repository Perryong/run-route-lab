"""Daily Garmin metrics; missing readings remain null, never invented zeros."""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from scripts.routes import number

def valid(value,positive=False):
 n=number(value)
 return n if n is not None and (n>0 if positive else n>=0) else None

def normalize(day,summary,heart):
 samples=[valid(p[1],True) for p in heart.get('heartRateValues',[]) or [] if isinstance(p,(list,tuple)) and len(p)>1]
 samples=[p for p in samples if p is not None]
 return {'date':day,'steps':valid(summary.get('totalSteps')),'distance_m':valid(summary.get('totalDistanceMeters')),
 'resting_hr_bpm':valid(summary.get('restingHeartRate'),True) or valid(heart.get('restingHeartRate'),True),
 'average_hr_bpm':round(sum(samples)/len(samples),1) if samples else None,
 'max_hr_bpm':valid(summary.get('maxHeartRate'),True) or valid(heart.get('maxHeartRate'),True),'status':'available' if summary or heart else 'unavailable'}

def collect(client,end=None):
 end=date.fromisoformat(end) if end else datetime.now(ZoneInfo('Asia/Singapore')).date()
 rows=[]
 for offset in range(6,-1,-1):
  day=(end-timedelta(days=offset)).isoformat();summary={};heart={}
  summary=client.get_user_summary(day)
  heart=client.get_heart_rates(day)
  rows.append(normalize(day,summary or {},heart or {}))
 return rows

def write(rows,path):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 data={'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'source':'Garmin','days':rows}
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,allow_nan=False),encoding='utf-8');tmp.replace(path)
