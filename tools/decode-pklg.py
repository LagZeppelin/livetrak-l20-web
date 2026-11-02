#!/usr/bin/env python3
"""Decode an iOS PacketLogger capture (.pklg) of the L-20 Control app into MIDI messages.

Usage: python3 tools/decode-pklg.py capture.pklg [--all]
Prints one line per MIDI message: time, TX (app -> L-20) / RX (L-20 -> app), hex bytes.
Meter SysEx (F0 52 00 00 31 ...) is hidden unless --all is given. See docs/protocol-l20-ble.md.
"""
import struct, sys, datetime

def records(path):
    b = open(path, 'rb').read(); i = 0
    while i + 13 <= len(b):
        ln, s, us = struct.unpack('<III', b[i:i + 12])  # iOS writes the little-endian pklg variant
        if ln < 9 or i + 4 + ln > len(b): break
        yield s + us / 1e6, b[i + 12], b[i + 13:i + 4 + ln]; i += 4 + ln

def att_packets(path, handle):
    buf = {2: b'', 3: b''}
    for t, ty, d in records(path):
        if ty not in (2, 3) or len(d) < 4: continue
        h, = struct.unpack('<H', d[:2])
        if h & 0xfff != handle: continue
        buf[ty] = (buf[ty] + d[4:]) if (h >> 12) & 3 == 1 else d[4:]
        if len(buf[ty]) >= 4:
            ln, cid = struct.unpack('<HH', buf[ty][:4])
            if len(buf[ty]) >= 4 + ln:
                if cid == 4: yield t, 'TX' if ty == 2 else 'RX', buf[ty][4:4 + ln]
                buf[ty] = b''

def l20_handle(path):
    """Connection handle of the device advertising as L-20_..., via the LE connection-complete event."""
    for t, ty, d in records(path):
        if ty == 1 and len(d) > 13 and d[0] == 0x3e and d[2] in (1, 0x0a) and d[3] == 0:
            return struct.unpack('<H', d[4:6])[0]  # shortcut: first LE connection, fine while only the L-20 connects first

DATA_LEN = {0x80: 2, 0x90: 2, 0xA0: 2, 0xB0: 2, 0xE0: 2, 0xC0: 1, 0xD0: 1}

def ble_midi(p, st):
    """BLE-MIDI packet -> complete MIDI messages. st keeps an open SysEx across packets."""
    out = []; i = 1; run = None; sx = st.get('sx')
    while i < len(p):
        c = p[i]
        if sx is not None:
            if c & 0x80:
                if i + 1 < len(p) and p[i + 1] == 0xF7:
                    sx.append(0xF7); out.append(bytes(sx)); sx = None; i += 2
                else: i += 1
                continue
            sx.append(c); i += 1; continue
        if c & 0x80:
            i += 1
            if i >= len(p): break
            if p[i] == 0xF0: sx = bytearray([0xF0]); i += 1; continue
            if p[i] & 0x80: run = p[i]; i += 1
        n = DATA_LEN.get(run & 0xF0, 0) if run else 0
        if not n: i += 1; continue
        while i + n <= len(p) and not p[i] & 0x80:
            out.append(bytes([run]) + p[i:i + n]); i += n
    st['sx'] = sx
    return out

def main():
    path = sys.argv[1]; show_all = '--all' in sys.argv
    st = {'TX': {}, 'RX': {}}
    for t, d, a in att_packets(path, l20_handle(path)):
        if a[0] not in (0x12, 0x52, 0x1b): continue  # write req, write cmd, notification
        for m in ble_midi(a[3:], st[d]):
            if not show_all and m[:5] == b'\xf0\x52\x00\x00\x31': continue
            ts = datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime('%H:%M:%S.%f')[:-3]
            print(ts, d, m.hex(' '))

if __name__ == '__main__':
    assert ble_midi(bytes.fromhex('8080b03c52803c53'), {}) == [b'\xb0\x3c\x52', b'\xb0\x3c\x53']
    main()
