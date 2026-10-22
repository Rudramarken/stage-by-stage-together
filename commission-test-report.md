# Driver commission change — verification

## Tested and working
- Signed-in TEST Ramesh Commission: ₹5,000 advance + ₹1,000 commission = ₹6,000 receivable; pending ₹1,000, received ₹0.
- Commission edited to ₹1,200 and saved twice: one commission_due row, not duplicate rows.
- Clicked real receipt form for ₹400 and ₹800, refreshing after each save. Final received ₹1,200, pending ₹0, driver balance ₹5,000. Database confirms two receipt credits totaling ₹1,200.
- Receiving ₹1 after full settlement was rejected. Reusing the first receipt's request ID returned the same receipt with exactly one history record.
- Commission off produced no commission record. Repeated mixed-case, extra-space driver name resolved to the existing single TEST driver.
- ₹20,000 To-Pay LR with ₹20,000 paid directly: party and transporter ledger net zero. No freight payment record created. Found and corrected an existing collision between party and transporter direct-payment ledger line keys.
- Trip fixed commission ₹1,000 appeared in salary recovery suggestion: ₹15,000 − ₹5,000 advance − ₹1,000 commission = ₹9,000 payable. Amount stayed ₹15,000 before confirmation; checking confirmation changed it to ₹9,000. Clicked save, refreshed, then read driver ledger as Settled (₹0).
- Turning another commission off twice retained one ₹1,000 due and one ₹1,000 offsetting reversal with reason; net zero.
- Commission report shows ₹1,200 received, ₹0 pending for the TEST LR. Cash report shows ₹1,200, excluding ₹1,000 salary recovery and consignee direct payments.
- Signed-in driver ledger, reports and outstanding screens rendered without browser errors.
- 17 automated tests passed across commission, freight, date/currency and routing tests; preview build reported OK.

## Built but not tested
- Simultaneous writes from two users, cross-business denial, receipt reversal and salary-payment reversal.
- Trip percentage recalculation, full trip-family totals and all form fields using manual input.

### Manual checks
1. On a TEST trip, set commission to 5%; link a ₹20,000 LR and check ₹1,000 commission in the trip summary.
2. Receive ₹400 from its driver, then Reverse that receipt with a TEST reason; refresh and check pending increases by ₹400 once.
3. Reverse a TEST salary payment with a reason; refresh and check advance/commission recoveries and salary outstanding are restored.
4. With two signed-in windows, attempt to receive the same remaining amount simultaneously; only one should succeed.
5. A separately approved account in a different business must not see or receive these commissions.

## Not built
No requested core commission feature omitted. The original project's full seven-stage verification remains outside this commission-specific test pass.

TEST records remain clearly named for inspection; no financial records were deleted. The existing app and RLS were preserved.