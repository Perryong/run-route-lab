"""Run from repository root: python -m scripts.sync. Never logs tokens or GPS."""
import argparse
import copy
import logging
import json
import os
import time
from pathlib import Path
from garminconnect import Garmin
from scripts import routes, state, health


def collect(client, data, max_activities=1000, delay=0.4, excluded=(), redownload=False):
    if not 1 <= max_activities <= 10000: raise ValueError('History limit must be between 1 and 10000')
    records=data.setdefault('activities',{})
    for identifier in excluded:records.pop(identifier,None)
    count=0
    for start in range(0,max_activities,100):
        limit=min(100,max_activities-start)
        batch=client.get_activities(start=start,limit=limit,activitytype='running')
        if not isinstance(batch,list):raise ValueError('Unexpected activity response')
        for summary in batch:
            identifier=str(summary['activityId'])
            if not identifier.isdigit():raise ValueError('Invalid activity ID')
            if identifier in excluded:continue
            if identifier not in records or redownload:
                # Original downloads are Garmin ZIP archives containing FIT files.
                payload=client.download_activity(identifier,dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
                parsed=routes.parse_export(payload, 'activity.zip' if payload[:2]==b'PK' else 'activity.fit')
                if len(parsed)!=1:raise ValueError('Expected one recording for activity')
                activity=parsed[0]
                activity['id']=identifier
                records[identifier]=activity
                time.sleep(delay)
            activity=records[identifier]
            activity['name']=summary.get('activityName',activity.get('name','Run'))
            local_date=summary.get('startTimeLocal')
            if local_date:activity['date']=str(local_date)[:10]
            for field,key in [('distance_m','distance'),('duration_s','duration'),('elevation_gain_m','elevationGain'),('average_hr_bpm','averageHR'),('max_hr_bpm','maxHR')]:
                if summary.get(key) is not None:activity[field]=routes.number(summary[key])
            count+=1
        if len(batch)<limit:break
        time.sleep(delay)
    data['history_limit_reached']=count>=max_activities
    return data


def run(path,key,bootstrap,output,client=None,max_activities=1000,trim_m=200,excluded=(),redownload=False,include_health=False):
    path=Path(path)
    data=state.load(path,key) if path.exists() else {'tokens':bootstrap,'activities':{}}
    if os.environ.get('RESET_SESSION')=='true':
        if not bootstrap:raise ValueError('Missing renewed bootstrap session')
        data['tokens']=bootstrap
    if not data.get('tokens'):raise ValueError('Missing initial Garmin session')
    client=client or Garmin()
    authenticated=False
    try:
        client.login(data['tokens'])
        authenticated=True
        # A failed collection must not replace the last complete activity snapshot.
        pending=copy.deepcopy(data)
        collect(client,pending,max_activities,excluded=excluded,redownload=redownload)
        if include_health:pending['health']=health.collect(client)
        data=pending
    finally:
        token_json=client.client.dumps()
        usable=authenticated
        if not usable:
            try:
                candidate=json.loads(token_json)
                usable=bool(candidate.get('di_token') and candidate.get('di_refresh_token'))
            except (ValueError,AttributeError):
                usable=False
        if usable:
            data['tokens']=token_json
            state.save(path,key,data)
    routes.write_public(data['activities'].values(),output,trim_m,excluded)
    health.write(data.get('health',[]) if include_health else [],Path(output).with_name('health.json'))
    print(f"Prepared {len(data['activities'])} activities. Raw recordings remain encrypted.")
    if data.get('history_limit_reached'):print('History limit reached; increase MAX_ACTIVITIES for more history.')


def main():
    logging.disable(logging.CRITICAL)
    parser=argparse.ArgumentParser()
    parser.add_argument('--state',default='.state/state.enc')
    parser.add_argument('--output',default='site/data/activities.json')
    parser.add_argument('--offline',action='store_true',help='Publish saved encrypted activities without contacting Garmin')
    parser.add_argument('--redownload',action='store_true',help='Replace recordings for scanned activities')
    args=parser.parse_args()
    try:
        key=os.environ['GARMIN_STATE_KEY'].strip()
        if args.offline:
            data=state.load(args.state,key)
            routes.write_public(data['activities'].values(),args.output,float(os.environ.get('ROUTE_TRIM_METERS','200')),set(filter(None,os.environ.get('EXCLUDED_ACTIVITY_IDS','').replace(' ','').split(','))))
            health.write(data.get('health',[]) if os.environ.get('PUBLISH_HEALTH','true')=='true' else [],Path(args.output).with_name('health.json'))
            return
        run(args.state,key,os.environ.get('GARMIN_TOKENS'),args.output,
            max_activities=int(os.environ.get('MAX_ACTIVITIES','1000')),
            trim_m=float(os.environ.get('ROUTE_TRIM_METERS','200')),
            excluded=set(filter(None,os.environ.get('EXCLUDED_ACTIVITY_IDS','').replace(' ','').split(','))),
            redownload=args.redownload,include_health=os.environ.get('PUBLISH_HEALTH','true')=='true')
    except Exception as exc:
        # Exception text from upstream can contain account data. Emit only the type.
        print(f'Sync failed ({type(exc).__name__}). Previous live site is unchanged. Check configuration, Garmin status, or renew local authentication.')
        raise SystemExit(1) from None

if __name__=='__main__':main()
