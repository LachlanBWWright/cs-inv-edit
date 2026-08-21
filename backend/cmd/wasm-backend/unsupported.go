//go:build !js || !wasm

package main

import "fmt"

func main() {
	fmt.Println("cs2 wasm backend requires a js/wasm build target")
}
