import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lachlanbwwright.csinvedit",
  appName: "CS Inventory Edit",
  webDir: "apps/web/dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
