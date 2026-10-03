// A wide corpus of card alerts in the formats Indian banks and card apps use
// (SMS, bank-app push, email), with fake card numbers. Every VALID_SPENDS
// entry is a real card spend: none may be skipped by the Android listener's
// quick filter or by the app's parser. Add new real formats here.

export const VALID_SPENDS = [
  // HDFC
  { bank: "HDFC SMS", text: "Spent Rs.1,250.00 On HDFC Bank Card 1234 At AMAZON PAY On 2026-10-03:10:30:45 Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1234 to 7308080808", amount: 1250 },
  { bank: "HDFC email 'thank you for using'", text: "Dear Card Member, Thank you for using your HDFC Bank Credit Card ending 1234 for Rs 2,499.00 at FLIPKART on 03-10-2026 12:10:05. Authorization code:- 123456", amount: 2499 },
  { bank: "HDFC autopay", text: "Rs.499.00 debited from HDFC Bank Credit Card ending 1234 towards NETFLIX on 03 Oct 2026 via e-mandate/autopay", amount: 499 },
  { bank: "HDFC with EMI marketing footer", text: "Alert! You've spent Rs.350 on your HDFC Bank Credit Card XX1234 at SWIGGY on 03-10-26. Convert to EMI? Click here to know more. T&C apply", amount: 350 },
  { bank: "HDFC 'was used for'", text: "Your HDFC Bank Credit Card ending 1234 was used for Rs. 1,999.00 at AMAZON on 03 Oct, 2026 at 14:22:10.", amount: 1999 },
  { bank: "HDFC RuPay UPI", text: "Rs.150.00 debited from your HDFC Bank RuPay Credit Card XX1234 to VPA paytmqr123@paytm on 03-10-26 (UPI Ref No 123456789012)", amount: 150 },
  { bank: "HDFC RuPay UPI 'Sent'", text: "Sent Rs.250.00 from HDFC Bank RuPay Credit Card XX1234 to swiggy@icici on 03/10/26. UPI Ref 123456789012", amount: 250 },
  { bank: "Tata Neu HDFC", text: "Rs. 3,000 spent on Tata Neu HDFC Bank Credit Card ending 1414 at BIGBASKET on 2026-10-03", amount: 3000 },
  { bank: "HDFC payment made using", text: "Payment of Rs.299.00 made using your HDFC Bank Credit Card XX1234 to GOOGLE PLAY on 03-10-26", amount: 299 },
  // ICICI
  { bank: "ICICI SMS", text: "INR 2,499.00 spent using ICICI Bank Card XX9876 on 03-Oct-26 on AMAZON PAY INDIA. Avl Limit: INR 1,50,000.00. If not you, call 1800 2662/SMS BLOCK 9876 to 9215676766", amount: 2499 },
  { bank: "ICICI 'transaction has been made'", text: "Dear Customer, a transaction of INR 799.00 has been made on your ICICI Bank Credit Card XX9876 at ZOMATO on 03-OCT-26.", amount: 799 },
  { bank: "ICICI 'Info:'", text: "Your ICICI Bank Credit Card XX9876 has been used for a transaction of INR 1,200.00 on Oct 03, 2026 at 10:15:22. Info: UBER INDIA.", amount: 1200 },
  { bank: "ICICI deducted", text: "INR 500.00 has been deducted on your ICICI Bank Credit Card XX9876 for an online transaction at AMAZON", amount: 500 },
  // SBI
  { bank: "SBI UPI (user sample)", text: "Rs.420.00 spent on your SBI Credit Card ending with 7683 at PADMASHREEFUELS on 03-10-26 via UPI (Ref No. 790280078105). Trxn. not done by you? Report at https://sbicard.com/Dispute", amount: 420 },
  { bank: "SBI SMS", text: "Rs.1,180.00 spent on your SBI Credit Card ending 2222 at AIRTEL PAYMENTS on 03/10/26. Trxn. not done by you? Report at https://sbicard.com/Dispute", amount: 1180 },
  { bank: "SBI compact date", text: "Transaction Alert: Rs 650.00 spent on SBI Card ending 2222 at DOMINOS on 03Oct26.", amount: 650 },
  { bank: "SBI autopay", text: "Rs.149.00 has been debited from your SBI Credit Card XX2222 towards NETFLIX for SI/e-mandate", amount: 149 },
  // Axis
  { bank: "Axis SMS", text: "Spent INR 450.50 Axis Bank Card no. XX4321 03-10-26 10:15:01 IST ZOMATO Avl Limit: INR 80,000.00 Not you? SMS BLOCK 4321 to 919951860002", amount: 450.5 },
  { bank: "Axis 'was spent'", text: "INR 299 was spent on your Axis Bank Credit Card XX4321 on 03-10-2026 at BIGBASKET.", amount: 299 },
  { bank: "Axis email 'charged'", text: "INR 1,250.00 was charged to your Axis Bank Credit Card no. XX4321 at ZOMATO on 03-10-2026.", amount: 1250 },
  // Kotak, IDFC, IndusInd, Yes, AU, RBL
  { bank: "Kotak", text: "Rs.1,500.00 spent on Kotak Credit Card x5555 at RELIANCE DIGITAL on 03/10/2026. Avl limit Rs.45,000. Not you? Call 18602662666", amount: 1500 },
  { bank: "Kotak RuPay UPI 'paid to'", text: "INR 99.00 paid to Zomato via UPI from your Kotak RuPay Credit Card x5555 on 03-10-2026. UPI Ref: 627312345678", amount: 99 },
  { bank: "IDFC FIRST", text: "INR 999.00 spent on your IDFC FIRST Bank Credit Card ending XX7777 at MYNTRA on 03-OCT-2026. Avl Limit: INR 2,00,000", amount: 999 },
  { bank: "IndusInd 'charged'", text: "Transaction of INR 2,000.00 has been charged on your IndusInd Bank Credit Card XX8888 at CROMA on 03/10/26", amount: 2000 },
  { bank: "Yes Bank 'debited with'", text: "Your YES BANK Credit Card XX6666 has been debited with INR 560.00 at UBER on 03-10-2026", amount: 560 },
  { bank: "AU 'deducted'", text: "Rs.1200 deducted from your AU Credit Card ending 4444 for purchase at DMART on 03-10-26", amount: 1200 },
  { bank: "RBL 'was charged'", text: "Dear Customer, your RBL Bank Credit Card ending 3333 was charged INR 870.00 at AJIO on 03/10/2026.", amount: 870 },
  // HSBC (user samples and app formats)
  { bank: "HSBC 'used at … for INR' (user sample)", text: "HSBC Credit Card xx7342 used at VISHAL MEGA MART for INR 1585.87 on 03/10/26. Avl limit INR 282112.21; due INR 3887.79. Call +914065118002 to report fraud.", amount: 1585.87 },
  { bank: "HSBC UPI (user sample)", text: "HSBC: Rs 3549.0 spent on your HSBC Credit Card ending 3417 at MANIPAL HEALTH ENTERPRISES PRIVATE LIMITED on 03 Oct 2026 through UPI: 316057993180. Trxn. not done by you? Call 18002673456.", amount: 3549 },
  { bank: "HSBC 'is successful'", text: "Your transaction of Rs.330 at SWIGGY using HSBC Credit Card xx3417 is successful", amount: 330 },
  { bank: "HSBC with loan/offer footer", text: "Rs 899 spent on HSBC Credit Card ending 5678 at BIGBASKET on 03 Oct 2026. Apply now for a pre-approved personal loan at 10.5% interest. T&C apply.", amount: 899 },
  // Card apps and fintech cards
  { bank: "OneCard", text: "You've spent ₹549 at Swiggy using your OneCard ending 1212 on 03 Oct 2026.", amount: 549 },
  { bank: "OneCard short", text: "₹549 debited at Swiggy via OneCard", amount: 549 },
  { bank: "BOBCARD", text: "Rs.700.00 spent on your BOBCARD ending 9090 at BPCL on 03-10-26", amount: 700 },
  { bank: "Scapia Federal", text: "INR 1,250 spent on your Scapia Federal Bank Credit Card at MAKEMYTRIP on 03-10-2026.", amount: 1250 },
  { bank: "StanChart 'thank you for using'", text: "Thank you for using StanChart Credit Card No XX0101 for INR 2,350.00 at AMAZON on 03/10/26 10:20", amount: 2350 },
  { bank: "AmEx", text: "Alert: You've spent INR 3,250.00 on your AMEX card ** 31005 at TAJ HOTELS on 3 October 2026 at 08:15 PM IST. Call 18004190691 if this was not made by you.", amount: 3250 },
  { bank: "Bank app push 'Card transaction:'", text: "Card transaction: Rs 450 at ZOMATO on your Credit Card XX1234", amount: 450 },
  // Unusual wording
  { bank: "'swiped for'", text: "Your Card XX1234 has been swiped for Rs.500 at HP PETROL on 03-10-26", amount: 500 },
  { bank: "'billed on'", text: "Rs 500 billed on your credit card XX1234 at AIRTEL on 03-10-26", amount: 500 },
  { bank: "'Txn of … done'", text: "Txn of INR 120.00 done on Card XX1234 at CHAI POINT on 03-10-26", amount: 120 },
  { bank: "'Purchase … is successful'", text: "Purchase of Rs 2,000 on your Card ending 1234 at SHOPPERS STOP is successful.", amount: 2000 },
  { bank: "no space after Rs", text: "Rs1,234.56 spent on card XX1234 at CAFE on 03-10-26", amount: 1234.56 },
  { bank: "INR without space", text: "INR1234 spent on card XX1234 at STORE on 03-10-26", amount: 1234 },
  { bank: "₹ with space", text: "₹ 2,345.00 spent on your credit card ending 1234 at Amazon on 03-10-26", amount: 2345 },
  { bank: "'has been spent … for a purchase'", text: "Rs.1,299 has been spent on your card **1234 for a purchase at NYKAA", amount: 1299 },
  { bank: "Rs …/- style", text: "Rs.500/- spent on your Credit Card XX1234 at MEDPLUS on 03-10-26", amount: 500 },
  { bank: "Credit A/c wording", text: "Your Credit A/c XX1234 debited for Rs 500 at STORE on 03-10-26", amount: 500 },
  { bank: "with reward points note", text: "Thank you for using your card XX1234 for a purchase of Rs 500 at STORE. You earned 10 reward points.", amount: 500 },
  { bank: "with cashback note", text: "INR 899.00 debited from your Credit Card XX1234 at BIGBASKET on 03-10-26. Cashback will be credited in your statement.", amount: 899 },
  { bank: "with 'never share OTP' footer", text: "Rs.1,250.00 spent on HDFC Bank Card x1234 at AMAZON on 03-10-26. Never share your OTP or card details with anyone. Call 18002586161", amount: 1250 },
  { bank: "with 'do not share OTP' footer", text: "INR 640.00 spent on ICICI Bank Card XX9876 at ZEPTO. Do not share OTP/CVV/PIN with anyone. Call 18001080", amount: 640 },
];

// Foreign-currency spends: must be captured (queued), the INR amount is not
// in the alert so the parser leaves it for review instead of guessing.
export const FOREIGN_SPENDS = [
  { bank: "AmEx USD", text: "Alert: You've spent USD 20.00 on your AMEX card ** 31005 at APPLE.COM/BILL on 3 October 2026." },
  { bank: "ICICI USD with INR limit", text: "USD 45.99 spent on your ICICI Bank Card XX9876 on 03-Oct-26 at NETFLIX.COM. Avl Limit INR 1,40,000" },
  { bank: "HDFC EUR", text: "EUR 12.50 spent on HDFC Bank Card 1234 at SPOTIFY On 2026-10-03:10:30:45" },
];

// Not spends. Queuing these is acceptable (false positives are fine), but
// the parser should still ignore the clear ones.
export const NOT_SPENDS = [
  { kind: "OTP", text: "482913 is your OTP for txn of Rs 999 at AMAZON on card XX1234. Valid for 10 mins." },
  { kind: "loan offer (user sample)", text: "Your HDFC Bank Credit Card xx5102 has an updated pre-approved loan limit of Rs.800000. You can view the details and proceed digitally in just a few clicks." },
  { kind: "CRED reward (user sample)", text: "CRED\nYou've earned ₹75 CRED cashback on your recent Apparel purchase.\nTap below and claim it in the next 7 days." },
  { kind: "declined", text: "Transaction of Rs.500.00 on your Axis Bank Card XX4321 at ZOMATO has been declined due to insufficient limit." },
  { kind: "bill payment received", text: "Payment of Rs.15,000.00 has been received towards your HSBC Credit Card ending 5678. Thank you." },
  { kind: "statement", text: "Your HDFC Bank Credit Card statement is ready. Total due Rs 4,500. Min due Rs 225. Due date 20-10-26." },
];
