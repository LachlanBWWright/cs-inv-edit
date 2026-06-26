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
	if strings.TrimSpace(path) == "" {
		return tradeupInput{}, fmt.Errorf("json path required")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return tradeupInput{}, err
	}
	var input tradeupInput
	if err := json.Unmarshal(content, &input); err != nil {
		return tradeupInput{}, err
	}
	return input, nil
}

func readApplyStickerInput(path string) (cs2pb.ApplyStickerInput, error) {
	if strings.TrimSpace(path) == "" {
		return cs2pb.ApplyStickerInput{}, fmt.Errorf("json path required")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return cs2pb.ApplyStickerInput{}, err
	}
	var input cs2pb.ApplyStickerInput
	if err := json.Unmarshal(content, &input); err != nil {
		return cs2pb.ApplyStickerInput{}, err
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
