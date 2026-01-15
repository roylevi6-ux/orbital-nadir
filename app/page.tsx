import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <main className="flex flex-col items-center gap-8 px-8 py-16 text-center max-w-4xl">
        {/* Logo/Title */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white">
            💰 ניהול כספי משק בית
          </h1>
          <h2 className="text-3xl font-semibold text-gray-700 dark:text-gray-300">
            Household Finance Manager
          </h2>
        </div>

        {/* Description */}
        <div className="space-y-4 max-w-2xl">
          <p className="text-xl text-gray-700 dark:text-gray-300 leading-relaxed" dir="rtl">
            מערכת חכמה לניהול הוצאות והכנסות של משק הבית. העלאה אוטומטית של נתונים מכרטיסי אשראי,
            חשבונות בנק, ו-BIT/Paybox. קטלוג חכם עם תמיכה מלאה בעברית.
          </p>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Automatically aggregate financial data from multiple sources, intelligently categorize
            transactions with Hebrew support, and gain AI-powered insights.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-3">📊</div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              ניתוח חכם
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI-powered categorization and insights
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-3">🔄</div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              סנכרון אוטומטי
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Multi-source data aggregation
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="text-4xl mb-3">🇮🇱</div>
            <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
              תמיכה בעברית
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Full Hebrew & RTL support
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Link
          href="/login"
          className="mt-8 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-lg rounded-full shadow-lg transition-all transform hover:scale-105"
        >
          התחבר למערכת / Login
        </Link>

        {/* Footer */}
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          Built with Next.js, Supabase, and AI
        </p>
      </main>
    </div>
  );
}

