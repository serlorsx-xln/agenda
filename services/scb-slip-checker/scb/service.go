package scb

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

func fmtConfs(p []float64) string {
	parts := make([]string, len(p))
	for i, v := range p {
		parts[i] = fmt.Sprintf("%.2f", v)
	}
	return "[" + strings.Join(parts, " ") + "]"
}

func captchaConfThreshold() float64 {
	s := strings.TrimSpace(os.Getenv("CAPTCHA_CONF_THRESHOLD"))
	if s == "" {
		return 0.97
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f <= 0 {
		return 0.97
	}
	return f
}

func confPass(conf float64) bool { return conf >= captchaConfThreshold() }

// Service ties the SCB client + captcha solver together.
type Service struct {
	cfg    Config
	solver CaptchaSolver
	pool   chan solvedCaptcha // nil unless prefetch is enabled
	maxAge time.Duration
	plog   *slog.Logger
}

type solvedCaptcha struct {
	ch     Challenge
	answer string
	conf   float64
	ts     time.Time
}

func NewService(cfg Config, solver CaptchaSolver) *Service {
	return &Service{cfg: cfg, solver: solver}
}

// EnablePrefetch starts a background worker that keeps `size` freshly-solved captchas
// ready, so /verify skips the load+solve step (≈250 ms off the critical path).
func (s *Service) EnablePrefetch(size int, log *slog.Logger) {
	s.pool = make(chan solvedCaptcha, size)
	s.maxAge = 35 * time.Second
	s.plog = log
	go s.prefetchLoop()
}

func (s *Service) prefetchLoop() {
	client, err := NewClient(s.cfg, s.plog)
	for {
		if err != nil {
			time.Sleep(time.Second)
			client, err = NewClient(s.cfg, s.plog)
			continue
		}
		ch, e := client.LoadCaptcha()
		if e != nil {
			time.Sleep(time.Second)
			continue
		}
		img, e := base64.StdEncoding.DecodeString(ch.ImageBase64)
		if e != nil {
			continue
		}
		ans, conf, _, _ := s.solver.Predict(img)
		s.pool <- solvedCaptcha{ch, ans, conf, time.Now()} // blocks when full (backpressure)
	}
}

func (s *Service) getPrefetched() *solvedCaptcha {
	for {
		select {
		case sc := <-s.pool:
			if time.Since(sc.ts) <= s.maxAge {
				return &sc
			} // else stale → drop and try next
		default:
			return nil
		}
	}
}

type payloadT struct {
	Tran        string `json:"tran"`
	Bank        string `json:"bank"`
	Amount      string `json:"amount"`
	CaptchaCode string `json:"captchaCode"`
	Random      struct {
		Random2 string `json:"random2"`
		Random1 string `json:"random1"`
		Tag     string `json:"tag"`
	} `json:"random"`
}

func buildPayload(tran, bank, amount, answer string, ch Challenge) []byte {
	var p payloadT
	p.Tran, p.Bank, p.Amount, p.CaptchaCode = tran, bank, amount, answer
	p.Random.Random2, p.Random.Random1, p.Random.Tag = ch.Random2, ch.Random1, ch.Tag
	b, _ := json.Marshal(p)
	return b
}

// CheckQR auto-detects bank+tran from the slip QR, then verifies.
func (s *Service) CheckQR(log *slog.Logger, qr string, amount float64) Result {
	bank, tran, err := parseSlipQR(qr)
	if err != nil {
		log.Warn("invalid QR payload", "err", err)
		r := newResult(InvalidQR)
		r.Message = err.Error()
		return r
	}
	log.Info("QR parsed", "bank", bank, "tran", tran)
	return s.check(log, tran, bank, amount)
}

// CheckImage decodes the QR from a slip image, then verifies.
func (s *Service) CheckImage(log *slog.Logger, img []byte, amount float64) Result {
	t := time.Now()
	qr, err := decodeQRImage(img)
	if err != nil {
		log.Warn("QR decode from image failed", "imgBytes", len(img), "err", err)
		r := newResult(InvalidQR)
		r.Message = err.Error()
		return r
	}
	log.Info("QR decoded from image", "imgBytes", len(img), "ms", msSince(t))
	return s.CheckQR(log, qr, amount)
}

func (s *Service) check(log *slog.Logger, tran, bank string, amount float64) Result {
	t0 := time.Now()
	log.Info("verify start", "tran", tran, "bank", bank, "amount", amount, "maxAttempts", s.cfg.MaxAttempts)
	amountStr := fmt.Sprintf("%.2f", amount)

	// fast path: use a pre-solved captcha (load + CNN already done in the background)
	if s.pool != nil {
		if sc := s.getPrefetched(); sc != nil {
			log.Info("prefetched captcha", "answer", sc.answer, "ageMs", time.Since(sc.ts).Milliseconds())
			if !confPass(sc.conf) {
				log.Info("prefetched captcha low confidence → fresh path", "confidence", sc.conf)
			} else if client, err := NewClient(s.cfg, log); err == nil {
				payload := buildPayload(tran, bank, amountStr, sc.answer, sc.ch)
				if verr := client.VerifyCaptcha(payload); verr == nil {
					if errCode, rows, ferr := client.FetchResult(payload); ferr == nil {
						res := s.buildResult(tran, bank, errCode, rows, sc.answer, sc.conf)
						log.Info("verify done (prefetched)", "code", res.ReturnCode, "status", res.Status, "totalMs", msSince(t0))
						return res
					}
				}
				log.Info("prefetched captcha failed → fresh path")
			}
		}
	}

	client, err := NewClient(s.cfg, log)
	if err != nil {
		log.Error("client init failed", "err", err)
		r := newResult(SystemError)
		r.Message, r.Tran, r.Bank = err.Error(), tran, bank
		return r
	}
	var lastErr error
	for attempt := 1; attempt <= s.cfg.MaxAttempts; attempt++ {
		log.Info("attempt begin", "n", attempt)

		tc := time.Now()
		ch, err := client.LoadCaptcha()
		if err != nil {
			log.Warn("load captcha failed", "n", attempt, "err", err, "ms", msSince(tc))
			lastErr = err
			continue
		}
		log.Info("captcha loaded", "n", attempt, "imgB64Len", len(ch.ImageBase64), "ms", msSince(tc))

		imgBytes, err := base64.StdEncoding.DecodeString(ch.ImageBase64)
		if err != nil {
			log.Warn("captcha base64 decode failed", "n", attempt, "err", err)
			lastErr = err
			continue
		}

		ts := time.Now()
		answer, conf, per, err := s.solver.Predict(imgBytes)
		if err != nil {
			log.Warn("cnn predict failed", "n", attempt, "err", err)
			lastErr = err
			continue
		}
		log.Info("captcha solved (CNN)", "n", attempt, "answer", answer, "confidence", conf, "perChar", fmtConfs(per), "ms", msSince(ts))

		if !confPass(conf) {
			log.Info("captcha low confidence → retry", "n", attempt, "confidence", conf, "threshold", captchaConfThreshold())
			lastErr = fmt.Errorf("low confidence %.4f", conf)
			continue
		}

		payload := buildPayload(tran, bank, amountStr, answer, ch)

		tv := time.Now()
		if err := client.VerifyCaptcha(payload); err != nil {
			if errors.Is(err, ErrCaptchaRejected) {
				log.Info("captcha rejected → retry", "n", attempt, "answer", answer, "ms", msSince(tv))
				lastErr = err
				continue
			}
			log.Error("verify-captcha upstream error", "n", attempt, "err", err, "ms", msSince(tv))
			return upstream(tran, bank, err)
		}
		log.Info("captcha verified ✓", "n", attempt, "answer", answer, "ms", msSince(tv))

		tr := time.Now()
		errCode, rows, err := client.FetchResult(payload)
		if err != nil {
			log.Error("fetch-result upstream error", "err", err, "ms", msSince(tr))
			return upstream(tran, bank, err)
		}
		log.Info("result fetched", "errorCode", errCode, "rows", len(rows), "ms", msSince(tr))

		res := s.buildResult(tran, bank, errCode, rows, answer, conf)
		log.Info("verify done", "code", res.ReturnCode, "status", res.Status, "attempts", attempt, "totalMs", msSince(t0))
		return res
	}

	st, msg := CaptchaFailed, "captcha failed after retries"
	if lastErr != nil {
		msg = lastErr.Error()
		if !errors.Is(lastErr, ErrCaptchaRejected) {
			st = UpstreamError
		}
	}
	log.Warn("verify failed", "code", st.Code, "status", st.Name, "message", msg, "totalMs", msSince(t0))
	r := newResult(st)
	r.Message, r.Tran, r.Bank = msg, tran, bank
	return r
}

func upstream(tran, bank string, err error) Result {
	r := newResult(UpstreamError)
	r.Message, r.Tran, r.Bank = err.Error(), tran, bank
	return r
}

func (s *Service) buildResult(tran, bank, errCode string, rows []kv, answer string, conf float64) Result {
	var r Result
	switch {
	case errCode == "ErrorReal":
		r = newResult(NotFound)
		r.Message = "ErrorReal"
	case errCode == "ErrorParam":
		r = newResult(InvalidParams)
		r.Message = "ErrorParam"
	case errCode != "":
		r = newResult(SystemError)
		r.Message = errCode
	case len(rows) == 0:
		r = newResult(NotFound)
		r.Message = "empty result"
	default:
		r = newResult(Found)
		r.SlipData, r.RawFields = buildSlipDetail(rows)
	}
	r.Tran, r.Bank = tran, bank
	r.Solver = map[string]any{"answer": answer, "confidence": conf, "pass_threshold": confPass(conf)}
	return r
}
