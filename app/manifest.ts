import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "水果圖鑑",
    short_name: "水果圖鑑",
    description: "本機水果圖鑑、品飲日誌與採購清單",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "zh-Hant",
  };
}
