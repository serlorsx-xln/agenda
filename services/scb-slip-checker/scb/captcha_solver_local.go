//go:build !slim

package scb

import (
	"fmt"
	"strings"

	"scbslip/model"
)

// LocalSolver wraps the in-process Go CNN (single-binary / dev mode).
type LocalSolver struct {
	Net *model.Net
}

func (s *LocalSolver) Predict(img []byte) (string, float64, []float64, error) {
	return s.Net.Predict(img)
}

// NewCaptchaSolverFromEnv returns LocalSolver if url is empty, else HTTPSolver.
func NewCaptchaSolverFromEnv(captchaURL string, net *model.Net) (CaptchaSolver, error) {
	url := strings.TrimSpace(captchaURL)
	if url == "" {
		if net == nil {
			return nil, fmt.Errorf("CAPTCHA_URL unset and no local model")
		}
		return &LocalSolver{Net: net}, nil
	}
	return NewHTTPSolver(url, ""), nil
}
