#!/usr/bin/env python3
"""Dependency-free regression checks for the recorded gameplay video assets."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
MP4 = ASSETS / "attract-gameplay.mp4"
WEBM = ASSETS / "attract-gameplay.webm"
POSTER = ASSETS / "attract-gameplay-poster.webp"

passes = 0
failures = 0


def check(condition: bool, message: str) -> None:
    global passes, failures
    if condition:
        passes += 1
        print(f"  ✓ {message}")
    else:
        failures += 1
        print(f"  ✗ FAIL: {message}")


def probe(path: Path) -> dict:
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,r_frame_rate,pix_fmt",
        "-show_entries", "format=duration,size", "-of", "json", str(path)
    ], text=True)
    return json.loads(output)


def frame_bytes(path: Path, second: float) -> bytes:
    return subprocess.check_output([
        "ffmpeg", "-v", "error", "-ss", str(second), "-i", str(path),
        "-frames:v", "1", "-vf", "scale=320:180", "-pix_fmt", "rgb24",
        "-f", "rawvideo", "pipe:1"
    ])


print("\n== Gameplay video assets ==")
check(MP4.exists(), "MP4 fallback exists")
check(WEBM.exists(), "WebM primary source exists")
check(POSTER.exists() and POSTER.stat().st_size > 10_000, "WebP poster exists and is non-trivial")

mp4 = probe(MP4)
webm = probe(WEBM)
mp4_stream = mp4["streams"][0]
webm_stream = webm["streams"][0]

check(mp4_stream["codec_name"] == "h264", "MP4 uses H.264")
check(webm_stream["codec_name"] == "vp9", "WebM uses VP9")
check((mp4_stream["width"], mp4_stream["height"]) == (1280, 720), "MP4 is 1280×720")
check((webm_stream["width"], webm_stream["height"]) == (1280, 720), "WebM is 1280×720")
check(13.9 <= float(mp4["format"]["duration"]) <= 14.1, "MP4 loop is 14 seconds")
check(13.9 <= float(webm["format"]["duration"]) <= 14.1, "WebM loop is 14 seconds")
check(MP4.stat().st_size < 2_000_000 and WEBM.stat().st_size < 2_000_000,
      "both video sources remain under 2 MB")

first = frame_bytes(MP4, 1.0)
later = frame_bytes(MP4, 8.0)
check(len(first) == len(later) == 320 * 180 * 3, "comparison frames decode completely")
mean_absolute_difference = sum(abs(a - b) for a, b in zip(first, later)) / len(first)
changed_ratio = sum(abs(a - b) > 12 for a, b in zip(first, later)) / len(first)
check(mean_absolute_difference > 3.0, f"timeline frames differ visibly (mean delta {mean_absolute_difference:.2f})")
check(changed_ratio > 0.04, f"timeline changes at least 4% of channels ({changed_ratio:.2%})")

loop_start = frame_bytes(MP4, 0.0)
loop_end = frame_bytes(MP4, 13.999)
loop_seam_delta = sum(abs(a - b) for a, b in zip(loop_start, loop_end)) / len(loop_start)
check(loop_seam_delta < 1.5, f"loop seam returns smoothly to the first frame (delta {loop_seam_delta:.2f})")

print(f"\n========== VIDEO ASSET RESULT: {passes} passed, {failures} failed ==========")
raise SystemExit(1 if failures else 0)
