"""Import local FIT/GPX/ZIP exports into the separately published manual dataset."""
import argparse
import json
from pathlib import Path
from scripts.routes import parse_export, write_public
from scripts.state import private_write


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('files',nargs='+',type=Path)
    p.add_argument('--trim',type=float,default=200)
    p.add_argument('--output',default='site/data/manual.json')
    p.add_argument('--store',default='.state/manual.json')
    p.add_argument('--clear',action='store_true',help='Replace the local import collection')
    args=p.parse_args()
    store=Path(args.store)
    items=json.loads(store.read_text()) if store.exists() and not args.clear else {}
    try:
        for path in args.files:
            for a in parse_export(path.read_bytes(),path.name):items[a['id']]=a
        # Validate public data before changing the saved collection.
        write_public(items.values(),args.output,args.trim)
        private_write(store,json.dumps(items,allow_nan=False).encode())
    except Exception as exc:raise SystemExit(f'Import failed ({type(exc).__name__}): verify your files and trim setting.') from None
    print(f'Imported {len(items)} activities. Publish only {args.output}; keep {args.store} and exports private.')

if __name__=='__main__':main()
