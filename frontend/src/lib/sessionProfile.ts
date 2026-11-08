import type { Profile } from "../data/types";
import { profiles } from "../data/types";
import type { AuthAccount } from "../api/client";

export function knownProfile(account: AuthAccount): Profile | null {
  return profiles.find((profile) => profile.customer.customer_id === account.customer_id) ?? null;
}

/** A profile shell for someone who signed up and is not in the Toyota data pack. */
export function shellProfile(account: AuthAccount): Profile {
  const payment = account.current_payment ?? 0;
  return {
    customer: {
      customer_id: account.customer_id,
      first_name: account.first_name,
      age: 0,
      city: account.city,
      state: account.state || "TX",
      occupation: "",
      annual_income: 0,
      other_monthly_debt: 0,
      credit_tier_at_origination: "",
      credit_tier_now: "",
      preferred_channel: "Web",
      marketing_consent: "N",
      vulnerable_flag: "N",
      autopay: "N",
      digital_engagement: "",
      payday_day: 1,
      payment_to_income_pct: 0,
      debt_to_income_pct: 0,
      financial_stress_score: 0,
      tenure_months_with_tfs: 0,
    },
    vehicle: {
      vehicle_id: "",
      customer_id: account.customer_id,
      model_year: account.vehicle_year ?? new Date().getFullYear(),
      model: account.vehicle_model || "Toyota",
      trim: "",
      condition_at_purchase: "",
      purchase_price_or_msrp: 0,
      odometer_now: 0,
      annual_miles_est: 12000,
      est_market_value_now: 0,
      toyota_care_ends: "",
      basic_warranty_ends: "",
      last_service_date: "",
      next_service_due: "",
      open_recall: "N",
    },
    account: {
      account_id: "",
      customer_id: account.customer_id,
      vehicle_id: "",
      contract_type: "loan",
      contract_start: "",
      term_months: 0,
      months_elapsed: 0,
      months_remaining: 0,
      contract_end: "",
      missed_payments_12m: 0,
      autopay: "N",
      amount_financed: 0,
      apr: null,
      money_factor: null,
      monthly_payment: payment,
      current_balance: null,
      payoff_quote: null,
      residual_value: null,
      mileage_allowance_total: null,
      est_equity: null,
      payment_due_day: 1,
    },
    situation: {
      situation_id: "",
      customer_id: account.customer_id,
      customer_says: account.life_change,
      context_summary: "This is what the customer wrote when they created the account. Toyota has not verified it.",
    },
    options: [],
    golden: {
      best_next_move: "",
      next_step_type: "Follow-up",
      offer_id: "",
      plain_language_message: "",
      why_not_the_others: "",
      guardrail_notes: "",
      value_driver_ids: [],
      value_if_completed_usd: 0,
      assumed_take_rate: 0,
      expected_value_usd: 0,
    },
    offer: null,
    moment: "",
  };
}
