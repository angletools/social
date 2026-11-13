# Arabic classification evaluation

The bundled dialect examples are a development smoke set. They do not establish independent Arabic accuracy or safe live recommendations.

For a release decision, have native Saudi/Gulf reviewers independently label held-out posts from the intended use cases. Resolve disagreements and record reviewer agreement separately. Include Saudi/Gulf, MSA, Egyptian and Arabizi slices; mixed-language text; sarcasm; quoted claims; negation; ambiguous brand names; and adversarial posts containing instruction-like text. Keep customer content out of the repository unless explicitly approved.

Use the same JSON fields as `dialect-set.json`: `text`, `dialect`, `sentiment`, `intent`, `sarcasm`. Point `EVAL_DATASET` at the approved held-out file, set `EVAL_ORG_ID` to an isolated workspace and configure its AI allowance. `npm run eval:dialect` makes paid requests in batches of at most 25. `EVAL_MIN_ACCURACY` sets the minimum per-field accuracy (default 0.8); choose the release threshold with the team before evaluating. `EVAL_OUTPUT` sets the result path (default `/tmp/rasd-dialect-evaluation.json`).

The output records the model, classifier version, dataset hash, coverage, per-field accuracy and dialect slices. Missing results count as failures; duplicate or invalid indices reject the run. A non-passing result exits nonzero. The output deliberately does not assert independent validation: reviewer independence, agreement, representativeness, adequate slice sizes and risk-specific error rates need a separate signed review.

Confidence shown in the app is the model's own rating, not a calibrated probability. Review risk decisions against the source post. Local tests cover evidence encoding and result validation; they do not establish resistance to prompt injection in a real model.
