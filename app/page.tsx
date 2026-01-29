import Link from "next/link";
import { Sparkles, BarChart3, RefreshCcw, Languages, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
      <main className="flex flex-col items-center gap-8 px-8 py-16 text-center max-w-4xl">
        {/* Logo/Title */}
        <div className="space-y-4">
          <div className="icon-glow w-24 h-24 mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="w-12 h-12 text-[var(--neon-blue)]" />
          </div>
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--neon-blue)] via-[var(--neon-pink)] to-[var(--neon-purple)]">
            ניהול כספי משק בית
          </h1>
          <h2 className="text-3xl font-semibold text-[var(--text-primary)]">
            Household Finance Manager
          </h2>
        </div>

        {/* Description */}
        <div className="space-y-4 max-w-2xl">
          <p className="text-xl text-[var(--text-primary)] leading-relaxed" dir="rtl">
            מערכת חכמה לניהול הוצאות והכנסות של משק הבית. העלאה אוטומטית של נתונים מכרטיסי אשראי,
            חשבונות בנק, ו-BIT/Paybox. קטלוג חכם עם תמיכה מלאה בעברית.
          </p>
          <p className="text-lg text-[var(--text-muted)]">
            Automatically aggregate financial data from multiple sources, intelligently categorize
            transactions with Hebrew support, and gain AI-powered insights.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8">
          <div className="holo-card cursor-pointer">
            <div className="icon-glow mx-auto mb-3 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-[var(--neon-blue)]" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-[var(--neon-blue)]">
              ניתוח חכם
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              AI-powered categorization and insights
            </p>
          </div>
          <div className="holo-card cursor-pointer">
            <div className="icon-glow mx-auto mb-3 flex items-center justify-center">
              <RefreshCcw className="w-6 h-6 text-[var(--neon-pink)]" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-[var(--neon-pink)]">
              סנכרון אוטומטי
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Multi-source data aggregation
            </p>
          </div>
          <div className="holo-card cursor-pointer">
            <div className="icon-glow mx-auto mb-3 flex items-center justify-center">
              <Languages className="w-6 h-6 text-[var(--neon-purple)]" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-[var(--neon-purple)]">
              תמיכה בעברית
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Full Hebrew & RTL support
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Link
          href="/login"
          className="btn-primary mt-8 px-8 py-4 text-lg flex items-center gap-2"
        >
          התחבר למערכת / Login <Zap className="w-5 h-5" />
        </Link>

        {/* Footer */}
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          Built with Next.js, Supabase, and AI
        </p>
      </main>
    </div>
  );
}
