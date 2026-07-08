package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"cs-inv-edit/backend/internal/app"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/rpc"
)

type encodeResult struct {
	AppID                  int    `json:"appid"`
	EMSG                   int    `json:"emsg"`
	BodyHex                string `json:"bodyHex"`
	BodySHA256             string `json:"bodySha256"`
	Confidence             string `json:"confidence"`
	RequiresLiveValidation bool   `json:"requiresLiveValidation"`
	Reason                 string `json:"reason,omitempty"`
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "encode" {
		if err := runEncode(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
		return
	}

	addr := os.Getenv("CS2_BACKEND_ADDR")
	if addr == "" {
		addr = "127.0.0.1:7331"
	}

	service := app.NewService()
	handler := rpc.NewHandler(service)

	log.Printf("cs2-backend listening on http://%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func runEncode(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("encode requires an operation name")
	}

	switch args[0] {
	case "storage.move-in":
		fs := flag.NewFlagSet("storage.move-in", flag.ContinueOnError)
		casketID := fs.Uint64("casket-id", 0, "casket id")
		itemID := fs.Uint64("item-id", 0, "item id")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		body, err := cs2pb.EncodeCasketItem(*casketID, *itemID)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgCasketItemAdd, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "high"}, false)
	case "sticker.apply":
		fs := flag.NewFlagSet("sticker.apply", flag.ContinueOnError)
		jsonPath := fs.String("json", "", "path to json input")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		input, err := readApplyStickerInput(*jsonPath)
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeApplySticker(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgApplySticker, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "ApplySticker payload contract not yet confirmed against current live client"}, false)
	case "nametags.apply":
		input, err := readInputFromJSONArgs[cs2pb.SetItemNameInput]("nametags.apply", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeSetItemName(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgSetItemName, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "medium", RequiresLiveValidation: true, Reason: "Name tag flows are protocol-level operations that need live-client validation"}, false)
	case "nametags.remove":
		input, err := readInputFromJSONArgs[cs2pb.RemoveItemNameInput]("nametags.remove", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeRemoveItemName(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgRemoveItemName, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "medium", RequiresLiveValidation: true, Reason: "Remove name payload requires live confirmation against current CS2 client"}, false)
	case "items.delete":
		input, err := readInputFromJSONArgs[cs2pb.DeleteItemInput]("items.delete", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeDeleteItem(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgDeleteItem, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "Deletion flows are destructive and require live validation before use"}, false)
	case "stattrak.swap":
		input, err := readInputFromJSONArgs[cs2pb.ApplyStatTrakSwapInput]("stattrak.swap", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeApplyStatTrakSwap(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgStatTrakSwap, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "medium", RequiresLiveValidation: true, Reason: "StatTrak swap contracts are not fully validated in this backend yet"}, false)
	case "strange-parts.apply":
		input, err := readInputFromJSONArgs[cs2pb.ApplyStrangePartInput]("strange-parts.apply", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeApplyStrangePart(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgApplyStrangePart, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "medium", RequiresLiveValidation: true, Reason: "Strange part application needs live validation against current CS2 behavior"}, false)
	case "items.use":
		input, err := readInputFromJSONArgs[cs2pb.UseItemInput]("items.use", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeUseItem(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgUseItemRequest, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "medium"}, false)
	case "items.use-multiple":
		input, err := readInputFromJSONArgs[cs2pb.UseMultipleItemsInput]("items.use-multiple", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeUseMultipleItems(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgUseItemRequest, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "UseMultipleItems routing is not confirmed in current CS2 public dumps"}, false)
	case "tools.apply":
		input, err := readInputFromJSONArgs[cs2pb.ApplyToolToItemInput]("tools.apply", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeApplyToolToItem(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgUseItemRequest, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "Generic tool application routing must be validated against live CS2 traffic"}, false)
	case "tools.apply-base":
		input, err := readInputFromJSONArgs[cs2pb.ApplyToolToBaseItemInput]("tools.apply-base", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeApplyToolToBaseItem(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgUseItemRequest, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "Base-item tool application routing must be validated against live CS2 traffic"}, false)
	case "gifts.send":
		input, err := readInputFromJSONArgs[cs2pb.GiftItemInput]("gifts.send", args[1:])
		if err != nil {
			return err
		}
		body, err := cs2pb.EncodeGiftItem(input)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgGiftItem, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "low", RequiresLiveValidation: true, Reason: "Gift payload compatibility is not fully confirmed for CS2"}, false)
	case "tradeup":
		fs := flag.NewFlagSet("tradeup", flag.ContinueOnError)
		jsonPath := fs.String("json", "", "path to json input")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		input, err := readTradeupInput(*jsonPath)
		if err != nil {
			return err
		}
		body, err := protocol.EncodeCraftRequest(input.Recipe, input.ItemIDs)
		if err != nil {
			return err
		}
		return printResult(encodeResult{AppID: protocol.AppIDCS2, EMSG: protocol.EMsgCraft, BodyHex: toHex(body), BodySHA256: sha256Hex(body), Confidence: "high", RequiresLiveValidation: false}, false)
	default:
		return fmt.Errorf("unsupported encode operation %s", args[0])
	}
}

type tradeupInput struct {
	Recipe  int16    `json:"recipe"`
	ItemIDs []uint64 `json:"itemIds"`
}

func readTradeupInput(path string) (tradeupInput, error) {
	return readJSONInput[tradeupInput](path)
}

func readApplyStickerInput(path string) (cs2pb.ApplyStickerInput, error) {
	return readJSONInput[cs2pb.ApplyStickerInput](path)
}

func readInputFromJSONArgs[T any](operation string, args []string) (T, error) {
	jsonPath, err := parseJSONPath(operation, args)
	if err != nil {
		var zero T
		return zero, err
	}
	return readJSONInput[T](jsonPath)
}

func parseJSONPath(operation string, args []string) (string, error) {
	fs := flag.NewFlagSet(operation, flag.ContinueOnError)
	jsonPath := fs.String("json", "", "path to json input")
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	return *jsonPath, nil
}

func readJSONInput[T any](path string) (T, error) {
	if strings.TrimSpace(path) == "" {
		var zero T
		return zero, fmt.Errorf("json path required")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		var zero T
		return zero, err
	}
	var input T
	if err := json.Unmarshal(content, &input); err != nil {
		var zero T
		return zero, err
	}
	return input, nil
}

func printResult(result encodeResult, pretty bool) error {
	if pretty {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(result)
	}
	enc := json.NewEncoder(os.Stdout)
	return enc.Encode(result)
}

func toHex(body []byte) string {
	return hex.EncodeToString(body)
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
