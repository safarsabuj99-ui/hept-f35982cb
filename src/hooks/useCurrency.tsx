import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Currency = "USD" | "BDT";

interface CurrencyContextType {
  currency: Currency;
  exchangeRate: number;
  toggleCurrency: () => void;
  formatAmount: (usdAmount: number, rateOverride?: number | null) => string;
  convertAmount: (usdAmount: number, rateOverride?: number | null) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [exchangeRate, setExchangeRate] = useState(120);

  useEffect(() => {
    supabase
      .from("settings" as any)
      .select("value")
      .eq("key", "exchange_rate")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.value) setExchangeRate(Number(data.value));
      });
  }, []);

  const toggleCurrency = () => setCurrency((c) => (c === "USD" ? "BDT" : "USD"));

  const convertAmount = (usdAmount: number, rateOverride?: number | null) => {
    if (currency === "USD") return usdAmount;
    const rate = rateOverride ?? exchangeRate;
    return usdAmount * rate;
  };

  const formatAmount = (usdAmount: number, rateOverride?: number | null) => {
    const converted = convertAmount(usdAmount, rateOverride);
    if (currency === "USD") {
      return `$${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `৳${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, exchangeRate, toggleCurrency, formatAmount, convertAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
