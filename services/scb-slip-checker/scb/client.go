package scb

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"time"

	fhttp "github.com/bogdanfinn/fhttp"
	tlsclient "github.com/bogdanfinn/tls-client"
	"github.com/bogdanfinn/tls-client/profiles"
)

// ErrCaptchaRejected means the captcha answer was wrong (retryable).
var ErrCaptchaRejected = errors.New("captcha rejected")

type Config struct {
	BaseURL         string
	ResourceOwnerID string
	SourceSystem    string
	AcceptLanguage  string
	Proxy           string
	TimeoutSec      int
	MaxAttempts     int
}

func DefaultConfig() Config {
	return Config{
		BaseURL:         "https://checkslip.scb.co.th/web/",
		ResourceOwnerID: "SLVF",
		SourceSystem:    "SLVF",
		AcceptLanguage:  "th-TH",
		TimeoutSec:      30,
		MaxAttempts:     3,
	}
}

type Client struct {
	cfg  Config
	http tlsclient.HttpClient
	log  *slog.Logger
}

func NewClient(cfg Config, log *slog.Logger) (*Client, error) {
	if log == nil {
		log = slog.Default()
	}
	opts := []tlsclient.HttpClientOption{
		tlsclient.WithTimeoutSeconds(cfg.TimeoutSec),
		tlsclient.WithClientProfile(profiles.Chrome_133),
		tlsclient.WithCookieJar(tlsclient.NewCookieJar()),
	}
	if cfg.Proxy != "" {
		opts = append(opts, tlsclient.WithProxyUrl(cfg.Proxy))
	}
	h, err := tlsclient.NewHttpClient(tlsclient.NewNoopLogger(), opts...)
	if err != nil {
		return nil, err
	}
	return &Client{cfg: cfg, http: h, log: log}, nil
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func b3id() string {
	const a = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 11)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = a[int(b[i])%len(a)]
	}
	return string(b)
}

func (c *Client) headers(appHeaders, jsonCT, requestUID bool, refererPath string) fhttp.Header {
	h := fhttp.Header{
		"accept":          {"application/json"},
		"accept-language": {c.cfg.AcceptLanguage},
		"referer":         {c.cfg.BaseURL + refererPath},
	}
	if jsonCT {
		h["content-type"] = []string{"application/json"}
	}
	if appHeaders {
		h["resourceOwnerID"] = []string{c.cfg.ResourceOwnerID}
		h["sourceSystem"] = []string{c.cfg.SourceSystem}
		h["x-b3-traceid"] = []string{b3id()}
		h["x-b3-spanid"] = []string{b3id()}
	}
	if requestUID {
		h["requestUID"] = []string{randHex(16)}
	}
	return h
}

func (c *Client) send(step, method, u string, h fhttp.Header, body []byte) ([]byte, int, error) {
	start := time.Now()
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := fhttp.NewRequest(method, u, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header = h
	c.log.Debug("http →", "step", step, "method", method, "url", shortURL(u), "reqBytes", len(body))
	resp, err := c.http.Do(req)
	if err != nil {
		c.log.Warn("http error", "step", step, "err", err, "ms", msSince(start))
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	c.log.Debug("http ←", "step", step, "status", resp.StatusCode, "respBytes", len(b), "ms", msSince(start))
	if bytes.Contains(b, []byte("_Incapsula_Resource")) || bytes.Contains(b, []byte("Powered By Incapsula")) {
		c.log.Warn("imperva block detected", "step", step, "status", resp.StatusCode)
		return b, resp.StatusCode, fmt.Errorf("blocked by Imperva (datacenter IP? set PROXY to a residential proxy)")
	}
	return b, resp.StatusCode, nil
}

func shortURL(u string) string {
	if i := indexByte(u, '?'); i >= 0 {
		return u[:i] + "?…"
	}
	return u
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func msSince(t time.Time) float64 {
	return float64(time.Since(t).Microseconds()) / 1000.0
}

func islandHTML(body []byte) string {
	var r struct {
		HTML string `json:"html"`
	}
	_ = json.Unmarshal(body, &r)
	return r.HTML
}

// LoadCaptcha fetches a fresh captcha (lighter island, falling back to the main page).
func (c *Client) LoadCaptcha() (Challenge, error) {
	props := url.QueryEscape(`{"reloadCount":0,"capchaHash":""}`)
	u := c.cfg.BaseURL + "__nuxt_island/Captchaisland_" + randHex(20) + ".json?props=" + props
	if body, status, err := c.send("load-captcha", "GET", u, c.headers(false, false, false, "main"), nil); err == nil && status == 200 {
		if ch, e := parseCaptcha(islandHTML(body)); e == nil {
			return ch, nil
		}
	}
	body, status, err := c.send("load-main", "GET", c.cfg.BaseURL+"main", c.headers(false, false, false, "main"), nil)
	if err != nil {
		return Challenge{}, err
	}
	if status != 200 {
		return Challenge{}, fmt.Errorf("load main: status %d", status)
	}
	return parseCaptcha(string(body))
}

// VerifyCaptcha validates the captcha; returns ErrCaptchaRejected if the answer is wrong.
func (c *Client) VerifyCaptcha(payload []byte) error {
	body, status, err := c.send("verify-captcha", "POST", c.cfg.BaseURL+"api/verify-captcha",
		c.headers(true, true, true, "main"), payload)
	if err != nil {
		return err
	}
	if status != 200 {
		return fmt.Errorf("verify-captcha: status %d", status)
	}
	var r struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return fmt.Errorf("verify-captcha: bad JSON")
	}
	if !r.Success {
		return ErrCaptchaRejected
	}
	return nil
}

// FetchResult queries the Tabledetail island and returns (errorCode, rows).
func (c *Client) FetchResult(payload []byte) (string, []kv, error) {
	u := c.cfg.BaseURL + "__nuxt_island/Tabledetail_" + randHex(20) + ".json?props=" + url.QueryEscape(string(payload))
	body, status, err := c.send("result-island", "GET", u, c.headers(false, false, false, "retail"), nil)
	if err != nil {
		return "", nil, err
	}
	if status != 200 {
		return "", nil, fmt.Errorf("island: status %d", status)
	}
	errCode, rows := parseResult(islandHTML(body))
	return errCode, rows, nil
}
