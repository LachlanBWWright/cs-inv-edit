package transport

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"image/png"
	"math"
	"reflect"
	"time"
)

const (
	tf2CustomizeItemTextureRequest  uint32 = 1023
	tf2CustomizeItemTextureResponse uint32 = 1024
	legacyGCHeaderVersion           uint16 = 1
	legacyGCHeaderSize                     = 18
	tf2DecalRequestSize                    = legacyGCHeaderSize + 24
	tf2DecalResponseSize                   = legacyGCHeaderSize + 6
	tf2DecalImageSize                      = 128
	tf2DecalMaxPNGBytes                    = tf2DecalImageSize*tf2DecalImageSize*4 + 4*1024
	tf2DecalResponseTimeout                = 10 * time.Second
)

type tf2DecalGCResponse struct {
	Index int16
	Code  uint32
}

func validateTF2DecalPNG(data []byte) error {
	if len(data) == 0 || len(data) >= tf2DecalMaxPNGBytes {
		return fmt.Errorf("TF2 decal PNG must contain 1..%d bytes", tf2DecalMaxPNGBytes-1)
	}
	reader := bytes.NewReader(data)
	image, err := png.Decode(reader)
	if err != nil {
		return fmt.Errorf("decode TF2 decal PNG: %w", err)
	}
	if reader.Len() != 0 {
		return fmt.Errorf("TF2 decal PNG contains %d trailing bytes", reader.Len())
	}
	bounds := image.Bounds()
	if bounds.Dx() != tf2DecalImageSize || bounds.Dy() != tf2DecalImageSize {
		return fmt.Errorf("TF2 decal PNG must be %dx%d, got %dx%d", tf2DecalImageSize, tf2DecalImageSize, bounds.Dx(), bounds.Dy())
	}
	return nil
}

func encodeTF2CustomizeItemTexture(sourceJobID, toolItemID, subjectItemID, ugcID uint64) ([]byte, error) {
	if sourceJobID == 0 || sourceJobID == math.MaxUint64 {
		return nil, fmt.Errorf("legacy GC source job ID is invalid")
	}
	if toolItemID == 0 || subjectItemID == 0 || ugcID == 0 || ugcID == math.MaxUint64 {
		return nil, fmt.Errorf("TF2 decal request IDs must be valid non-zero values")
	}
	payload := make([]byte, tf2DecalRequestSize)
	binary.LittleEndian.PutUint16(payload[0:2], legacyGCHeaderVersion)
	binary.LittleEndian.PutUint64(payload[2:10], math.MaxUint64)
	binary.LittleEndian.PutUint64(payload[10:18], sourceJobID)
	binary.LittleEndian.PutUint64(payload[18:26], toolItemID)
	binary.LittleEndian.PutUint64(payload[26:34], subjectItemID)
	binary.LittleEndian.PutUint64(payload[34:42], ugcID)
	return payload, nil
}

func decodeTF2CustomizeItemTextureResponse(payload []byte, sourceJobID uint64) (tf2DecalGCResponse, error) {
	if len(payload) != tf2DecalResponseSize {
		return tf2DecalGCResponse{}, fmt.Errorf("TF2 decal response has %d bytes, want %d", len(payload), tf2DecalResponseSize)
	}
	if binary.LittleEndian.Uint16(payload[0:2]) != legacyGCHeaderVersion {
		return tf2DecalGCResponse{}, fmt.Errorf("TF2 decal response has unsupported legacy GC header version")
	}
	if binary.LittleEndian.Uint64(payload[2:10]) != sourceJobID {
		return tf2DecalGCResponse{}, fmt.Errorf("TF2 decal response target job ID did not match request")
	}
	return tf2DecalGCResponse{
		Index: int16(binary.LittleEndian.Uint16(payload[18:20])),
		Code:  binary.LittleEndian.Uint32(payload[20:24]),
	}, nil
}

func (s *SteamGCClient) ApplyTF2Decal(ctx context.Context, request TF2DecalRequest) (TF2DecalResult, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	if request.ToolItemID == 0 || request.SubjectItemID == 0 || request.ToolItemID == request.SubjectItemID {
		return TF2DecalResult{}, fmt.Errorf("TF2 decal tool and subject item IDs must be distinct non-zero values")
	}
	if err := validateTF2DecalPNG(request.PNG); err != nil {
		return TF2DecalResult{}, err
	}
	before, err := s.requestGameInventoryLocked(ctx, tf2AppID)
	if err != nil {
		return TF2DecalResult{}, fmt.Errorf("load authoritative TF2 inventory before decal application: %w", err)
	}
	tool, toolFound := findGCInventoryItem(before, request.ToolItemID)
	subject, subjectFound := findGCInventoryItem(before, request.SubjectItemID)
	if !toolFound || !subjectFound {
		return TF2DecalResult{}, fmt.Errorf("TF2 GC inventory does not contain both the decal tool and subject item")
	}

	filename, err := newTF2DecalFilename()
	if err != nil {
		return TF2DecalResult{}, err
	}
	uploaded, err := s.uploadTF2DecalUGC(ctx, request.PNG, filename)
	if err != nil {
		return TF2DecalResult{}, fmt.Errorf("upload TF2 decal image: %w", err)
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return TF2DecalResult{}, ErrNotConnected
	}
	sourceJobID := uint64(conn.GetNextJobId())
	payload, err := encodeTF2CustomizeItemTexture(sourceJobID, request.ToolItemID, request.SubjectItemID, uploaded.ID)
	if err != nil {
		return TF2DecalResult{}, err
	}
	if err := s.SendToGC(ctx, tf2AppID, tf2CustomizeItemTextureRequest, payload); err != nil {
		return TF2DecalResult{}, fmt.Errorf("send TF2 decal GC request: %w", err)
	}
	response, err := s.waitForTF2DecalResponse(ctx, sourceJobID)
	if err != nil {
		return TF2DecalResult{}, err
	}

	result := TF2DecalResult{UGCID: uploaded.ID, ResponseIndex: response.Index, ResponseCode: response.Code}
	refreshCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	after, refreshErr := s.requestGameInventoryLocked(refreshCtx, tf2AppID)
	if refreshErr == nil {
		result.InventoryConfirmed = tf2DecalInventoryChanged(tool, subject, after)
	}
	if refreshErr != nil {
		result.Diagnostics = append(result.Diagnostics, "TF2 GC response arrived, but the inventory refresh failed: "+refreshErr.Error())
	} else if !result.InventoryConfirmed {
		result.Diagnostics = append(result.Diagnostics, "TF2 GC response arrived, but the expected inventory mutation was not confirmed")
	}
	return result, nil
}

func (s *SteamGCClient) waitForTF2DecalResponse(ctx context.Context, sourceJobID uint64) (tf2DecalGCResponse, error) {
	timer := time.NewTimer(tf2DecalResponseTimeout)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return tf2DecalGCResponse{}, ctx.Err()
		case <-timer.C:
			return tf2DecalGCResponse{}, fmt.Errorf("timed out waiting for TF2 decal GC response %d", tf2CustomizeItemTextureResponse)
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != tf2AppID || message.EMsg != tf2CustomizeItemTextureResponse {
				continue
			}
			response, err := decodeTF2CustomizeItemTextureResponse(message.Body, sourceJobID)
			if err != nil {
				continue
			}
			return response, nil
		}
	}
}

func newTF2DecalFilename() (string, error) {
	var token [12]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", fmt.Errorf("generate TF2 decal upload filename: %w", err)
	}
	return fmt.Sprintf("my_custom_images/%x.png", token[:]), nil
}

func findGCInventoryItem(items []GCInventoryItem, id uint64) (GCInventoryItem, bool) {
	for _, item := range items {
		if item.ID == id {
			return item, true
		}
	}
	return GCInventoryItem{}, false
}

func tf2DecalInventoryChanged(tool, subject GCInventoryItem, after []GCInventoryItem) bool {
	afterTool, toolFound := findGCInventoryItem(after, tool.ID)
	afterSubject, subjectFound := findGCInventoryItem(after, subject.ID)
	toolConsumed := !toolFound || afterTool.Quantity < tool.Quantity
	if !subjectFound {
		return false
	}
	subjectChanged := !reflect.DeepEqual(subject.Attributes, afterSubject.Attributes) || !reflect.DeepEqual(subject.AttributeBytes, afterSubject.AttributeBytes)
	return toolConsumed && subjectChanged
}
