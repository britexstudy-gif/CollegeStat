#!/usr/bin/env python3
"""Download current official IPEDS releases, retaining per-file evidence and hashes.
Fall 2025 released July 2026; winter 2024 is the latest published admissions cycle.
Never assign a retrieval year as the observation year.
"""
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('fetch_public', Path(__file__).with_name('fetch-public.py'))
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)
tables = ['HD2025', 'IC2025', 'EFFY2025', 'ADM2024', 'COST1_2024', 'SFA2324']
f.many([('ipeds', table + suffix + '.zip', 'https://nces.ed.gov/ipeds/complete-data-files/' + table + suffix + '.zip') for table in tables for suffix in ['', '_Dict']])
