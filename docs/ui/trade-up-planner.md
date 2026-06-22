# Trade-up planner design defence

The trade-up planner uses ten fixed slots because the shape of the workflow is stable even when the item contents change. A fixed frame reduces cognitive load, especially on mobile, because the user can instantly understand how complete the basket is.

The summary box only shows a few values: collection, average float, and output framing. That keeps the interface decision-oriented instead of forcing the user to parse an over-detailed simulation panel.

The design intentionally surfaces validation errors in-place. Mixed-collection or incomplete baskets should fail visibly without throwing the user out of the workflow, which is why the error state occupies the same panel area as the success summary.
