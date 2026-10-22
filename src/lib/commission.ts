export function commissionTotals(amount: number, received: number, cancelled = false) {
  return { due: cancelled ? 0 : amount, received, pending: cancelled ? 0 : Math.max(0, amount - received) };
}

export function validateCommissionReceipt(amount: number, pending: number) {
  return Number.isFinite(amount) && amount > 0 && amount <= pending;
}

export function salaryRecovery(outstanding: number, advances: number, commission: number, confirmed: boolean) {
  const advance = confirmed ? Math.min(outstanding, Math.max(0, advances)) : 0;
  const commissionRecovery = confirmed ? Math.min(Math.max(0, outstanding - advance), Math.max(0, commission)) : 0;
  return { advance, commission: commissionRecovery, payable: outstanding - advance - commissionRecovery };
}