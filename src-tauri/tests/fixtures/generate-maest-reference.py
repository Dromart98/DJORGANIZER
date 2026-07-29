"""Regenerate the MAEST preprocessing fixture with official Essentia b9fa6cb.

Run with the official Essentia Python bindings after checking the algorithms
against commit b9fa6cb674ca43dfb94d28d293aeda441c6745db. Essentia is a fixture-generation
tool only and is not a DJOrganizer dependency.
"""

import base64
from pathlib import Path

import numpy as np
from essentia.standard import FrameGenerator, TensorflowInputMusiCNN

FRAMES = 1876
BANDS = 96
SAMPLES = 480_000
state = 0x12345678
audio = np.empty(SAMPLES, dtype=np.float32)
for index in range(SAMPLES):
    state = (state * 1_664_525 + 1_013_904_223) & 0xFFFFFFFF
    audio[index] = (
        np.float32((state >> 16) - 32_768)
        / np.float32(32_768.0)
        * np.float32(0.2)
    )

extract = TensorflowInputMusiCNN()
mel = np.asarray(
    [
        extract(frame)
        for frame in FrameGenerator(
            audio, frameSize=512, hopSize=256, startFromZero=False
        )
    ],
    dtype=np.float32,
)
assert mel.shape == (FRAMES, BANDS)
normalized = (mel - np.float32(2.06755686098554)) * np.float32(
    1.0 / (1.268292820667291 * 2.0)
)
path = Path(__file__).with_name("maest-preprocessing-essentia-b9fa6cb.bin.b64")
raw = normalized.astype("<f4").tobytes()
path.write_bytes(base64.encodebytes(raw))
print(f"wrote {path}: shape={normalized.shape}")
