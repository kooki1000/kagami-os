import type { ReactNode } from "react";
import type { DockPosition, DockSize } from "@/system/dock/dockStore";
import type { ThemePreference } from "@/system/theme/themeStore";
import { Check, Info, Monitor, Palette } from "lucide-react";
import { useState } from "react";
import { useDockStore } from "@/system/dock/dockStore";
import {
  ACCENTS,
  accentSwatch,
  WALLPAPERS,
} from "@/system/settings/palettes";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useThemeStore } from "@/system/theme/themeStore";

type Section = "appearance" | "dock" | "about";

const NAV: Array<{ id: Section; label: string; icon: typeof Palette }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "dock", label: "Dock", icon: Monitor },
  { id: "about", label: "About", icon: Info },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 hairline-b">
      <div className="mb-2.5 text-[12.5px] font-semibold text-ink">{label}</div>
      {children}
    </div>
  );
}

interface SegmentOption<T> {
  value: T;
  label: string;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  width,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
}) {
  return (
    <div className="flex rounded-[9px] bg-ph p-0.75" style={{ width }}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`flex-1 rounded-btn px-3 py-1.5 text-[12px] transition-colors ${
            value === option.value
              ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.14)]"
              : "font-medium text-ink-2 hover:text-ink"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AppearanceSection() {
  const preference = useThemeStore(s => s.preference);
  const setPreference = useThemeStore(s => s.setPreference);
  const accentId = useSettingsStore(s => s.accentId);
  const setAccent = useSettingsStore(s => s.setAccent);
  const wallpaperId = useSettingsStore(s => s.wallpaperId);
  const setWallpaper = useSettingsStore(s => s.setWallpaper);

  return (
    <>
      <Row label="Appearance">
        <Segmented<ThemePreference>
          width={240}
          value={preference}
          onChange={setPreference}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </Row>

      <Row label="Accent color">
        <div className="flex gap-2.75">
          {ACCENTS.map((accent) => {
            const selected = accent.id === accentId;
            return (
              <button
                key={accent.id}
                type="button"
                aria-label={accent.name}
                title={accent.name}
                className={`relative size-6.5 rounded-full border-[1.5px] border-black/10 ${
                  selected
                    ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]"
                    : ""
                }`}
                style={{ background: accentSwatch(accent) }}
                onClick={() => setAccent(accent.id)}
              >
                {selected && (
                  <Check className="absolute inset-0 m-auto size-3.5 text-white" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label="Wallpaper">
        <div className="flex gap-2.5">
          {WALLPAPERS.map((wallpaper) => {
            const selected = wallpaper.id === wallpaperId;
            return (
              <button
                key={wallpaper.id}
                type="button"
                aria-label={wallpaper.name}
                title={wallpaper.name}
                className={`h-12.5 w-19.5 rounded-[9px] border-2 transition-shadow ${
                  selected
                    ? "border-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]"
                    : "border-transparent"
                }`}
                style={{ background: wallpaper.swatch }}
                onClick={() => setWallpaper(wallpaper.id)}
              />
            );
          })}
        </div>
      </Row>
    </>
  );
}

function DockSection() {
  const size = useDockStore(s => s.size);
  const setSize = useDockStore(s => s.setSize);
  const position = useDockStore(s => s.position);
  const setPosition = useDockStore(s => s.setPosition);

  return (
    <>
      <Row label="Size">
        <Segmented<DockSize>
          width={240}
          value={size}
          onChange={setSize}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
      </Row>
      <Row label="Position on screen">
        <Segmented<DockPosition>
          width={240}
          value={position}
          onChange={setPosition}
          options={[
            { value: "bottom", label: "Bottom" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ]}
        />
      </Row>
    </>
  );
}

function AboutSection() {
  const facts: Array<[string, string]> = [
    ["Version", "0.6.0 — “Lagoon”"],
    ["Build", "Phase 6 · Settings"],
    ["Engine", "React + TypeScript · Vite"],
    ["Storage", "Virtual file system (IndexedDB)"],
  ];
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="size-14 rotate-45 rounded-[12px] bg-accent shadow-[0_10px_28px_-8px_var(--accent)]" />
      <h1 className="mt-5 text-[24px] font-bold tracking-tight text-ink">Kagami OS</h1>
      <p className="mt-1 text-[13px] text-ink-2">A desktop that lives in your browser.</p>

      <div className="mt-6 w-full max-w-72 overflow-hidden rounded-[12px] bg-surface-2 hairline">
        {facts.map(([key, value], i) => (
          <div
            key={key}
            className={`flex items-center justify-between px-3.5 py-2 text-[12px] ${
              i < facts.length - 1 ? "hairline-b" : ""
            }`}
          >
            <span className="text-ink-2">{key}</span>
            <span className="font-medium text-ink">{value}</span>
          </div>
        ))}
      </div>

      <p className="mt-5 max-w-72 text-[11.5px] leading-relaxed text-ink-2">
        An original desktop environment — no Apple or third-party OS code,
        assets, or trademarks. Icons by Lucide; typeface Inter.
      </p>
    </div>
  );
}

export default function SettingsApp() {
  const [section, setSection] = useState<Section>("appearance");

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[150px] flex-none flex-col gap-0.5 bg-surface-2 px-2.25 py-3 select-none hairline-r">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex items-center gap-2.25 rounded-[8px] px-2.25 py-1.5 text-left text-[12.5px] font-medium ${
                active
                  ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent"
                  : "text-ink-2 hover:bg-ph"
              }`}
              onClick={() => setSection(item.id)}
            >
              <Icon className="size-4 opacity-80" strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-auto">
        {section === "appearance" && <AppearanceSection />}
        {section === "dock" && <DockSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
