export default function Footer() {
  return (
    <footer className="border-t border-cnt-border mt-auto">
      <div className="container mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-cnt-red rounded-sm flex items-center justify-center">
            <span className="text-white font-black text-[8px]">CNT</span>
          </div>
          <span className="text-xs text-gray-600">Televisión Por Cable Tepa © {new Date().getFullYear()}</span>
        </div>
        <p className="text-xs text-gray-700">Tepatitlán de Morelos, Jalisco, México</p>
      </div>
    </footer>
  );
}
