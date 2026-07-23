# Discogs-EffNet attribution

- Original model: `discogs-effnet-bs64-1`, version 1 (`EffnetDiscogs`).
- Model author: Pablo Alonso, Music Technology Group, Universitat Pompeu Fabra.
- Related publication: Pablo Alonso-Jiménez, Xavier Serra and Dmitry Bogdanov, “Music Representation Learning Based on Editorial Metadata from Discogs”, ISMIR 2022.
- Original official source: https://essentia.upf.edu/models/feature-extractors/discogs-effnet/
- Original model license: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0). The applicable license text is included separately in `LICENSE-CC-BY-NC-SA-4.0.txt`.
- Intended use in DJOrganizer: personal, non-commercial, local genre suggestions that require manual acceptance.

## Changes to the licensed material

On 2026-07-22, the official TensorFlow Frozen Graph was converted to a TensorFlow.js GraphModel. TensorFlow functions were materialized into an intermediate Frozen Graph and the two existing outputs were given distinct identity names (`discogs_predictions` and `discogs_embeddings`) so TensorFlow.js could expose both ports. The conversion did not quantize, prune or intentionally alter any trained weight. The derived TensorFlow.js files remain subject to CC BY-NC-SA 4.0.

Original file integrity:

- `discogs-effnet-bs64-1.pb`: SHA-256 `3ed9af50d5367c0b9c795b294b00e7599e4943244f4cbd376869f3bfc87721b1`
- `discogs-effnet-bs64-1.json`: SHA-256 `a35003202384735c33154e20264267f9941705218a7b93202b655a1d408d4ff6`

DJOrganizer and its authors do not claim endorsement by the model author, MTG, UPF or Discogs.
