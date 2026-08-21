package gametracking

import (
	"strings"

	"google.golang.org/protobuf/reflect/protoreflect"
)

var baseGCMessageNames = map[uint32]string{
	21:   "CMsgSOSingleObject",
	22:   "CMsgSOSingleObject",
	23:   "CMsgSOSingleObject",
	24:   "CMsgSOCacheSubscribed",
	25:   "CMsgSOCacheUnsubscribed",
	26:   "CMsgSOMultipleObjects",
	27:   "CMsgSOCacheSubscriptionCheck",
	28:   "CMsgSOCacheSubscriptionRefresh",
	1094: "CMsgCasketItem",
	2536: "CMsgCasketItem",
	4004: "CMsgClientWelcome",
	4006: "CMsgClientHello",
	4007: "CMsgServerHello",
}

func MessageNameForEMsg(emsg uint32) (string, bool) {
	files, err := files()
	if err != nil {
		return "", false
	}
	// The shared GC system enum retains "GC" in these EMsg identifiers, but
	// the corresponding gcsdk message types do not.
	if candidate, ok := baseGCMessageNames[emsg]; ok && messageExists(files, candidate) {
		return candidate, true
	}
	found := ""
	files.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		found = messageNameInFile(files, file, emsg)
		return found == ""
	})
	return found, found != ""
}

func messageNameInFile(files descriptorFinder, file protoreflect.FileDescriptor, emsg uint32) string {
	enums := file.Enums()
	for index := 0; index < enums.Len(); index++ {
		value := enums.Get(index).Values().ByNumber(protoreflect.EnumNumber(emsg))
		if value == nil {
			continue
		}
		valueName := string(value.Name())
		if !strings.HasPrefix(valueName, "k_EMsg") && !strings.HasPrefix(valueName, "k_ESOMsg") {
			continue
		}
		for _, candidate := range messageNameCandidates(valueName) {
			if messageExists(files, candidate) {
				return candidate
			}
		}
	}
	return ""
}

func messageNameCandidates(valueName string) []string {
	raw := strings.TrimPrefix(strings.TrimPrefix(valueName, "k_EMsg"), "k_ESOMsg")
	return []string{
		"CMsg" + raw,
		"CMsg" + strings.TrimPrefix(raw, "GC"),
		"CMsgSO" + raw,
		"CMsgSO" + strings.TrimPrefix(raw, "_"),
		"CMsgSOCache" + raw,
		"CMsgSOCache" + strings.TrimPrefix(raw, "_"),
	}
}

type descriptorFinder interface {
	FindDescriptorByName(protoreflect.FullName) (protoreflect.Descriptor, error)
}

func messageExists(files descriptorFinder, name string) bool {
	descriptor, err := files.FindDescriptorByName(protoreflect.FullName(name))
	if err != nil {
		return false
	}
	_, ok := descriptor.(protoreflect.MessageDescriptor)
	return ok
}
