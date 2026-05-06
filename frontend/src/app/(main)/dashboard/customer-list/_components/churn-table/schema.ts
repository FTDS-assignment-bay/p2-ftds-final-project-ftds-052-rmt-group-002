import z from "zod";

export const churnCustomerSchema = z.object({
  customer_id: z.string(),
  full_name: z.string().nullable(),
  churn_probability: z.number().nullable(),
  risk_segment: z.string().nullable(),   // "high" | "medium" | "low" dari DB
  predicted_clv_90d: z.number().nullable(),
  segment_name: z.string().nullable(),
  recency_days: z.number().nullable(),
  frequency: z.number().nullable(),
  monetary_total: z.number().nullable(),
});

export const churnCustomersSchema = z.array(churnCustomerSchema);

export type ChurnCustomerRow = z.infer<typeof churnCustomerSchema>;
