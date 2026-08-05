export type AppSlug =
  | "tttt"
  | "otolume"
  | "shortcuts-browser"
  | "tax-calculator"
  | "sake-rhythm";

export interface StoreLink {
  label: string;
  url: string;
  className?: "google-play";
}

export interface AppDefinition {
  slug: AppSlug;
  name: string;
  pageTitle: string;
  description: string;
  cardDescription: string;
  subtitle: string;
  icon: string;
  isPublic: boolean;
  externalUrl?: string;
  storeLinks: StoreLink[];
  statusLabel?: string;
  privacyDescription: string;
  privacyShowIcon: boolean;
}

export const apps: AppDefinition[] = [
  {
    slug: "tttt",
    name: "tttt..",
    pageTitle: "tttt.. Too Tired to Type",
    description:
      "A calm AI reading app for bedtime with no prompts, chat, or typing",
    cardDescription:
      "Calm AI stories, trivia, and quizzes for bedtime — no typing required",
    subtitle: "No prompts, no chat, just read",
    icon: "/assets/images/apps/tttt.svg",
    isPublic: true,
    externalUrl: "https://tootiredtotype.com/en/",
    storeLinks: [
      {
        label: "View on App Store",
        url: "https://apps.apple.com/app/id6758298365",
      },
    ],
    privacyDescription:
      "Privacy Policy for tttt.. Too Tired to Type",
    privacyShowIcon: true,
  },
  {
    slug: "otolume",
    name: "OtoLume",
    pageTitle: "OtoLume - Bluetooth Microphone Recording",
    description:
      "An iPhone voice recorder that uses a Bluetooth headset microphone and lets you review waveforms and frequency bands",
    cardDescription:
      "Record with a Bluetooth headset microphone and review waveforms and frequency bands",
    subtitle: "Simple recording from a Bluetooth microphone",
    icon: "/assets/images/apps/otolume.png",
    isPublic: true,
    storeLinks: [
      {
        label: "App Store",
        url: "https://apps.apple.com/app/id6791972933",
      },
    ],
    privacyDescription:
      "How OtoLume handles microphone access, recordings, and user privacy",
    privacyShowIcon: false,
  },
  {
    slug: "shortcuts-browser",
    name: "Shortcuts Browser",
    pageTitle: "Shortcuts Browser",
    description: "Lightning fast website access from home screen shortcuts",
    cardDescription: "Lightning fast website access from home screen shortcuts",
    subtitle: "Lightning fast website access from home screen",
    icon: "/assets/images/apps/shortcuts-browser.jpg",
    isPublic: true,
    storeLinks: [
      {
        label: "View on App Store",
        url: "https://apps.apple.com/us/app/shortcuts-browser/id6749188858",
      },
    ],
    privacyDescription:
      "How Shortcuts Browser handles local app data, advertising identifiers, and user privacy choices",
    privacyShowIcon: true,
  },
  {
    slug: "tax-calculator",
    name: "Tax Inclusive Price Calculator",
    pageTitle: "Tax Inclusive Price Calculator",
    description:
      "Japanese consumption tax calculator for smart shopping and household management",
    cardDescription:
      "Smart Japanese consumption tax calculator for shopping and household management",
    subtitle: "Smart Japanese consumption tax calculator",
    icon: "/assets/images/apps/tax-calculator.jpg",
    isPublic: true,
    storeLinks: [
      {
        label: "View on App Store",
        url: "https://apps.apple.com/jp/app/%E7%A8%8E%E8%BE%BC%E3%81%BF%E4%BE%A1%E6%A0%BC%E8%A8%88%E7%AE%97%E6%A9%9F/id6748836014",
      },
      {
        label: "Get on Google Play",
        url: "https://play.google.com/store/apps/details?id=com.makemoney.taxcalculator",
        className: "google-play",
      },
    ],
    privacyDescription:
      "How Tax Inclusive Price Calculator handles calculation data, advertising services, and purchases",
    privacyShowIcon: true,
  },
  {
    slug: "sake-rhythm",
    name: "SakeRhythm",
    pageTitle: "SakeRhythm - Healthy Drinking Support App",
    description:
      "Japanese healthy drinking support app with hydration reminders and hangover prevention tips",
    cardDescription: "Healthy drinking support for group gatherings",
    subtitle: "Healthy drinking support app for group gatherings",
    icon: "/assets/images/apps/sake-rhythm.jpg",
    isPublic: false,
    storeLinks: [],
    statusLabel: "App Store release planned",
    privacyDescription:
      "Privacy Policy for SakeRhythm - Healthy Drinking Support App",
    privacyShowIcon: false,
  },
];

export const publicApps = apps.filter((app) => app.isPublic);
export const localApps = apps.filter((app) => !app.externalUrl);

export function getApp(slug: AppSlug): AppDefinition {
  const app = apps.find((candidate) => candidate.slug === slug);
  if (!app) throw new Error(`Unknown app slug: ${slug}`);
  return app;
}
