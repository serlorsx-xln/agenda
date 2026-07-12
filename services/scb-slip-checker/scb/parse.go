package scb

import (
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
)

var (
	reChallenge = regexp.MustCompile(`data-style-capcha="([^"]+)"`)
	reCapImg    = regexp.MustCompile(`src="(data:image/[^"]+)"`)
	reError     = regexp.MustCompile(`id="checkError"[^>]*style-error="([^"]*)"`)
	reRow       = regexp.MustCompile(`(?s)<tr[^>]*>(.*?)</tr>`)
	reCell      = regexp.MustCompile(`(?s)<t[dh][^>]*>(.*?)</t[dh]>`)
	reTag       = regexp.MustCompile(`<[^>]+>`)
	reSpace     = regexp.MustCompile(`\s+`)
)

// Challenge is the captcha puzzle (AES-GCM token parts) + the image.
type Challenge struct {
	Random1, Random2, Tag string
	ImageBase64           string // raw base64 (no data: prefix)
}

func parseCaptcha(html string) (Challenge, error) {
	m := reChallenge.FindStringSubmatch(html)
	if m == nil {
		return Challenge{}, fmt.Errorf("captcha challenge not found")
	}
	parts := strings.Split(m[1], "/")
	if len(parts) != 3 {
		return Challenge{}, fmt.Errorf("unexpected captcha challenge format (%d parts)", len(parts))
	}
	ch := Challenge{Random2: parts[0], Random1: parts[1], Tag: parts[2]}
	if img := reCapImg.FindStringSubmatch(html); img != nil {
		if i := strings.IndexByte(img[1], ','); i >= 0 {
			ch.ImageBase64 = img[1][i+1:]
		}
	}
	if ch.ImageBase64 == "" {
		return Challenge{}, fmt.Errorf("captcha image not found")
	}
	return ch, nil
}

func stripHTML(s string) string {
	s = reTag.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, " ", " ")
	return strings.TrimSpace(reSpace.ReplaceAllString(s, " "))
}

type kv struct{ label, value string }

// parseResult returns the island error code ("" if success) and ordered label/value rows.
func parseResult(html string) (string, []kv) {
	errCode := ""
	if m := reError.FindStringSubmatch(html); m != nil {
		errCode = strings.TrimSpace(m[1])
	}
	var rows []kv
	for _, r := range reRow.FindAllStringSubmatch(html, -1) {
		cells := reCell.FindAllStringSubmatch(r[1], -1)
		if len(cells) < 2 {
			continue
		}
		label := stripHTML(cells[0][1])
		var vals []string
		for _, c := range cells[1:] {
			vals = append(vals, stripHTML(c[1]))
		}
		value := strings.TrimSpace(strings.Join(vals, " "))
		if label != "" {
			rows = append(rows, kv{strings.TrimRight(label, ": "), value})
		}
	}
	return errCode, rows
}

func bilingual(v string) map[string]string {
	if i := strings.Index(v, " / "); i >= 0 {
		return map[string]string{"TH": strings.TrimSpace(v[:i]), "EN": strings.TrimSpace(v[i+3:])}
	}
	c := strings.TrimSpace(v)
	return map[string]string{"TH": c, "EN": c}
}

func englishLabel(label string) string {
	if i := strings.Index(label, " / "); i >= 0 {
		label = label[i+3:]
	}
	return strings.ToLower(strings.TrimSpace(label))
}

func amount(v string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(strings.ReplaceAll(v, ",", "")), 64)
	return f
}

// buildSlipDetail maps the bilingual table rows into the a.py-style SLIP_DATA.
func buildSlipDetail(rows []kv) (map[string]any, map[string]string) {
	detail := map[string]any{}
	sender := map[string]any{}
	receiver := map[string]any{}
	txn := map[string]any{"CURRENCY": "THB"}
	var refs []string
	raw := map[string]string{}

	for _, row := range rows {
		raw[row.label] = row.value
		key := englishLabel(row.label)
		switch {
		case strings.Contains(key, "verification status"):
			detail["VERIFICATION"] = bilingual(row.value)
		case strings.Contains(key, "ref id"), strings.Contains(key, "slip no"):
			detail["REF_ID"] = strings.TrimSpace(row.value)
		case strings.Contains(key, "date"):
			txn["TXN_DATE"] = bilingual(row.value)
		case strings.Contains(key, "from account name"):
			sender["ACCT_NAME"] = bilingual(row.value)
		case strings.Contains(key, "from account number"):
			sender["ACCT_NUM"] = strings.TrimSpace(row.value)
		case strings.HasPrefix(key, "from"):
			sender["BANK_NAME"] = bilingual(row.value)
		case strings.Contains(key, "to account name"), strings.Contains(key, "biller name"):
			receiver["ACCT_NAME"] = bilingual(row.value)
		case strings.Contains(key, "promptpay"), strings.Contains(key, "reference id"):
			receiver["ACCT_NUM"] = strings.TrimSpace(row.value)
		case strings.Contains(key, "to account number"), strings.Contains(key, "biller id"), strings.Contains(key, "account number"):
			receiver["ACCT_NUM"] = strings.TrimSpace(row.value)
		case strings.HasPrefix(key, "to"):
			receiver["BANK_NAME"] = bilingual(row.value)
		case strings.Contains(key, "reference"):
			refs = append(refs, strings.TrimSpace(row.value))
		case strings.Contains(key, "amount"):
			txn["TXN_AMT"] = amount(row.value)
			txn["DISP_AMT"] = bilingual(row.value)
		}
	}
	detail["TXN_INFO"] = txn
	detail["SENDER_INFO"] = sender
	detail["RECEIVER_INFO"] = receiver
	if len(refs) > 0 {
		detail["REFERENCES"] = refs
	}
	return detail, raw
}
