# Written with AI assistance (Claude); see the README.
"""Download one large file over several HTTP range requests at once.

    python scripts/fetch_parallel.py <url> <output path> [connections]

NASA Goddard's server gives each connection well under 1 MB/s; the files are several GB.
Finished parts are remembered in <output>.parts, so an interrupted download resumes.
"""
import json
import os
import sys
import threading
import urllib.request

CHUNK = 16 * 1024 * 1024


def main(url, out, conns=12):
    head = urllib.request.Request(url, method="HEAD")
    size = int(urllib.request.urlopen(head, timeout=60).headers["Content-Length"])
    state_path = out + ".parts"
    done = set(json.load(open(state_path))) if os.path.exists(state_path) and os.path.exists(out) else set()
    if not os.path.exists(out):
        with open(out, "wb") as f:
            f.truncate(size)
    parts = [i for i in range(0, size, CHUNK) if i not in done]
    lock = threading.Lock()
    got = [len(done) * CHUNK]

    def work():
        while True:
            with lock:
                if not parts:
                    return
                start = parts.pop(0)
            end = min(start + CHUNK, size) - 1
            for attempt in range(8):
                try:
                    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
                    data = urllib.request.urlopen(req, timeout=120).read()
                    if len(data) != end - start + 1:
                        raise IOError("short read")
                    break
                except Exception as e:  # retry the part
                    if attempt == 7:
                        raise
            with lock:
                with open(out, "r+b") as f:
                    f.seek(start)
                    f.write(data)
                done.add(start)
                json.dump(sorted(done), open(state_path, "w"))
                got[0] += len(data)
                print(f"\r{got[0] / 1e6:8.0f} / {size / 1e6:.0f} MB", end="", flush=True)

    threads = [threading.Thread(target=work) for _ in range(conns)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    if len(done) * CHUNK >= size:
        os.remove(state_path)
        print(f"\ndone: {out} ({size} bytes)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 12)
