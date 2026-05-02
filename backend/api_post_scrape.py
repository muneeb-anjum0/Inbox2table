import requests

URL = 'http://127.0.0.1:5000/api/scrape'
HEADERS = {'X-User-Email': '2380223@szabist-isb.pk', 'Content-Type': 'application/json'}

resp = requests.post(URL, headers=HEADERS, json={"force_refresh": True})
print('Status:', resp.status_code)
try:
    print(resp.json())
except Exception as e:
    print(resp.text)
