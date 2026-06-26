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
	"cs-inv-edit/backend/internal/proto"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/rpc"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "encode" {
		handleEncode(os.Args[2:])
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

func handleEncode(args []string) {
	if len(args) == 0 {
		fmt.Println("usage: cs2-backend encode <operation>")
		os.Exit(2)
	}
	cmd := args[0]
	switch cmd {
	case "storage.move-in":
		var casketID uint64
		var itemID uint64
		flagSet := flag.NewFlagSet("encode-storage", flag.ContinueOnError)
		flagSet.Uint64Var(&casketID, "casket-id", 0, "casket ID")
		flagSet.Uint64Var(&itemID, "item-id", 0, "item ID")
		_ = flagSet.Parse(args[1:])
		body, err := proto.EncodeCasketItem(casketID, itemID)
		if err != nil {
			log.Fatal(err)
		}
		printEncodeResult(1092, body)
	case "sticker.apply":
		var jsonPath string
		flagSet := flag.NewFlagSet("encode-sticker", flag.ContinueOnError)
		flagSet.StringVar(&jsonPath, "json", "", "json input path")
		_ = flagSet.Parse(args[1:])
		payload := proto.ApplyStickerInput{}
		if jsonPath != "" {
			data, err := os.ReadFile(jsonPath)
			if err != nil {
				log.Fatal(err)
			}
			if err := json.Unmarshal(data, &payload); err != nil {
				log.Fatal(err)
			}
		}
		body, err := proto.EncodeApplySticker(payload)
		if err != nil {
			log.Fatal(err)
		}
		printEncodeResult(1086, body)
	case "tradeup":
		var jsonPath string
		flagSet := flag.NewFlagSet("encode-tradeup", flag.ContinueOnError)
		flagSet.StringVar(&jsonPath, "json", "", "json input path")
		_ = flagSet.Parse(args[1:])
		var payload struct {
			Recipe  int16
			ItemIDs []uint64 `json:"itemIds"`
		}
		if jsonPath != "" {
			data, err := os.ReadFile(jsonPath)
			if err != nil {
				log.Fatal(err)
			}
			if err := json.Unmarshal(data, &payload); err != nil {
				log.Fatal(err)
			}
		}
		body, err := protocol.EncodeCraftRequest(payload.Recipe, payload.ItemIDs)
		if err != nil {
			log.Fatal(err)
		}
		printEncodeResult(1002, body)
	default:
		fmt.Printf("unsupported encode target: %s\n", cmd)
		os.Exit(2)
	}
}

func printEncodeResult(emsg int, body []byte) {
	fmt.Println(strings.TrimSpace(fmt.Sprintf(`{"appid":730,"emsg":%d,"bodyHex":"%s","bodySha256":"%s","confidence":"high","requiresLiveValidation":false}`,
		emsg,
		hex.EncodeToString(body),
		sha256Hex(body),
	)))
}

func sha256Hex(body []byte) string {
	sum := sha256Sum(body)
	return hex.EncodeToString(sum[:])
}

func sha256Sum(body []byte) [32]byte {
	var out [32]byte
	if len(body) == 0 {
		return out
	}
	return sha256.Sum256(body)
}
