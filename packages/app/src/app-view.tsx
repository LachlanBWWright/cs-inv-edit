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
        return result
          .andThen((res: any) => {
            console.info("[app] connecting Steam account", input);
            console.info("[app] connect result", res);
            return fromAppPromise(
              controller.syncAccountState(res),
              "Account synchronization failed",
            );
          })
          .match(
            () => ({ ok: true as const }),
            (error: any) => ({
              ok: false as const,
              message: error.message ?? "Unable to sign in to Steam",
            }),
          );
      }}
      onStartSteamQR={async () => {
        const result = props.backend.startSteamQR
          ? props.backend.startSteamQR()
          : ({
              match: (onOk: any, onErr: any) =>
                onErr({ message: "Steam QR login unavailable" }),
            } as never);
        return result.match(
          (status: any) => {
            controller.setConnection(status);
            return { ok: true as const };
          },
          (error: any) => ({
            ok: false as const,
            message: error.message ?? "Unable to start QR sign-in",
          }),
        );
      }}
      onSubmitSteamGuard={async (input) => {
        const result = props.backend.submitSteamGuard
          ? props.backend.submitSteamGuard(input)
          : ({ andThen: () => ({ match: () => undefined }) } as never);
        return result
          .andThen((res: any) => {
            console.info("[app] submitting Steam Guard code");
            console.info("[app] Steam Guard result", res);
            return fromAppPromise(
              controller.syncAccountState(res),
              "Account synchronization failed",
            );
          })
          .match(
            () => ({ ok: true as const }),
            (error: any) => ({
              ok: false as const,
              message: error.message ?? "Unable to verify the code",
            }),
          );
      }}
      onDisconnect={async () => {
        const disconnect =
          props.backend.disconnectSteam?.() ??
          ({ andThen: () => ({ match: () => undefined }) } as never);
        return disconnect
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
            (error: any) => ({
              ok: false as const,
              message: error.message ?? "Unable to disconnect",
            }),
          );
      }}
      onInventoryRefresh={(suppressToast) =>
        controller.refreshInventoryState({ suppressToast })
      }
      onGameInventoryRefresh={(game, suppressToast) =>
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
            (error: any) => {
              if (suppressToast) return;
              controller.pushToast({
                title: "Inventory refresh failed",
                description:
                  error.message ?? `Unable to refresh ${game} inventory`,
                variant: "danger",
              });
            },
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
      onGameOperation={(type, input, suppressToast) =>
        controller.settleOperation(props.backend.submitOperation(type, input), {
          suppressToast,
        })
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
      onArmoryRedeem={(input) => {
        const beforeItemIds = new Set(
          (controller.inventory()?.items ?? []).map((item) => item.id),
        );
        return controller
          .settleOperation(props.backend.redeemArmory(input), {
            skipInventoryRefresh: true,
          })
          .then((receipt) => {
            const openedItem = (controller.inventory()?.items ?? []).find(
              (item) => !beforeItemIds.has(item.id),
            );
            void controller.refetchArmory();
            void controller.refreshInventoryState({ suppressToast: true });
            return openedItem
              ? {
                  ...receipt,
                  state: "completed" as const,
                  message: `Armory reward received: ${openedItem.marketName || openedItem.name}`,
                  result: { ...receipt.result, openedItem },
                }
              : receipt;
          });
      }}
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
