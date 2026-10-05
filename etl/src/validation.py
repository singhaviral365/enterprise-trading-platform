"""Data quality validation and dead-letter handling."""

import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import NamedTuple

import pandas as pd

logger = logging.getLogger(__name__)


class ValidationFailureReason(str, Enum):
    """Reasons a row may fail validation."""
    NEGATIVE_QUANTITY = "negative_quantity"
    NEGATIVE_PRICE = "negative_price"
    INVALID_SIDE = "invalid_side"
    INVALID_STATUS = "invalid_status"
    MISSING_ACCOUNT = "missing_account_key"
    MISSING_INSTRUMENT = "missing_instrument_key"
    MISSING_DATE = "missing_date_key"
    TRADE_VALUE_MISMATCH = "trade_value_mismatch"
    DUPLICATE_ORDER = "duplicate_source_order_id"
    TYPE_ERROR = "type_error"
    NULL_REQUIRED_FIELD = "null_required_field"
    UNKNOWN = "unknown_error"


class DeadLetterRow(NamedTuple):
    """A row that failed validation."""
    source_order_id: str
    reason: str
    details: str
    batch_id: str
    failed_at: str


class ValidationError(RuntimeError):
    """Raised when validation fails."""


VALID_SIDES = {"BUY", "SELL"}
VALID_STATUSES = {"NEW", "FILLED", "REJECTED", "CANCELLED"}


def validate_and_split(
    dataframe: pd.DataFrame,
    dimension_keys: dict,
    existing_order_ids: set,
    batch_id: str,
) -> tuple[pd.DataFrame, list[DeadLetterRow]]:
    """
    Validate fact trade rows and separate valid from invalid.
    
    Args:
        dataframe: DataFrame with columns from Postgres orders join with dimension lookups.
        dimension_keys: Dict with keys 'account_keys', 'instrument_keys', 'date_keys'
                       mapping source IDs to surrogate keys.
        existing_order_ids: Set of source_order_ids already in fact_trades.
        batch_id: Identifier for this batch load.
    
    Returns:
        Tuple of (valid_rows_df, dead_letter_rows_list)
    """
    valid_rows = []
    dead_letters = []
    
    for idx, row in dataframe.iterrows():
        try:
            # Check for nulls in required fields
            required_fields = ['source_order_id', 'account_id', 'symbol', 'side', 'quantity', 
                             'limit_price', 'status', 'created_on']
            for field in required_fields:
                if pd.isna(row.get(field)):
                    raise ValueError(f"Null value in required field: {field}")
            
            source_order_id = str(row['source_order_id'])
            
            # Check for duplicate
            if source_order_id in existing_order_ids:
                dead_letters.append(DeadLetterRow(
                    source_order_id=source_order_id,
                    reason=ValidationFailureReason.DUPLICATE_ORDER.value,
                    details=f"Order {source_order_id} already loaded",
                    batch_id=batch_id,
                    failed_at=datetime.now().isoformat(),
                ))
                continue
            
            # Validate quantity
            quantity = int(row['quantity'])
            if quantity <= 0:
                raise ValueError(f"Quantity must be positive, got {quantity}")
            
            # Validate price
            limit_price = float(row['limit_price'])
            if limit_price <= 0:
                raise ValueError(f"Price must be positive, got {limit_price}")
            
            # Validate side
            side = str(row['side']).upper()
            if side not in VALID_SIDES:
                raise ValueError(f"Invalid side: {side}, must be {VALID_SIDES}")
            
            # Validate status
            status = str(row['status']).upper()
            if status not in VALID_STATUSES:
                raise ValueError(f"Invalid status: {status}, must be {VALID_STATUSES}")
            
            # Look up dimension keys
            account_id = str(row['account_id'])
            symbol = str(row['symbol']).upper()
            created_on = pd.Timestamp(row['created_on'])
            date_key = int(created_on.strftime("%Y%m%d"))
            
            account_key = dimension_keys['account_keys'].get(account_id)
            if account_key is None:
                raise ValueError(f"Account {account_id} not found in dim_account")
            
            instrument_key = dimension_keys['instrument_keys'].get(symbol)
            if instrument_key is None:
                raise ValueError(f"Instrument {symbol} not found in dim_instrument")
            
            if date_key not in dimension_keys['date_keys']:
                raise ValueError(f"Date {date_key} not found in dim_date")
            
            # Compute trade_value
            trade_value = quantity * limit_price
            
            # Validate trade_value matches expected (if provided)
            if 'trade_value' in row and not pd.isna(row['trade_value']):
                provided_value = float(row['trade_value'])
                if abs(trade_value - provided_value) > 0.01:  # Allow small floating-point error
                    raise ValueError(
                        f"Trade value mismatch: computed {trade_value}, provided {provided_value}"
                    )
            
            # Row is valid
            valid_row = {
                'source_order_id': source_order_id,
                'account_key': account_key,
                'instrument_key': instrument_key,
                'date_key': date_key,
                'side': side,
                'quantity': quantity,
                'price': limit_price,
                'status': status,
                'trade_value': trade_value,
                'created_at': created_on,
            }
            
            # Add executed_price if available (for FILLED orders)
            if 'executed_price' in row and not pd.isna(row['executed_price']):
                valid_row['executed_price'] = float(row['executed_price'])
            else:
                valid_row['executed_price'] = None
            
            valid_rows.append(valid_row)
        
        except Exception as exc:
            reason = _get_failure_reason(str(exc))
            dead_letters.append(DeadLetterRow(
                source_order_id=str(row.get('source_order_id', 'UNKNOWN')),
                reason=reason.value,
                details=str(exc),
                batch_id=batch_id,
                failed_at=datetime.now().isoformat(),
            ))
    
    valid_df = pd.DataFrame(valid_rows) if valid_rows else pd.DataFrame()
    
    logger.info(
        "Validation complete: %d valid, %d invalid (dead-lettered)",
        len(valid_rows),
        len(dead_letters),
    )
    
    return valid_df, dead_letters


def _get_failure_reason(error_msg: str) -> ValidationFailureReason:
    """Infer failure reason from error message."""
    error_lower = error_msg.lower()
    
    if "quantity" in error_lower or "negative_quantity" in error_lower:
        return ValidationFailureReason.NEGATIVE_QUANTITY
    if "price" in error_lower or "negative_price" in error_lower:
        return ValidationFailureReason.NEGATIVE_PRICE
    if "side" in error_lower or "invalid side" in error_lower:
        return ValidationFailureReason.INVALID_SIDE
    if "status" in error_lower or "invalid status" in error_lower:
        return ValidationFailureReason.INVALID_STATUS
    if "account" in error_lower or "not found in dim_account" in error_lower:
        return ValidationFailureReason.MISSING_ACCOUNT
    if "instrument" in error_lower or "not found in dim_instrument" in error_lower:
        return ValidationFailureReason.MISSING_INSTRUMENT
    if "date" in error_lower or "not found in dim_date" in error_lower:
        return ValidationFailureReason.MISSING_DATE
    if "trade_value" in error_lower or "mismatch" in error_lower:
        return ValidationFailureReason.TRADE_VALUE_MISMATCH
    if "duplicate" in error_lower:
        return ValidationFailureReason.DUPLICATE_ORDER
    if "type" in error_lower:
        return ValidationFailureReason.TYPE_ERROR
    if "null" in error_lower:
        return ValidationFailureReason.NULL_REQUIRED_FIELD
    
    return ValidationFailureReason.UNKNOWN


def save_dead_letters(
    dead_letters: list[DeadLetterRow],
    output_dir: Path,
) -> Path | None:
    """
    Save dead-lettered rows to CSV.
    
    Args:
        dead_letters: List of DeadLetterRow tuples.
        output_dir: Directory to write dead-letter file.
    
    Returns:
        Path to dead-letter file, or None if no dead letters.
    """
    if not dead_letters:
        return None
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    dl_df = pd.DataFrame([
        {
            'source_order_id': dl.source_order_id,
            'reason': dl.reason,
            'details': dl.details,
            'batch_id': dl.batch_id,
            'failed_at': dl.failed_at,
        }
        for dl in dead_letters
    ])
    
    output_path = output_dir / f"dead_letters_{dead_letters[0].batch_id}.csv"
    dl_df.to_csv(output_path, index=False)
    
    logger.info("Saved %d dead-lettered rows to %s", len(dead_letters), output_path)
    
    return output_path
