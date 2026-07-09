import { useWindowStore } from "@/system/windows/windowStore";

/** Wallpaper layer. Desktop icons arrive with the virtual file system. */
export function Desktop() {
  const blurAll = useWindowStore(s => s.blurAll);

  return (
    <div className="wallpaper z-0" onPointerDown={blurAll}>
      <div className="wallpaper-ring" />
    </div>
  );
}
