#!/usr/bin/env python3
"""Verify the pinned Trystero browser bundle and its license."""
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "vendor" / "trystero-nostr-0.25.3.min.js"
LICENSE = ROOT / "vendor" / "TRYSTERO-LICENSE.txt"
README = ROOT / "vendor" / "README.md"
EXPECTED_SHA256 = "24a3d2d8658e19598e6789ad406f2d13420f08ae27cd240802f373ffa1d4e5e0"

passes = 0
failures = 0

def check(condition, message):
    global passes, failures
    if condition:
        passes += 1
        print(f"  ✓ {message}")
    else:
        failures += 1
        print(f"  ✗ FAIL: {message}")

print("\n== Vendored P2P dependency ==")
check(BUNDLE.exists(), "Trystero browser bundle exists")
check(LICENSE.exists(), "upstream license is preserved")
check(README.exists(), "vendoring provenance is documented")

bundle = BUNDLE.read_bytes() if BUNDLE.exists() else b""
license_text = LICENSE.read_text(errors="replace") if LICENSE.exists() else ""
readme_text = README.read_text(errors="replace") if README.exists() else ""
actual_hash = sha256(bundle).hexdigest()

check(actual_hash == EXPECTED_SHA256, f"bundle SHA-256 matches pinned artifact ({actual_hash})")
check(50_000 <= len(bundle) <= 100_000, f"bundle size is expected ({len(bundle)} bytes)")
check(b"sourceMappingURL" not in bundle, "production bundle has no source-map reference")
check("Copyright (c) 2021 Dan Motzenbecker" in license_text and
      "Permission is hereby granted" in license_text and
      'THE SOFTWARE IS PROVIDED "AS IS"' in license_text,
      "license text preserves the complete MIT grant and warranty disclaimer")
check("trystero@0.25.3" in readme_text and EXPECTED_SHA256 in readme_text,
      "README pins package version and bundle hash")

print(f"\n========== VENDOR RESULT: {passes} passed, {failures} failed ==========")
raise SystemExit(1 if failures else 0)
