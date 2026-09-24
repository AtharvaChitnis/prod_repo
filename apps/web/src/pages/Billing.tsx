import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";

type BillingResponse = {
  plan: string;
  status: string;
  usage: { researchRuns: number; files: number };
  entitlement: { researchRunsPerMonth: number; maxFiles: number };
  stripeCustomer: boolean;
  plans: { id: string; checkoutReady: boolean; entitlement: { researchRunsPerMonth: number; maxFiles: number } }[];
};

export function Billing() {
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [error, setError] = useState("");
  const [params] = useSearchParams();

  async function load() {
    setBilling(await api<BillingResponse>("/billing"));
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load billing"));
  }, []);

  async function checkout(plan: string) {
    setError("");
    try {
      const data = await api<{ url: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Checkout failed");
    }
  }

  async function portal() {
    try {
      const data = await api<{ url: string }>("/billing/portal", { method: "POST" });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Portal failed");
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>{billing ? `${billing.plan} · ${billing.status}` : "Plan"}</h1>
        </div>
      </header>
      {params.get("checkout") === "success" ? <p className="notice">Checkout returned. Plan updates after Stripe confirms the webhook.</p> : null}
      {params.get("checkout") === "cancel" ? <p className="notice">Checkout was cancelled.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {billing ? <p className="muted">{billing.usage.researchRuns} runs · {billing.usage.files} / {billing.entitlement.maxFiles} files</p> : null}
      <ul className="cards plans">
        {billing?.plans.filter((plan) => plan.id !== "free").map((plan) => (
          <li key={plan.id}>
            <strong>{plan.id}</strong>
            <span>{plan.entitlement.researchRunsPerMonth} runs / month · {plan.entitlement.maxFiles} files</span>
            <button type="button" disabled={!plan.checkoutReady} onClick={() => void checkout(plan.id)}>
              {plan.checkoutReady ? "Upgrade" : "Price not configured"}
            </button>
          </li>
        ))}
      </ul>
      {billing?.stripeCustomer ? <button type="button" className="secondary" onClick={() => void portal()}>Manage subscription</button> : null}
    </section>
  );
}
