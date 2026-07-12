"""Minimal client (stdlib only) — upload a slip image and print the result.

Usage:  python client.py <slip-image> <amount> [api-url]
Example: python client.py slip.jpg 10.00
"""

import json
import sys
import urllib.request
import uuid

API = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:8000/verify/image"


def verify(image_path: str, amount: str, url: str) -> dict:
    image = open(image_path, "rb").read()
    boundary = "----" + uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"amount\"\r\n\r\n{amount}\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"slip.jpg\"\r\n"
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode() + image + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.load(resp)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: python client.py <slip-image> <amount> [api-url]")
    result = verify(sys.argv[1], sys.argv[2], API)
    print(json.dumps(result, ensure_ascii=False, indent=2))
