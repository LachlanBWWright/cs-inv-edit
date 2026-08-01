export interface ModalBackdropProps {
  label: string;
  onClick: () => void;
  class?: string;
}

export function ModalBackdrop(props: ModalBackdropProps) {
  return (
    <button
      type="button"
      class={`modal-backdrop cursor-default ${props.class ?? ""}`}
      aria-label={props.label}
      onClick={props.onClick}
    />
  );
}

export function ModalCloseRow(props: {
  label: string;
  onClose: () => void;
  buttonClass?: string;
}) {
  return (
    <div class="mb-2 flex justify-end">
      <IconButton
        label={props.label}
        class={props.buttonClass}
        onClick={props.onClose}
      >
        ×
      </IconButton>
    </div>
  );
}
import { IconButton } from "./IconButton.js";
