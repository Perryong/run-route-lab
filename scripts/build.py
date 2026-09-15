"""Create a Pages artifact from an explicit allowlist, never the project root."""
import json
from pathlib import Path
import shutil

ALLOWED_FIELDS={'id','name','date','distance_m','duration_s','elevation_gain_m','segments','route_trimmed','trim_m','average_hr_bpm','max_hr_bpm'}


def main():
    source=Path('site');target=Path('dist')
    for name in ['activities','manual']:
        dataset=json.loads((source/'data'/f'{name}.json').read_text())
        if dataset.get('schema_version')!=1:raise ValueError('Unsupported dataset')
        for activity in dataset['activities']:
            if set(activity)-ALLOWED_FIELDS:raise ValueError('Unexpected public activity fields')
    health=json.loads((source/'data'/'health.json').read_text())
    if health.get('schema_version')!=1:raise ValueError('Unsupported health dataset')
    for day in health['days']:
        if set(day)-{'date','steps','distance_m','resting_hr_bpm','average_hr_bpm','max_hr_bpm','status'}:raise ValueError('Unexpected public health fields')
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
