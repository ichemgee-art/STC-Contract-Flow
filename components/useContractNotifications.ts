"use client";

import { useCallback, useEffect, useState } from "react";
import { getContractSummary } from "@/lib/contracts";
import { playUiSound, primeUiAudio } from "@/lib/sounds";
import type { Language } from "@/components/LanguageProvider";

const ENABLED_KEY = "stc-contract-reminders-enabled";
const LAST_REMINDER_KEY = "stc-contract-last-reminder";
const FIVE_HOURS = 5 * 60 * 60 * 1000;

function reminderCopy(language: Language, summary: Awaited<ReturnType<typeof getContractSummary>>) {
  if (language === "ar") {
    return {
      title: "🔔 متابعة عقود STC",
      body: [
        `إجمالي العقود: ${summary.total}`,
        `ختم STC: ${summary.waitingStc}`,
        `ختم العميل: ${summary.waitingClient}`,
        `دفعة مقدمة: ${summary.waitingPayment}`,
        `توريد: ${summary.waitingSupply}`,
        `دفعة التشوين: ${summary.waitingSettlement}`,
        `مكتمل: ${summary.completed}`,
      ].join(" · "),
    };
  }

  return {
    title: "🔔 STC Contract Follow-up",
    body: [
      `Total: ${summary.total}`,
      `STC stamp: ${summary.waitingStc}`,
      `Client stamp: ${summary.waitingClient}`,
      `Payment: ${summary.waitingPayment}`,
      `Supply: ${summary.waitingSupply}`,
      `Stocking payment: ${summary.waitingSettlement}`,
      `Completed: ${summary.completed}`,
    ].join(" · "),
  };
}

export function useContractNotifications(language: Language) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(ENABLED_KEY) === "true";
    setEnabled(saved);

    if (saved && !window.localStorage.getItem(LAST_REMINDER_KEY)) {
      window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
    }
  }, []);

  const showReminder = useCallback(async () => {
    const summary = await getContractSummary();
    const copy = reminderCopy(language, summary);

    playUiSound("reminder");

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(copy.title, {
        body: copy.body,
        tag: "stc-contract-reminder",
      });

      notification.onclick = () => {
        window.focus();
        window.location.href = "/dashboard";
        notification.close();
      };
    }

    window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
  }, [language]);

  useEffect(() => {
    if (!enabled) return;

    const checkIfDue = () => {
      const last = Number(window.localStorage.getItem(LAST_REMINDER_KEY) || Date.now());
      if (Date.now() - last < FIVE_HOURS) return;
      void showReminder().catch(() => undefined);
    };

    checkIfDue();
    const timer = window.setInterval(checkIfDue, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, showReminder]);

  const toggle = useCallback(async () => {
    primeUiAudio();

    if (enabled) {
      setEnabled(false);
      window.localStorage.setItem(ENABLED_KEY, "false");
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    setEnabled(true);
    window.localStorage.setItem(ENABLED_KEY, "true");
    window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
    playUiSound("reminder");

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(
        language === "ar" ? "تم تفعيل تنبيهات STC" : "STC notifications enabled",
        {
          body:
            language === "ar"
              ? "سيتم تذكيرك بملخص العقود كل 5 ساعات أثناء عمل الموقع."
              : "You will receive a contract summary every 5 hours while the site is running.",
          tag: "stc-contract-notifications-enabled",
        },
      );
    }
  }, [enabled, language]);

  return { enabled, toggle };
}
