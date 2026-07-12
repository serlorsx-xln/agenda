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

	"scbslip/model"
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

func main() {
	level := slog.LevelInfo
	if strings.EqualFold(os.Getenv("LOG_LEVEL"), "debug") {
		level = slog.LevelDebug
	}
	color := os.Getenv("NO_COLOR") == "" && isatty.IsTerminal(os.Stdout.Fd())
	if os.Getenv("FORCE_COLOR") != "" {
		color = true
	}
	if color {
		enableANSI()
	}
	logger := slog.New(newPrettyHandler(os.Stdout, level, color))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	net, err := model.Default()
	if err != nil {
		logger.Error("load model failed", "err", err)
		os.Exit(1)
	}
	solver, err := scb.NewCaptchaSolverFromEnv(os.Getenv("CAPTCHA_URL"), net)
	if err != nil {
		logger.Error("captcha solver init failed", "err", err)
		os.Exit(1)
	}
	banner(os.Stdout, color, port, level.String(), len(net.Charset), net.NChars)
	logger.Info("model loaded", "nChars", net.NChars, "charsetLen", len(net.Charset))

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

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok", "n_chars": net.NChars, "charset_len": len(net.Charset),
		})
	})

	mux.HandleFunc("/verify", func(w http.ResponseWriter, r *http.Request) {
		rlog := logger.With("req", reqID())
		start := time.Now()
		rlog.Info("request", "method", r.Method, "path", r.URL.Path, "remote", clientIP(r))
		if r.Method != http.MethodPost {
			rlog.Warn("method not allowed", "method", r.Method)
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
			return
		}
		var body struct {
			QR     string  `json:"qr"`
			Amount float64 `json:"amount"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.QR == "" || body.Amount <= 0 {
			rlog.Warn("bad request", "err", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "need {qr, amount>0}"})
			return
		}
		res := svc.CheckQR(rlog, body.QR, body.Amount)
		rlog.Info("response", "code", res.ReturnCode, "status", res.Status, "ms", msSince(start))
		writeJSON(w, http.StatusOK, res)
	})

	mux.HandleFunc("/verify/image", func(w http.ResponseWriter, r *http.Request) {
		rlog := logger.With("req", reqID())
		start := time.Now()
		rlog.Info("request", "method", r.Method, "path", r.URL.Path, "remote", clientIP(r))
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
			return
		}
		if err := r.ParseMultipartForm(16 << 20); err != nil {
			rlog.Warn("bad multipart", "err", err)
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
	})

	logger.Info("server listening", "addr", "0.0.0.0:"+port, "logLevel", level.String())
	if err := http.ListenAndServe("0.0.0.0:"+port, mux); err != nil {
		logger.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
