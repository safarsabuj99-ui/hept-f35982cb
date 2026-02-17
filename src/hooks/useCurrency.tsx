import { createContext, useContext, useState, ReactNode } from "react";

type Currency = "USD" | "BDT";

interface CurrencyContextType {
  currency: Currency;
  toggleCurrency: () => void;
  formatAmount: (usdAmount: number, rate?: number) => string;
  convertAmount: (usdAmount: number, rate?: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");

  const toggleCurrency = () => setCurrency((c) => (c === "USD" ? "BDT" : "USD"));

  const convertAmount = (usdAmount: number, rate?: number) => {
    if (currency === "USD") return usdAmount;
    return usdAmount * (rate ?? 120);
  };

  const formatAmount = (usdAmount: number, rate?: number) => {
    const converted = convertAmount(usdAmount, rate);
    if (currency === "USD") {
      return `$${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `৳${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, toggleCurrency, formatAmount, convertAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
