"""An authored binary FIT fixture exercises the actual decoder, including CRC."""
import struct
import unittest
from fitdecode.utils import compute_crc
from scripts.routes import parse_export


def fit_fixture():
    def definition(local,global_id,fields):
        return bytes([0x40|local,0,0])+struct.pack('<H',global_id)+bytes([len(fields)])+b''.join(bytes(f) for f in fields)
    epoch=1157155200  # FIT epoch seconds; used only as synthetic timestamp.
    rec_fields=[(253,4,0x86),(0,4,0x85),(1,4,0x85),(2,2,0x84)]
    payload=definition(0,20,rec_fields)
    for i in range(3):payload+=b'\0'+struct.pack('<IiiH',epoch+i*60,int((1.3+i*.001)*2**31/180),int(103.8*2**31/180),2550+i*5)
    fields=[(5,1,0),(2,4,0x86),(9,4,0x86),(8,4,0x86),(22,2,0x84)]
    payload+=definition(1,18,fields)+b'\1'+struct.pack('<BIIIH',1,epoch,25000,120000,2)
    header=struct.pack('<BBHI4s',12,0x20,2134,len(payload),b'.FIT')
    content=header+payload
    return content+struct.pack('<H',compute_crc(content))

class BinaryTests(unittest.TestCase):
    def test_original_fit_decodes_real_messages(self):
        a=parse_export(fit_fixture(),'run.fit')[0]
        self.assertEqual(a['distance_m'],250)
        self.assertEqual(a['duration_s'],120)
        self.assertEqual(len(a['segments'][0]),3)
        self.assertAlmostEqual(a['segments'][0][0][2],10)

    def test_corrupted_fit_is_rejected(self):
        data=bytearray(fit_fixture());data[-1]^=255
        with self.assertRaises(Exception):parse_export(data,'bad.fit')
