# Collection reveal wear generation

The collection slot-machine preview generates cosmetic miss-item floats using
the historical natural-drop model documented in
[`trade-up-float-and-paint-seed-distribution.md`](trade-up-float-and-paint-seed-distribution.md).
This is a UI simulation, not an assertion about Valve's current server-side
implementation and not the trade-up output formula.

## Algorithm

1. Select one source wear bracket using these observed probabilities:

   | Bracket | Source interval | Probability |
   | --- | ---: | ---: |
   | Factory New | 0.00–0.07 | 3% |
   | Minimal Wear | 0.07–0.15 | 24% |
   | Field-Tested | 0.15–0.38 | 33% |
   | Well-Worn | 0.38–0.45 | 24% |
   | Battle-Scarred | 0.45–1.00 | 16% |

2. Generate a value uniformly within the selected source interval. If its
   bounds are `bracket_min` and `bracket_max`, the generated value is:

   ```text
   generated_float = bracket_min + random_0_to_1 * (bracket_max - bracket_min)
   ```

3. Read the finish's current `wearMin` and `wearMax` caps from live CS2 item
   metadata. Missing caps default to 0 and 1 respectively.

4. Compress and translate the generated value into the finish's permitted
   range:

   ```text
   final_float = generated_float * (wearMax - wearMin) + wearMin
   ```

The bracket is deliberately chosen before the cap transform. Selecting a
visible bracket after applying caps would produce a different distribution.
The reveal card places `final_float` on the same five-colour wear bar used by
inventory item details and greys out values below `wearMin` or above `wearMax`.

If an authoritative item result already includes `paintWear`, the animation
uses that actual value. Generated floats are only used for simulated reel
misses and previews. Only weapon skins sourced from case contents are marked
as StatTrak™-eligible, and each such simulated miss independently has a 10%
chance. Ordinary skin collections, Armory collections, trade-up collections,
and non-skin entries never receive a synthetic StatTrak™ label.
