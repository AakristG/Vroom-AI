import raw from "./profiles.json";

export type YN = "Y" | "N";

export interface Customer {
  customer_id: string;
  first_name: string;
  age: number;
  city: string;
  state: string;
  occupation: string;
  annual_income: number;
  other_monthly_debt: number;
  credit_tier_at_origination: string;
  credit_tier_now: string;
  preferred_channel: string;
  marketing_consent: YN;
  vulnerable_flag: YN;
  autopay: YN;
  digital_engagement: string;
  payday_day: number;
  payment_to_income_pct: number;
  debt_to_income_pct: number;
  financial_stress_score: number;
  tenure_months_with_tfs: number;
}

export interface Vehicle {
  vehicle_id: string;
  customer_id: string;
  model_year: number;
  model: string;
  trim: string;
  condition_at_purchase: string;
  purchase_price_or_msrp: number;
  odometer_now: number;
  annual_miles_est: number;
  est_market_value_now: number;
  toyota_care_ends: string;
  basic_warranty_ends: string;
  last_service_date: string;
  next_service_due: string;
  open_recall: YN;
}

export interface Account {
  account_id: string;
  customer_id: string;
  vehicle_id: string;
  contract_type: "loan" | "lease";
  contract_start: string;
  term_months: number;
  months_elapsed: number;
  months_remaining: number;
  contract_end: string;
  missed_payments_12m: number;
  autopay: YN;
  amount_financed: number;
  apr: number | null;
  money_factor: number | null;
  monthly_payment: number;
  current_balance: number | null;
  payoff_quote: number | null;
  residual_value: number | null;
  mileage_allowance_total: number | null;
  est_equity: number | null;
  payment_due_day: number;
}

export interface Option {
  option_id: string;
  option_name: string;
  new_monthly_payment: number | null;
  monthly_payment_change: number | null;
  upfront_cost: number | null;
  total_cost_vs_keep_as_is: number | null;
  eligibility: string;
  plain_language_summary: string;
  key_assumption: string;
  tradeoff: string;
}

export type NextStepType = "Self-service" | "Follow-up" | "Offer";

export interface Golden {
  best_next_move: string;
  next_step_type: NextStepType;
  offer_id: string;
  plain_language_message: string;
  why_not_the_others: string;
  guardrail_notes: string;
  value_driver_ids: string[];
  value_if_completed_usd: number;
  assumed_take_rate: number;
  expected_value_usd: number;
}

export interface Offer {
  offer_id: string;
  offer_name: string;
  next_step_type: string;
  eligibility_rule_summary: string;
  business_value: string;
  service_effort: string;
}

export interface Profile {
  customer: Customer;
  vehicle: Vehicle;
  account: Account;
  situation: { situation_id: string; customer_id: string; customer_says: string; context_summary: string };
  options: Option[];
  golden: Golden;
  offer: Offer | null;
  moment: string;
}

export interface ValueDriver {
  driver_id: string;
  description: string;
  assumption_text: string;
  value_usd: string;
  value_type: string;
}

const data = raw as unknown as { profiles: Profile[]; valueDrivers: ValueDriver[] };
export const profiles = data.profiles;
export const valueDrivers = data.valueDrivers;
