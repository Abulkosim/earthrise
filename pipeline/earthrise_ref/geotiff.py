"""A minimal reader for the GeoTIFFs NASA Goddard publishes for the south-pole sites.

Those files are plain: little-endian classic TIFF, one band of 32-bit floats, no compression,
stored in strips, with a pixel scale and one tie point. Nothing else is supported, on purpose:
a wrong guess about a format would silently shift terrain.
"""
import struct
import numpy as np


def read(path):
    """Returns (heights[rows, cols] float32 with NaN where empty, left x, top y, metres per pixel)."""
    with open(path, "rb") as f:
        head = f.read(8)
        if head[:4] != b"II*\x00":
            raise ValueError(f"{path}: not a little-endian classic TIFF")
        f.seek(struct.unpack("<I", head[4:])[0])
        tags = {}
        for _ in range(struct.unpack("<H", f.read(2))[0]):
            tag, typ, cnt, val = struct.unpack("<HHII", f.read(12))
            tags[tag] = (typ, cnt, val)

        def values(tag, fmt=None, size=None):
            typ, cnt, val = tags[tag]
            if fmt is None:  # integer tags come as 16-bit or 32-bit, the file says which
                fmt, size = {3: ("H", 2), 4: ("I", 4)}[typ]
            if cnt * size <= 4:
                return list(struct.unpack("<" + fmt * cnt, struct.pack("<I", val)[: cnt * size]))
            f.seek(val)
            return list(struct.unpack("<" + fmt * cnt, f.read(cnt * size)))

        w, h = tags[256][2], tags[257][2]
        if tags[258][2] != 32 or tags[259][2] != 1 or tags[339][2] != 3 or tags[277][2] != 1:
            raise ValueError(f"{path}: expected one uncompressed band of 32-bit floats")
        offsets = values(273)
        counts = values(279)
        rows_per_strip = tags[278][2]
        scale = values(33550, "d", 8)
        tie = values(33922, "d", 8)
        if abs(scale[0] - scale[1]) > 1e-9 or tie[0] != 0 or tie[1] != 0:
            raise ValueError(f"{path}: expected square pixels and a tie point at the raster origin")
        a = np.empty((h, w), dtype="<f4")
        for i, (off, cnt) in enumerate(zip(offsets, counts)):
            f.seek(off)
            rows = min(rows_per_strip, h - i * rows_per_strip)
            a[i * rows_per_strip: i * rows_per_strip + rows] = np.frombuffer(f.read(cnt), dtype="<f4").reshape(rows, w)
    return a, tie[3], tie[4], scale[0]


def convert(path, out_path, chunk_rows=2048):
    """Decode a float32 GeoTIFF of any size into a raw float32 file, without holding it in memory.

    Handles what NASA Goddard's LOLA products use: classic TIFF or BigTIFF, strips or tiles,
    no compression or DEFLATE; no predictor, horizontal differencing (2) or the floating-point predictor (3).
    Returns (cols, rows, left x, top y, metres per pixel). Empty pixels stay NaN.
    """
    import zlib
    with open(path, "rb") as f:
        head = f.read(16)
        if head[:2] != b"II":
            raise ValueError(f"{path}: not little-endian")
        big = struct.unpack("<H", head[2:4])[0] == 43
        if big:
            f.seek(struct.unpack("<Q", head[8:16])[0])
            n = struct.unpack("<Q", f.read(8))[0]
            entry, fmt = 20, "<HHQQ"
        else:
            f.seek(struct.unpack("<I", head[4:8])[0])
            n = struct.unpack("<H", f.read(2))[0]
            entry, fmt = 12, "<HHII"
        tags = {}
        for _ in range(n):
            tag, typ, cnt, val = struct.unpack(fmt, f.read(entry))
            tags[tag] = (typ, cnt, val)
        sizes = {1: ("B", 1), 2: ("c", 1), 3: ("H", 2), 4: ("I", 4), 16: ("Q", 8), 12: ("d", 8)}
        inline = 8 if big else 4

        def values(tag):
            typ, cnt, val = tags[tag]
            code, size = sizes[typ]
            if cnt * size <= inline:
                raw = struct.pack("<Q" if big else "<I", val)[: cnt * size]
            else:
                f.seek(val)
                raw = f.read(cnt * size)
            return list(struct.unpack("<" + code * cnt, raw))

        one = lambda tag, default=None: values(tag)[0] if tag in tags else default
        w, h = one(256), one(257)
        comp, pred = one(259, 1), one(317, 1)
        if one(258) != 32 or one(339) != 3 or one(277, 1) != 1:
            raise ValueError(f"{path}: expected one band of 32-bit floats")
        if comp not in (1, 8, 32946) or pred not in (1, 2, 3):
            raise ValueError(f"{path}: compression {comp} / predictor {pred} not supported")
        scale, tie = values(33550), values(33922)
        if abs(scale[0] - scale[1]) > 1e-9 or tie[0] != 0 or tie[1] != 0:
            raise ValueError(f"{path}: expected square pixels and a tie point at the raster origin")
        tiled = 322 in tags
        bw, bh = (one(322), one(323)) if tiled else (w, one(278, h))
        offsets, counts = values(324 if tiled else 273), values(325 if tiled else 279)
        across = -(-w // bw)

        def block(i):
            f.seek(offsets[i])
            raw = f.read(counts[i])
            rows = bh if tiled else min(bh, h - i * bh)
            if counts[i] == 0:
                return np.full((rows, bw), np.nan, dtype="<f4")
            if comp != 1:
                raw = zlib.decompress(raw)
            a = np.frombuffer(raw, dtype=np.uint8)[: rows * bw * 4].reshape(rows, bw * 4)
            if pred == 2:
                # horizontal differencing of the 32-bit words: undo with a running sum that wraps
                return np.cumsum(np.frombuffer(a.tobytes(), dtype="<u4").reshape(rows, bw), axis=1, dtype=np.uint32).view("<f4")
            if pred == 3:
                # undo the byte-wise horizontal differencing, then put the four byte planes
                # (most significant first) back together as little-endian floats
                a = np.cumsum(a, axis=1, dtype=np.uint8).reshape(rows, 4, bw)[:, ::-1, :]
                a = np.ascontiguousarray(a.transpose(0, 2, 1))
            return a.reshape(rows, bw, 4).view("<f4")[..., 0] if pred == 3 else a.view("<f4")

        out = np.memmap(out_path, dtype="<f4", mode="w+", shape=(h, w))
        for b0 in range(0, len(offsets), across if tiled else 1):
            if tiled:
                r0 = (b0 // across) * bh
                row = np.concatenate([block(b0 + j) for j in range(across)], axis=1)
                rows = min(bh, h - r0)
                out[r0:r0 + rows] = row[:rows, :w]
            else:
                r0 = b0 * bh
                blk = block(b0)
                out[r0:r0 + blk.shape[0]] = blk
        out.flush()
    return w, h, tie[3], tie[4], scale[0]
