import importlib.util
import os
import sys

os.environ["NUANYU_TOKEN"] = "tok123"
os.environ["DASHSCOPE_API_KEY"] = "sk-test"
os.environ["RATE_PER_MIN"] = "5"
os.environ["RATE_PER_DAY"] = "12"

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "pylibs"))
spec = importlib.util.spec_from_file_location(
    "nuanyu_app",
    r"E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/deploy/app.py",
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FakeResp:
    status_code = 200
    headers = {"Content-Type": "text/event-stream"}

    def iter_content(self, chunk_size=None):
        yield b'data: {"choices":[]}\n\n'


mod.requests.request = lambda **kw: FakeResp()

c = mod.app.test_client()

print("health:", c.get("/api/health").json)

r = c.post("/api/chat/completions", json={"model": "x"})
print("no-token ->", r.status_code, r.json["error"]["message"][:20])

r = c.post("/api/chat/completions", json={"model": "x"},
           headers={"Authorization": "Bearer wrong"})
print("bad-token ->", r.status_code)

h = {"X-Nuanyu-Token": "tok123"}
codes = [c.post("/api/chat/completions", json={"model": "x"}, headers=h).status_code
         for _ in range(8)]
print("with-token codes:", codes)

r = c.post("/api/chat/completions", json={"model": "x"}, headers=h)
print("429 retry-after:", r.headers.get("Retry-After"))

r = c.post("/api/chat/completions", data=b"x" * (300 * 1024),
           headers=dict(h, **{"X-Forwarded-For": "9.9.9.9"}))
print("too-large ->", r.status_code, r.json["error"]["message"])

print("OPTIONS ->", c.open("/api/chat/completions", method="OPTIONS").status_code)
