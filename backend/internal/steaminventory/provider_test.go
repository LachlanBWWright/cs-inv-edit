package steaminventory

import (
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/transport"
)

func TestSnapshotNormalizesInventoryServiceItems(t *testing.T) {
	snapshot, err := Snapshot(480, transport.SteamInventoryServiceResponse{
		ETag: "schema-v1",
		ItemJSON: `[
			{"itemid":"9007199254740993","itemdefid":"101","quantity":"2","acquired":"1700000000","state":"active","origin":"drop","dynamic_props":"{\"kills\":7,\"label\":\"demo\"}"}
		]`,
		ItemDefJSON: `{"itemdefs":[
			{"itemdefid":"101","name":"Service Item","display_type":"Collectible","description":"A test item","icon_url":"https://cdn.test/item.png","tradable":"1","marketable":true,"tags":"[{\"category\":\"rarity\",\"value\":\"rare\",\"name\":\"Rare\"}]"}
		]}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Game != "steam-service" || snapshot.AppID != 480 || snapshot.SchemaRevision != "schema-v1" {
		t.Fatalf("snapshot identity=%#v", snapshot)
	}
	if len(snapshot.Items) != 1 {
		t.Fatalf("items=%d", len(snapshot.Items))
	}
	item := snapshot.Items[0]
	if item.AssetID != "9007199254740993" || item.Quantity != 2 || item.Name != "Service Item" {
		t.Fatalf("item=%#v", item)
	}
	if item.Details.ServiceDefinitionID != "101" || item.Details.DynamicProperties["kills"] != "7" || item.Details.DynamicProperties["label"] != "demo" {
		t.Fatalf("details=%#v", item.Details)
	}
	if item.Details.AcquiredAt != "2023-11-14T22:13:20Z" || !item.Tradable || !item.Marketable {
		t.Fatalf("normalized state=%#v", item)
	}
	if len(item.Tags) != 1 || item.Tags[0].Name != "Rare" {
		t.Fatalf("tags=%#v", item.Tags)
	}
}

func TestSnapshotKeepsItemsWithoutDefinitions(t *testing.T) {
	snapshot, err := Snapshot(42, transport.SteamInventoryServiceResponse{
		ItemJSON:    `{"items":[{"itemid":1,"itemdefid":999,"quantity":1}]}`,
		ItemDefJSON: `[]`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Items) != 1 || snapshot.Items[0].Name != "Definition 999" {
		t.Fatalf("items=%#v", snapshot.Items)
	}
	if !strings.Contains(strings.Join(snapshot.Diagnostics, "\n"), "no matching item definition") {
		t.Fatalf("diagnostics=%#v", snapshot.Diagnostics)
	}
}

func TestSnapshotSupportsDefinitionsKeyedByID(t *testing.T) {
	snapshot, err := Snapshot(42, transport.SteamInventoryServiceResponse{
		ItemJSON:    `[{"itemid":"1","itemdefid":"999","quantity":"1"}]`,
		ItemDefJSON: `{"999":{"name":"Keyed definition","icon_url":"relative-token"}}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Items[0].Name != "Keyed definition" || snapshot.Items[0].ImageURL != "" {
		t.Fatalf("item=%#v", snapshot.Items[0])
	}
}

func TestSnapshotSupportsNestedDefinitionsKeyedByID(t *testing.T) {
	snapshot, err := Snapshot(42, transport.SteamInventoryServiceResponse{
		ItemJSON:    `[{"itemid":"1","itemdefid":"999","quantity":"1"}]`,
		ItemDefJSON: `{"itemdefs":{"999":{"name":"Nested keyed definition"}}}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Items[0].Name != "Nested keyed definition" {
		t.Fatalf("item=%#v", snapshot.Items[0])
	}
}

func TestSnapshotRejectsInvalidDynamicProperties(t *testing.T) {
	_, err := Snapshot(42, transport.SteamInventoryServiceResponse{
		ItemJSON:    `[{"itemid":"1","itemdefid":"2","quantity":"1","dynamic_props":"not-json"}]`,
		ItemDefJSON: `[]`,
	})
	if err == nil || !strings.Contains(err.Error(), "dynamic properties") {
		t.Fatalf("error=%v", err)
	}
}
