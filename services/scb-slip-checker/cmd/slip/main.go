// SCB slip verification service — uses remote captcha microservice when CAPTCHA_URL is set.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/mattn/go-isatty"

	"scbslip/scb"
)

func reqID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func msSince(t time.Time) float64 { return float64(time.Since(t).Microseconds()) / 1000.0 }

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("x-forwarded-for"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func apiKeyMiddleware(next http.HandlerFunc, apiKey string) http.HandlerFunc {
	if apiKey == "" {
		return next
	}
	return func(w http.ResponseWriter, r *http.Request) {
		auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if auth == "" {
			auth = r.Header.Get("X-API-Key")
		}
		if auth != apiKey {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func main() {
	level := slog.LevelInfo
	if strings.EqualFold(os.Getenv("LOG_LEVEL"), "debug") {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	captchaURL := strings.TrimSpace(os.Getenv("CAPTCHA_URL"))
	if captchaURL == "" {
		logger.Error("CAPTCHA_URL is required for slip service")
		os.Exit(1)
	}

	captchaKey := strings.TrimSpace(os.Getenv("CAPTCHA_API_KEY"))
	if captchaKey == "" {
		captchaKey = strings.TrimSpace(os.Getenv("API_KEY"))
	}
	solver := scb.NewHTTPSolver(captchaURL, captchaKey)
	logger.Info("using remote captcha solver", "url", captchaURL)

	cfg := scb.DefaultConfig()
	if p := os.Getenv("PROXY"); p != "" {
		cfg.Proxy = p
		logger.Info("proxy enabled")
	}
	if m := os.Getenv("MAX_ATTEMPTS"); m != "" {
		if v, e := strconv.Atoi(m); e == nil && v > 0 {
			cfg.MaxAttempts = v
		}
	}

	svc := scb.NewService(cfg, solver)
	if os.Getenv("PREFETCH") != "" && os.Getenv("PREFETCH") != "0" {
		size := 3
		if v, e := strconv.Atoi(os.Getenv("PREFETCH_SIZE")); e == nil && v > 0 {
			size = v
		}
		svc.EnablePrefetch(size, logger)
		logger.Info("captcha prefetch enabled", "size", size)
	}

	_ = isatty.IsTerminal(os.Stdout.Fd()) // keep import for parity with monolith

	apiKey := strings.TrimSpace(os.Getenv("API_KEY"))
	if apiKey == "" {
		logger.Error("API_KEY is required")
		os.Exit(1)
	}
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		captchaOK := false
		client := &http.Client{Timeout: 3 * time.Second}
		if resp, err := client.Get(strings.TrimRight(captchaURL, "/") + "/health"); err == nil {
			resp.Body.Close()
			captchaOK = resp.StatusCode == http.StatusOK
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":     "ok",
			"captcha_ok": captchaOK,
		})
	})

	mux.HandleFunc("/verify", apiKeyMiddleware(func(w http.ResponseWriter, r *http.Request) {
		rlog := logger.With("req", reqID())
		start := time.Now()
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
			return
		}
		var body struct {
			QR     string  `json:"qr"`
			Amount float64 `json:"amount"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.QR == "" || body.Amount <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "need {qr, amount>0}"})
			return
		}
		res := svc.CheckQR(rlog, body.QR, body.Amount)
		rlog.Info("response", "code", res.ReturnCode, "status", res.Status, "ms", msSince(start))
		writeJSON(w, http.StatusOK, res)
	}, apiKey))

	mux.HandleFunc("/verify/image", apiKeyMiddleware(func(w http.ResponseWriter, r *http.Request) {
		rlog := logger.With("req", reqID())
		start := time.Now()
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
			return
		}
		if err := r.ParseMultipartForm(16 << 20); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "multipart form required"})
			return
		}
		amount, _ := strconv.ParseFloat(r.FormValue("amount"), 64)
		if amount <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "amount>0 required"})
			return
		}
		f, fh, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file required"})
			return
		}
		defer f.Close()
		img, err := io.ReadAll(f)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read file"})
			return
		}
		rlog.Info("image received", "filename", fh.Filename, "bytes", len(img), "amount", amount)
		res := svc.CheckImage(rlog, img, amount)
		rlog.Info("response", "code", res.ReturnCode, "status", res.Status, "ms", msSince(start))
		writeJSON(w, http.StatusOK, res)
	}, apiKey))

	addr := "0.0.0.0:" + port
	logger.Info("slip service listening", "addr", addr)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       120 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		logger.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
