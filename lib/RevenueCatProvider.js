// lib/RevenueCatProvider.js
import { createContext, useContext, useEffect, useState } from "react";
import Purchases from "react-native-purchases";
import { ENTITLEMENT_ID, RC_API_KEY } from "./revenuecat";

const RevenueCatContext = createContext({
  isPro: false,
  loading: true,
  customerInfo: null,
  refreshCustomerInfo: async () => {},
});

export function RevenueCatProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [isPro, setIsPro] = useState(false);

  // configure SDK once
  useEffect(() => {
    // You can pass a user ID here instead of null if you later add accounts
    Purchases.configure({ apiKey: RC_API_KEY });

    const fetchInfo = async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);
        const active = info?.entitlements?.active?.[ENTITLEMENT_ID];
        setIsPro(!!active);
      } catch (e) {
        console.warn("RevenueCat getCustomerInfo error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();

    // Listen to changes (purchases/restores)
    const listener = Purchases.addCustomerInfoUpdateListener((info) => {
      setCustomerInfo(info);
      const active = info?.entitlements?.active?.[ENTITLEMENT_ID];
      setIsPro(!!active);
    });

    return () => {
      listener && Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const refreshCustomerInfo = async () => {
    try {
      setLoading(true);
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      const active = info?.entitlements?.active?.[ENTITLEMENT_ID];
      setIsPro(!!active);
    } catch (e) {
      console.warn("RevenueCat refreshCustomerInfo error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RevenueCatContext.Provider
      value={{ isPro, loading, customerInfo, refreshCustomerInfo }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  return useContext(RevenueCatContext);
}