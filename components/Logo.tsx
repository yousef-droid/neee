"use client";

export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" };
  return (
    <div className={`font-black tracking-tighter ${sizes[size]} flex items-center gap-2`}>
      <div className="relative">
        <div className="w-8 h-8 bg-red-primary rounded-lg flex items-center justify-center transform rotate-3">
          <span className="text-white font-bold text-sm">Q</span>
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-light rounded-full animate-pulse" />
      </div>
      <span className="text-white">Quick<span className="text-red-primary">Sell</span>Pro</span>
    </div>
  );
}
