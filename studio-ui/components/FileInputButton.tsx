"use client";

import { useRef } from "react";

type Props = {
  accept?: string;
  onFile: (file: File) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function FileInputButton({
  accept = "image/png,image/jpeg,image/webp,image/svg+xml",
  onFile,
  children,
  className,
  style,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
        style={{ display: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}
