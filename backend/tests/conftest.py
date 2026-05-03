import os
from unittest.mock import MagicMock, patch

# Ensure test collection does not require real Supabase credentials.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

_supabase_patch = patch("supabase.create_client", return_value=MagicMock(name="supabase_client_mock"))
_supabase_patch.start()
