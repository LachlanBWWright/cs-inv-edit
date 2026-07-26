import { render } from "solid-js/web";
import {
  App,
  createSharedDataClient,
  type LocalAgentClient,
} from "@cs-inv-edit/app";
import "@cs-inv-edit/app/styles.css";

const backend: LocalAgentClient = window.cs2;
const dataServiceUrl =
  (import.meta as ImportMeta & { env?: { VITE_DATA_SERVICE_URL?: string } }).env
    ?.VITE_DATA_SERVICE_URL ?? "http://127.0.0.1:7332";
const data = createSharedDataClient(dataServiceUrl);

render(
  () => <App backend={backend} data={data} platform="desktop" />,
  document.getElementById("root")!,
);
