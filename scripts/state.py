"""Authenticated encryption for tokens and untrimmed activity records."""
import json
import os
import tempfile
import zlib
from pathlib import Path
from cryptography.fernet import Fernet


def load(path, key):
    return json.loads(zlib.decompress(Fernet(key.encode()).decrypt(Path(path).read_bytes())))


def private_write(path, payload):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(payload)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def save(path,key,value):
    payload=Fernet(key.encode()).encrypt(zlib.compress(json.dumps(value,allow_nan=False).encode(),level=6))
    if len(payload)>90*1024*1024:raise ValueError('Encrypted state exceeds the 90 MiB repository limit')
    private_write(path,payload)
