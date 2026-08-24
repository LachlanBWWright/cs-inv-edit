package steamapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"google.golang.org/protobuf/proto"
)

type ClientOptFunc func(*apiClient)
type apiClient struct {
	root       string
	httpClient *http.Client
}

func NewClient(opts ...ClientOptFunc) *apiClient {
	client := &apiClient{
		root:       "api.steampowered.com",
		httpClient: http.DefaultClient,
	}
	for _, opt := range opts {
		opt(client)
	}
	return client
}

func WithHttpClient(httpClient *http.Client) ClientOptFunc {
	return func(c *apiClient) {
		c.httpClient = httpClient
	}
}

func (client *apiClient) Url(iface string, method string, version int, query url.Values) *url.URL {
	return &url.URL{
		Scheme:   "https",
		Host:     client.root,
		Path:     fmt.Sprintf("%s/%s/v%d/", iface, method, version),
		RawQuery: query.Encode(),
	}
}

func (client *apiClient) DoJson(request *http.Request, body any) error {
	response, err := client.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, body)
}

func (client *apiClient) DoProtobuf(request *http.Request, body proto.Message) error {
	query := request.URL.Query()
	query.Add("format", "protobuf_raw")
	request.URL.RawQuery = query.Encode()

	response, err := client.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	return proto.Unmarshal(data, body)
}
