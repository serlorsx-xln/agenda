package scb

// Status is a custom numeric outcome code (mirrors the Python StatusCode).
type Status struct {
	Code string
	Name string
}

var (
	Found         = Status{"0000", "FOUND"}
	NotFound      = Status{"0001", "NOT_FOUND"}
	InvalidParams = Status{"0002", "INVALID_PARAMS"}
	InvalidQR     = Status{"7777", "INVALID_QR"}
	CaptchaFailed = Status{"8888", "CAPTCHA_FAILED"}
	LowConfidence = Status{"8890", "LOW_CONFIDENCE"}
	UpstreamError = Status{"9998", "UPSTREAM_ERROR"}
	SystemError   = Status{"9999", "SYSTEM_ERROR"}
)

// Result is the a.py-style response payload.
type Result struct {
	ReturnCode string            `json:"RETURN_CODE"`
	Status     string            `json:"STATUS"`
	Message    string            `json:"MESSAGE"`
	Tran       string            `json:"TRAN"`
	Bank       string            `json:"BANK"`
	SlipData   map[string]any    `json:"SLIP_DATA"`
	RawFields  map[string]string `json:"RAW_FIELDS"`
	Solver     map[string]any    `json:"SOLVER"`
}

func newResult(s Status) Result {
	return Result{ReturnCode: s.Code, Status: s.Name}
}
