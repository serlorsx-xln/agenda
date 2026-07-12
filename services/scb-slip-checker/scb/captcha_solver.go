package scb

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CaptchaSolver solves SCB captcha images (local CNN or remote HTTP service).
type CaptchaSolver interface {
	Predict(img []byte) (answer string, conf float64, perChar []float64, err error)
}

// HTTPSolver calls a remote captcha microservice (POST /predict).
type HTTPSolver struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

type predictResponse struct {
	Answer     string    `json:"answer"`
	Confidence float64   `json:"confidence"`
	PerChar    []float64 `json:"per_char"`
	Error      string    `json:"error"`
}

func NewHTTPSolver(baseURL, apiKey string) *HTTPSolver {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &HTTPSolver{
		BaseURL: baseURL,
		APIKey:  strings.TrimSpace(apiKey),
		Client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *HTTPSolver) Predict(img []byte) (string, float64, []float64, error) {
	req, err := http.NewRequest(http.MethodPost, s.BaseURL+"/predict", bytes.NewReader(img))
	if err != nil {
		return "", 0, nil, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	if s.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.APIKey)
	}
	resp, err := s.Client.Do(req)
	if err != nil {
		return "", 0, nil, fmt.Errorf("captcha service: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return "", 0, nil, fmt.Errorf("captcha service HTTP %d: %s", resp.StatusCode, string(body))
	}
	var out predictResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", 0, nil, fmt.Errorf("captcha response: %w", err)
	}
	if out.Error != "" {
		return "", 0, nil, fmt.Errorf("captcha service: %s", out.Error)
	}
	if out.Answer == "" {
		return "", 0, nil, fmt.Errorf("captcha service: empty answer")
	}
	return out.Answer, out.Confidence, out.PerChar, nil
}
