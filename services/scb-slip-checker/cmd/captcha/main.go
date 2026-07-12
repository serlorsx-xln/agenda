// Captcha CNN microservice — POST /predict with raw captcha image bytes.
package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"scbslip/model"
)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func apiKeyMiddleware(next http.HandlerFunc, apiKey string) http.HandlerFunc {
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
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	apiKey := strings.TrimSpace(os.Getenv("API_KEY"))
	if apiKey == "" {
		logger.Error("API_KEY is required")
		os.Exit(1)
	}

	net, err := model.Default()
	if err != nil {
		logger.Error("load model failed", "err", err)
		os.Exit(1)
	}
	logger.Info("captcha model loaded", "nChars", net.NChars, "charsetLen", len(net.Charset))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8001"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok", "n_chars": net.NChars, "charset_len": len(net.Charset),
		})
	})

	mux.HandleFunc("/predict", apiKeyMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
			return
		}

		var img []byte
		var err error

		ct := r.Header.Get("Content-Type")
		if strings.HasPrefix(ct, "multipart/form-data") {
			if err := r.ParseMultipartForm(4 << 20); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad multipart"})
				return
			}
			f, _, ferr := r.FormFile("file")
			if ferr != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file required"})
				return
			}
			defer f.Close()
			img, err = io.ReadAll(f)
		} else {
			img, err = io.ReadAll(io.LimitReader(r.Body, 4<<20))
		}
		if err != nil || len(img) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "empty image"})
			return
		}

		answer, conf, perChar, err := net.Predict(img)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"answer":     answer,
			"confidence": conf,
			"per_char":   perChar,
		})
	}, apiKey))

	addr := "0.0.0.0:" + port
	logger.Info("captcha service listening", "addr", addr)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		logger.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
