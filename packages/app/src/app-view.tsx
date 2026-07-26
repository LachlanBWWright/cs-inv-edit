import { AppView } from "./AppView.js";
import { createOperationApi } from "./lib/api.js";
import { fromAppPromise } from "./lib/result.js";
import { createAppController, type AppProps } from "./app-controller.js";

export type { AppProps } from "./app-controller.js";

export function App(props: AppProps) {
  const controller = createAppController(props);

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
      tf2ProtocolEntries={controller.tf2ProtocolEntries()}
      dota2Inventory={controller.dota2Inventory()}
      gameInventoryLoading={{
        steam: controller.steamInventory.loading,
        tf2: controller.tf2Inventory.loading,
        dota2: controller.dota2Inventory.loading,
      }}
      armory={controller.armory()}
      store={controller.store()}
      trades={controller.trades()}
      tradeAccounts={controller.tradeAccounts()}
      settings={controller.settings()}
      query={controller.query()}
      setQuery={controller.setQuery}
      kindFilter={controller.kindFilter()}
      setKindFilter={controller.setKindFilter}
      compactMode={controller.compactMode()}
      setCompactMode={controller.setCompactMode}
      receipts={controller.receipts()}
      events={controller.events()}
      toasts={controller.toasts()}
      platform={props.platform}
      onAddAccount={() => void controller.addAccount()}
      onSignInAccount={(account) => void controller.signInAccount(account)}
      onSignOutAccount={(account) => void controller.signOutAccount(account)}
      onDeleteAccount={(account) => void controller.deleteAccount(account)}
      onRefreshInventory={() => void controller.refreshInventoryState()}
      onDismissToast={controller.dismissToast}
      onConnect={async (input) => {
        const result = props.backend.connectSteam
          ? props.backend.connectSteam(input)
          : ({ match: () => undefined } as never);
        await result
          .andThen((res: any) => {
            console.info("[app] connecting Steam account", input);
            console.info("[app] connect result", res);
            return fromAppPromise(
              controller.syncAccountState(res),
              "Account synchronization failed",
            );
          })
          .match(
            () => undefined,
            (error: any) => {
              controller.pushToast({
                title: "Sign-in failed",
                description: error.message ?? "Unable to sign in to Steam",
                variant: "danger",
              });
            },
          );
      }}
      onStartSteamQR={async () => {
        const result = props.backend.startSteamQR
          ? props.backend.startSteamQR()
          : ({
              match: (onOk: any, onErr: any) =>
                onErr({ message: "Steam QR login unavailable" }),
            } as never);
        await result.match(
          (status: any) => controller.setConnection(status),
          (error: any) =>
            controller.pushToast({
              title: "QR sign-in failed",
              description: error.message ?? "Unable to start QR sign-in",
              variant: "danger",
            }),
        );
      }}
      onSubmitSteamGuard={async (input) => {
        const result = props.backend.submitSteamGuard
          ? props.backend.submitSteamGuard(input)
          : ({ andThen: () => ({ match: () => undefined }) } as never);
        await result
          .andThen((res: any) => {
            console.info("[app] submitting Steam Guard code");
            console.info("[app] Steam Guard result", res);
            return fromAppPromise(
              controller.syncAccountState(res),
              "Account synchronization failed",
            );
          })
          .match(
            () => undefined,
            (error: any) => {
              controller.pushToast({
                title: "Steam Guard failed",
                description: error.message ?? "Unable to verify the code",
                variant: "danger",
              });
            },
          );
      }}
      onDisconnect={async () => {
        const disconnect =
          props.backend.disconnectSteam?.() ??
          ({ andThen: () => ({ match: () => undefined }) } as never);
        await disconnect
          .andThen(() =>
            fromAppPromise(
              Promise.resolve(controller.refetchConnection()),
              "Connection reload failed",
            ),
          )
          .match(
            () => {
              controller.setView("account");
              controller.pushToast({
                title: "Account disconnected",
                description: "The session has been cleared.",
                variant: "warning",
              });
            },
            (error: any) => {
              controller.pushToast({
                title: "Disconnect failed",
                description: error.message ?? "Unable to disconnect",
                variant: "danger",
              });
            },
          );
      }}
      onToast={controller.pushToast}
      onInventoryRefresh={() => void controller.refreshInventoryState()}
      onGameInventoryRefresh={(game) =>
        void props.backend
          .refreshGameInventory(game)
          .andThen(() =>
            fromAppPromise(
              Promise.resolve(
                game === "steam"
                  ? controller.refetchSteamInventory()
                  : game === "tf2"
                    ? controller.refetchTF2Inventory()
                    : controller.refetchDota2Inventory(),
              ),
              `${game} inventory reload failed`,
            ),
          )
          .match(
            () => undefined,
            (error: any) =>
              controller.pushToast({
                title: "Inventory refresh failed",
                description:
                  error.message ?? `Unable to refresh ${game} inventory`,
                variant: "danger",
              }),
          )
      }
      onSteamServiceRefresh={(appId) =>
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
            (error: any) =>
              controller.pushToast({
                title: "Inventory Service refresh failed",
                description:
                  error.message ?? `Unable to refresh AppID ${appId}`,
                variant: "danger",
              }),
          )
      }
      onGameOperation={(type, input) =>
        controller.settleOperation(props.backend.submitOperation(type, input))
      }
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
      onArmoryRedeem={(input) =>
        controller
          .settleOperation(props.backend.redeemArmory(input))
          .then(async (receipt) => {
            await controller.refetchArmory();
            return receipt;
          })
      }
      onStoreRefresh={controller.refreshStoreState}
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
      onStoreReconcile={(id) =>
        props.backend.reconcileStorePurchase(id).match(
          (session) => session,
          (error) => ({
            ...(controller.store()
              ? {
                  offerId: "",
                  defIndex: 0,
                  name: "Store purchase",
                  currency: controller.store()?.currency ?? "",
                }
              : {
                  offerId: "",
                  defIndex: 0,
                  name: "Store purchase",
                  currency: "",
                }),
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
      onTerminalSubmit={(type, input) =>
        controller.settleOperation(props.backend.submitOperation(type, input), {
          suppressToast: true,
        })
      }
      onStorageSubmit={(type, input) =>
        controller.settleOperation(props.backend.submitOperation(type, input))
      }
      onTradeUpSubmit={(type, input) =>
        controller.settleOperation(props.backend.submitOperation(type, input))
      }
      onStickerSubmit={(type, input) =>
        controller.settleOperation(props.backend.submitOperation(type, input))
      }
      onNameTagApply={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyNameTag(input),
        )
      }
      onNameTagRemove={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).removeNameTag(input),
        )
      }
      onToolApplyStatTrakSwap={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyStatTrakSwap(input),
        )
      }
      onToolApplyStrangePart={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyStrangePart(input),
        )
      }
      onToolApplyToolToItem={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyToolToItem(input),
        )
      }
      onToolApplyToolToBaseItem={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).applyToolToBaseItem(input),
        )
      }
      onItemDelete={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).deleteItem(input),
        )
      }
      onItemUse={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).useItem(input),
        )
      }
      onItemUseMultiple={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).useMultipleItems(input),
        )
      }
      onItemGift={(input) =>
        controller.settleOperation(
          createOperationApi(props.backend).giftItem(input),
        )
      }
      onSaveSettings={(next) => controller.saveSettings(next)}
    />
  );
}
