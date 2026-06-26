import { render } from "solid-js/web";
import { App, type AppBackendClient } from "@cs-inv-edit/app";
import "@cs-inv-edit/app/styles.css";

const backend: AppBackendClient = window.cs2;

render(() => <App backend={backend} platform="desktop" />, document.getElementById("root")!);
