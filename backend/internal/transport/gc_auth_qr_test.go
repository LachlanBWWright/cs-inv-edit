package transport

import (
	"reflect"
	"testing"

	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func TestQRChallengeMissingFields(t *testing.T) {
	tests := []struct {
		name     string
		response *steampb.CAuthentication_BeginAuthSessionViaQR_Response
		want     []string
	}{
		{name: "nil response", want: []string{"response"}},
		{name: "empty response", response: &steampb.CAuthentication_BeginAuthSessionViaQR_Response{}, want: []string{"challenge_url", "client_id", "request_id"}},
		{
			name: "complete response",
			response: &steampb.CAuthentication_BeginAuthSessionViaQR_Response{
				ChallengeUrl: proto.String("https://s.team/q/example"),
				ClientId:     proto.Uint64(123),
				RequestId:    []byte{1, 2, 3},
			},
			want: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := qrChallengeMissingFields(tt.response); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("qrChallengeMissingFields() = %v, want %v", got, tt.want)
			}
		})
	}
}
