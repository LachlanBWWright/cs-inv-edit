import { Show } from "solid-js";
import { Button } from "../../shared/ui/Button.js";

export function InventoryTradeUpToolbar(props: {
  active: boolean;
  selectedCount: number;
  requiredCount: number;
  onStart: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  return (
    <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2.5">
      <Show
        when={props.active}
        fallback={
          <Button variant="action" onClick={props.onStart}>
            Start a trade-up
          </Button>
        }
      >
        <div class="mr-auto">
          <p class="text-sm font-semibold text-slate-100">Build a trade-up contract</p>
          <p class="text-xs text-slate-400">
            {props.selectedCount}/{props.requiredCount} compatible skins selected
          </p>
        </div>
        <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        <Button
          disabled={props.selectedCount !== props.requiredCount}
          onClick={props.onReview}
        >
          Review trade-up
        </Button>
      </Show>
    </div>
  );
}
