import { createSignal, Show } from "solid-js";
import { Button } from "../../shared/ui/Button.js";
import {
  tf2CraftingRecipes,
  type TF2CraftingRecipe,
} from "./tf2-crafting-recipes.js";

export function TF2CraftingToolbar(props: {
  active: boolean;
  label: string;
  selectedCount: number;
  requiredCount: number;
  onStartRecipe: (recipe: TF2CraftingRecipe) => void;
  onStartStatClock: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  const [recipeId, setRecipeId] = createSignal(
    String(tf2CraftingRecipes[0]?.id ?? ""),
  );
  const startRecipe = () => {
    const recipe = tf2CraftingRecipes.find(
      (candidate) => candidate.id === Number(recipeId()),
    );
    if (recipe) props.onStartRecipe(recipe);
  };
  return (
    <div class="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2.5">
      <Show
        when={props.active}
        fallback={
          <>
            <label class="grid min-w-56 gap-1 text-xs text-slate-400">
              Crafting recipe
              <select
                class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
                value={recipeId()}
                onInput={(event) => setRecipeId(event.currentTarget.value)}
              >
                {tf2CraftingRecipes.map((recipe) => (
                  <option value={recipe.id}>{recipe.name}</option>
                ))}
              </select>
            </label>
            <Button variant="action" onClick={startRecipe}>
              Start recipe
            </Button>
            <Button variant="action" onClick={props.onStartStatClock}>
              Craft Stat Clock
            </Button>
          </>
        }
      >
        <div class="mr-auto">
          <p class="text-sm font-semibold text-slate-100">{props.label}</p>
          <p class="text-xs text-slate-400">
            {props.selectedCount}/{props.requiredCount} ingredients selected
          </p>
        </div>
        <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
        <Button
          disabled={props.selectedCount !== props.requiredCount}
          onClick={props.onReview}
        >
          Review craft
        </Button>
      </Show>
    </div>
  );
}
