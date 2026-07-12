/** Response from scb-slip-checker POST /verify/image */

type ScbSlipBilingual = { TH?: string; EN?: string };

type ScbSlipData = {
  VERIFICATION?: ScbSlipBilingual;
  REF_ID?: string;
  TXN_INFO?: {
    CURRENCY?: string;
    TXN_DATE?: ScbSlipBilingual;
    TXN_AMT?: number;
    DISP_AMT?: ScbSlipBilingual;
  };
  SENDER_INFO?: {
    BANK_NAME?: ScbSlipBilingual;
    ACCT_NAME?: ScbSlipBilingual;
    ACCT_NUM?: string;
  };
  RECEIVER_INFO?: {
    BANK_NAME?: ScbSlipBilingual;
    ACCT_NAME?: ScbSlipBilingual;
    ACCT_NUM?: string;
  };
  REFERENCES?: string[];
};

export type ScbSlipResult = {
  RETURN_CODE: string;
  STATUS: string;
  MESSAGE?: string;
  TRAN?: string;
  BANK?: string;
  SLIP_DATA?: ScbSlipData;
  RAW_FIELDS?: Record<string, string>;
  SOLVER?: {
    answer?: string;
    confidence?: number;
    pass_threshold?: boolean;
  };
};


export function isSlipFound(result: ScbSlipResult): boolean {
  return result.STATUS === "FOUND" && result.RETURN_CODE === "0000";
}

export function mapScbReturnCode(code: string): string {
  switch (code) {
    case "0000":
      return "found";
    case "0001":
      return "not_found";
    case "0002":
      return "invalid_params";
    case "7777":
      return "invalid_qr";
    case "8888":
      return "captcha_failed";
    case "9998":
      return "upstream_error";
    case "9999":
      return "system_error";
    default:
      return "unknown";
  }
}
