import type { Preview } from "storybook-solidjs-vite";
import "../src/styles.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Inventory"],
      },
    },
  },
  decorators: [
    (Story) => (
      <main class="min-h-screen bg-slate-950 p-6 text-slate-50">
        <Story />
      </main>
    ),
  ],
};

export default preview;
