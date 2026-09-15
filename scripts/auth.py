"""Interactive local authentication. Run on your computer, never in Actions."""
import argparse
import getpass
import logging
from pathlib import Path
import subprocess
from cryptography.fernet import Fernet
from garminconnect import Garmin
from scripts.state import private_write


def main():
    logging.disable(logging.CRITICAL)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',help='Optional owner/repository: set secrets using authenticated GitHub CLI')
    parser.add_argument('--renew',action='store_true',help='Renew tokens, preserving the existing encryption key')
    args=parser.parse_args()
    root=Path('.secrets');root.mkdir(mode=0o700,exist_ok=True)
    key_path=root/'GARMIN_STATE_KEY.txt'
    if args.renew and not key_path.exists():
        raise SystemExit('Keep the original .secrets/GARMIN_STATE_KEY.txt when renewing. Do not rotate the key accidentally.')
    email=input('Garmin email: ').strip()
    api=Garmin(email=email,password=getpass.getpass('Garmin password: '),prompt_mfa=lambda:input('Garmin MFA code: ').strip())
    try:
        api.login()
    except Exception as exc:
        raise SystemExit(f'Garmin login failed ({type(exc).__name__}). Retry locally after checking the account.') from None
    private_write(root/'GARMIN_TOKENS.json',api.client.dumps().encode())
    if not key_path.exists():private_write(key_path,Fernet.generate_key())
    if args.repo:
        if args.repo.startswith('-') or len(args.repo.split('/'))!=2:raise SystemExit('Use owner/repository')
        for name,path in [('GARMIN_TOKENS',root/'GARMIN_TOKENS.json'),('GARMIN_STATE_KEY',key_path)]:
            with path.open('rb') as f:subprocess.run(['gh','secret','set',name,'--repo',args.repo],stdin=f,check=True)
        print('GitHub Actions secrets configured.')
    else:
        print('Login saved locally. Set GARMIN_TOKENS from .secrets/GARMIN_TOKENS.json and GARMIN_STATE_KEY from .secrets/GARMIN_STATE_KEY.txt in repository Actions secrets. Do not commit these files.')
    if args.renew:print('Next, manually run Publish with reset_session=true to use the renewed session while retaining your history.')

if __name__=='__main__':main()
