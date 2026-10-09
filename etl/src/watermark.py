"""Watermark management for incremental loads."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


class WatermarkError(RuntimeError):
    """Raised when watermark operations fail."""


def load_watermark(watermark_file: Path) -> datetime | None:
    """
    Load the last recorded watermark timestamp.
    
    Args:
        watermark_file: Path to watermark JSON file.
    
    Returns:
        datetime of last watermark, or None if file doesn't exist.
    """
    if not watermark_file.exists():
        logger.info("No watermark file found: %s", watermark_file)
        return None
    
    try:
        with open(watermark_file, 'r') as f:
            data = json.load(f)
        
        watermark_str = data.get('last_load_timestamp')
        if not watermark_str:
            logger.warning("Watermark file exists but is empty")
            return None
        
        watermark = datetime.fromisoformat(watermark_str)
        logger.info("Loaded watermark: %s", watermark)
        return watermark
    
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise WatermarkError(f"Failed to load watermark from {watermark_file}") from exc


def save_watermark(watermark_file: Path, watermark: datetime, batch_id: str) -> None:
    """
    Save the current watermark timestamp.
    
    Args:
        watermark_file: Path to watermark JSON file.
        watermark: datetime to save.
        batch_id: Identifier for this batch load.
    """
    watermark_file.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        'last_load_timestamp': watermark.isoformat(),
        'batch_id': batch_id,
        'saved_at': datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
    
    try:
        with open(watermark_file, 'w') as f:
            json.dump(data, f, indent=2)
        logger.info("Saved watermark: %s (batch: %s)", watermark, batch_id)
    except IOError as exc:
        raise WatermarkError(f"Failed to save watermark to {watermark_file}") from exc
