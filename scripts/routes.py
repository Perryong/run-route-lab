"""Parse exports locally; publish only the explicit, privacy-filtered schema."""
import hashlib
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from zoneinfo import ZoneInfo
import zipfile
from defusedxml import ElementTree as ET

MAX_BYTES = 50 * 1024 * 1024


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def distance(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2-lat1, math.radians(b[1]-a[1])
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def point(lat, lon, elevation=None, timestamp=None):
    lat, lon = number(lat), number(lon)
    if lat is None or lon is None or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError('Invalid GPS coordinate')
    return [lat, lon, number(elevation), timestamp]


def parse_time(value):
    if not value:
        return None
    dt = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace('Z','+00:00'))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def normalized(segments, identifier, name, summary=None):
    summary = summary or {}
    points = [p for seg in segments for p in seg]
    times = [p[3] for p in points if p[3] is not None]
    start = parse_time(summary.get('start_time')) or (min(times) if times else None)
    end = max(times) if times else start
    for p in points:
        p[3] = max(0, (p[3]-start).total_seconds()) if p[3] and start else None
    measured_distance = sum(distance(a,b) for seg in segments for a,b in zip(seg,seg[1:]))
    gain = sum(max(0,b[2]-a[2]) for seg in segments for a,b in zip(seg,seg[1:]) if a[2] is not None and b[2] is not None)
    return {
        'id': identifier, 'name': name,
        'date': start.astimezone(ZoneInfo('Asia/Singapore')).date().isoformat() if start else None,
        'distance_m': number(summary.get('total_distance')) if summary.get('total_distance') is not None else measured_distance,
        'duration_s': number(summary.get('total_timer_time')) if summary.get('total_timer_time') is not None else ((end-start).total_seconds() if start and end else None),
        'elevation_gain_m': number(summary.get('total_ascent')) if summary.get('total_ascent') is not None else (gain if any(p[2] is not None for p in points) else None),
        'segments': segments, 'average_hr_bpm': number(summary.get('avg_heart_rate')), 'max_hr_bpm': number(summary.get('max_heart_rate')),
    }


def parse_gpx(data, identifier):
    root = ET.fromstring(data)
    tracks = root.findall('.//{*}trk')
    if not tracks:
        raise ValueError('GPX contains no recorded track')
    activities=[]
    for idx,trk in enumerate(tracks):
        segments=[]
        for seg in trk.findall('{*}trkseg'):
            pts=[]
            for p in seg.findall('{*}trkpt'):
                pts.append(point(p.get('lat'),p.get('lon'),p.findtext('{*}ele'),parse_time(p.findtext('{*}time'))))
            if pts: segments.append(pts)
        if not segments: raise ValueError('GPX track contains no points')
        activities.append(normalized(segments,identifier+f'-{idx}',trk.findtext('{*}name') or 'Imported run'))
    return activities


def from_fit_records(records, session, identifier):
    segments, current = [], []
    for rec in records:
        lat, lon = number(rec.get('position_lat')), number(rec.get('position_long'))
        if lat is None or lon is None:
            if current: segments.append(current); current=[]
            continue
        p = point(lat*180/2**31, lon*180/2**31, rec.get('enhanced_altitude',rec.get('altitude')), parse_time(rec.get('timestamp')))
        if current and current[-1][3] and p[3] and (p[3]-current[-1][3]).total_seconds()>120:
            segments.append(current); current=[]
        current.append(p)
    if current: segments.append(current)
    return normalized(segments,identifier,'Imported run',session)


def parse_fit(data, identifier):
    import fitdecode
    records, sessions = [], []
    with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.RAISE) as reader:
        for frame in reader:
            if isinstance(frame, fitdecode.FitDataMessage):
                values={field.name:field.value for field in frame.fields}
                if frame.name=='record': records.append(values)
                if frame.name=='session': sessions.append(values)
    if len(sessions)!=1: raise ValueError('Import a single running activity; multi-session FIT is not supported')
    if sessions[0].get('sport') not in ('running',None): raise ValueError('FIT activity is not running')
    return [from_fit_records(records,sessions[0],identifier)]


def parse_export(data, filename):
    if len(data)>MAX_BYTES: raise ValueError('Export exceeds 50 MiB')
    ext=Path(filename).suffix.lower()
    identifier=hashlib.sha256(data).hexdigest()[:20]
    if ext=='.zip':
        activities=[]
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if len(z.infolist())>200 or sum(f.file_size for f in z.infolist())>MAX_BYTES:
                raise ValueError('ZIP expands beyond import limits')
            for f in z.infolist():
                p=PurePosixPath(f.filename)
                if p.is_absolute() or '..' in p.parts or '\\' in f.filename:
                    raise ValueError('Unsafe ZIP member path')
                if p.suffix.lower() in ('.fit','.gpx'):
                    activities.extend(parse_export(z.read(f),f.filename))
        if not activities: raise ValueError('ZIP contains no FIT or GPX exports')
        return activities
    if ext=='.fit': return parse_fit(data,identifier)
    if ext=='.gpx': return parse_gpx(data,identifier)
    raise ValueError('Expected FIT, GPX, or ZIP')


def crosses_circle(a,b,center,radius):
    # Local projection suffices for endpoint privacy circles (metres).
    k=111195; cosine=math.cos(math.radians(center[0]))
    ax=(a[1]-center[1])*k*cosine; ay=(a[0]-center[0])*k
    bx=(b[1]-center[1])*k*cosine; by=(b[0]-center[0])*k
    dx,dy=bx-ax,by-ay
    t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
    return math.hypot(ax+t*dx,ay+t*dy)<radius


def public_activity(activity, trim_m=200):
    if not math.isfinite(trim_m) or trim_m<0: raise ValueError('Trim distance must be nonnegative')
    source=activity.get('segments',[])
    points=[p for seg in source for p in seg]
    circles=[points[0],points[-1]] if points else []
    segments=[]
    for seg in source:
        current=[]
        for p in seg:
            hidden=any(distance(p,c)<trim_m for c in circles)
            crossing=current and any(crosses_circle(current[-1],p,c,trim_m) for c in circles)
            if hidden or crossing:
                if len(current)>1: segments.append(current)
                current=[]
            if not hidden: current.append([round(p[0],6),round(p[1],6),number(p[2]),number(p[3])])
        if len(current)>1: segments.append(current)
    return {
        'id': str(activity['id']), 'name': 'Run · '+(activity.get('date') or 'Undated'),
        'date': activity.get('date'),
        'distance_m': number(activity.get('distance_m')),
        'duration_s': number(activity.get('duration_s')),
        'elevation_gain_m': number(activity.get('elevation_gain_m')),
        'average_hr_bpm': number(activity.get('average_hr_bpm')), 'max_hr_bpm': number(activity.get('max_hr_bpm')),
        'segments': segments, 'route_trimmed': trim_m>0, 'trim_m':trim_m,
    }


def write_public(activities, output, trim_m=200, excluded=()):
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    data={'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'source':'Garmin exports','activities':[
        public_activity(a,trim_m) for a in activities if str(a['id']) not in excluded
    ]}
    data['activities'].sort(key=lambda a:a.get('date') or '',reverse=True)
    tmp=output.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False),encoding='utf-8');tmp.replace(output)
