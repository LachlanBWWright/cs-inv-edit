import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountViewLayout } from "./account-view-sections.js";

const noOp = () => undefined;
const noEvent = (_event: Event) => undefined;

// A deterministic, local-only QR-shaped SVG keeps screenshots stable without
// contacting Steam or depending on a generated challenge URL.
const mockQR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 210 210'%3E%3Crect width='210' height='210' fill='white'/%3E%3Cg fill='black'%3E%3Cpath d='M10 10h60v60H10zM20 20v40h40V20zM30 30h20v20H30zM140 10h60v60h-60zM150 20v40h40V20zM160 30h20v20h-20zM10 140h60v60H10zM20 150v40h40v-40zM30 160h20v20H30zM90 10h10v10H90zM110 10h10v20h-10zM80 40h20v10H80zM100 60h20v10h-20zM80 90h10v20H80zM100 90h20v10h-20zM130 90h10v20h-10zM150 90h20v10h-20zM180 90h20v10h-20zM90 120h20v10H90zM120 120h10v20h-10zM140 120h20v10h-20zM170 120h10v20h-10zM90 150h10v20H90zM110 150h20v10h-20zM140 150h10v20h-10zM160 160h20v10h-20zM190 150h10v30h-10zM90 190h20v10H90zM120 180h20v20h-20zM150 190h20v10h-20z'/%3E%3C/g%3E%3C/svg%3E";

const baseArgs = {
  status: "",
  loading: false,
  connectionState: undefined,
  connectionDetail: undefined,
  accountName: undefined,
  username: "",
  password: "",
  passwordVisible: false,
  guardCode: "",
  qrImage: "",
  qrLoadingText: "Preparing QR sign-in…",
  onUsernameChange: noOp,
  onPasswordChange: noOp,
  onPasswordToggle: noOp,
  onGuardCodeChange: noOp,
  onConnect: noEvent,
  onSteamGuard: noEvent,
  onDisconnect: noOp,
  onRetrySteamQR: noOp,
  onRefreshSteamQR: noOp,
};

const meta = {
  title: "Accounts/Sign in",
  component: AccountViewLayout,
  decorators: [
    (Story) => <div class="mx-auto max-w-6xl"><Story /></div>,
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Deterministic sign-in states used for QR and connection-status visual regression coverage.",
      },
    },
  },
} satisfies Meta<typeof AccountViewLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QRReady: Story = {
  args: {
    ...baseArgs,
    qrImage: mockQR,
    qrLoadingText: "Rendering secure QR code…",
  },
};

export const QRLoading: Story = {
  args: {
    ...baseArgs,
    connectionState: "connecting",
    connectionDetail: "Connecting to Steam and creating a QR sign-in session",
    qrLoadingText: "Connecting to Steam and requesting a sign-in session…",
  },
};

export const QRStillWaiting: Story = {
  args: {
    ...baseArgs,
    qrLoadingText: "Still waiting for Steam to create a sign-in session…",
  },
};

export const QRConnectionError: Story = {
  args: {
    ...baseArgs,
    connectionState: "error",
    connectionDetail:
      "Steam approved the sign-in, but the connection server asked us to reconnect. Try again to finish signing in.",
    qrLoadingText:
      "Steam approved the sign-in, but the connection server asked us to reconnect. Try again to finish signing in.",
  },
};

export const QRReconnectError: Story = {
  args: {
    ...baseArgs,
    connectionState: "error",
    connectionDetail:
      "Steam requested a different connection server after 3 attempts.",
    qrLoadingText:
      "Steam requested a different connection server after 3 attempts.",
  },
};

export const SteamGuardRequired: Story = {
  args: {
    ...baseArgs,
    connectionState: "needs_steam_guard",
    connectionDetail: "Approve this sign-in on your Steam mobile app.",
  },
};

export const SessionConflict: Story = {
  args: {
    ...baseArgs,
    connectionState: "session_conflict",
    connectionDetail:
      "Close CS2 or sign out of Steam on the other device, then retry.",
  },
};

export const Connected: Story = {
  args: {
    ...baseArgs,
    connectionState: "connected",
    accountName: "demo-account",
  },
};
