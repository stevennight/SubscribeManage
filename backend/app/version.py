"""Build and runtime version metadata."""
import os


VERSION = os.getenv("SUBSCRIBEMANAGE_VERSION", "0.1.0-dev")
COMMIT = os.getenv("SUBSCRIBEMANAGE_COMMIT", "")
BUILD_DATE = os.getenv("SUBSCRIBEMANAGE_BUILD_DATE", "")


def info() -> dict[str, str]:
    """Return version metadata for health and diagnostics endpoints."""
    return {
        "version": VERSION,
        "commit": COMMIT,
        "build_date": BUILD_DATE,
    }
