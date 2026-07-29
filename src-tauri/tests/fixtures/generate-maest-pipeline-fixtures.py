"""Regenerate the deterministic 30-second WAV and FLAC pipeline fixtures."""

import base64
import math
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

FIXTURES = Path(__file__).parent


def write_tone(path: Path, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
        for index in range(sample_rate * 30):
            value = round(
                6_000 * math.sin(2 * math.pi * 440 * index / sample_rate)
                + 2_000 * math.sin(2 * math.pi * 997 * index / sample_rate)
            )
            output.writeframesraw(struct.pack("<h", value))


def encode_base64(source: Path, destination: Path) -> None:
    encoded = base64.b64encode(source.read_bytes()).decode("ascii")
    destination.write_text(
        "\n".join(encoded[index : index + 76] for index in range(0, len(encoded), 76))
        + "\n",
        encoding="ascii",
    )


with tempfile.TemporaryDirectory() as temporary_directory:
    temporary = Path(temporary_directory)
    wav_16 = temporary / "maest-pipeline-16khz.wav"
    wav_44 = temporary / "maest-pipeline-44khz.wav"
    flac_44 = temporary / "maest-pipeline-44khz.flac"
    write_tone(wav_16, 16_000)
    write_tone(wav_44, 44_100)
    subprocess.run(
        ["flac", "--silent", "--best", f"--output-name={flac_44}", str(wav_44)],
        check=True,
    )
    encode_base64(wav_16, FIXTURES / "maest-pipeline-16khz.wav.b64")
    encode_base64(flac_44, FIXTURES / "maest-pipeline-44khz.flac.b64")
