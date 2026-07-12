package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"unicode/utf8"
)

// ANSI colors
const (
	cReset   = "\033[0m"
	cDim     = "\033[2m"
	cBold    = "\033[1m"
	cRed     = "\033[31m"
	cGreen   = "\033[32m"
	cYellow  = "\033[33m"
	cMagenta = "\033[35m"
	cCyan    = "\033[36m"
	cGray    = "\033[90m"
)

// prettyHandler is a compact, colorized slog.Handler for human reading.
type prettyHandler struct {
	w     io.Writer
	level slog.Level
	color bool
	attrs []slog.Attr
	mu    *sync.Mutex
}

func newPrettyHandler(w io.Writer, level slog.Level, color bool) *prettyHandler {
	return &prettyHandler{w: w, level: level, color: color, mu: &sync.Mutex{}}
}

func (h *prettyHandler) Enabled(_ context.Context, l slog.Level) bool { return l >= h.level }

func (h *prettyHandler) WithGroup(string) slog.Handler { return h }

func (h *prettyHandler) WithAttrs(as []slog.Attr) slog.Handler {
	nh := *h
	nh.attrs = append(append([]slog.Attr{}, h.attrs...), as...)
	return &nh
}

func (h *prettyHandler) paint(s, code string) string {
	if !h.color || code == "" {
		return s
	}
	return code + s + cReset
}

func (h *prettyHandler) levelBadge(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return h.paint("ERR", "\033[1;91m") // bright red
	case l >= slog.LevelWarn:
		return h.paint("WRN", "\033[1;93m") // bright yellow
	case l >= slog.LevelInfo:
		return h.paint("INF", "\033[1;92m") // bright green
	default:
		return h.paint("DBG", "\033[1;96m") // bright cyan
	}
}

func (h *prettyHandler) appendAttr(b *strings.Builder, a slog.Attr) {
	if a.Equal(slog.Attr{}) {
		return
	}
	var val, code string
	switch a.Key {
	case "ms":
		f := a.Value.Float64()
		val = fmt.Sprintf("%.1fms", f)
		switch {
		case f < 100:
			code = cGreen
		case f < 500:
			code = cCyan
		default:
			code = cYellow
		}
	case "confidence":
		f := a.Value.Float64()
		val = fmt.Sprintf("%.4f", f)
		if f >= 0.97 {
			code = cGreen
		} else {
			code = cYellow
		}
	case "status", "code":
		val = a.Value.String()
		if val == "FOUND" || val == "0000" {
			code = cGreen
		} else {
			code = cYellow
		}
	case "err", "message":
		val, code = a.Value.String(), cRed
	case "answer", "tran", "bank":
		val, code = a.Value.String(), cCyan
	case "req":
		val, code = a.Value.String(), cMagenta
	default:
		val = a.Value.String()
	}
	b.WriteByte(' ')
	b.WriteString(h.paint(a.Key+"=", cDim))
	b.WriteString(h.paint(val, code))
}

func (h *prettyHandler) Handle(_ context.Context, r slog.Record) error {
	var b strings.Builder
	b.WriteString(h.paint(r.Time.Format("15:04:05.000"), cGray))
	b.WriteByte(' ')
	b.WriteString(h.levelBadge(r.Level))
	b.WriteByte(' ')

	msg := r.Message
	b.WriteString(h.paint(msg, cBold))
	if pad := 24 - utf8.RuneCountInString(msg); pad > 0 {
		b.WriteString(strings.Repeat(" ", pad))
	}

	for _, a := range h.attrs {
		h.appendAttr(&b, a)
	}
	r.Attrs(func(a slog.Attr) bool { h.appendAttr(&b, a); return true })
	b.WriteByte('\n')

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := io.WriteString(h.w, b.String())
	return err
}

func banner(w io.Writer, color bool, port, level string, charset, nChars int) {
	const width = 48
	paint := func(s, c string) string {
		if !color {
			return s
		}
		return c + s + cReset
	}
	bar := paint("│", cCyan)
	line := func(s string) string {
		return bar + " " + s + strings.Repeat(" ", max(0, width-1-visibleLen(s))) + bar
	}
	fmt.Fprintln(w, paint("┌"+strings.Repeat("─", width)+"┐", cCyan))
	fmt.Fprintln(w, line(paint("SCB Slip Checker", cBold)+paint("  ·  Go single-binary", cGray)))
	fmt.Fprintln(w, line(paint(fmt.Sprintf("CNN in-binary · %d chars × %d positions", charset, nChars), cGray)))
	fmt.Fprintln(w, line(paint("listening ", cGray)+paint(":"+port, cGreen)+paint("   ·   log ", cGray)+paint(level, cYellow)))
	fmt.Fprintln(w, paint("└"+strings.Repeat("─", width)+"┘", cCyan))
}

// visibleLen counts runes ignoring ANSI escape sequences.
func visibleLen(s string) int {
	n, inEsc := 0, false
	for _, r := range s {
		if r == '\033' {
			inEsc = true
			continue
		}
		if inEsc {
			if r == 'm' {
				inEsc = false
			}
			continue
		}
		n++
	}
	return n
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
