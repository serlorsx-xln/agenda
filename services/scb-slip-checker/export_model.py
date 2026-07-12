"""Export the PyTorch captcha CNN (models/captcha_cnn.pt) to the flat binary the
Go code embeds (model/model.bin). Only needed if you retrain/replace the model —
model/model.bin is committed, so `go build` works without running this.

Run:  python export_model.py
"""

from __future__ import annotations

import struct
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "models" / "captcha_cnn.pt"
OUT = ROOT / "model" / "model.bin"


def main() -> None:
    state = torch.load(SRC, map_location="cpu", weights_only=False)
    charset = state["charset"]
    n_chars, w, h = int(state["n_chars"]), int(state["w"]), int(state["h"])
    weights = state["model"]
    tensors = [(k, v) for k, v in weights.items() if v.dtype.is_floating_point]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(b"SCBM")
        cs = charset.encode("utf-8")
        f.write(struct.pack("<i", len(cs)))
        f.write(cs)
        f.write(struct.pack("<iii", n_chars, w, h))
        f.write(struct.pack("<i", len(tensors)))
        for name, t in tensors:
            t = t.contiguous().float()
            nb = name.encode("utf-8")
            f.write(struct.pack("<i", len(nb)))
            f.write(nb)
            dims = list(t.shape)
            f.write(struct.pack("<i", len(dims)))
            for d in dims:
                f.write(struct.pack("<i", int(d)))
            f.write(t.numpy().astype("<f4").tobytes())

    print(f"wrote {OUT}  ({OUT.stat().st_size/1e6:.2f} MB)  charset={charset!r} n_chars={n_chars} w={w} h={h} tensors={len(tensors)}")


if __name__ == "__main__":
    main()
