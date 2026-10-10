# Real-document fixtures

These are **genuine** visa PDFs downloaded from official sources, kept so the
unit tests cannot imply a capability the extractor does not have:

| file | source | size |
|------|--------|------|
| `real-eu-schengen-form.pdf` | European Commission, Harmonised application form (home-affairs.ec.europa.eu) | ~290 KB |
| `real-dk-vfs-form.pdf` | VFS Global Denmark, Schengen visa application | ~98 KB |
| `real-de-schengen-form.pdf` | German Federal Foreign Office, Schengen application (germany.info) | ~284 KB |
| `hotel-booking.pdf` | synthetic (reportlab) — the case import is scoped to | ~2 KB |
| `scanned.pdf` | synthetic, genuinely image-only — the honest-refusal case | ~1.7 KB |
| `encrypted.pdf` | synthetic, password-protected — the honest-refusal case | ~2 KB |

The DS-160 exemplar (10 MB, 83 pages, from tahirih.org) is **not** committed: it is
too large for a demo repo, and its text layer is a scanned image anyway — the
verbatim lines it contributes are asserted in `test/real-docs.test.mjs` instead.

## The finding these exist to protect

Measured with `python3 tools/bench_real.py`:

```
file                      chars   "label: value" lines   fields extracted
hotel-booking.pdf          342          11                7/7  (high confidence)
real-dk-vfs-form.pdf      9937           6                0
real-eu-schengen-form.pdf 4950           3                0
real-de-schengen-form.pdf 8897           2                0
real-ds160-exemplar.pdf    191           0                0
```

**PDF import reads booking confirmations, itineraries and bank statements. It
does not read official application forms.** Those lay fields out in boxed grid
cells, so a label and its filled-in value sit on different baselines and never
pair up — and worse, a naive pairing pairs one field's label with the *next*
field's label.

The UI says exactly this rather than showing a vague "nothing recognised", and
`test/real-docs.test.mjs` asserts it so the limitation cannot be quietly
regressed away.
