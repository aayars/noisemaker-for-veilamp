#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Noise Factor LLC
"""Apply the DSL extension to an explicit Veilamp source folder."""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Veilamp source folder")
parser.add_argument("--check", action="store_true", help="Check the patch without changing files")
args = parser.parse_args()
source = args.source.resolve(strict=True)
manifest = source / "app/veilamp/package.json"
if not (source / "crates/veilamp-net/src/protocol.rs").is_file() or not manifest.is_file():
    parser.error("Select the Veilamp source folder that contains Cargo.toml and app/veilamp.")
if json.loads(manifest.read_text())["name"] != "veilamp":
    parser.error("The source folder does not contain the Veilamp application.")
patch = Path(__file__).with_name("veilamp-dsl.patch")
subprocess.run(["git", "apply", "--check", str(patch)], cwd=source, check=True)
if not args.check:
    subprocess.run(["git", "apply", str(patch)], cwd=source, check=True)
print("The DSL extension patch is compatible." if args.check else "The DSL extension is applied.")
