import { Show } from "solid-js";
import { swapScreenshotURL } from "./cs2-screenshot.js";
import { ActionLink } from "./ui/ActionLink.js";

export function GameInventoryCommerceActions(props: {
  inventoryUrl?: string;
  saleUrl?: string;
  inspectUrl?: string;
}) {
  const screenshotUrl = () => swapScreenshotURL(props.inspectUrl);
  return (
    <Show
      when={
        props.inventoryUrl ||
        props.saleUrl ||
        props.inspectUrl ||
        screenshotUrl()
      }
    >
      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        <Show when={props.inventoryUrl}>
          {(url) => (
            <ActionLink href={url()} tone="primary">
              View in inventory ↗
            </ActionLink>
          )}
        </Show>
        <Show when={props.saleUrl}>
          {(url) => (
            <ActionLink href={url()} tone="primary">
              Sell on Steam ↗
            </ActionLink>
          )}
        </Show>
        <Show when={props.inspectUrl}>
          {(url) => (
            <ActionLink href={url()} tone="primary">
              Inspect in game ↗
            </ActionLink>
          )}
        </Show>
        <Show when={screenshotUrl()}>
          {(url) => (
            <ActionLink href={url()}>Generate screenshot ↗</ActionLink>
          )}
        </Show>
      </div>
    </Show>
  );
}
