import { Show, createSignal } from "solid-js";

export type ItemPreviewMediaVariant =
  "details" | "inventory-card" | "economy-card";

const mediaClasses: Record<
  ItemPreviewMediaVariant,
  { box: string; image: string }
> = {
  details: { box: "h-64 w-full text-2xl", image: "h-64 w-full" },
  "inventory-card": {
    box: "h-36 w-full text-xl",
    image: "h-36 w-full object-top",
  },
  "economy-card": { box: "h-20 w-full text-sm", image: "h-20 w-full" },
};

export function ItemPreviewMedia(props: {
  name: string;
  imageUrl?: string;
  variant: ItemPreviewMediaVariant;
}) {
  const [failed, setFailed] = createSignal(false);
  const classes = () => mediaClasses[props.variant];
  const initials = () =>
    props.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <Show
      when={!failed() ? props.imageUrl : undefined}
      fallback={
        <div
          class={`${classes().box} grid place-items-center bg-transparent font-semibold text-slate-600`}
        >
          {initials()}
        </div>
      }
    >
      {(url) => (
        <img
          class={`${classes().image} bg-transparent object-contain`}
          src={url()}
          alt={props.name}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </Show>
  );
}
