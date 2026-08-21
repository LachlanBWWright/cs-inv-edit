import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Alert } from "./Alert.js";
import { Button } from "./Button.js";
import { Card, CardContent, CardHeader } from "./Card.js";
import { Input } from "./Input.js";
import { PageHeader } from "./PageHeader.js";
import { SegmentedControl } from "./SegmentedControl.js";
import { Select } from "./Select.js";
import { Surface } from "./Surface.js";
import { WearRangeBar } from "./WearRangeBar.js";

function ButtonGallery() {
  return (
    <section class="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Shared UI"
        title="Buttons"
        description="Supported variants, sizes, and disabled states."
      />
      <Surface class="flex flex-wrap items-center gap-3 p-5">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="action">Action</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
      </Surface>
      <Surface class="flex items-center gap-3 p-5" tone="inset">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Surface>
    </section>
  );
}

function FormGallery() {
  const [mode, setMode] = createSignal<"items" | "value">("items");
  return (
    <section class="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Shared UI" title="Form controls" />
      <Card>
        <CardHeader>
          <h3 class="font-semibold">Inventory filters</h3>
        </CardHeader>
        <CardContent class="grid gap-4">
          <label class="grid gap-1.5 text-sm text-slate-300">
            Search
            <Input value="AK-47" placeholder="Search inventory" />
          </label>
          <label class="grid gap-1.5 text-sm text-slate-300">
            Sort
            <Select value="price-high">
              <option value="price-high">Price: high to low</option>
              <option value="float-low">Float: low to high</option>
            </Select>
          </label>
          <SegmentedControl
            value={mode()}
            options={[
              { value: "items", label: "Items", suffix: <span>128</span> },
              { value: "value", label: "Value", suffix: <span>$842</span> },
            ]}
            onChange={setMode}
            label="Inventory summary"
          />
          <Input disabled value="Unavailable while disconnected" />
        </CardContent>
      </Card>
    </section>
  );
}

function FeedbackGallery() {
  return (
    <section class="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="Shared UI" title="Status and feedback" />
      <Alert>Inventory metadata is up to date.</Alert>
      <Alert variant="success">Storage operation completed.</Alert>
      <Alert variant="warning">Connect to Steam before refreshing.</Alert>
      <Alert variant="danger">The GC rejected this operation.</Alert>
      <WearRangeBar wear={0.092_814} min={0} max={0.7} />
      <WearRangeBar wear={0.418_721} min={0.06} max={0.8} />
    </section>
  );
}

const meta = {
  title: "Shared UI/Foundation",
  component: Surface,
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = { render: () => <ButtonGallery /> };
export const FormControls: Story = { render: () => <FormGallery /> };
export const Feedback: Story = { render: () => <FeedbackGallery /> };
