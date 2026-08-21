import { AppView } from "./AppView.js";
import { fromAppPromise } from "../../shared/lib/result.js";
import { createOperationApi } from "../../shared/lib/api.js";
import type { EconomyGame } from "../../shared/ui-types.js";
import { createAppController } from "./app-controller.js";
import type { AppProps } from "./app-props.js";

export type { AppProps } from "./app-props.js";

export function App(props: AppProps) {
  const controller = createAppController(props);

  const handleConnect = async (input: {
    username?: string;
    password?: string;
  }) => {
    if (!props.backend.connectSteam)
      return { ok: false as const, message: "Steam sign-in unavailable" };
    return props.backend
      .connectSteam(input)
      .andThen((res) => {
        console.info("[app] connecting Steam account", input);
        console.info("[app] connect result", res);
        return fromAppPromise(
          controller.syncAccountState(res),
          "Account synchronization failed",
        );
      })
      .match(
        () => ({ ok: true as const }),
        (error) => ({
          ok: false as const,
          message: error.message ?? "Unable to sign in to Steam",
        }),
      );
  };

  const handleStartSteamQR = async () => {
    if (!props.backend.startSteamQR)
      return { ok: false as const, message: "Steam QR login unavailable" };
    return props.backend.startSteamQR().match(
      (status) => {
        controller.setConnection(status);
        return { ok: true as const };
      },
      (error) => ({
        ok: false as const,
        message: error.message ?? "Unable to start QR sign-in",
      }),
    );
  };

  const handleSubmitSteamGuard = async (input: { code: string }) => {
    if (!props.backend.submitSteamGuard)
      return { ok: false as const, message: "Steam Guard is unavailable" };
    return props.backend
      .submitSteamGuard(input)
      .andThen((res) => {
        console.info("[app] submitting Steam Guard code");
        console.info("[app] Steam Guard result", res);
        return fromAppPromise(
          controller.syncAccountState(res),
          "Account synchronization failed",
        );
      })
      .match(
        () => ({ ok: true as const }),
        (error) => ({
          ok: false as const,
          message: error.message ?? "Unable to verify the code",
        }),
      );
  };

  const handleDisconnect = async () => {
    if (!props.backend.disconnectSteam)
      return { ok: false as const, message: "Steam disconnect unavailable" };
    return props.backend
      .disconnectSteam()
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(controller.refetchConnection()),
          "Connection reload failed",
        ),
      )
      .match(
        () => {
          controller.setView("account");
          return { ok: true as const };
        },
        (error) => ({
          ok: false as const,
          message: error.message ?? "Unable to disconnect",
        }),
      );
  };

  const handleInventoryRefresh = (suppressToast?: boolean) =>
    controller.refreshInventoryState({ suppressToast });

  const refetchGameInventory = (game: EconomyGame) => {
    if (game === "steam") return controller.refetchSteamInventory();
    if (game === "tf2") return controller.refetchTF2Inventory();
    return controller.refetchDota2Inventory();
  };

  const handleGameInventoryRefresh = (
    game: EconomyGame,
    suppressToast?: boolean,
  ) =>
    void props.backend
      .refreshGameInventory(game)
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(refetchGameInventory(game)),
          `${game} inventory reload failed`,
        ),
      )
      .match(
        () => undefined,
        (error) => {
          if (suppressToast) return;
          controller.pushToast({
            title: "Inventory refresh failed",
            description: error.message ?? `Unable to refresh ${game} inventory`,
            variant: "danger",
          });
        },
      );

  const handleSteamServiceRefresh = (appId: number) =>
    void props.backend
      .refreshSteamInventoryService(appId)
      .andThen(() =>
        fromAppPromise(
          Promise.resolve(controller.refetchSteamServiceInventory()),
          "Steam Inventory Service reload failed",
        ),
      )
      .match(
        () => undefined,
        (error) =>
          controller.pushToast({
            title: "Inventory Service refresh failed",
            description: error.message ?? `Unable to refresh AppID ${appId}`,
            variant: "danger",
          }),
      );

  const handleGameOperation = (
    type: string,
    input: unknown,
    suppressToast?: boolean,
  ) =>
    controller.settleOperation(props.backend.submitOperation(type, input), {
      suppressToast,
    });
  const handleArmoryRedeem = (
    input: Parameters<typeof props.backend.redeemArmory>[0],
  ) =>
    controller
      .settleOperation(props.backend.redeemArmory(input), {
        skipInventoryRefresh: true,
      })
      .then(async (receipt) => {
        if (receipt.state === "awaiting_gc_confirmation") {
          await Promise.all([
            controller.refreshArmoryState(),
            controller.refreshInventoryState({ suppressToast: true }),
          ]);
        } else {
          await controller.refetchArmory();
        }
        return receipt;
      });
  const failedStoreIdentity = () => ({
    offerId: "",
    defIndex: 0,
    name: "Store purchase",
    currency: controller.store()?.currency ?? "",
  });

  return (
    <AppView
      view={controller.view()}
      setView={controller.setView}
      selectedItemId={controller.selectedItemId()}
      setSelectedItemId={controller.setSelectedItemId}
      statusMessage=""
      health={controller.health()}
      connection={controller.connection()}
      accounts={controller.accounts()}
      accountUsername={controller.accountUsername()}
      accountLoginOnly={controller.accountLoginOnly()}
      inventory={controller.inventory()}
      inventoryLoading={
        controller.inventoryRefreshActive() || controller.inventory.loading
      }
      steamInventory={controller.steamInventory()}
      steamServiceInventory={controller.steamServiceInventory()}
      steamServiceGames={controller.steamServiceGames()}
      steamServiceGamesLoading={controller.steamServiceGamesLoading()}
      steamServiceAppId={controller.steamServiceAppId()}
      setSteamServiceAppId={controller.setSteamServiceAppId}
      tf2Inventory={controller.tf2Inventory()}
      tf2Features={controller.tf2Features()}
      cs2Features={controller.cs2Features()}
      tf2ProtocolEntries={controller.tf2ProtocolEntries()}
      dota2Inventory={controller.dota2Inventory()}
      gameInventoryLoading={{
        steam: controller.steamInventory.loading,
        tf2: controller.tf2Inventory.loading,
        dota2: controller.dota2Inventory.loading,
      }}
      armory={controller.armory()}
      store={controller.store()}
      tf2Store={controller.tf2Store()}
      trades={controller.trades()}
      tradeAccounts={controller.tradeAccounts()}
      settings={controller.settings()}
      query={controller.query()}
      setQuery={controller.setQuery}
      kindFilter={controller.kindFilter()}
      setKindFilter={controller.setKindFilter}
      compactMode={controller.compactMode()}
      setCompactMode={controller.setCompactMode}
      toasts={controller.toasts()}
      platform={props.platform}
      onAddAccount={() => void controller.addAccount()}
      onSignInAccount={(account) => void controller.signInAccount(account)}
      onSignOutAccount={(account) => void controller.signOutAccount(account)}
      onDeleteAccount={(account) => void controller.deleteAccount(account)}
      onRefreshInventory={() => void controller.refreshInventoryState()}
      onDismissToast={controller.dismissToast}
      onConnect={handleConnect}
      onStartSteamQR={handleStartSteamQR}
      onSubmitSteamGuard={handleSubmitSteamGuard}
      onDisconnect={handleDisconnect}
      onInventoryRefresh={handleInventoryRefresh}
      onGameInventoryRefresh={handleGameInventoryRefresh}
      onSteamServiceRefresh={handleSteamServiceRefresh}
      onGameOperation={handleGameOperation}
      onArmoryRefresh={controller.refreshArmoryState}
      onMarketPreview={controller.requestMarketPreview}
      onScanPrices={(marketNames, appId) =>
        props.data.queryPrices({ marketNames, currency: "USD", appId }).match(
          (result) => result,
          (error) => {
            controller.pushToast({
              title: "Vendor prices unavailable",
              description: error.message,
              variant: "warning",
            });
            return undefined;
          },
        )
      }
      onArmoryRedeem={handleArmoryRedeem}
      onStoreRefresh={controller.refreshStoreState}
      onTF2StoreRefresh={controller.refreshTF2StoreState}
      onStorePurchase={(input) =>
        props.backend.initializeStorePurchase(input).match(
          (session) => session,
          (error) => ({
            id: "failed",
            status: "failed" as const,
            offerId: input.offerId,
            defIndex: 0,
            name: "Store purchase",
            quantity: input.quantity,
            currency: "",
            amountMinor: 0,
            formattedAmount: "",
            createdAt: new Date().toISOString(),
            message: error.message ?? "Purchase initialization failed",
          }),
        )
      }
      onTF2StorePurchase={(input) =>
        props.backend.initializeTF2StorePurchase(input).match(
          (session) => session,
          (error) => ({
            id: "failed",
            status: "failed" as const,
            offerId: input.offerId,
            defIndex: 0,
            name: input.offerId,
            quantity: input.quantity,
            currency: "",
            amountMinor: input.expectedAmountMinor,
            formattedAmount: "",
            createdAt: new Date().toISOString(),
            message: error.message,
          }),
        )
      }
      onStoreReconcile={(id) =>
        props.backend.reconcileStorePurchase(id).match(
          (session) => session,
          (error) => ({
            ...failedStoreIdentity(),
            id,
            status: "failed" as const,
            quantity: 1,
            amountMinor: 0,
            formattedAmount: "",
            createdAt: new Date().toISOString(),
            message: error.message ?? "Purchase reconciliation failed",
          }),
        )
      }
      onTradesRefresh={controller.refreshTradeAccountsState}
      onInventoryRename={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyNameTag(input),
        )
      }
      onRemoveName={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).removeNameTag(input),
        )
      }
      onOpenContainer={(input, suppressToast) =>
        controller.settleOperation(
          props.backend.submitOperation("containers.open", input),
          { suppressToast },
        )
      }
      onLoadTerminalOffer={(terminalId) =>
        controller.settleOperation(
          props.backend.submitOperation("terminal.load-offer", { terminalId }),
          {
            suppressToast: true,
          },
        )
      }
      onLoadStorageContents={(casketId) =>
        controller.settleOperation(
          props.backend.submitOperation("storage.load", { casketId }),
        )
      }
      onMoveFromStorage={(input) =>
        controller.settleOperation(
          props.backend.submitOperation("storage.move-out", input),
        )
      }
      onMoveIntoStorage={(input) =>
        controller.settleOperation(
          props.backend.submitOperation("storage.move-in", input),
        )
      }
      onExecuteTradeUp={(input) =>
        controller.settleOperation(
          props.backend.submitOperation("tradeups.execute", input),
        )
      }
      onSaveSettings={(next) => controller.saveSettings(next)}
    />
  );
}
