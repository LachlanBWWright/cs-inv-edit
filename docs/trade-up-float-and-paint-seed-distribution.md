# Float and Paint-Seed Distribution Notes

This document records findings from CSFloat's July 3, 2020 analysis,
[Analysis of Float Value and Paint Seed Distribution in CS:GO](https://blog.csfloat.com/analysis-of-float-value-and-paint-seed-distribution-in-cs-go/),
that are relevant to trade-up previews and item metadata.

The article predates CS2 and the October 2025 trade-up changes. It is an
empirical analysis of generated CS:GO items, not an official Valve
specification. Use it to explain observed population distributions and item
attributes, not as authority for the current trade-up formula. See
[`trade-up-formula.md`](trade-up-formula.md) for the formula modeled by this
project.

## Float generation findings

- Float values are stored as IEEE 754 32-bit floating-point values.
- Naturally generated items were observed to select a wear category first and
  then distribute floats approximately uniformly within that category's
  interval. The article reports this example distribution for AK-47 | Case
  Hardened: approximately 3% Factory New, 24% Minimal Wear, 33% Field-Tested,
  24% Well-Worn, and 16% Battle-Scarred.
- This category-first generation leaves gaps around wear boundaries in
  naturally generated items. The article gives the example of an M4A4 |
  Magnesium with no naturally generated floats between 0.07 and 0.08. It also
  states that trade-up outputs follow a different calculation and therefore do
  not necessarily share those gaps.
- For a finish whose allowed range is `[min_float, max_float]`, the observed
  natural-generation transform is:

  ```text
  final_float = generated_float * (max_float - min_float) + min_float
  ```

  This compresses the underlying distribution into the finish's allowed float
  range. Consequently, equal-width portions of a visible wear category need
  not be equally likely for a float-capped finish.
- Within an individual generated wear interval, the article found the values
  approximately uniform, including at very low float values. This does not
  mean that floats are uniform across the entire 0–1 range, because the wear
  categories themselves have different probabilities.
- The article observed that the population of trade-up outputs skews toward
  lower floats because players can select inputs and because many finishes
  have a maximum float below 1. This is selection bias in the item population,
  not evidence that the outcome item or its paint seed is selected
  non-uniformly.

## Paint-seed findings

- A paint seed controls pseudo-random texture transformations such as offset,
  scale, and rotation. Its visual importance depends on the finish.
- In the article's sample of roughly 50,000 items, paint seeds appeared
  uniformly distributed over the generated range: one ordinary seed was about
  as likely as another.
- The article describes seeds as ranging from 0 through 1000, while also noting
  that seed 1000 could only originate from a trade-up. Its unboxing example
  therefore treats a particular seed as roughly a 1-in-1000 event. Preserve
  the integer seed reported by the GC rather than deriving it from float or
  display metadata.
- Identical paint seeds reproduce the same texture placement for the same
  paint kit and weapon. A seed alone is not a global pattern classification;
  its meaning is tied to the finish and model.

## Implications for trade-up previews

1. Keep outcome probability separate from output wear. Collection and finish
   selection determine which item is produced; the current trade-up wear
   formula determines its float.
2. Do not use the article's natural-drop wear percentages to weight trade-up
   outcomes. They describe naturally generated items, not contract outcome
   odds.
3. Show the output finish's allowed minimum and maximum when presenting a
   predicted float. Float caps change the numeric output and the population
   distribution users observe.
4. Do not infer an output paint seed from input floats or seeds. The article
   supports treating paint seed as a distinct generated attribute, but it does
   not specify the current GC's trade-up seed-generation algorithm.
5. Label rarity claims carefully. A low float can be rare in the natural item
   population yet intentionally targetable through a trade-up, and visually
   desirable paint seeds are finish-specific even if seed numbers are
   approximately uniform.

## Scope and confidence

The strongest findings are the observed shape of historical natural-drop float
distributions, the float-range transform, and the approximately uniform
paint-seed sample. Exact percentages, boundary behavior, the special handling
of seed 1000, and any server-side generator details should be treated as
historical observations until verified against current CS2 data. None of these
findings supersedes live `items_game.txt` wear caps, GC-owned item attributes,
or current contract-result validation.
