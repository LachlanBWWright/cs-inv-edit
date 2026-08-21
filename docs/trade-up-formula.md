# Current CS2 Trade-Up Formula

This project models the trade-up behavior introduced alongside Valve's October
22, 2025 extension of Trade Up Contracts to knives and gloves.

Valve's official update confirms that five regular Covert items can produce a
regular knife or gloves from an eligible input collection, while five
StatTrak™ Covert items can produce a StatTrak™ knife. Regular weapon-skin
contracts continue to use ten inputs. Valve's May 2026 update also confirms
that Souvenir inputs lose all Souvenir attributes and produce a normal item one
quality higher.

Official update sources:

- https://store.steampowered.com/news/posts/?appids=730&enddate=1761258727&feed=steam_announce%2F1000
- https://www.counter-strike.net/news/updates?l=english

## Wear calculation

The post-update wear calculation normalizes every input within that finish's
own allowed float range before averaging:

```text
normalized_input = (input_float - input_min) / (input_max - input_min)
normalized_average = sum(normalized_inputs) / input_count
output_float = output_min + normalized_average * (output_max - output_min)
```

For identical inputs, `normalized_average` is simply that finish's normalized
wear. A 0–1 input at 0.50 and a 0–0.10 input at 0.05 are both normalized to
0.50 and contribute identical wear. This removes the old "float cap" advantage;
the output's own caps still determine its final numeric float.

Valve has not published this arithmetic in its patch notes. It is an observed
formula corroborated by post-update contract results, so previews are
descriptive rather than guarantees of a GC result.

For historical empirical findings about natural item float distributions,
float caps, paint seeds, and how those observations should be interpreted in a
trade-up preview, see
[`trade-up-float-and-paint-seed-distribution.md`](trade-up-float-and-paint-seed-distribution.md).

## Outcome probabilities

The newer selection behavior removes the old collection-size bias: an input's
collection contribution is based on its share of contract inputs, rather than
how many next-rarity finishes that collection contains. Candidates within that
collection pool divide its probability evenly.

For an identical-copy preview, only the input's eligible collection contributes
outcomes. Souvenir inputs are previewed as normal outputs. Knife/glove previews
first trace the live collection and its `item_sets[].unusuals` quality mapping.
Because Valve's public schema frequently names those rare-special pools without
enumerating their members, the pool is expanded through the live game-derived
crate index documented in [`cs2-items-game.md`](cs2-items-game.md). Every
expanded candidate must join back to a live Valve base item and paint kit.
Candidates are omitted when that relationship cannot be resolved instead of
being invented.
