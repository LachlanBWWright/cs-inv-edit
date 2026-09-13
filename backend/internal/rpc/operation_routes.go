package rpc

import (
	"net/http"
	"strings"

	"cs-inv-edit/backend/internal/operations"
)

func (h *Handler) LoadStorage(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "storage.load")
}
func (h *Handler) MoveIntoStorage(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "storage.move-in")
}
func (h *Handler) MoveOutOfStorage(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "storage.move-out")
}
func (h *Handler) OpenContainer(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "containers.open")
}
func (h *Handler) PreviewTradeUp(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "tradeups.preview")
}
func (h *Handler) ExecuteTradeUp(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "tradeups.execute")
}
func (h *Handler) ApplyNameTag(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "nametags.apply")
}
func (h *Handler) RemoveNameTag(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "nametags.remove")
}
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "items.delete")
}
func (h *Handler) ApplyStatTrakSwap(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "stattrak.swap")
}
func (h *Handler) ApplyStrangePart(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "strange-parts.apply")
}
func (h *Handler) UseItem(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "items.use")
}
func (h *Handler) UseMultipleItems(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "items.use-multiple")
}
func (h *Handler) ApplyToolToItem(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "tools.apply")
}
func (h *Handler) ApplyToolToBaseItem(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "tools.apply-base")
}
func (h *Handler) SendGift(w http.ResponseWriter, r *http.Request) {
	h.writeBodyOperation(w, r, "gifts.send")
}

func (h *Handler) RedeemArmory(w http.ResponseWriter, r *http.Request) {
	receipt, ok := h.handleBodyOperationDirect(w, r, h.service.RedeemArmory)
	if ok {
		writeJSON(w, receipt)
	}
}

func (h *Handler) RejectMissingOperationType(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusBadRequest, "missing operation type")
}

func (h *Handler) SubmitOperation(w http.ResponseWriter, r *http.Request, pType string) {
	opType := strings.TrimSpace(pType)
	if opType == "" {
		writeError(w, http.StatusBadRequest, "missing operation type")
		return
	}
	h.writeBodyOperation(w, r, opType)
}

func (h *Handler) writeBodyOperation(w http.ResponseWriter, r *http.Request, opType string) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.SubmitOperation(opType, body))
}

func (h *Handler) handleBodyOperationDirect(w http.ResponseWriter, r *http.Request, submit func(map[string]any) operations.Receipt) (operations.Receipt, bool) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return operations.Receipt{}, false
	}
	return submit(body), true
}
