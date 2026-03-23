import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--f1-black)]">
      <div className="w-full max-w-md">
        {/* F1 Pulse branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="flex items-center justify-center w-10 h-10 rounded font-black text-white text-sm tracking-wider"
            style={{
              background: "#e10600",
              fontFamily: "Titillium Web, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            F1
          </div>
          <div className="flex flex-col">
            <span
              className="font-black text-white text-lg uppercase tracking-widest leading-tight"
              style={{
                fontFamily: "Titillium Web, sans-serif",
                letterSpacing: "0.15em",
              }}
            >
              Pulse
            </span>
            <span className="text-[9px] text-white/25 uppercase tracking-[0.2em]">
              Race Analytics
            </span>
          </div>
        </div>
        <SignUp
          fallbackRedirectUrl="/dashboard"
          signInUrl="/sign-in"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-[#1e1e2a] border border-white/[0.07] shadow-2xl",
            },
          }}
        />
      </div>
    </div>
  );
}
