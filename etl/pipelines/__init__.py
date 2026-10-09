"""
ETL Pipeline Orchestration
============================
Pipeline stages and full end-to-end orchestration.

Usage:
  python -m pipelines.run_incremental_load           # Full pipeline
  python -m pipelines.stage_1_extract [--first-run]  # Extract stage
  python -m pipelines.stage_2_transform [--first-run] # Transform/validate stage
  python -m pipelines.stage_3_load [--first-run]     # Load stage
"""
