"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ContractStatus, StageKey } from "@/types/contract";

export type Language = "ar" | "en";

const en = {
  dashboard: "Dashboard",
  contracts: "Contracts",
  newContract: "New Contract",
  contractDetails: "Contract Details",
  addContract: "Add Contract",
  signOut: "Sign out",
  administrator: "Administrator",
  editor: "Editor",
  loadingFlow: "Loading Contract Flow…",
  accessControl: "Access control",
  accountNotEnabled: "Your account is not enabled yet.",
  accountNotEnabledHelp: "Ask the system administrator to activate your user profile in Firebase, then sign in again.",
  mainNavigation: "Main navigation",
  mobileNavigation: "Mobile navigation",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  internalWorkflow: "Internal workflow",
  loginHeadline: "Every contract. One clear flow.",
  loginDescription: "Track signatures, down payments, supply and stocking payments without spreadsheets or scattered follow-ups.",
  privateAccess: "Private access · Firebase Authentication · Firestore Security Rules",
  welcomeBack: "Welcome back",
  signInContinue: "Sign in to continue",
  loginHelp: "Use the company account enabled by your administrator.",
  email: "Email address",
  password: "Password",
  signingIn: "Signing in…",
  signIn: "Sign in",
  noSignup: "No public sign-up is available for this system.",
  incorrectCredentials: "Incorrect email or password.",
  tooManyAttempts: "Too many attempts. Try again later.",
  accountDisabled: "This account has been disabled.",
  genericLoginError: "Could not sign in. Check your details and try again.",
  accountExistsNoAccess: "Your account exists, but access to STC Contract Flow is not enabled.",
  contractLifecycle: "Contract lifecycle",
  dashboardHeadline: "Everything moving through one clear flow.",
  dashboardDescription: "See what is signed, paid, supplied and ready for the stocking payment without opening multiple sheets.",
  viewAllContracts: "View all contracts",
  completed: "completed",
  contractsFullySettled: "contracts fully completed",
  totalContracts: "Total contracts",
  inProgress: "In progress",
  waitingClientStamp: "Waiting client stamp",
  pipeline: "Pipeline",
  stageCompletion: "Stage completion",
  latestActivity: "Latest activity",
  recentContracts: "Recent contracts",
  viewAll: "View all",
  loadingContracts: "Loading contracts…",
  noContractsYet: "No contracts yet",
  addFirstContract: "Add the first contract to start the flow.",
  loadContractsError: "Could not load contracts. Check your Firebase setup and access.",
  contractRegister: "Contract register",
  contractsHeadline: "Track every agreement from stamp to stocking payment.",
  totalContractsShown: "{total} total contracts · {shown} shown",
  searchPlaceholder: "Search company, representative, type or product…",
  allStatuses: "All statuses",
  company: "Company",
  representative: "Representative",
  contract: "Contract",
  status: "Status",
  complete: "complete",
  noMatchingContracts: "No matching contracts",
  noMatchingContractsHelp: "Try another search or add a new contract.",
  reopenConfirm: "Reopening this stage will also clear every stage after it. Continue?",
  updateStageError: "Could not update this stage.",
  justNow: "Just now",
  newRecord: "New record",
  addContractHeadline: "Add a contract in seconds.",
  newContractDescription: "The workflow starts at “Stamped by STC” after the basic details are saved.",
  createContractError: "Could not create the contract. Check your connection and permissions.",
  contractInformation: "Contract information",
  basicDetails: "Basic details",
  basicDetailsHelp: "Keep the entry short and searchable. Contract type and product are free text.",
  salesRepresentative: "Sales representative",
  salesRepresentativePlaceholder: "e.g. Ahmed Mohamed",
  companyClient: "Company / Client",
  companyPlaceholder: "e.g. ABC Contracting",
  contractType: "Contract type",
  contractTypePlaceholder: "e.g. Supply & Installation",
  contractTypeHelp: "Manual entry — not limited to a predefined list.",
  productItem: "Product / Item",
  productPlaceholder: "e.g. HPL",
  productHelp: "Examples: HPL, Corian, Raised Floor, Expansion Joints.",
  cancel: "Cancel",
  saveContract: "Save Contract",
  saving: "Saving…",
  pending: "Pending",
  done: "Done",
  next: "Next",
  locked: "Locked",
  reopen: "Reopen",
  finish: "Complete",
  editContract: "Edit contract",
  editContractDescription: "Update the basic information without changing the workflow history.",
  saveChanges: "Save Changes",
  loadContractError: "Could not load this contract.",
  saveChangesError: "Could not save the changes.",
  deleteContractError: "Could not delete this contract.",
  deleteConfirmPrefix: "Delete the contract for",
  deleteConfirmSuffix: "? This cannot be undone.",
  loadingContract: "Loading contract…",
  contractNotFound: "Contract not found",
  contractNotFoundHelp: "It may have been deleted or you may not have access.",
  contractRecord: "Contract record",
  edit: "Edit",
  delete: "Delete",
  created: "Created",
  workflowProgress: "Workflow progress",
  workflow: "Workflow",
  contractStages: "Contract stages",
  completeInOrder: "Complete in order",
  recordInfo: "Record info",
  auditDetails: "Audit details",
  contractId: "Contract ID",
  createdBy: "Created by",
  createdAt: "Created at",
  lastUpdated: "Last updated",
  stageDatesNote: "Stage dates are captured automatically when a checkbox is completed.",
  stcUser: "STC User",
  openContract: "Open",
  languageLabel: "العربية",
  companyNameFull: "Specialized Trading & Construction",
} as const;

const ar: Record<keyof typeof en, string> = {
  dashboard: "لوحة التحكم",
  contracts: "العقود",
  newContract: "عقد جديد",
  contractDetails: "تفاصيل العقد",
  addContract: "إضافة عقد",
  signOut: "تسجيل الخروج",
  administrator: "مدير النظام",
  editor: "محرر",
  loadingFlow: "جاري تحميل نظام العقود…",
  accessControl: "التحكم في الصلاحيات",
  accountNotEnabled: "حسابك غير مُفعّل حتى الآن.",
  accountNotEnabledHelp: "اطلب من مدير النظام تفعيل حسابك في Firebase ثم سجّل الدخول مرة أخرى.",
  mainNavigation: "التنقل الرئيسي",
  mobileNavigation: "التنقل على الهاتف",
  openMenu: "فتح القائمة",
  closeMenu: "إغلاق القائمة",
  internalWorkflow: "نظام متابعة داخلي",
  loginHeadline: "كل عقد. مسار واحد واضح.",
  loginDescription: "تابع الأختام والدفعات والتوريد ودفعة التشوين بدون شيتات متفرقة أو متابعة يدوية.",
  privateAccess: "دخول خاص · Firebase Authentication · Firestore Security Rules",
  welcomeBack: "أهلًا بعودتك",
  signInContinue: "سجّل الدخول للمتابعة",
  loginHelp: "استخدم حساب الشركة الذي فعّله مدير النظام.",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  signingIn: "جاري تسجيل الدخول…",
  signIn: "تسجيل الدخول",
  noSignup: "لا يوجد تسجيل حسابات جديد من داخل النظام.",
  incorrectCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  tooManyAttempts: "محاولات كثيرة. حاول مرة أخرى لاحقًا.",
  accountDisabled: "تم تعطيل هذا الحساب.",
  genericLoginError: "تعذر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.",
  accountExistsNoAccess: "الحساب موجود، لكن صلاحية الدخول إلى نظام STC Contract Flow غير مفعّلة.",
  contractLifecycle: "دورة حياة العقد",
  dashboardHeadline: "كل العقود تتحرك في مسار واحد واضح.",
  dashboardDescription: "اعرف ما تم ختمه ودفعه وتوريده ووصل لدفعة التشوين بدون فتح أكثر من شيت.",
  viewAllContracts: "عرض كل العقود",
  completed: "مكتمل",
  contractsFullySettled: "عقد تم إنهاؤه بالكامل",
  totalContracts: "إجمالي العقود",
  inProgress: "قيد التنفيذ",
  waitingClientStamp: "بانتظار ختم العميل",
  pipeline: "مسار العقود",
  stageCompletion: "نسبة إنجاز المراحل",
  latestActivity: "آخر النشاطات",
  recentContracts: "أحدث العقود",
  viewAll: "عرض الكل",
  loadingContracts: "جاري تحميل العقود…",
  noContractsYet: "لا توجد عقود حتى الآن",
  addFirstContract: "أضف أول عقد لبدء المتابعة.",
  loadContractsError: "تعذر تحميل العقود. راجع إعدادات Firebase والصلاحيات.",
  contractRegister: "سجل العقود",
  contractsHeadline: "تابع كل عقد من الختم حتى دفعة التشوين.",
  totalContractsShown: "إجمالي العقود {total} · المعروض {shown}",
  searchPlaceholder: "ابحث بالشركة أو المندوب أو نوع العقد أو المنتج…",
  allStatuses: "كل الحالات",
  company: "الشركة",
  representative: "المندوب",
  contract: "العقد",
  status: "الحالة",
  complete: "مكتمل",
  noMatchingContracts: "لا توجد عقود مطابقة",
  noMatchingContractsHelp: "جرّب بحثًا آخر أو أضف عقدًا جديدًا.",
  reopenConfirm: "إعادة فتح هذه المرحلة ستمسح أيضًا كل المراحل التالية. هل تريد المتابعة؟",
  updateStageError: "تعذر تحديث هذه المرحلة.",
  justNow: "الآن",
  newRecord: "سجل جديد",
  addContractHeadline: "أضف عقدًا خلال ثوانٍ.",
  newContractDescription: "يبدأ مسار المتابعة من «العقد مختوم من عندنا» بعد حفظ البيانات الأساسية.",
  createContractError: "تعذر إنشاء العقد. راجع الاتصال والصلاحيات.",
  contractInformation: "بيانات العقد",
  basicDetails: "البيانات الأساسية",
  basicDetailsHelp: "اجعل البيانات مختصرة وسهلة البحث. نوع العقد والمنتج إدخال يدوي.",
  salesRepresentative: "اسم المندوب",
  salesRepresentativePlaceholder: "مثال: أحمد محمد",
  companyClient: "اسم الشركة / العميل",
  companyPlaceholder: "مثال: ABC للمقاولات",
  contractType: "نوع العقد",
  contractTypePlaceholder: "مثال: توريد وتركيب",
  contractTypeHelp: "إدخال يدوي — غير مقيد بقائمة محددة.",
  productItem: "المنتج / البند",
  productPlaceholder: "مثال: HPL",
  productHelp: "أمثلة: HPL، Corian، Raised Floor، Expansion Joints.",
  cancel: "إلغاء",
  saveContract: "حفظ العقد",
  saving: "جاري الحفظ…",
  pending: "معلّق",
  done: "تم",
  next: "التالي",
  locked: "مغلق",
  reopen: "إعادة فتح",
  finish: "إتمام",
  editContract: "تعديل العقد",
  editContractDescription: "عدّل البيانات الأساسية بدون تغيير سجل مراحل العقد.",
  saveChanges: "حفظ التعديلات",
  loadContractError: "تعذر تحميل هذا العقد.",
  saveChangesError: "تعذر حفظ التعديلات.",
  deleteContractError: "تعذر حذف هذا العقد.",
  deleteConfirmPrefix: "هل تريد حذف عقد",
  deleteConfirmSuffix: "؟ لا يمكن التراجع عن هذا الإجراء.",
  loadingContract: "جاري تحميل العقد…",
  contractNotFound: "العقد غير موجود",
  contractNotFoundHelp: "قد يكون تم حذفه أو لا تملك صلاحية الوصول إليه.",
  contractRecord: "سجل العقد",
  edit: "تعديل",
  delete: "حذف",
  created: "تاريخ الإنشاء",
  workflowProgress: "نسبة تقدم العقد",
  workflow: "مسار العمل",
  contractStages: "مراحل العقد",
  completeInOrder: "يتم التنفيذ بالترتيب",
  recordInfo: "بيانات السجل",
  auditDetails: "تفاصيل المراجعة",
  contractId: "رقم العقد",
  createdBy: "أُنشئ بواسطة",
  createdAt: "تاريخ الإنشاء",
  lastUpdated: "آخر تحديث",
  stageDatesNote: "يتم تسجيل تاريخ كل مرحلة تلقائيًا عند إتمامها.",
  stcUser: "مستخدم STC",
  openContract: "فتح",
  languageLabel: "English",
  companyNameFull: "المتخصصة للتجارة والمقاولات",
};

const stageLabels: Record<Language, Record<StageKey, { label: string; short: string }>> = {
  en: {
    stampedByUs: { label: "Stamped by STC", short: "STC Stamp" },
    stampedByClient: { label: "Stamped by Client", short: "Client Stamp" },
    downPayment: { label: "Down Payment", short: "Payment" },
    supply: { label: "Supply", short: "Supply" },
    settlement: { label: "Stocking Payment", short: "Stocking Payment" },
  },
  ar: {
    stampedByUs: { label: "العقد مختوم من عندنا", short: "ختم STC" },
    stampedByClient: { label: "العقد مختوم من عندهم", short: "ختم العميل" },
    downPayment: { label: "الدفعة المقدمة", short: "دفعة مقدمة" },
    supply: { label: "التوريد", short: "التوريد" },
    settlement: { label: "دفعة التشوين", short: "دفعة التشوين" },
  },
};

const statusLabels: Record<Language, Record<ContractStatus, string>> = {
  en: {
    "Waiting for STC Stamp": "Waiting for STC Stamp",
    "Waiting for Client Stamp": "Waiting for Client Stamp",
    "Waiting for Down Payment": "Waiting for Down Payment",
    "Waiting for Supply": "Waiting for Supply",
    "Waiting for Stocking Payment": "Waiting for Stocking Payment",
    Completed: "Completed",
  },
  ar: {
    "Waiting for STC Stamp": "بانتظار ختم STC",
    "Waiting for Client Stamp": "بانتظار ختم العميل",
    "Waiting for Down Payment": "بانتظار الدفعة المقدمة",
    "Waiting for Supply": "بانتظار التوريد",
    "Waiting for Stocking Payment": "بانتظار دفعة التشوين",
    Completed: "مكتمل",
  },
};

type TranslationKey = keyof typeof en;

interface LanguageContextValue {
  language: Language;
  dir: "rtl" | "ltr";
  locale: "ar-EG" | "en-GB";
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  stageLabel: (key: StageKey, short?: boolean) => string;
  statusLabel: (status: ContractStatus) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ar");

  useEffect(() => {
    const saved = window.localStorage.getItem("stc-language");
    if (saved === "ar" || saved === "en") setLanguage(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("stc-language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = language === "ar" ? ar : en;
    return {
      language,
      dir: language === "ar" ? "rtl" : "ltr",
      locale: language === "ar" ? "ar-EG" : "en-GB",
      t: (key, vars) => {
        let text = dictionary[key];
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(replacement));
          }
        }
        return text;
      },
      stageLabel: (key, short = false) => short ? stageLabels[language][key].short : stageLabels[language][key].label,
      statusLabel: (status) => statusLabels[language][status],
      toggleLanguage: () => setLanguage((current) => current === "ar" ? "en" : "ar"),
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
