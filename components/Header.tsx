"use client";

import Link from "next/link";
import Logo from "./Logo";
import { Shield, Home } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-red-dark/30 bg-darker/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/"><Logo /></Link>
        <nav className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-red-primary/10 transition-all">
            <Home size={18} /><span className="hidden sm:inline">Home</span>
          </Link>
          <Link href="/admin" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-primary/10 text-red-primary hover:bg-red-primary hover:text-white transition-all border border-red-primary/30">
            <Shield size={18} /><span className="hidden sm:inline">Admin</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
