import React, { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";

const LOCAL_LOGO_KEY = "malasombre_studio_logo_v1";

export function BrandHeader() {
  const [logoSrc, setLogoSrc] = useState<string>("/logotipo.png");
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_LOGO_KEY);
      if (saved) {
        setLogoSrc(saved);
        setLogoFailed(false);
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const handleSelectLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result;
      if (typeof result === "string") {
        setLogoSrc(result);
        setLogoFailed(false);
        try {
          localStorage.setItem(LOCAL_LOGO_KEY, result);
        } catch {
          // Ignore storage quota errors
        }
        try {
          await fetch("/api/logo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: result }),
          });
        } catch {
          // Non-blocking server persistence
        }
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <header className="w-full border-b border-[#8a2be2]/20 bg-[#050507]/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Brand mark (logotipo.png + wordmark, single line) */}
        <a
          href="#roteiro"
          className="flex items-center gap-3.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2] rounded-md"
        >
          {!logoFailed ? (
            <img
              src={logoSrc}
              alt="Logotipo Mala.Sombre"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-9 w-auto max-w-[140px] object-contain shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-9 w-9 rounded-lg bg-[#2a0033] border border-[#8a2be2]/40 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(138,43,226,0.28)]"
            >
              <svg
                viewBox="0 0 36 36"
                className="w-6 h-6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M23.5 7.5C17.7 8.4 13.5 13.4 13.5 19.4C13.5 24.4 16.5 28.7 20.9 30.5C13.8 30.8 8 25.1 8 18C8 11.2 13.3 5.7 20 5.5C21.2 5.5 22.4 6.2 23.5 7.5Z"
                  fill="#8a2be2"
                />
                <path
                  d="M19 30V18L15.5 14.5M19 22L23.5 17.5M19 18L21.5 12.5"
                  stroke="#f3eff8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
          <span className="font-display text-xl font-bold tracking-wide text-white uppercase">
            Mala.Sombre Motion Studio
          </span>
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#b9accb]">
          <a
            href="#roteiro"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Roteiro
          </a>
          <a
            href="#preview"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Preview 16:9
          </a>
          <a
            href="#exportacao"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Exportação
          </a>
          <a
            href="#identidade"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Identidade Visual
          </a>
        </nav>

        {/* Zone 3: 1 concise utility action to attach/update logotipo.png */}
        <div className="flex items-center shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleSelectLogo}
            className="hidden"
            aria-label="Selecionar arquivo logotipo.png"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#e5dbf5] bg-[#140d1f] hover:bg-[#2a0033] border border-[#8a2be2]/35 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
          >
            <Upload className="w-3.5 h-3.5 text-[#8a2be2]" />
            <span>{logoFailed ? "Carregar logotipo.png" : "Trocar Logotipo"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
