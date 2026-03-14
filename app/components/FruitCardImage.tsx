"use client";

import React from "react";

export type ThumbnailCrop = { cropX: number; cropY: number; zoom: number };

type FruitCardImageProps = {
  src: string;
  alt: string;
  imageDisplayMode?: "cover" | "contain";
  thumbnailCrop?: ThumbnailCrop | null;
  className?: string;
};

const DEFAULT_CROP: ThumbnailCrop = { cropX: 50, cropY: 50, zoom: 1 };

function FruitCardImageInner({
  src,
  alt,
  imageDisplayMode = "cover",
  thumbnailCrop,
  className = "",
}: FruitCardImageProps) {
  const crop = thumbnailCrop ?? DEFAULT_CROP;

  if (imageDisplayMode === "contain") {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-[12px] ${className}`}
        style={{ aspectRatio: "1 / 1" }}
      >
        {/* Blur background — no animation on filter */}
        <div
          className="absolute inset-0 bg-gray-200"
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: "scale(1.4)",
            filter: "blur(25px) saturate(0.7)",
          }}
          aria-hidden
        />
        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.12) 100%)",
          }}
          aria-hidden
        />
        {/* Foreground — only transform animated on hover */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain object-center transition-transform duration-200 ease-out hover:scale-[1.03] active:scale-[1.03]"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[12px] ${className}`}
      style={{ aspectRatio: "1 / 1" }}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover object-center"
        style={{
          objectFit: "cover",
          objectPosition: `${crop.cropX}% ${crop.cropY}%`,
          transform: `scale(${crop.zoom})`,
          transformOrigin: "center",
        }}
        draggable={false}
      />
    </div>
  );
}

const FruitCardImage = React.memo(FruitCardImageInner);
export default FruitCardImage;
