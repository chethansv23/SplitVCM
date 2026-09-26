// Anonymised sample alerts in the formats Indian card issuers commonly use.
// Replace or extend these with your own real alerts (remove names and
// numbers first) — every parser change must keep them passing.

export const DEBIT_ALERTS = [
  {
    name: "HDFC card SMS",
    text: "Rs.1,250.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-23:10:30:00 Avl bal: Rs.45,000.00. Not you? Call 18002586161",
    expected: { amount: 1250, cardLastFour: "1234", merchant: "SWIGGY", day: "2026-09-23", confidence: "high" },
  },
  {
    name: "HSBC card SMS",
    text: "Your HSBC Credit Card ending 5678 has been used for INR 899.00 at BIGBASKET on 14 Sep 2026 at 18:05. Available credit limit INR 1,20,000.",
    expected: { amount: 899, cardLastFour: "5678", merchant: "BIGBASKET", day: "2026-09-14", confidence: "high" },
  },
  {
    name: "Axis card SMS",
    text: "INR 450.50 spent on Axis Bank Card XX4321 on 13-09-26 at ZOMATO. Avl Lmt: INR 80,000.00",
    expected: { amount: 450.5, cardLastFour: "4321", merchant: "ZOMATO", day: "2026-09-13", confidence: "high" },
  },
  {
    name: "ICICI card SMS",
    text: "INR 2,499.00 spent using ICICI Bank Card XX9876 on 15-Sep-26 on AMAZON PAY INDIA. Avl Limit: INR 1,50,000.00.",
    expected: { amount: 2499, cardLastFour: "9876", day: "2026-09-15" },
  },
  {
    name: "SBI card SMS",
    text: "Rs.320.00 spent on your SBI Credit Card ending 2468 at PHONEPE on 02/09/26. Trxn. not done by you? Report at sbicard.com",
    expected: { amount: 320, cardLastFour: "2468", merchant: "PHONEPE", day: "2026-09-02", confidence: "high" },
  },
  {
    name: "RuPay credit card UPI",
    text: "Rs 150.00 debited from HSBC RuPay Credit Card via UPI to VPA swiggy.stores@axb on 20-09-2026. UPI Ref 123456789012",
    expected: { amount: 150, channel: "upi", merchant: "Swiggy", vpa: "swiggy.stores@axb", day: "2026-09-20" },
  },
  {
    name: "Credit card UPI with 'credited' payee wording",
    text: "ICICI Bank Credit Card XX9876 debited for Rs 150.00 on 20-Sep-26; SWIGGY credited. UPI:123456789012. Call 18002662 for dispute.",
    expected: { amount: 150, cardLastFour: "9876", day: "2026-09-20" },
  },
  {
    name: "Email notification",
    title: "Transaction alert for your HDFC Bank Credit Card",
    text: "Dear Customer, Rs.1250.00 has been debited from your HDFC Bank Credit Card ending 1234 towards BOOKMYSHOW on 23 Sep, 2026 at 10:31:12.",
    expected: { amount: 1250, cardLastFour: "1234", merchant: "BOOKMYSHOW", day: "2026-09-23" },
  },
];

export const CREDIT_ALERTS = [
  {
    name: "Refund",
    text: "Refund of Rs.899.00 from BIGBASKET has been credited to your HSBC Credit Card ending 5678 on 18 Sep 2026.",
    expected: { amount: 899, cardLastFour: "5678", direction: "credit" },
  },
];

export const IGNORED_ALERTS = [
  { reason: "otp", text: "123456 is the OTP for your transaction of Rs.1,250.00 at SWIGGY on HDFC Bank Card x1234. Do not share it." },
  { reason: "failed", text: "Transaction of Rs.500.00 on your Axis Bank Card XX4321 at ZOMATO has been declined due to insufficient limit." },
  { reason: "card-repayment", text: "Payment of Rs.15,000.00 has been received towards your HSBC Credit Card ending 5678. Thank you." },
  { reason: "cash-withdrawal", text: "Rs.2,000.00 withdrawn at ATM using your HDFC Bank Card x1234 on 2026-09-23:12:00:00." },
  { reason: "balance-only", text: "Your available credit limit on SBI Credit Card ending 2468 is Rs.50,000.00 as on 23-09-26." },
  { reason: "bank-account", text: "Sent Rs.150.00 From HDFC Bank A/C x4455 To SWIGGY On 20/09/26 Ref 123456789012. Not You? Call 18002586161" },
  { reason: "bank-account", text: "Rs 2,000.00 debited from A/c XX4455 on 20-09-26 to VPA friend@okaxis. UPI Ref 1234" },
  { reason: "cashback-posting", text: "Cashback of Rs.250.00 has been credited to your Airtel Axis Bank Credit Card XX4321 on 12-09-26." },
  { reason: "promotional", text: "Congrats! You are pre-approved for a loan of Rs.5,00,000. Apply now, T&C apply." },
];
