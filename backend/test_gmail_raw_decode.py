import base64
from scraper.gmail_client import _parse_raw_message_html, _base64_urlsafe_decode

# Construct a simple multipart MIME with an HTML part
raw_message = b"From: test@example.com\r\nTo: you@example.com\r\nSubject: Test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=abc123\r\n\r\n--abc123\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis is plain text\r\n--abc123\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><p>Full HTML content with <b>table</b></p></body></html>\r\n--abc123--\r\n"
raw_b64 = base64.urlsafe_b64encode(raw_message).decode('utf-8')

print('Raw b64 length:', len(raw_b64))

html = _parse_raw_message_html(raw_b64)
print('Extracted HTML:', html)
